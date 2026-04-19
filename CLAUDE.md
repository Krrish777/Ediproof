# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ediproof** is a blockchain-based academic certificate verification DApp. Certificates are issued as Soulbound Tokens (SBTs) — non-transferable ERC-721s permanently bound to a student's wallet. Certificates are hashed on-chain (`keccak256(name, course, institution, ipfsURI)`), so tampering breaks the hash, making forgery cryptographically detectable.

**Status:** 3-day demo build targeting Sepolia testnet only. No CI/CD, no mainnet deployment, no contract upgradeability.

## Critical Constraint

**Node.js 22 LTS is required.** `better-sqlite3` won't compile on Node v24. Both `contracts/` and `backend/` enforce `"engines": { "node": ">=22.0.0 <24.0.0" }`.

## Commands

### Contracts (`cd contracts`)
```bash
npm run compile          # Compile Solidity with Hardhat
npm test                 # Run Chai unit tests against local Hardhat node
npm run deploy:sepolia   # Deploy contract to Sepolia + export ABI to frontend
npm run seed:sepolia     # Add demo institution + 3 sample certificates
npm run verify:sepolia   # Verify contract on Etherscan
npm run node             # Start local Hardhat node
```

### Backend (`cd backend`)
```bash
npm start                # Express server on port 8787
npm run dev              # Start with --watch (hot reload)
```

### Environment Setup
Copy `.env.example` → `.env` in both `contracts/` and `backend/` before running any commands. Required vars:
- `contracts/.env`: `ALCHEMY_SEPOLIA_RPC`, `DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY`
- `backend/.env`: `PINATA_JWT`, `PORT` (default 8787), `DB_PATH` (default `./ediproof.db`)

## Architecture

The blockchain is the **source of truth**. If the backend is offline, verification still works via direct contract reads.

```
React SPA (Vite) — not yet scaffolded
  ├── ethers.js BrowserProvider (MetaMask) → institutions/students write txs
  ├── ethers.js JsonRpcProvider (Alchemy) → verifiers read-only, no wallet needed
  └── HTTP multipart upload → Express Backend → Pinata V3 API (IPFS)
                                              → SQLite (event logging only)

Smart Contract (Sepolia)
  └── EdiproofCertificate.sol (ERC721 Soulbound + Enumerable + Ownable)
```

**Three user roles:**
- **Institution** (MetaMask required): issues, revokes, reissues certificates
- **Student** (MetaMask required): views certificates bound to their wallet
- **Verifier** (no wallet): verifies any certificate by hash — the main trust primitive

## Key Files

| File | Purpose |
|------|---------|
| `contracts/contracts/EdiproofCertificate.sol` | Core SBT contract |
| `contracts/scripts/deploy.ts` | Deploy + exports ABI to frontend build |
| `contracts/scripts/seed.ts` | Demo data seeder |
| `contracts/test/EdiproofCertificate.test.ts` | Full test suite (fixture pattern) |
| `backend/src/server.js` | Express app — 6 endpoints |
| `backend/src/db.js` | SQLite setup, WAL mode, prepared statements |
| `backend/src/pinata.js` | Pinata V3 proxy (keeps JWT server-side) |
| `design/` | HTML wireframes for 4 UI flows (landing, issue, verify, my-certs) |

## Smart Contract Design

`issueCertificate(to, name, course, institution, ipfsURI)` → mints SBT + stores hash  
`verifyCertificate(tokenId, name, course, institution, ipfsURI)` → pure hash comparison  
`revokeCertificate(tokenId)` → burns token  
`reissueCertificate(tokenId, newURI)` → burns + remints with new hash  

Soulbound enforcement: `_update()` override rejects all transfers except mint (from == 0) and burn (to == 0).

Institution whitelist is owner-controlled (`addInstitution` / `removeInstitution`). Only whitelisted addresses can call `issueCertificate`.

## Backend API

All endpoints under `http://localhost:8787`:
- `GET /api/health`
- `POST /api/upload` — multipart file → Pinata, returns `{ cid, ipfsURI, gatewayURL }`
- `POST /api/log` — log an event `{ kind, tokenId, txHash, actor, institution }`
- `GET /api/stats` — aggregated counts + institution list
- `GET /api/activity?limit=20` — recent events
- `GET /api/institution/:address` — per-institution stats

`kind` values: `issued`, `revoked`, `reissued`, `verified`

## Frontend (Not Yet Built)

Frontend will be a React + Vite SPA. After wireframe selection from `design/`, scaffold under `frontend/`. The deploy script exports ABI + contract address to `frontend/src/contracts/` automatically.

**Pinata JWT must never reach the browser.** Always upload files via the backend proxy (`POST /api/upload`).
