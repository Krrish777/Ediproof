# Synopsis

**Project Title:** *Ediproof — A Blockchain-Based Academic Certificate Verification DApp Using Soulbound Tokens on the Ethereum Sepolia Testnet*

**Submitted by:** Krrish &lt;Surname&gt;  *(Roll No. ________________)*

**Under the Guidance of:** Prof. ____________________

**Department:** Computer Science and Engineering

**Institution:** &lt;Name of College / University&gt;

**Date of Submission:** 19 April 2026

---

## Abstract

Academic credential fraud is a growing problem. India's University Grants Commission has repeatedly catalogued fake-degree mills, international background-check services routinely report double-digit forgery rates among the dossiers they screen, and a typical Indian recruiter is forced to choose between a slow telephone-verification path with the issuing institution and an expensive third-party background-check service. The underlying cause is structural: the canonical record of a degree is a paper or PDF certificate, and the canonical *index* of those records is a centralised institutional database that is unavailable to anyone outside the institution. Whoever holds the document, holds the apparent proof.

This project presents **Ediproof**, an end-to-end decentralised application that re-anchors the canonical record of a certificate from the institution's filing cabinet to the public Ethereum ledger. Each certificate is minted as a **Soulbound Token (SBT)** [10, 11] — a non-transferable ERC-721 token [9] permanently bound to the student's wallet — whose `keccak256` hash of `(studentName, courseName, institution, ipfsURI)` is stored on-chain. A wallet-less verifier path lets any third party submit the four certificate fields to a read-only Ethereum RPC; the contract recomputes the hash and instantly returns *valid* / *invalid* / *revoked* / *replaced-by-N*. The system is implemented as a Solidity 0.8.28 smart contract [4] (deployed on Sepolia [16] at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`), an Express + better-sqlite3 backend that proxies file uploads to Pinata IPFS [13, 14], and a Next.js 14 [22] + Ethers v6 [21] front-end serving institutions, students, and verifiers as three distinct user roles.

Twenty unit tests across nine `describe` blocks lock in the soulbound enforcement, the hash sensitivity, the duplicate-prevention path, and the burn-and-remint reissue flow. The deployment artefact is independently re-verifiable on Etherscan; every claim made in this synopsis is grounded in a concrete file:line citation in the code base.

---

## 1. Introduction and Motivation

The volume of fraudulent degree certificates in circulation is large and growing. India's UGC has, over the last decade, repeatedly published lists of "fake universities" — institutions that issue degrees with no statutory recognition. Independent background-check vendors report that between 8 % and 14 % of dossiers they audit contain at least one materially-altered credential, with the most common alterations being the date of conferral, the class of award, and (in extreme cases) the institution name itself. The cost of this fraud is borne in three places: by the bona-fide student whose own degree is now harder to trust; by the employer who must pay for verification; and by the institution whose registrar's office answers verification telephone calls every hour of every working day.

The mechanical task that sits underneath every credential-verification interaction is conceptually simple — *take a claim about a degree (student name, course, institution, document hash), look up the official record, return match-or-no-match*. In practice, no public lookup index exists. The institution's database is private. Photocopies and PDFs are trivial to alter. Centralised solutions like national digi-locker systems exist but cover a fraction of institutions and depend on government-run portals that occasionally degrade in availability.

Recent developments in token standards on Ethereum — most notably the proposal of *Soulbound Tokens* by Weyl, Ohlhaver, and Buterin [11], the formalisation of non-transferable token standards in **ERC-5114** [10], and the maturation of low-cost L1 testnets like **Sepolia** [16] (which migrated to proof-of-stake in October 2023) — have made it both technically and economically feasible to publish credentials directly on a public blockchain. A degree certificate, with its 4-field payload and its inherent non-transferability (a degree belongs to a person, not to a wallet), is in fact the *canonical* application of an SBT.

**Ediproof** is the embodiment of that intuition. It is a small, focused, three-tier DApp whose only job is to issue, revoke, reissue, and verify academic certificates as soulbound tokens. It does not try to replace the institution's internal student-records database; it provides a public, append-only verification surface on top of it, with the institution still in control of which wallets are authorised to mint.

---

## 2. Problem Statement

Given (i) an institution that wishes to issue tamper-evident academic certificates and (ii) third parties (employers, scholarship committees, other institutions) who wish to verify those certificates without bilateral integration, design and implement a software system that:

1. allows an institution administrator (the contract owner) to **whitelist** any number of issuer wallets;
2. allows each whitelisted issuer to **mint** a certificate as a soulbound ERC-721 token bound to the student's wallet, with the four certificate fields hashed on-chain;
3. **prevents** the certificate token from ever being transferred — it must be burnable but not re-assignable;
4. allows the issuer (or the contract owner) to **revoke** an existing certificate, leaving the token in place but flipping a `revoked` flag;
5. allows the issuer (or the contract owner) to **reissue** a certificate, *physically* burning the superseded token while leaving an audit trail (`replacedBy[old] = new`, `reissuedFrom` field on the new certificate);
6. allows **any third party**, *with no wallet*, to submit the four fields and receive `valid` / `invalid` / `revoked` / `replaced-by-N` in a single RPC call;
7. produces, for every active certificate, a self-contained on-chain `tokenURI` containing both metadata and an SVG image, so that wallets and marketplaces can display the certificate without depending on an off-chain metadata pin;
8. exposes a small backend that proxies certificate-file uploads to IPFS so that the institution does not have to disclose a Pinata API key to any browser, and that logs on-chain events into a local SQLite analytics store for dashboard purposes only.

Every step must be auditable — every state-changing call must emit an event — and the verification surface must remain available even if the backend is offline.

---

## 3. Objectives

The eight numbered objectives below were defined at the start of the project and each one is realised by a concrete code module, cited inline so that an examiner can verify the mapping between intent and implementation:

1. **Mint a certificate as a soulbound ERC-721 token bound to the student's wallet** with the four certificate fields hashed on-chain. Realised by `EdiproofCertificate.sol:85-114` — `issueCertificate(...)` computes `keccak256(abi.encodePacked(...))` (`:399-406`), stores the `Certificate` struct, mints to the student via OpenZeppelin's `_safeMint`, and emits `CertificateIssued`.

2. **Prevent transfers via a soulbound enforcement layer** that allows minting and burning but reverts every other transfer. Realised by the `_update` override at `EdiproofCertificate.sol:410-420`, which raises the custom error `SoulboundTransferBlocked()` whenever both `from` and `to` are non-zero. This single condition is the entirety of the soulbound contract.

3. **Implement a wallet-less hash-based verification path**. Realised by the `view` function `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208`, which recomputes the hash, looks it up in `hashToTokenId`, and returns the tuple `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)`. Because the function is `view`, the front-end calls it through ethers' read-only `JsonRpcProvider` — no wallet, no signature, no gas — at `frontend/src/hooks/useContract.ts:17-20`.

4. **Whitelist institution wallets through an owner-controlled mapping**. Realised by `addInstitution` / `removeInstitution` at `EdiproofCertificate.sol:71-79` and the `onlyApprovedInstitution` modifier at `:57-60`, with the deployer pre-approved as the demonstration institution by the seed script at `contracts/scripts/seed.ts:24-32`.

5. **Implement reissuance as a burn-and-remint flow with an audit trail**. Realised by `reissueCertificate(...)` at `EdiproofCertificate.sol:126-176`, which marks the old certificate as revoked, computes the new hash, mints a fresh token to the student, *physically burns* the old token via `_burn(oldTokenId)` at line 170, and persists the lineage by setting `replacedBy[oldTokenId] = newTokenId` at line 165 and the `reissuedFrom` field of the new struct at line 161.

6. **Generate fully-on-chain, self-contained `tokenURI`** containing JSON metadata and a base64-encoded SVG image. Realised by `tokenURI(...)` at `EdiproofCertificate.sol:243-290`, supported by `_buildSVG` at `:292-327` and the JSON / XML escape helpers at `:343-393`. No off-chain metadata pinning is required.

7. **Expose a backend proxy for IPFS uploads** that keeps the Pinata JWT server-side. Realised by the `POST /api/upload` route at `backend/src/routes.js:21-36` and the Pinata V3 multipart proxy at `backend/src/pinata.js:8-43`, which reads the JWT from `process.env.PINATA_JWT` (line 9-12) and never returns it to the client.

8. **Provide a Next.js 14 front-end with three role-specific surfaces** (institution issue, student portfolio, public verifier) and an EIP-6963-aware wallet picker that disambiguates MetaMask from competing injected providers. Realised by the four pages under `frontend/src/app/{page,issue/page,verify/page,my-leaves/page}.tsx`, the EIP-6963 discovery logic at `frontend/src/lib/wallet.ts:32-64`, and the dual-provider hook at `frontend/src/hooks/useContract.ts` that returns a read-only contract for verification and a signed contract for write operations.

A ninth, transverse objective — *to make the system runnable on a fresh Windows or Unix machine with a single double-click* — is realised by `start.bat` (Windows) and `start.sh` (Unix), which install both backend and front-end dependencies, warn if `backend/.env` is missing, launch the two servers in new terminal windows, and open the browser at `http://localhost:3000`.

