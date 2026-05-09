# Chapter 9 — Appendix

> *Chapter overview.* This appendix collects supplementary material referenced throughout the body of the report. §9.1 records additional configuration data — environment file templates, npm-script inventories, and package manifests — that an examiner reproducing the project will need. §9.2 reproduces the most important code listings extracted from `EdiproofCertificate.sol` and the backend so that an examiner can read the headline primitives without opening the source tree. §9.3 collects the figures referenced in the body of the report. §9.4 records the live deployment artefact and the URLs at which it can be independently re-verified.

---

## 9.1 Additional Data

### 9.1.1 Environment file templates

**`contracts/.env.example`** (3 mandatory variables):

```
# RPC endpoint for the Sepolia testnet
ALCHEMY_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# Deployer wallet private key (must hold ≥ 0.05 Sepolia ETH)
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# Etherscan API key for hardhat verify
ETHERSCAN_API_KEY=YOUR_KEY
```

**`backend/.env.example`** (4 variables, only `PINATA_JWT` mandatory):

```
# Express port (default 8787)
PORT=8787

# SQLite database path (default ./ediproof.db)
DB_PATH=./ediproof.db

# Pinata V3 JWT — never returned to the browser
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional Pinata gateway override (default: https://gateway.pinata.cloud)
PINATA_GATEWAY=https://gateway.pinata.cloud
```

### 9.1.2 npm script inventory

| Sub-project | Script | Action |
|---|---|---|
| `contracts/` | `npm run compile` | Compile Solidity with Hardhat |
| `contracts/` | `npm test` | Run Chai unit tests against in-process Hardhat node |
| `contracts/` | `npm run deploy:sepolia` | Deploy to Sepolia + export ABI to front-end |
| `contracts/` | `npm run seed:sepolia` | Approve deployer + 3 sample certificates |
| `contracts/` | `npm run verify:sepolia` | Verify on Etherscan |
| `contracts/` | `npm run node` | Start local Hardhat node |
| `backend/` | `npm start` | Start Express server on port 8787 |
| `backend/` | `npm run dev` | Start with `--watch` (hot reload) |
| `frontend/` | `npm run dev` | Next.js dev server on port 3000 |
| `frontend/` | `npm run build` | Production build |
| `frontend/` | `npm run start` | Production server |

### 9.1.3 Backend `events` table schema

```sql
CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT NOT NULL,          -- 'issued' | 'revoked' | 'reissued' | 'verified'
    token_id     INTEGER,                -- nullable; absent for 'verified' events
    tx_hash      TEXT,                   -- nullable
    actor        TEXT,                   -- the EOA that performed the action
    institution  TEXT,                   -- the institution name string
    created_at   INTEGER NOT NULL        -- ms since epoch (server-side)
);
CREATE INDEX IF NOT EXISTS idx_events_kind        ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_institution ON events(institution);
CREATE INDEX IF NOT EXISTS idx_events_created_at  ON events(created_at);
```

### 9.1.4 Front-end runtime dependency manifest

```json
{
  "dependencies": {
    "next":      "14.2.29",
    "react":     "^18.3.1",
    "react-dom": "^18.3.1",
    "ethers":    "^6.13.4"
  }
}
```

The runtime dependency list is deliberately exactly four entries, keeping the supply-chain attack surface minimal.

### 9.1.5 Custom errors raised by the contract

| Error | Selector calc | Carries | Raised in |
|---|---|---|---|
| `NotApprovedInstitution()` | `keccak256("NotApprovedInstitution()")[0:4]` | — | `onlyApprovedInstitution` modifier |
| `DuplicateCertificate(bytes32, uint256)` | computed | hash + existing token id | `issueCertificate`, `reissueCertificate` |
| `NotIssuerOrOwner()` | computed | — | `revokeCertificate`, `reissueCertificate` |
| `InvalidTokenId()` | computed | — | lifecycle functions on unknown id |
| `AlreadyRevoked()` | computed | — | `revokeCertificate` |
| `SoulboundTransferBlocked()` | computed | — | `_update` on transfer |

---

## 9.2 Source Code

This section reproduces the most important code extracts from the project. The full source tree is available on the repository; the listings below cover the cryptographic, access-control, and metadata primitives that the body of the report cites repeatedly.

### 9.2.1 The `Certificate` struct (`EdiproofCertificate.sol:16-26`)

```solidity
struct Certificate {
    string  studentName;
    string  courseName;
    string  institution;
    string  ipfsURI;
    bytes32 certHash;
    uint64  issuedAt;
    bool    revoked;
    uint256 reissuedFrom; // 0 if original
    address issuer;
}
```

