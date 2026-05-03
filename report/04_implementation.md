# Chapter 3 — Implementation

> *Chapter overview.* This is the longest chapter of the report. It walks through the implementation in a top-down manner: project layout, the smart contract (struct, storage, events, errors, modifiers, constructor, every external function), the hash-construction and soulbound-enforcement primitives that are the project's distinctive cryptographic and access-control choices, the Hardhat configuration, the deploy and seed scripts, the Express backend (server, routes, SQLite, Pinata proxy), the Next.js front-end (pages, components, hooks, libs), the design system, the configuration files, the build-run-test commands, and the live deployment artefact recorded on Sepolia. Source-file paths are given throughout in the form `file:line` so that the chapter doubles as a guided code-walk.

---

## 3.1 Project Layout

The project root contains four sub-projects — `contracts/`, `backend/`, `frontend/`, `design/` — plus two one-shot launchers and three documentation files. The annotated tree (depth limited for readability) is shown below.

```
Ediproof/
├── README.md                       # Project overview + setup instructions
├── CLAUDE.md                       # Architecture brief (note: stale on frontend status)
├── start.bat                       # Windows one-shot launcher (87 lines)
├── start.sh                        # Unix one-shot launcher
├── wireframes.html                 # Two design variations to choose from
│
├── contracts/                      # Hardhat 2 + OpenZeppelin v5 smart contract
│   ├── contracts/
│   │   └── EdiproofCertificate.sol # Main contract (438 lines)
│   ├── scripts/
│   │   ├── deploy.ts               # Deploy + ABI export to frontend
│   │   └── seed.ts                 # Approve deployer + 3 demo certificates
│   ├── test/
│   │   └── EdiproofCertificate.test.ts   # 9 describe / 20 it
│   ├── deployments/
│   │   └── sepolia.json            # Address, deployer, txHash, deployedAt
│   ├── hardhat.config.ts           # Solidity 0.8.28, cancun, viaIR, Sepolia, Etherscan v2
│   ├── package.json                # 6 npm scripts; 11 devDeps
│   └── .env.example                # ALCHEMY_SEPOLIA_RPC, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY
│
├── backend/                        # Express 4 + better-sqlite3 + Pinata proxy
│   ├── src/
│   │   ├── server.js               # Express app (36 lines)
│   │   ├── routes.js               # 6 routes + multer (78 lines)
│   │   ├── db.js                   # SQLite WAL + 4 prepared statements (62 lines)
│   │   └── pinata.js               # Pinata V3 multipart proxy (44 lines)
│   ├── package.json                # 5 deps; engines >=22 <24
│   └── .env.example                # PORT, DB_PATH, PINATA_JWT, PINATA_GATEWAY
│
├── frontend/                       # Next.js 14 + React 18 + Ethers v6 + TS 5
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Landing
│   │   │   ├── issue/page.tsx      # Institution: issue / reissue / revoke
│   │   │   ├── verify/page.tsx     # Public verifier (wallet-less)
│   │   │   └── my-leaves/page.tsx  # Student portfolio
│   │   ├── components/
│   │   │   ├── Masthead.tsx
│   │   │   ├── WalletChip.tsx
│   │   │   ├── WalletGate.tsx
│   │   │   ├── ActivityStrip.tsx
│   │   │   └── Colophon.tsx
│   │   ├── hooks/
│   │   │   ├── useWallet.ts        # EIP-6963 + Sepolia chain switch
│   │   │   └── useContract.ts      # JsonRpcProvider + BrowserProvider
│   │   └── lib/
│   │       ├── api.ts              # Backend HTTP client (4 functions)
│   │       ├── hash.ts             # ethers.solidityPackedKeccak256 + display helpers
│   │       ├── wallet.ts           # EIP-6963 provider discovery
│   │       ├── EdiproofCertificate.abi.json  # Auto-exported by deploy script
│   │       └── deployment.json     # { address, network }
│   └── package.json                # 4 runtime deps (next/react/react-dom/ethers)
│
└── design/                         # Pre-implementation HTML wireframes
    ├── 01-landing.html
    ├── 02-issue.html
    ├── 03-verify.html
    ├── 04-my-certificates.html
    ├── index.html
    └── styles.css                  # Archival/parchment design language
```

Two design choices in this layout are worth highlighting. First, the front-end intentionally has **no** state-management library (no Redux, no Zustand, no React Query). All state is component-local; cross-component state lives in `useWallet` or in the `useContract` hook. The simplicity is deliberate — for a four-page app, a state-management library is overhead. Second, the `frontend/src/lib/EdiproofCertificate.abi.json` and `frontend/src/lib/deployment.json` files are **not** authored by hand; they are auto-exported by `contracts/scripts/deploy.ts:35-51` immediately after the contract is deployed. The contract is therefore the single upstream of both the on-chain bytecode and the front-end's ABI binding — they cannot drift.

---

## 3.2 The Smart Contract

The contract `contracts/contracts/EdiproofCertificate.sol` is 438 lines of Solidity 0.8.28. It inherits from OpenZeppelin's `ERC721Enumerable` (which itself inherits from `ERC721`) and `Ownable`, and uses `Strings` for `uint`-to-string conversion and `Base64` for the `tokenURI` data-URI encoding. The full inheritance and import block is at lines 4-15.

### 3.2.1 The `Certificate` struct (lines 16-26)