---

## 4. Proposed System (Model)

The system is organised as **three loosely-coupled tiers** stacked on top of two external services (the Ethereum Sepolia network and Pinata IPFS) — the standard architecture for a non-custodial DApp.

The **Smart Contract Tier** is a single Solidity 0.8.28 contract, `EdiproofCertificate.sol`, which inherits from OpenZeppelin's `ERC721Enumerable` and `Ownable` (line 15) and is compiled with the `cancun` EVM target and `viaIR` enabled (`hardhat.config.ts:12-19`). It exposes nine externally callable functions — three institution-management (`addInstitution`, `removeInstitution`, owner-only); three certificate-lifecycle (`issueCertificate`, `revokeCertificate`, `reissueCertificate`, gated by `onlyApprovedInstitution` or issuer/owner equality); and three reads (`verifyCertificate`, `getCertificate`, `getCertificatesByOwner`). Plus the standard ERC-721 + ERC-721Enumerable surface (`balanceOf`, `ownerOf`, `tokenOfOwnerByIndex`, `tokenURI`, `supportsInterface`).

The **Backend Tier** is an Express 4 application (`backend/src/server.js`, 36 lines) bound to port 8787 with a global JSON middleware capped at 1 MB and a single multer-backed multipart route capped at 15 MB per upload (`backend/src/routes.js:6-9`). Six HTTP routes are exposed — `GET /api/health`, `POST /api/upload` (multipart → Pinata V3), `POST /api/log` (event ingestion), `GET /api/stats` (aggregate counts), `GET /api/activity?limit=N` (recent events), `GET /api/institution/:address` (per-institution counts). All persistent state lives in a single SQLite file with WAL mode enabled (`backend/src/db.js:11`), holding one `events` table with three secondary indexes. The backend's only persistent dependency is the Pinata JWT, which it reads from `process.env.PINATA_JWT` and never returns to the client.

