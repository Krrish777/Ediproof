// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