```solidity
struct Certificate {
    string studentName;
    string courseName;
    string institution;
    string ipfsURI;
    bytes32 certHash;
    uint64  issuedAt;
    bool    revoked;
    uint256 reissuedFrom; // 0 if original
    address issuer;
}
```

Table 3.1 enumerates the nine fields:

| Field | Type | Purpose |
|---|---|---|
| `studentName` | `string` | Name as written on the certificate |
| `courseName` | `string` | Programme / degree title |
| `institution` | `string` | Issuing institution name |
| `ipfsURI` | `string` | `ipfs://<cid>` pointer to the certificate file |
| `certHash` | `bytes32` | `keccak256(abi.encodePacked(...))` of the four strings — the on-chain anchor |
| `issuedAt` | `uint64` | Block timestamp of issuance, sufficient until year 584,942,417,355 |
| `revoked` | `bool` | Soft-revoke flag; `true` after `revokeCertificate` or after the old leg of `reissueCertificate` |
| `reissuedFrom` | `uint256` | The token id of the predecessor; zero for original certificates |
| `issuer` | `address` | EOA that minted; gates `revokeCertificate` and `reissueCertificate` |

### 3.2.2 Storage (lines 28-33)

The contract has four mappings and one private counter:

```solidity
mapping(uint256 => Certificate) public certificates;       // tokenId → struct
mapping(bytes32 => uint256)     public hashToTokenId;       // certHash → tokenId (verifier index)
mapping(address => bool)        public approvedInstitutions;// EOA → approved bit
mapping(uint256 => uint256)     public replacedBy;          // oldTokenId → newTokenId
uint256 private _nextTokenId = 1;                           // monotonic, starts at 1
```

`certificates` is the canonical record. `hashToTokenId` is the *inverse index* that makes hash-based verification a single SLOAD — without it, `verifyCertificate` would have to enumerate every certificate. `approvedInstitutions` is the institution whitelist, set/unset by the owner. `replacedBy` is the lineage pointer for reissuance, written at line 165.

### 3.2.3 Events (lines 35-48)

Five events, declared in order of frequency:

```solidity
event InstitutionAdded(address indexed institution);
event InstitutionRemoved(address indexed institution);
event CertificateIssued(uint256 indexed tokenId, address indexed student, bytes32 certHash, string institution);
event CertificateRevoked(uint256 indexed tokenId, address indexed revokedBy);
event CertificateReissued(uint256 indexed oldTokenId, uint256 indexed newTokenId, address indexed issuer);
```

The `indexed` modifier on the first three positional parameters of each event causes them to be stored as topics rather than data, allowing efficient filtering by Etherscan, The Graph subgraphs, and any off-chain indexer.

### 3.2.4 Custom errors (lines 50-55)

```solidity
error NotApprovedInstitution();
error DuplicateCertificate(bytes32 certHash, uint256 existingTokenId);
error NotIssuerOrOwner();
error InvalidTokenId();
error AlreadyRevoked();
error SoulboundTransferBlocked();
```

Custom errors (Solidity 0.8.4+) are preferred over `require(..., "string")` because the encoded payload is shorter (a 4-byte selector + arguments instead of a string) and because they let the test suite assert with `revertedWithCustomError(...)` rather than against a free-form string. `DuplicateCertificate(certHash, existingTokenId)` carries diagnostic data so a caller can look up the conflict without an extra read.

### 3.2.5 Modifier (lines 57-60)

```solidity
modifier onlyApprovedInstitution() {
    if (!approvedInstitutions[msg.sender]) revert NotApprovedInstitution();
    _;
}
```

Used by `issueCertificate` (line 91) and `reissueCertificate` (line 133) to gate writes. `revokeCertificate` does *not* use this modifier — it allows the original issuer to revoke even if the issuer has since been removed from the whitelist. The asymmetry is deliberate: revocation should remain available even after an institution is de-listed.

### 3.2.6 Constructor (lines 62-65)

```solidity
constructor(address initialOwner)
    ERC721("Ediproof Certificate", "EDI")
    Ownable(initialOwner)
{}
```

The token has the human-readable name *Ediproof Certificate* and the symbol *EDI*. `initialOwner` is the deployer wallet, persisted as `0xe3F2…F94c6d` on Sepolia (`deployments/sepolia.json:4`). The constructor body is empty because no further initialisation is required.

### 3.2.7 Public-function inventory

Table 3.3 summarises the contract's external surface.

| Group | Function | File:line | Gating | Effect |
|---|---|---|---|---|
| Inst. mgmt | `addInstitution(address)` | `:71-74` | `onlyOwner` | Sets approved bit; emits `InstitutionAdded` |
| Inst. mgmt | `removeInstitution(address)` | `:76-79` | `onlyOwner` | Clears approved bit; emits `InstitutionRemoved` |
| Lifecycle | `issueCertificate(student, name, course, institution, ipfsURI)` | `:85-114` | `onlyApprovedInstitution` | Computes hash, mints SBT, emits `CertificateIssued` |
| Lifecycle | `revokeCertificate(tokenId)` | `:116-124` | issuer or owner; rejects double-revoke | Sets `revoked=true`; emits `CertificateRevoked` |
| Lifecycle | `reissueCertificate(oldId, name, course, institution, ipfsURI, newWallet)` | `:126-176` | `onlyApprovedInstitution` + issuer-or-owner | Soft-revokes old, computes new hash, mints new, *burns* old, links lineage |
| Read | `verifyCertificate(name, course, institution, ipfsURI)` | `:182-208` | none | Returns `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)` |
| Read | `getCertificate(tokenId)` | `:210-217` | none; reverts on unknown id | Returns the full struct |
| Read | `getCertificatesByOwner(address)` | `:219-229` | none | Returns array of token ids owned |
| Read | `totalCertificates()` | `:231-233` | none | Returns `_nextTokenId - 1` |
| Metadata | `tokenURI(tokenId)` | `:243-290` | reverts on unknown id (via `_requireOwned`) | Returns base64 JSON data URI with on-chain SVG |

