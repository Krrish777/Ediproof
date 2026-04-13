# Ediproof

Blockchain-based academic certificate verification DApp. Certificates are issued as **Soulbound Tokens (SBTs)** — non-transferable ERC-721s permanently bound to a student's wallet. Any tampering breaks the on-chain hash, so forgery is cryptographically detectable.

## Repo layout

```
Ediproof/
├── contracts/        # Hardhat 2 + OpenZeppelin v5 smart contract
├── backend/          # Express + SQLite + Pinata upload proxy
├── frontend/         # (scaffolded after wireframe selection)
├── wireframes.html   # Two UI variations to pick from
└── README.md
```

## Prerequisites (install once)

- **Node.js 22 LTS** — DO NOT use Node 24; `better-sqlite3` won't build.
- **MetaMask** browser extension
- **Git** (optional)

## Credentials you need before deploying

You cannot run the full demo without these. Create the accounts and fill the env files described below.

| Service      | Why                            | Where to get it                                                 |
| ------------ | ------------------------------ | --------------------------------------------------------------- |
| Alchemy      | Sepolia RPC endpoint           | https://dashboard.alchemy.com → create app on Sepolia          |
| Pinata       | IPFS file storage              | https://app.pinata.cloud/developers/api-keys → generate JWT    |
| Sepolia ETH  | Pay gas for deploy + issuances | https://www.alchemy.com/faucets/ethereum-sepolia (0.1 ETH plenty) |
| Etherscan    | Contract verification          | https://etherscan.io/myapikey                                  |

## Setup

### 1. Contracts
```bash
cd contracts
cp .env.example .env.local
# Edit .env.local and fill in ALCHEMY_SEPOLIA_RPC, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY
npm install
npm run compile
npm test                     # runs unit tests against Hardhat local
npm run deploy:sepolia       # deploys to Sepolia, exports ABI to frontend/
npm run seed:sepolia         # adds demo institution + 3 sample certs
```

### 2. Backend
```bash
cd ../backend
cp .env.example .env.local
# Edit .env.local and fill in PINATA_JWT (and PINATA_GATEWAY if you have a dedicated one)
npm install
npm start                    # http://localhost:8787
# Smoke test:
#   curl http://localhost:8787/api/health
#   curl -F "file=@some.pdf" http://localhost:8787/api/upload
```

### 3. Frontend
Scaffolded after you pick a wireframe variation. See `wireframes.html` in the repo root.

## Architecture

```
                 ┌──────────────┐
  Verifier ────▶ │              │
 (no wallet)     │              │  ethers.js (read-only JsonRpcProvider)
                 │  React SPA   │◀────────────────┐
  Student ────▶  │  (Vite)      │                 │
  (MetaMask)     │              │ ethers.js       │
                 │              │ (BrowserProvider)│
 Institution ──▶ │              │                 │
  (MetaMask)     └───────┬──────┘                 │
                         │ multipart upload       │
                         ▼                        │
                 ┌──────────────┐          ┌──────┴──────┐
                 │   Express    │          │   Sepolia   │
                 │   Backend    │          │  Blockchain │
                 │              │          │             │
                 │  /api/upload ├─▶ Pinata │ EdiproofCert│
                 │  /api/log    │   V3 API │  .sol (SBT) │
                 │  /api/stats  │          │             │
                 │  /api/activity          └─────────────┘
                 │              │
                 │  SQLite DB   │
                 └──────────────┘
```

**Key design rule:** the blockchain is the source of truth. If the backend is down, verification still works directly against the contract. The backend only exists to proxy Pinata uploads (so the JWT doesn't leak to the browser) and to serve fast stats for the dashboard.

## How a certificate is verified (zero-wallet path)

1. Anyone opens the DApp → goes to **Verify** tab.
2. Types student name, course, institution, IPFS URI into the form.
3. The React app uses a **read-only `JsonRpcProvider`** pointed at Alchemy — **no wallet required**.
4. It calls `verifyCertificate(...)` which recomputes `keccak256(abi.encodePacked(name, course, institution, ipfsURI))` on-chain and looks up the tokenId.
5. If the hash matches an existing, non-revoked certificate → returns `valid=true` along with the student's wallet address.
6. If anything was tampered (even one letter) → the hash differs → `valid=false`.

## Demo script (4 minutes)

See `C:\Users\777kr\.claude\plans\gleaming-mapping-liskov.md` section 12.

## Out of scope (do not build)

Gas optimization, multi-chain, mainnet, upgradability proxies, multi-sig admin, subgraph/indexer, email notifications, ENS, i18n, CI/CD. This is a 3-day demo build.
