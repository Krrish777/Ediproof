// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title Ediproof Certificate
/// @notice Soulbound (non-transferable) academic certificates as ERC-721 tokens.
///         Each certificate stores a cryptographic hash of its public fields, so
///         any tampering of student name, course, institution, or IPFS URI is
///         instantly detectable via `verifyCertificate`.
contract EdiproofCertificate is ERC721Enumerable, Ownable {
    struct Certificate {
        string studentName;
        string courseName;
        string institution;
        string ipfsURI;
        bytes32 certHash;
        uint64 issuedAt;
        bool revoked;
        uint256 reissuedFrom; // 0 if original
        address issuer;
    }

    mapping(uint256 => Certificate) public certificates;
    mapping(bytes32 => uint256) public hashToTokenId;
    mapping(address => bool) public approvedInstitutions;
    mapping(uint256 => uint256) public replacedBy;

    uint256 private _nextTokenId = 1;

    event InstitutionAdded(address indexed institution);
    event InstitutionRemoved(address indexed institution);
    event CertificateIssued(
        uint256 indexed tokenId,
        address indexed student,
        bytes32 certHash,
        string institution
    );
    event CertificateRevoked(uint256 indexed tokenId, address indexed revokedBy);
    event CertificateReissued(
        uint256 indexed oldTokenId,
        uint256 indexed newTokenId,
        address indexed issuer
    );

    error NotApprovedInstitution();
    error DuplicateCertificate(bytes32 certHash, uint256 existingTokenId);
    error NotIssuerOrOwner();
    error InvalidTokenId();
    error AlreadyRevoked();
    error SoulboundTransferBlocked();

    modifier onlyApprovedInstitution() {
        if (!approvedInstitutions[msg.sender]) revert NotApprovedInstitution();
        _;
    }

    constructor(address initialOwner)
        ERC721("Ediproof Certificate", "EDI")
        Ownable(initialOwner)
    {}

    // ---------------------------------------------------------------------
    // Institution management
    // ---------------------------------------------------------------------

    function addInstitution(address institution) external onlyOwner {
        approvedInstitutions[institution] = true;
        emit InstitutionAdded(institution);
    }

    function removeInstitution(address institution) external onlyOwner {
        approvedInstitutions[institution] = false;
        emit InstitutionRemoved(institution);
    }

    // ---------------------------------------------------------------------
    // Issue / Revoke / Reissue
    // ---------------------------------------------------------------------

    function issueCertificate(
        address student,
        string calldata studentName,
        string calldata courseName,
        string calldata institution,
        string calldata ipfsURI
    ) external onlyApprovedInstitution returns (uint256 tokenId) {
        bytes32 certHash = _computeHash(studentName, courseName, institution, ipfsURI);

        uint256 existing = hashToTokenId[certHash];
        if (existing != 0) revert DuplicateCertificate(certHash, existing);

        tokenId = _nextTokenId++;
        certificates[tokenId] = Certificate({
            studentName: studentName,
            courseName: courseName,
            institution: institution,
            ipfsURI: ipfsURI,
            certHash: certHash,
            issuedAt: uint64(block.timestamp),
            revoked: false,
            reissuedFrom: 0,
            issuer: msg.sender
        });
        hashToTokenId[certHash] = tokenId;

        _safeMint(student, tokenId);

        emit CertificateIssued(tokenId, student, certHash, institution);
    }

    function revokeCertificate(uint256 tokenId) external {
        Certificate storage c = certificates[tokenId];
        if (c.certHash == bytes32(0)) revert InvalidTokenId();
        if (msg.sender != c.issuer && msg.sender != owner()) revert NotIssuerOrOwner();
        if (c.revoked) revert AlreadyRevoked();

        c.revoked = true;
        emit CertificateRevoked(tokenId, msg.sender);
    }

    function reissueCertificate(
        uint256 oldTokenId,
        string calldata newStudentName,
        string calldata newCourseName,
        string calldata newInstitution,
        string calldata newIpfsURI,
        address newStudentWallet
    ) external onlyApprovedInstitution returns (uint256 newTokenId) {
        Certificate storage old = certificates[oldTokenId];
        if (old.certHash == bytes32(0)) revert InvalidTokenId();
        if (msg.sender != old.issuer && msg.sender != owner()) revert NotIssuerOrOwner();

        if (!old.revoked) {
            old.revoked = true;
            emit CertificateRevoked(oldTokenId, msg.sender);
        }

        bytes32 newHash = _computeHash(
            newStudentName,
            newCourseName,
            newInstitution,
            newIpfsURI
        );
        uint256 existing = hashToTokenId[newHash];
        if (existing != 0) revert DuplicateCertificate(newHash, existing);

        newTokenId = _nextTokenId++;
        certificates[newTokenId] = Certificate({
            studentName: newStudentName,
            courseName: newCourseName,
            institution: newInstitution,
            ipfsURI: newIpfsURI,
            certHash: newHash,
            issuedAt: uint64(block.timestamp),
            revoked: false,
            reissuedFrom: oldTokenId,
            issuer: msg.sender
        });
        hashToTokenId[newHash] = newTokenId;
        replacedBy[oldTokenId] = newTokenId;

        // Physically remove the superseded SBT from the old wallet. The struct,
        // hash mapping, and replacedBy entry are intentionally retained so that
        // verifyCertificate(oldHash) still returns "revoked, replaced by N".
        _burn(oldTokenId);

        _safeMint(newStudentWallet, newTokenId);

        emit CertificateIssued(newTokenId, newStudentWallet, newHash, newInstitution);
        emit CertificateReissued(oldTokenId, newTokenId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Verification / read helpers
    // ---------------------------------------------------------------------

    function verifyCertificate(
        string calldata studentName,
        string calldata courseName,
        string calldata institution,
        string calldata ipfsURI
    )
        external
        view
        returns (
            bool valid,
            uint256 tokenId,
            address ownerAddr,
            bool revoked,
            uint256 replacedByTokenId
        )
    {
        bytes32 certHash = _computeHash(studentName, courseName, institution, ipfsURI);
        tokenId = hashToTokenId[certHash];
        if (tokenId == 0) {
            return (false, 0, address(0), false, 0);
        }
        Certificate storage c = certificates[tokenId];
        ownerAddr = _ownerOf(tokenId);
        revoked = c.revoked;
        replacedByTokenId = replacedBy[tokenId];
        valid = !revoked;
    }

    function getCertificate(uint256 tokenId)
        external
        view
        returns (Certificate memory)
    {
        if (certificates[tokenId].certHash == bytes32(0)) revert InvalidTokenId();
        return certificates[tokenId];
    }

    function getCertificatesByOwner(address account)
        external
        view
        returns (uint256[] memory tokenIds)
    {
        uint256 count = balanceOf(account);
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(account, i);
        }
    }

    function totalCertificates() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ---------------------------------------------------------------------
    // Token metadata (fully on-chain)
    // ---------------------------------------------------------------------

    /// @notice Returns a base64-encoded JSON data URI containing name, description,
    ///         on-chain SVG image, external_url to the IPFS-hosted PDF, and attributes.
    ///         No off-chain metadata pin is required — every byte rendered by wallets
    ///         is derived from contract storage.
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721)
        returns (string memory)
    {
        _requireOwned(tokenId);
        Certificate storage c = certificates[tokenId];

        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(_buildSVG(tokenId, c)))
        );

        string memory status = c.revoked ? "Revoked" : "Active";

        string memory json = string.concat(
            '{"name":"',
            _escapeJSON(c.courseName),
            unicode" — ",
            _escapeJSON(c.studentName),
            '","description":"Ediproof Soulbound Certificate issued by ',
            _escapeJSON(c.institution),
            ". Verifiable on-chain via certificate hash.",
            '","image":"',
            image,
            '","external_url":"',
            _escapeJSON(_ipfsToGateway(c.ipfsURI)),
            '","attributes":[',
            '{"trait_type":"Institution","value":"',
            _escapeJSON(c.institution),
            '"},',
            '{"trait_type":"Issued At","display_type":"date","value":',
            Strings.toString(uint256(c.issuedAt)),
            "},",
            '{"trait_type":"Status","value":"',
            status,
            '"},',
            '{"trait_type":"Token ID","value":"#',
            Strings.toString(tokenId),
            '"}]}'
        );

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        );
    }

    function _buildSVG(uint256 tokenId, Certificate storage c)
        private
        view
        returns (string memory)
    {
        string memory revokedStamp = c.revoked
            ? string.concat(
                '<g transform="translate(300,200) rotate(-22)">',
                '<rect x="-150" y="-40" width="300" height="80" fill="none" stroke="#a0372e" stroke-width="6"/>',
                '<text x="0" y="14" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="48" fill="#a0372e" letter-spacing="6">REVOKED</text>',
                "</g>"
            )
            : "";

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">',
            '<rect width="600" height="400" fill="#f4ecd8"/>',
            '<rect x="14" y="14" width="572" height="372" fill="none" stroke="#3a2618" stroke-width="2"/>',
            '<rect x="22" y="22" width="556" height="356" fill="none" stroke="#8a6d3b" stroke-width="1"/>',
            '<text x="300" y="78" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="16" fill="#8a6d3b" letter-spacing="4">EDIPROOF SOULBOUND CERTIFICATE</text>',
            '<text x="300" y="158" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="22" fill="#5a1a1a" letter-spacing="3">',
            _escapeXML(c.courseName),
            "</text>",
            '<text x="300" y="218" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#1a1a1a">',
            _escapeXML(c.studentName),
            "</text>",
            '<text x="300" y="296" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="#3a2618">',
            _escapeXML(c.institution),
            "</text>",
            '<text x="300" y="346" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="12" fill="#8a6d3b" letter-spacing="2">Token #',
            Strings.toString(tokenId),
            "</text>",
            revokedStamp,
            "</svg>"
        );
    }

    function _ipfsToGateway(string memory uri) private pure returns (string memory) {
        bytes memory b = bytes(uri);
        bytes memory prefix = bytes("ipfs://");
        if (b.length < prefix.length) return uri;
        for (uint256 i = 0; i < prefix.length; i++) {
            if (b[i] != prefix[i]) return uri;
        }
        bytes memory rest = new bytes(b.length - prefix.length);
        for (uint256 i = 0; i < rest.length; i++) {
            rest[i] = b[i + prefix.length];
        }
        return string.concat("https://gateway.pinata.cloud/ipfs/", string(rest));
    }

    function _escapeJSON(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        // Worst case every byte needs escaping (\X), so reserve 2x.
        bytes memory out = new bytes(b.length * 2);
        uint256 j = 0;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            if (ch == '"' || ch == "\\") {
                out[j++] = "\\";
                out[j++] = ch;
            } else if (uint8(ch) < 0x20) {
                // Control characters: drop them. Demo data is plain ASCII.
                continue;
            } else {
                out[j++] = ch;
            }
        }
        bytes memory trimmed = new bytes(j);
        for (uint256 i = 0; i < j; i++) {
            trimmed[i] = out[i];
        }
        return string(trimmed);
    }

    function _escapeXML(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        // Worst case '&' → '&amp;' (5 bytes), reserve 6x.
        bytes memory out = new bytes(b.length * 6);
        uint256 j = 0;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            if (ch == "<") {
                out[j++] = "&"; out[j++] = "l"; out[j++] = "t"; out[j++] = ";";
            } else if (ch == ">") {
                out[j++] = "&"; out[j++] = "g"; out[j++] = "t"; out[j++] = ";";
            } else if (ch == "&") {
                out[j++] = "&"; out[j++] = "a"; out[j++] = "m"; out[j++] = "p"; out[j++] = ";";
            } else if (ch == '"') {
                out[j++] = "&"; out[j++] = "q"; out[j++] = "u"; out[j++] = "o"; out[j++] = "t"; out[j++] = ";";
            } else if (ch == "'") {
                out[j++] = "&"; out[j++] = "a"; out[j++] = "p"; out[j++] = "o"; out[j++] = "s"; out[j++] = ";";
            } else {
                out[j++] = ch;
            }
        }
        bytes memory trimmed = new bytes(j);
        for (uint256 i = 0; i < j; i++) {
            trimmed[i] = out[i];
        }
        return string(trimmed);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _computeHash(
        string calldata studentName,
        string calldata courseName,
        string calldata institution,
        string calldata ipfsURI
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(studentName, courseName, institution, ipfsURI));
    }

    /// @dev Soulbound enforcement: allow mint (from == 0) and burn (to == 0),
    ///      block every other transfer.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert SoulboundTransferBlocked();
        }
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