The standard ERC-721 + Enumerable surface (`balanceOf`, `ownerOf`, `tokenOfOwnerByIndex`, `safeTransferFrom`, `transferFrom`, `approve`, `setApprovalForAll`, `getApproved`, `isApprovedForAll`, `supportsInterface`) is inherited unchanged from OpenZeppelin. The transfer-style functions are reachable but *every* one of them passes through `_update` (override at line 410-420), so the soulbound condition fires before any state change.

### 3.2.8 `issueCertificate` walkthrough (lines 85-114)

```solidity
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
        courseName:  courseName,
        institution: institution,
        ipfsURI:     ipfsURI,
        certHash:    certHash,
        issuedAt:    uint64(block.timestamp),
        revoked:     false,
        reissuedFrom: 0,
        issuer:      msg.sender
    });
    hashToTokenId[certHash] = tokenId;

    _safeMint(student, tokenId);

    emit CertificateIssued(tokenId, student, certHash, institution);
}
```

Three notes. First, the duplicate check at line 94-95 ensures that the same `(name, course, institution, ipfsURI)` cannot be minted twice — even by a different institution wallet. This is a deliberate global-uniqueness invariant, exercised by `test_golden_*` "duplicate hash reverts" at `test/EdiproofCertificate.test.ts:93-115`. Second, `_safeMint` (from OpenZeppelin's `ERC721`) calls `onERC721Received` on the recipient if it is a contract, ensuring that contract recipients are aware of the new token. Third, the `issuer` field is `msg.sender`, *not* `tx.origin` — the gating thus correctly applies to a meta-transaction relayer if one is added in future.

### 3.2.9 `revokeCertificate` walkthrough (lines 116-124)

```solidity
function revokeCertificate(uint256 tokenId) external {
    Certificate storage c = certificates[tokenId];
    if (c.certHash == bytes32(0))                              revert InvalidTokenId();
    if (msg.sender != c.issuer && msg.sender != owner())       revert NotIssuerOrOwner();
    if (c.revoked)                                             revert AlreadyRevoked();

    c.revoked = true;
    emit CertificateRevoked(tokenId, msg.sender);
}
```

Three guards before the state change: existence (the `certHash` of an absent struct is the zero bytes32), authorisation (issuer or contract owner), and idempotency (`AlreadyRevoked` to prevent silent re-revocation). The function is a *soft* revoke — the token continues to exist in the student's wallet, but the `revoked` flag flips, and `verifyCertificate(...)` then returns `valid = false, revoked = true`. This is exercised by tests at `test/EdiproofCertificate.test.ts:262-282`.

### 3.2.10 `reissueCertificate` walkthrough (lines 126-176)

The reissuance flow is the most complex of the three lifecycle paths. It implements a *burn-and-remint* with an audit trail. The sequence is:

1. **Validate the old token** (lines 134-136). Existence and authorisation are checked exactly as in `revokeCertificate`.
2. **Soft-revoke if not already revoked** (lines 138-141). If the old certificate is still active, flip `revoked = true` and emit `CertificateRevoked`. This step is idempotent — if the caller has already revoked, the function proceeds without re-emitting.
3. **Compute the new hash and reject duplicates** (lines 143-150). Same logic as `issueCertificate`.
4. **Persist the new struct** (lines 152-163). The new struct's `reissuedFrom` field is set to the old `tokenId`.
5. **Update the `replacedBy` mapping** (line 165). `replacedBy[oldTokenId] = newTokenId`. This is the lineage pointer that lets verifiers presenting the old hash receive a "revoked, replaced by N" answer.
6. **Burn the old token** (line 170). `_burn(oldTokenId)`. The old token disappears from the student's wallet — `ownerOf(oldTokenId)` reverts after this point (locked in by `test/EdiproofCertificate.test.ts:286-314`). The struct, the hash mapping, and the `replacedBy` entry are *intentionally* retained so that `verifyCertificate(oldHash)` continues to work.
7. **Mint the new token to the student wallet** (line 172). `_safeMint(newStudentWallet, newTokenId)`.
8. **Emit both events** (lines 174-175). `CertificateIssued(newTokenId, ...)` for the new mint and `CertificateReissued(oldTokenId, newTokenId, msg.sender)` for the lineage record.

The retention of the old struct after `_burn` is the key design subtlety. ERC-721's `_burn` clears the `_owners` mapping but does not touch any other contract storage — the `Certificate` struct in `certificates[oldTokenId]` therefore remains readable, which is what allows `verifyCertificate(oldHash)` to return the helpful "revoked, replaced by 2" tuple instead of "not found". This is exercised explicitly by the test at `test/EdiproofCertificate.test.ts:316-350`.

### 3.2.11 On-chain `tokenURI` (lines 243-290)

The contract returns a fully-self-contained metadata payload: a `data:application/json;base64,...` URI whose JSON body contains a `data:image/svg+xml;base64,...` value in its `image` field. No off-chain metadata pin is required. This makes the SBT renderable in any ERC-721-aware wallet (MetaMask, Rainbow, OpenSea-Sepolia) without any further infrastructure.

The JSON body has five top-level fields and four `attributes`:

```json
{
  "name": "<courseName> — <studentName>",
  "description": "Ediproof Soulbound Certificate issued by <institution>. Verifiable on-chain via certificate hash.",
  "image": "data:image/svg+xml;base64,<base64 SVG>",
  "external_url": "<https gateway URL constructed from ipfsURI>",
  "attributes": [
    { "trait_type": "Institution", "value": "<institution>" },
    { "trait_type": "Issued At", "display_type": "date", "value": <unix timestamp> },
    { "trait_type": "Status", "value": "Active" or "Revoked" },
    { "trait_type": "Token ID", "value": "#<tokenId>" }
  ]
}
```

Any user-supplied field flows through `_escapeJSON` (lines 343-365) before being inlined into the JSON. The escape function (a) doubles backslashes and double-quotes (`"` → `\"`, `\` → `\\`) and (b) silently drops control characters below `0x20`. This is what makes the JSON parsable even when a user types a name like `Alice "The Hacker" O\Brien`, locked in by `test/EdiproofCertificate.test.ts:442-458`.

### 3.2.12 On-chain SVG (lines 292-327)

`_buildSVG` constructs a 600×400 SVG document with a parchment-coloured background (`#f4ecd8`), a brown double border (`#3a2618` outer, `#8a6d3b` inner), the project name in italic small caps (*EDIPROOF SOULBOUND CERTIFICATE*), the course name in oxblood italic, the student name in large serif type, the institution name below it, and a footer reading `Token #<id>`. If the certificate has been revoked, an additional SVG group is rendered: a 300×80 red rectangle rotated -22 degrees with the text *REVOKED* inside it (lines 297-304). The revoked stamp is asserted by the test at `test/EdiproofCertificate.test.ts:386-414`.

User-supplied fields (course name, student name, institution name) flow through `_escapeXML` (lines 367-393) before being inlined into the SVG. The function escapes `<`, `>`, `&`, `"`, and `'` to their named entities — defending the SVG against the same class of injection that the JSON escaping defends against on the metadata side.

---

## 3.3 Hash Construction and Soulbound Enforcement

These two primitives — the hash and the `_update` override — are the cryptographic and access-control core of the project. They are reproduced here in full.

### 3.3.1 The hash (lines 399-406)

```solidity
function _computeHash(
    string calldata studentName,
    string calldata courseName,
    string calldata institution,
    string calldata ipfsURI
) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(studentName, courseName, institution, ipfsURI));
}
```

`abi.encodePacked` concatenates the four strings without padding. `keccak256` then produces a 32-byte digest. Any change to *any* byte of *any* of the four fields produces a different digest with overwhelming probability — the central security property of the verification path. The same primitive is invoked by the front-end at `frontend/src/lib/hash.ts:13-17`, which wraps `ethers.solidityPackedKeccak256(['string','string','string','string'], [...])` to give the institution a live hash preview that is bit-identical to the contract's computation. The test at `test/EdiproofCertificate.test.ts:241-260` ("returns valid=false for tampered input (single letter change)") locks this down.

### 3.3.2 Soulbound enforcement (lines 410-420)

```solidity
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
```

OpenZeppelin's ERC-721 funnels all transfer-shaped operations through `_update` — `_mint` (called from `_safeMint`) calls it with `from == 0`; `_burn` calls it with `to == 0`; `transferFrom` and `safeTransferFrom` call it with both `from != 0` and `to != 0`. The override above lets the first two through (mint and burn) and reverts the third — the entirety of the soulbound contract. Five lines of Solidity, including the closing brace.

The custom error `SoulboundTransferBlocked()` is asserted by `test/EdiproofCertificate.test.ts:119-141` ("safeTransferFrom reverts"). Because `_update` is the *only* path through which an ERC-721 token's owner can change, this single override blocks every transfer surface — including `safeTransferFrom`, `transferFrom`, the token-managed approval flows, marketplace clear-and-claim patterns, and any future ERC-721 operation that may be added through OZ extensions.

---

## 3.4 Hardhat Configuration (`contracts/hardhat.config.ts`)

The full configuration is 52 lines. Three blocks are worth highlighting:

### 3.4.1 Compiler (lines 12-19)

```typescript
solidity: {
  version: "0.8.28",
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    viaIR: true,
  },
},
```

The `cancun` EVM target and `viaIR: true` flag were both required to compile OpenZeppelin v5 contracts under Solidity 0.8.28 — they were added in commit `86c3aa8` after the initial OZ-v5 + 0.8.28 combination failed to compile. The optimiser at `runs: 200` balances deployment cost (the default) against runtime cost (favoured by larger values) — `200` is the OpenZeppelin default and is appropriate for a contract that is deployed once and called many times.

### 3.4.2 Networks (lines 20-29)

```typescript
networks: {
  hardhat: {},
  sepolia: ALCHEMY_SEPOLIA_RPC ? {
    url: ALCHEMY_SEPOLIA_RPC,
    accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    chainId: 11155111,
  } : undefined as any,
},
```

Two networks are configured. `hardhat` is the in-process test network used by `npm test`. `sepolia` is conditional on `ALCHEMY_SEPOLIA_RPC` being set — if the env var is missing, the network is `undefined` and any attempt to deploy fails clean rather than connecting to mainnet by accident. The `chainId: 11155111` is Sepolia's official identifier and matches the front-end's `useWallet.ts:14`.

### 3.4.3 Etherscan v2 (lines 30-42)

```typescript
etherscan: {
  apiKey: ETHERSCAN_API_KEY,
  customChains: [{
    network: "sepolia",
    chainId: 11155111,
    urls: {
      apiURL:    "https://api.etherscan.io/v2/api?chainid=11155111",
      browserURL:"https://sepolia.etherscan.io",
    },
  }],
},
```

Etherscan migrated to a v2 endpoint structure in early 2026; the customChains override is what makes `hardhat verify --network sepolia` route to the correct v2 URL. This was added in commit `c335550`.

---

## 3.5 Deployment Script (`contracts/scripts/deploy.ts`)

The deploy script is 63 lines. It runs end-to-end in approximately twenty seconds from a clean state, divided into five steps.

1. **Identify the deployer and log the network** (lines 5-10). `ethers.getSigners()` returns the wallet derived from `DEPLOYER_PRIVATE_KEY`; the deployer's balance is logged so the operator can confirm there is enough Sepolia ETH.
2. **Deploy the contract** (lines 12-14). `ethers.getContractFactory("EdiproofCertificate")` and `Factory.deploy(deployer.address)` — the deployer's address becomes the `Ownable` initial owner.
3. **Persist the deployment metadata** (lines 21-33). The script writes `contracts/deployments/{network.name}.json` with five fields: `network`, `address`, `deployer`, `deployedAt`, `txHash`. This file is read by the seed script at `seed.ts:6-17` and by the testing chapter's documentation.
4. **Export the ABI to the front-end** (lines 35-51). The artifact is loaded from `contracts/artifacts/contracts/EdiproofCertificate.sol/EdiproofCertificate.json` and the `.abi` field is written to `frontend/src/lib/EdiproofCertificate.abi.json`. The contract address is written to `frontend/src/lib/deployment.json`. Both writes are wrapped in a `try`/`catch` (lines 38-51) so that the script continues if the front-end directory does not yet exist.
5. **Print next-step instructions** (lines 53-56). The script outputs the exact `hardhat verify` command, a reminder to copy the address into `frontend/.env.local`, and a pointer to the seed script.

The actual deployment to Sepolia recorded for this project produced the artefact:

```json
{
  "network":   "sepolia",
  "address":   "0x14Cf79F1ef984db755f0803E215FB12038Ad64d5",
  "deployer":  "0xe3F2f5e13Dc8D95545AED98EFBbD9BF892F94c6d",
  "deployedAt":"2026-04-19T06:38:37.295Z",
  "txHash":    "0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6"
}
```

This file at `contracts/deployments/sepolia.json` is the authoritative deployment record consulted throughout the rest of this report.

---

## 3.6 Seed Script (`contracts/scripts/seed.ts`)

The seed script is 78 lines. It is run *after* `deploy.ts` and serves two purposes: to approve the deployer wallet as the demonstration institution, and to issue three sample certificates that populate the front-end with visible data.

The three sample certificates seeded against the live Sepolia deployment are:

| # | Student | Course | Institution | IPFS URI |
|---|---|---|---|---|
| 1 | Aarav Sharma | B.Tech Computer Science | MIT | `ipfs://bafybeigdyrztseedcert1aarav` |
| 2 | Priya Patel | M.Sc Data Science | Stanford University | `ipfs://bafybeigdyrztseedcert2priya` |
| 3 | Rahul Verma | B.E. Electronics Engineering | IIT Delhi | `ipfs://bafybeigdyrztseedcert3rahul` |

(Source: `seed.ts:36-55`.)

The student wallet for all three is the deployer itself (line 35) — *"for demo, issue to self"* — which is not a privacy-sensible choice for a real deployment but is convenient for a demonstration where the same operator needs to be able to inspect each certificate from a single wallet. In a real deployment, the institution would call `issueCertificate(...)` with the actual student's wallet address.

---

## 3.7 Backend (Express + Pinata + SQLite)

The backend is 220 lines of plain JavaScript across four files. It is deliberately minimal — Ediproof's design rule is that the backend is *not* on the critical path for verification. If it goes offline, only file uploads (which require Pinata) and the analytics dashboard stop working; the verifier path continues to function unchanged.

### 3.7.1 `backend/src/server.js` (36 lines)

The Express application is bootstrapped in five lines:

```javascript
const app = express();
const PORT = Number(process.env.PORT) || 8787;
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", router);
```

A discovery route at `GET /` returns a self-describing JSON listing the six endpoints (lines 14-26) — useful when an operator hits the backend with a bare browser to confirm it is alive. A global error handler at lines 28-31 catches any uncaught error from a route and returns `500 { error: <message> }`. The server then listens on the configured port and logs `[ediproof-backend] listening on http://localhost:<PORT>`.

### 3.7.2 `backend/src/routes.js` — six routes (78 lines)

Table 3.5 enumerates the routes:

| Method | Path | File:line | Auth | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | `:13-15` | none | Returns `{ ok: true, service: "ediproof-backend" }` |
| POST | `/api/upload` | `:21-36` | none, but `multipart/form-data` field `file` ≤ 15 MB | Forwards to Pinata, returns `{ cid, ipfsURI, gatewayURL }` |
| POST | `/api/log` | `:43-56` | none, but `kind` required | Inserts a row into `events` |
| GET | `/api/stats` | `:58-67` | none | Returns aggregate counts by kind + distinct institution count |
| GET | `/api/activity` | `:69-72` | none, `limit` clamped to 100 | Returns the last `limit` events |
| GET | `/api/institution/:address` | `:74-77` | none | Returns `{ address, issuedCount, lastActive }` |

Multer is configured at lines 6-9 with in-memory storage and a 15 MB per-file limit — the typical certificate PDF is well under this limit. The upload route at lines 21-36 is the one with the most interesting failure modes: a missing `file` field returns a 400 with a helpful message, a Pinata-side failure surfaces the upstream message verbatim (commit `76a851d` introduced this surfacing).

The log route at lines 43-56 takes a JSON body with one required field (`kind`) and four optional fields (`tokenId`, `txHash`, `actor`, `institution`); `Date.now()` is added server-side so the timestamp is monotonic across calls. The stats and activity routes are pure SQL — they delegate to the prepared statements at `db.js`.

### 3.7.3 `backend/src/db.js` — SQLite setup (62 lines)

The database is opened with `better-sqlite3` (the synchronous driver chosen because the backend's load is low and synchronous code is easier to reason about than the asynchronous alternatives):

```javascript
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
```

WAL (Write-Ahead Logging) mode at line 11 lets reads proceed concurrently with writes — necessary because the front-end may be polling `GET /api/activity` while the institution is firing `POST /api/log`. The schema is created idempotently with `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` (lines 13-26), reproduced in §2.2.2 of Chapter 2.

The four prepared statements (lines 28-59) are the only data-access path. Prepared statements (a) parse the SQL once at startup rather than on every call and (b) bind parameters with the correct type, defending against SQL injection. They are reproduced verbatim:

```javascript
export const insertEvent = db.prepare(`
  INSERT INTO events (kind, token_id, tx_hash, actor, institution, created_at)
  VALUES (@kind, @tokenId, @txHash, @actor, @institution, @createdAt)
`);

export const selectStats = db.prepare(`
  SELECT
    SUM(CASE WHEN kind = 'issued'   THEN 1 ELSE 0 END) AS totalIssued,
    SUM(CASE WHEN kind = 'revoked'  THEN 1 ELSE 0 END) AS totalRevoked,
    SUM(CASE WHEN kind = 'reissued' THEN 1 ELSE 0 END) AS totalReissued,
    SUM(CASE WHEN kind = 'verified' THEN 1 ELSE 0 END) AS totalVerified,
    COUNT(DISTINCT institution) AS institutions
  FROM events
`);

export const selectActivity = db.prepare(`
  SELECT id, kind, token_id AS tokenId, tx_hash AS txHash,
         actor, institution, created_at AS createdAt
  FROM events
  ORDER BY created_at DESC
  LIMIT ?
`);

export const selectByInstitution = db.prepare(`
  SELECT
    institution AS address,
    COUNT(*) AS issuedCount,
    MAX(created_at) AS lastActive
  FROM events
  WHERE institution = ? AND kind = 'issued'
  GROUP BY institution
`);
```

Each prepared statement is re-used across every request that needs it — there is no per-request preparation cost.

### 3.7.4 `backend/src/pinata.js` — Pinata V3 multipart proxy (44 lines)

The proxy module exports one function, `uploadToPinata(buffer, filename, mimetype)`, which:

1. **Reads the JWT** from `process.env.PINATA_JWT` and throws if it is missing (lines 9-12). This is the *only* place in the codebase that touches the JWT; the backend's six routes never receive it from a request and never return it in a response.
2. **Constructs a multipart form** with three fields (lines 14-18): `file` (a `Blob` wrapping the buffer with the original MIME type), `network` (always `"public"` for Pinata's public IPFS network), and `name` (the original filename, used as Pinata-side metadata).
3. **Posts to Pinata V3** at `https://uploads.pinata.cloud/v3/files` with a `Bearer` Authorization header (lines 20-24).
4. **Validates the response** (lines 26-35). Non-2xx responses produce an error including the upstream status code and body text. The CID is extracted from `json?.data?.cid` and a missing CID raises an explicit error with the offending JSON for easier debugging.
5. **Returns a tidy three-field object** (lines 37-42): `cid`, `ipfsURI` (`ipfs://<cid>`), and `gatewayURL` (`<gateway>/ipfs/<cid>`, where the gateway is either the env var `PINATA_GATEWAY` or the public default `https://gateway.pinata.cloud`).

The function is the entire surface area of the Pinata integration. There is no caching, no retry, no Pinata SDK dependency — just `fetch`. This minimalism is deliberate: it makes the proxy easy to reason about and easy to swap for a different pinning service if Pinata becomes unsuitable.

---

## 3.8 Front-end (Next.js 14 + Ethers v6)

The front-end is a Next.js 14.2.29 application using the App Router. Table 3.6 inventories its source files.

| Group | File | Lines | Purpose |
|---|---|---|---|
| Layout | `src/app/layout.tsx` | small | Root layout shared by every page |
| Page | `src/app/page.tsx` | medium | Landing |
| Page | `src/app/issue/page.tsx` | large | Institution: issue / reissue / revoke; wallet-gated |
| Page | `src/app/verify/page.tsx` | large | Public verifier; **not** wallet-gated |
| Page | `src/app/my-leaves/page.tsx` | medium | Student portfolio; wallet-gated |
| Component | `src/components/Masthead.tsx` | small | Newspaper-style header |
| Component | `src/components/WalletChip.tsx` | small | Compact connected-wallet indicator |
| Component | `src/components/WalletGate.tsx` | small | Page-level connection prompt + Sepolia switch |
| Component | `src/components/ActivityStrip.tsx` | small | Recent-events ticker |
| Component | `src/components/Colophon.tsx` | small | Footer |
| Hook | `src/hooks/useWallet.ts` | 124 | EIP-6963 discovery + Sepolia chain-switch |
| Hook | `src/hooks/useContract.ts` | 38 | Read-only `JsonRpcProvider` + signed `BrowserProvider` |
| Lib | `src/lib/api.ts` | 78 | Backend HTTP client (4 functions) |
| Lib | `src/lib/hash.ts` | 44 | `solidityPackedKeccak256` + display helpers |
| Lib | `src/lib/wallet.ts` | 72 | EIP-6963 provider listener + getMetaMaskProvider |
| Auto | `src/lib/EdiproofCertificate.abi.json` | — | Exported by `deploy.ts` |
| Auto | `src/lib/deployment.json` | — | Exported by `deploy.ts` |

### 3.8.1 EIP-6963 wallet discovery (`lib/wallet.ts`)

When multiple wallet extensions are installed in the same browser (MetaMask + OKX + Coinbase, say), each races to inject itself into `window.ethereum`. Whichever wallet wins last "owns" the global slot. OKX in particular has been observed to overwrite MetaMask, causing `window.ethereum` to point at OKX even when the user intended to use MetaMask. This was the root cause of the user-reported bug closed by commit `8fe44f9`.

EIP-6963 defines a custom-event protocol that bypasses the global slot. Each wallet announces itself on the `eip6963:announceProvider` window event with a `{ info: { uuid, name, icon, rdns }, provider }` detail. The application listens for these announcements and dispatches `eip6963:requestProvider` to invite all installed wallets to announce themselves. Ediproof's implementation is a 73-line module:

```typescript
// frontend/src/lib/wallet.ts:32-40
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail
    if (detail?.info?.uuid && !announced.find(p => p.info.uuid === detail.info.uuid)) {
      announced.push(detail)
    }
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}
```

The `getMetaMaskProvider()` function at lines 46-64 then picks the announcement whose `info.rdns === 'io.metamask'`, falls back to the legacy `window.ethereum.providers[]` array if no EIP-6963 announcements arrived, and finally to a strict `window.ethereum.isMetaMask` check. The three-step fallback ensures the picker works against MetaMask installations of every vintage.

### 3.8.2 Wallet hook (`hooks/useWallet.ts:41-124`)

The hook returns `{ address, chainId, isConnecting, error, connect }`. On mount (lines 85-121) it subscribes to MetaMask's `accountsChanged` and `chainChanged` events so that the UI re-renders when the user switches account or network. The `connect()` callback (lines 47-83) sequences four steps:

1. Pick the MetaMask provider via EIP-6963 (`getMetaMaskProvider()`).
2. Request `eth_requestAccounts` (which triggers MetaMask's connection pop-up).
3. Read the current `eth_chainId`.
4. If not Sepolia, call `switchToSepolia(provider)` (helper at lines 16-39), which sends `wallet_switchEthereumChain` and falls back to `wallet_addEthereumChain` if Sepolia is unknown to the wallet (error code `4902`).

The `wallet_addEthereumChain` payload (lines 27-33) includes the official Sepolia name, native currency, RPC URL (`https://rpc.sepolia.org`), and block-explorer URL (`https://sepolia.etherscan.io`).

### 3.8.3 Contract hook (`hooks/useContract.ts`)

The hook exposes two paths. The `useContract()` React hook (lines 16-23) returns a memoised read-only contract via `ethers.JsonRpcProvider(ALCHEMY_URL)` — the wallet-less verifier path. The `getSignedContract()` async function (lines 30-38) returns a contract bound to the MetaMask `BrowserProvider`'s signer — used by the issuance and student pages for write operations. The contract address is loaded from the auto-exported `deployment.json` (line 5) and the ABI from `EdiproofCertificate.abi.json` (line 6), so updating the contract requires only re-running `npm run deploy:sepolia` from `contracts/`.

### 3.8.4 Off-chain hash preview (`lib/hash.ts:7-17`)

```typescript
export function computeCertHash(
  name: string,
  course: string,
  institution: string,
  ipfsURI: string,
): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'string', 'string', 'string'],
    [name, course, institution, ipfsURI],
  )
}
```

The function reproduces the on-chain `keccak256(abi.encodePacked(...))` exactly, in the browser, with no contract round-trip. The institution sees the live hash update as they type, and the same hash appears on chain after the issuance transaction is mined — a useful debugging aid that also doubles as a sanity check for verifiers preparing a verification claim.

### 3.8.5 Backend HTTP client (`lib/api.ts`)

Four exported functions: `fetchStats()`, `fetchActivity(limit)`, `logEvent(payload)`, `uploadFile(file)`, plus `fetchInstitutionStats(address)`. The base URL is hard-coded at line 1 (`http://localhost:8787`). The `uploadFile` function at lines 45-71 has a particularly verbose error-handling path: if the backend is unreachable (a typical mistake when only one of the two `start.bat` windows has been opened), the user sees a helpful message — *"Backend unreachable at http://localhost:8787. Is the backend server running? Start it by double-clicking start.bat..."* — rather than a cryptic `TypeError: Failed to fetch`. The pattern was added in commit `76a851d`.

---

## 3.9 Design System and Wireframes (`design/`)

The `design/` directory contains four standalone HTML wireframes (`01-landing.html`, `02-issue.html`, `03-verify.html`, `04-my-certificates.html`), an index page, and a single shared stylesheet (`styles.css`). These wireframes are the design-time artefact: they predate the Next.js scaffolding and were used to choose the visual language before any React component was written. They are kept in the repository as a reference for future redesigns.

The chosen design language is *archival*. The palette is built around a parchment cream (`#fef9f3`-ish), an oxblood red for emphasis (`#5a1a1a`), an ink black for body text (close to `#1a1a1a`), and a brass brown for borders (`#8a6d3b`). The typography is a serif for body text, an italic small-caps for the masthead, and a monospace for hashes and addresses. The visual metaphor is *the ledger of verified learning, impressed in ink that cannot be unwritten* (`design/01-landing.html`'s tagline) — each certificate is a "leaf" pressed into the ledger, which is why the student-portfolio page is named `/my-leaves`.

The Next.js implementation reuses the design language but renders it as React components. Inline styles on the Verify page (`frontend/src/app/verify/page.tsx:63-79`) use CSS custom properties (`var(--ink)`, `var(--oxblood)`, `var(--font-display)`) defined in the global stylesheet, keeping the design tokens centralised.

---

## 3.10 Configuration and Environment Files

Two `.env.example` files document the operator-facing configuration.

**`contracts/.env.example`** (12 lines):
```
ALCHEMY_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_KEY
```

The three variables are the Sepolia RPC (read from `hardhat.config.ts:7`), the deployer wallet private key (read from line 8), and the Etherscan API key for `hardhat verify` (read from line 9). The file is copied to `contracts/.env.local` (which is gitignored) and the operator fills in real values.

**`backend/.env.example`** (12 lines):
```
PORT=8787
DB_PATH=./ediproof.db
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PINATA_GATEWAY=https://gateway.pinata.cloud
```

`PORT` defaults to 8787 (`backend/src/server.js:7`). `DB_PATH` defaults to `./ediproof.db` relative to `backend/src/` (`backend/src/db.js:6-8`). `PINATA_JWT` is the only mandatory variable — the Pinata proxy throws if it is missing (`backend/src/pinata.js:10-12`). `PINATA_GATEWAY` is optional; if not set, the public gateway is used.

A third env file exists in the front-end for `VITE_CONTRACT_ADDRESS` (referenced in `deploy.ts:55`), but the current implementation reads the address directly from the auto-exported `deployment.json` and the env variable is therefore unused — a cleanup item noted in the future-work chapter.

---

## 3.11 Build, Run, and Test Commands

| Action | Command | Sub-project |
|---|---|---|
| Compile contracts | `npm run compile` | `contracts/` |
| Run contract tests | `npm test` | `contracts/` |
| Deploy to Sepolia | `npm run deploy:sepolia` | `contracts/` |
| Seed demo certificates | `npm run seed:sepolia` | `contracts/` |
| Verify on Etherscan | `npm run verify:sepolia <address> <constructor-arg>` | `contracts/` |
| Local Hardhat node | `npm run node` | `contracts/` |
| Start backend | `npm start` | `backend/` |
| Backend with watch | `npm run dev` | `backend/` |
| Front-end dev server | `npm run dev` | `frontend/` |
| Front-end production build | `npm run build` | `frontend/` |
| Front-end production server | `npm run start` | `frontend/` |
| **All-in-one (Windows)** | `start.bat` | repository root |
| **All-in-one (Unix)** | `./start.sh` | repository root |

The all-in-one launcher is the recommended path for a non-developer audience (a viva examiner, a recruiter watching a demo). It detects Node, installs both backend and front-end dependencies, warns if `backend/.env` is missing, opens two terminal windows (one per server), waits 15 seconds for boot-up, and opens `http://localhost:3000` in the default browser.

---

## 3.12 Live Deployment Artefact

The contract is deployed to Sepolia at the address recorded in `contracts/deployments/sepolia.json`:

| Field | Value |
|---|---|
| Network | sepolia |
| Address | `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` |
| Deployer | `0xe3F2f5e13Dc8D95545AED98EFBbD9BF892F94c6d` |
| Deployed at | `2026-04-19T06:38:37.295Z` |
| Tx hash | `0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6` |

The contract is publicly inspectable at:

> **https://sepolia.etherscan.io/address/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5**

The deployment transaction is at:

> **https://sepolia.etherscan.io/tx/0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6**

Any reader of this report may follow either link to confirm independently that the contract is live, that it carries the source code documented in this chapter, and that the constructor argument was the deployer EOA quoted above.

---

> *Chapter summary.* This chapter has walked through every layer of the implementation from the project layout, through the smart contract (struct, storage, events, errors, modifier, lifecycle and read functions, on-chain `tokenURI` and SVG, hash construction, soulbound enforcement), the Hardhat configuration (Solidity 0.8.28, cancun, viaIR, Sepolia chainId, Etherscan v2), the deploy and seed scripts, the four-file Express backend (server, routes, db, pinata), the Next.js front-end (pages, components, hooks, libs, EIP-6963 wallet discovery), the design system, the env files, the npm scripts, and the live deployment artefact. Wherever a constant or a control-flow choice could be misread, the corresponding `file:line` location has been cited so that the reader can verify the description against the source. Chapter 4 now turns to the testing strategy, presenting the unit tests, the integration testing approach, the system-level demonstration, the performance characterisation, and the security posture of the codebase.