### 9.2.2 Storage and the verifier inverse-index (`:28-33`)

```solidity
mapping(uint256 => Certificate) public certificates;       // tokenId → struct
mapping(bytes32 => uint256)     public hashToTokenId;       // certHash → tokenId
mapping(address => bool)        public approvedInstitutions;
mapping(uint256 => uint256)     public replacedBy;          // oldId → newId
uint256 private _nextTokenId = 1;
```

### 9.2.3 The certificate hash (`:399-406`)

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

### 9.2.4 The soulbound `_update` override (`:410-420`)

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

### 9.2.5 `issueCertificate` (`:85-114`)

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
        studentName:  studentName,
        courseName:   courseName,
        institution:  institution,
        ipfsURI:      ipfsURI,
        certHash:     certHash,
        issuedAt:     uint64(block.timestamp),
        revoked:      false,
        reissuedFrom: 0,
        issuer:       msg.sender
    });
    hashToTokenId[certHash] = tokenId;

    _safeMint(student, tokenId);

    emit CertificateIssued(tokenId, student, certHash, institution);
}
```

### 9.2.6 `verifyCertificate` (`:182-208`)

```solidity
function verifyCertificate(
    string calldata studentName,
    string calldata courseName,
    string calldata institution,
    string calldata ipfsURI
) external view returns (
    bool   valid,
    uint256 tokenId,
    address ownerAddr,
    bool   revoked,
    uint256 replacedByTokenId
) {
    bytes32 certHash = _computeHash(studentName, courseName, institution, ipfsURI);
    tokenId = hashToTokenId[certHash];
    if (tokenId == 0) {
        return (false, 0, address(0), false, 0);
    }
    Certificate storage c = certificates[tokenId];
    revoked           = c.revoked;
    replacedByTokenId = replacedBy[tokenId];
    ownerAddr         = _ownerOf(tokenId);   // 0 if burned, returns student wallet otherwise
    valid             = !revoked;
}
```

### 9.2.7 Backend Pinata proxy (`backend/src/pinata.js`)

```javascript
const PINATA_URL     = "https://uploads.pinata.cloud/v3/files";
const DEFAULT_GATEWAY = "https://gateway.pinata.cloud";

export async function uploadToPinata(buffer, filename, mimetype) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error("PINATA_JWT environment variable is not set");
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype }), filename);
  form.append("network", "public");
  form.append("name", filename);

  const res = await fetch(PINATA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pinata ${res.status}: ${body}`);
  }

  const json = await res.json();
  const cid  = json?.data?.cid;
  if (!cid) {
    throw new Error(`Pinata response missing data.cid: ${JSON.stringify(json)}`);
  }

  const gateway = process.env.PINATA_GATEWAY || DEFAULT_GATEWAY;
  return {
    cid,
    ipfsURI:    `ipfs://${cid}`,
    gatewayURL: `${gateway}/ipfs/${cid}`,
  };
}
```

### 9.2.8 Front-end EIP-6963 wallet picker (`frontend/src/lib/wallet.ts`, abbreviated)

```typescript
type EIP6963ProviderDetail = {
  info:     { uuid: string; name: string; icon: string; rdns: string };
  provider: any;  // EIP-1193 provider
};