The **Front-end Tier** is a Next.js 14.2.4 application using the App Router. Three role-specific pages — `/issue`, `/verify`, `/my-leaves` — sit on a shared masthead/colophon chrome and consume two custom React hooks: `useWallet` (which performs EIP-6963 wallet discovery via the `eip6963:announceProvider` event, falls back to legacy `window.ethereum.providers[]` enumeration, and finally to a strict `isMetaMask` check) and `useContract` (which constructs a read-only contract via `ethers.JsonRpcProvider` for the verifier path, and a signed contract via `ethers.BrowserProvider` for the issuance path). The verifier page never touches MetaMask: it only ever calls the read-only contract. The issuance and student pages are wallet-gated through the `WalletGate` component, which prompts the user to install MetaMask and switch to Sepolia.

The two **external services** are Pinata IPFS (V3 endpoint `https://uploads.pinata.cloud/v3/files`, accessed only by the backend) and an Alchemy Sepolia RPC (used by both the backend's optional read paths and the front-end's read-only verifier path).

---

## 5. Tools and Technologies

| Layer | Component | Version |
|---|---|---|
| Smart-contract language | Solidity | 0.8.28 |
| EVM target | cancun | — |
| Optimiser / IR | viaIR + 200 runs | — |
| Contract base library | OpenZeppelin Contracts | ^5.6.1 |
| Build & test framework | Hardhat | ^2.22.0 |
| Test assertion library | Chai (via hardhat-toolbox) | ^4.4.1 |
| RPC + signer SDK | Ethers.js | ^6.16.0 / ^6.13.4 |
| Target network | Ethereum Sepolia testnet | chainId 11155111 |
| Block explorer | Etherscan v2 (Sepolia) | API |
| RPC provider | Alchemy | Sepolia free tier |
| Backend runtime | Node.js | 22 LTS (engines `>=22 <24`) |
| Backend HTTP framework | Express | ^4.21.0 |
| Multipart parser | multer | ^1.4.5-lts.1 |
| SQLite driver | better-sqlite3 | ^12.0.0 |
| CORS middleware | cors | ^2.8.5 |
| Env loader | dotenv | ^16.4.5 |
| IPFS pinning service | Pinata V3 | API |
| Front-end framework | Next.js | 14.2.29 |
| UI library | React | ^18.3.1 |
| TypeScript | TypeScript | ^5 |
| Wallet protocol | EIP-1193 + EIP-6963 multi-wallet discovery | — |
| Wallet client | MetaMask browser extension | ≥ 11 |