const announced: EIP6963ProviderDetail[] = [];

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
    if (detail?.info?.uuid && !announced.find(p => p.info.uuid === detail.info.uuid)) {
      announced.push(detail);
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getMetaMaskProvider() {
  const m = announced.find(p => p.info.rdns === "io.metamask");
  if (m) return m.provider;

  const eth: any = (typeof window !== "undefined" ? window : {}).ethereum;
  if (eth?.providers) {
    const p = eth.providers.find((x: any) => x.isMetaMask);
    if (p) return p;
  }
  if (eth?.isMetaMask) return eth;
  throw new Error("MetaMask not detected");
}
```

### 9.2.9 Front-end off-chain hash preview (`frontend/src/lib/hash.ts:7-17`)

```typescript
import { ethers } from "ethers";

export function computeCertHash(
  name:        string,
  course:      string,
  institution: string,
  ipfsURI:     string,
): string {
  return ethers.solidityPackedKeccak256(
    ["string", "string", "string", "string"],
    [name, course, institution, ipfsURI],
  );
}
```

This call reproduces the on-chain `keccak256(abi.encodePacked(...))` exactly, with no contract round-trip.

---

## 9.3 Screenshots / Diagrams

The figures below correspond to the entries in the *List of Figures* on page vii. High-resolution versions are stored alongside this report.

| Figure | Caption | Insertion guidance |
|---|---|---|
| 2.1 | Three-tier block diagram (Browser/MetaMask → Backend → Sepolia + IPFS) | Insert in `02_design.md` after "## 2.1 System Architecture" |
| 2.2 | Module-interaction overview | Insert after "## 2.2 Module Description" |
| 2.3 | Level-0 Data Flow Diagram | Insert after "## 2.3.1 Level-0 Context" |
| 2.4 | Level-1 DFD — Issue flow | Insert after "## 2.3.2 Level-1 Decomposition — Issuance" |
| 2.5 | Level-1 DFD — Verify (wallet-less) flow | Insert after "## 2.3.3 Level-1 Decomposition — Verifier" |
| 2.6 | System flowchart — issuance happy path | Insert after "## 2.4 Flowchart of the System" |
| 2.7 | Use case diagram (4 actors, 9 use cases) | Insert after "## 2.7.4 Use Case Summary" |
| 2.8 | Sequence diagram — issuance | Insert after "## 2.7.1 Issuance — End-to-End Sequence" |
| 2.9 | Sequence diagram — verifier | Insert after "## 2.7.2 Verifier — Wallet-less Sequence" |
| 3.1 | Project layout tree | Already inline in `03_implementation.md` §3.1.3 |
| 3.2 | Landing page screenshot | Insert in `03_implementation.md` §3.4.1 |
| 3.3 | Issue page screenshot | Insert in `03_implementation.md` §3.4.2 |
| 3.4 | Verify page screenshot | Insert in `03_implementation.md` §3.4.3 |
| 3.5 | My-leaves page screenshot | Insert in `03_implementation.md` §3.4.4 |
| 4.1 | Test pyramid | Insert in `04_results.md` §4.2 or `05_testing.md` §5.2 |
| 4.2 | Etherscan view of the deployed contract | Insert in `04_results.md` §4.1.5 |
| 4.3 | Indicative gas profile per public function | Insert in `04_results.md` §4.2.1 |
| 5.1 | Hardhat + Mocha + Chai test execution output | Inline as code block in `05_testing.md` §5.4 |

For Word output: Insert → Pictures → choose file. For pandoc-PDF: replace the heading line above each figure with `![Caption](path/to/figure.png)` and re-render.

---

## 9.4 Certificates / Permissions

### 9.4.1 Live deployment record

The contract is deployed to Sepolia at the address recorded in `contracts/deployments/sepolia.json`:

| Field | Value |
|---|---|
| Network | sepolia |
| Address | `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` |
| Deployer | `0xe3F2f5e13Dc8D95545AED98EFBbD9BF892F94c6d` |
| Deployed at (UTC) | `2026-04-19T06:38:37.295Z` |
| Tx hash | `0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6` |

### 9.4.2 Etherscan URLs (public, permanent)

The contract's verified source page:

> **https://sepolia.etherscan.io/address/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5**

The deployment transaction record:

> **https://sepolia.etherscan.io/tx/0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6**

The *Read Contract* tab on the contract page exposes every public function, including the wallet-less `verifyCertificate(...)` form. Submitting the four fields of any seed certificate returns the canonical tuple directly from Etherscan, with no Ediproof component in the request path.

### 9.4.3 Open-source licenses (transitive dependencies)

The project depends on transitively-licensed open-source software whose licences are listed below for completeness. None of the licences impose obligations that conflict with the project's intended use.

| Dependency | License |
|---|---|
| OpenZeppelin Contracts v5 | MIT |
| Hardhat | MIT |
| Ethers.js v6 | MIT |
| Next.js | MIT |
| React 18 | MIT |
| TypeScript | Apache 2.0 |
| Express 4 | MIT |
| multer | MIT |
| better-sqlite3 | MIT |
| cors | MIT |
| dotenv | BSD-2-Clause |

### 9.4.4 Certificates of project completion (placeholder)

> **[Certificate of project completion — institution-issued; to be inserted]**

> **[Industry / internship completion certificate, if applicable — to be inserted]**

> **[Plagiarism / originality certificate — to be inserted]**

The placeholders above mark positions where institution-issued certificates accompanying the project submission can be bound into the final report. They are not part of the running system.

---

> *Chapter summary.* This appendix has collected the supplementary configuration data, source-code listings, figure index, and live-deployment record needed to support every claim made in the body of the report. The Etherscan URLs in §9.4.2 are the most important single artefact: any reader of this report can follow them and re-verify, without contacting the project authors or institution, that the contract is live, that the source is verified, and that the wallet-less `verifyCertificate` function returns the expected tuples for the seed certificates documented in §3.3.4.