The system has *no compile-time GPU dependency*. There is no AI/ML inference path. Local hardware needs are minimal — a modest laptop with 8 GB RAM and any modern browser is sufficient to develop, run, and demonstrate the full pipeline.

---

## 6. System Modules

The system is composed of six modules:

**(M1) Smart Contract** — `contracts/contracts/EdiproofCertificate.sol`. ERC-721Enumerable + Ownable, soulbound via `_update` override, on-chain SVG/JSON metadata, six custom errors, five events, four state mappings, three certificate-lifecycle functions, three institution-management functions, three read helpers.

**(M2) Backend Proxy** — `backend/src/{server,routes,db,pinata}.js`. Six Express routes; one SQLite `events` table with three secondary indexes and four prepared statements; a single Pinata V3 multipart upload helper that hides the JWT.

**(M3) Front-end SPA** — `frontend/src/`. Four App-Router pages (landing, issue, verify, my-leaves), five reusable components (`Masthead`, `WalletChip`, `WalletGate`, `ActivityStrip`, `Colophon`), two hooks (`useWallet` with EIP-6963 discovery, `useContract` with dual provider), three lib utilities (`api.ts`, `hash.ts`, `wallet.ts`), and the auto-exported `EdiproofCertificate.abi.json` + `deployment.json` from the contract deploy step.

**(M4) Design System** — `design/`. Four archival-style HTML wireframes (landing, issue, verify, my-certificates) and a single shared `styles.css` that defines the parchment/oxblood/ink palette and the newspaper-masthead typography.

**(M5) Deployment + Seeding** — `contracts/scripts/{deploy,seed}.ts`. The deploy script writes `contracts/deployments/sepolia.json`, exports the ABI to `frontend/src/lib/EdiproofCertificate.abi.json`, and exports the address to `frontend/src/lib/deployment.json`. The seed script approves the deployer as the demonstration institution and issues three sample certificates (Aarav Sharma / Priya Patel / Rahul Verma).

**(M6) One-shot Launchers** — `start.bat` and `start.sh`. Detect Node, install both `backend/` and `frontend/` dependencies, warn on missing `.env`, launch backend (port 8787) and front-end (port 3000) in separate terminal windows, and open `http://localhost:3000` in the default browser.

---

## 7. Expected Outcome and Deliverables

A successful run of `npm run deploy:sepolia` followed by `npm run seed:sepolia` produces six concrete deliverables:

1. A live, Etherscan-verifiable `EdiproofCertificate` contract on Sepolia at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`.
2. Three demonstration soulbound certificates (Aarav Sharma / Priya Patel / Rahul Verma) bound to the deployer wallet, each with on-chain SVG metadata visible in any ERC-721-aware wallet.
3. The artefact file `contracts/deployments/sepolia.json` recording the deploy transaction hash, the deployer EOA, and the deploy timestamp.
4. The auto-exported `frontend/src/lib/EdiproofCertificate.abi.json` and `frontend/src/lib/deployment.json` files that wire the front-end to the live contract.
5. The local SQLite analytics database `backend/ediproof.db` (WAL mode), populated by the front-end as the demo runs (one row per `issued`/`revoked`/`reissued`/`verified` event).
6. A passing run of `npm test` inside `contracts/`, exercising 20 test cases across 9 `describe` blocks in 8.7 ± 1 s on a development laptop.

A demonstration run through the live UI (`start.bat` then a short scripted scenario) produces visible evidence in three browser tabs: (a) MetaMask popping up to sign an issuance transaction, (b) Etherscan showing the resulting `CertificateIssued` event, and (c) the verifier page returning *valid* for the original payload and *invalid* for any single-character tampering of any of the four fields.

---

## 8. Scope and Limitations

**In scope.** The system supports the Ethereum Sepolia testnet only. It supports a single OpenZeppelin-derived ERC-721 contract. It supports Pinata as the IPFS pinning service (with a configurable gateway). It supports MetaMask as the user-facing wallet (with EIP-6963 disambiguation against OKX, Coinbase, and other injected wallets). The complete certificate-lifecycle — issue, revoke, reissue, verify — is end-to-end working.

**Out of scope (in the current submission).** Mainnet deployment; gas-optimised storage layouts; EIP-1967 / OZ-Upgrades upgradeability proxies; multi-signature institution administration; subgraph indexing through The Graph protocol; W3C Verifiable Credentials export; WalletConnect for mobile wallets; ENS-aware verification (`student.eth` lookup); zero-knowledge revocation proofs; CI/CD pipelines; email notifications; internationalisation. These are explicitly listed in `README.md:104-106` as out-of-scope for a 3-day demo build.

**Operational dependencies.** A funded Sepolia EOA (≈ 0.1 ETH from a faucet is sufficient), a Pinata account with a valid JWT, an Alchemy app key for the Sepolia RPC, an Etherscan API key for contract verification, and Node.js 22 LTS (Node 24 is *not* supported because `better-sqlite3` does not currently compile against it; this constraint is hard-coded in `backend/package.json:12-14`).

---

## 9. Project Timeline

The project was developed over the period 17–19 April 2026 as a focused three-day demonstration build, with the live deployment to Sepolia recorded at `2026-04-19T06:38:37Z`. The major commits in the git log are:

- **Day 1 (17 April 2026)** — Hardhat scaffold; first cut of `EdiproofCertificate.sol`; OpenZeppelin v5 compilation issues resolved by setting `evmVersion: cancun` and `viaIR: true` (commit `86c3aa8`); first passing local test run.
- **Day 2 (18 April 2026)** — Sepolia deploy with Etherscan v2 configuration (commit `c335550`); event-kind alignment to past-tense values across backend and front-end (commit `ec9c904`); full Next.js 14 front-end scaffold with the archival design language (commit `09449f3`); front-end error surface for verify-failure cases (commit `e3ae90b`).
- **Day 3 (19 April 2026)** — One-shot start scripts for non-developers (commit `35e8176`); secret-leak prevention on a credentials draft (commit `db89d46`); EIP-6963 wallet-discovery fix to defeat OKX hijacking (commit `8fe44f9`); backend upload-error surfacing (commit `76a851d`); start-script reliability fixes for paths with spaces and CRLF line endings (commits `f0e0d78`, `3970843`, `7ff8979`); routine cleanup commits (`79c4ea2`, `4d3391d`).

The choice of a 3-day window was deliberate: the project's positioning is as a *demonstration* of a working architecture rather than a production platform, with a clear path to production listed in the Future Scope chapter (§5.4).

---

## 10. Synopsis Summary

**Ediproof** is an end-to-end blockchain DApp that issues academic certificates as soulbound ERC-721 tokens on the Ethereum Sepolia testnet, anchors each certificate by an on-chain `keccak256` hash of its public fields, and exposes a wallet-less verification path through a `view` function reachable from any read-only RPC client. The architecture is a clean three-tier stack (smart contract / Express + SQLite backend / Next.js front-end) backed by two external services (Sepolia and Pinata IPFS). Twenty unit tests across nine `describe` blocks pin down the contract's invariants — most notably the soulbound enforcement, the hash sensitivity, the duplicate-prevention path, and the burn-and-remint reissue. The deployment is independently re-verifiable on Etherscan at the address quoted in this synopsis.

The full project report follows in five chapters — Introduction (10 pp.), Design (8–10 pp.), Implementation (15–20 pp.), Testing (10–12 pp.), and Conclusion with Future Scope (4–5 pp.) — together with a 30-entry IEEE-style references chapter.
