# Chapter 1 — Introduction

> *Chapter overview.* This chapter situates the **Ediproof** DApp within the contemporary landscape of academic-credential verification, articulates the operational gaps that motivate the project, enumerates the objectives it sets out to achieve, sketches the proposed three-tier system architecture at a conceptual level, and closes with the software and hardware specification used during development. Subsequent chapters drill into the design diagrams (Chapter 2), the implementation (Chapter 3), the testing strategy (Chapter 4), and the conclusion together with future scope (Chapter 5).

---

## 1.1 About the Project

Every higher-education institution issues, every academic year, hundreds or thousands of degree certificates that the recipient is then expected to show to employers, scholarship committees, and other institutions for the rest of their working life. The mechanical question — *is this degree real?* — has remained surprisingly hard to answer. The traditional answer is a paper certificate signed and stamped by the institution; the contemporary answer is a PDF with the same signatures and stamps; and in both cases the verification path of last resort is a telephone call from the verifier's office to the registrar of the issuing institution.

This is unsatisfactory on three counts. First, it is *slow*: the registrar's office is staffed during business hours only, and a verification telephone call typically takes several days to resolve when the registrar is busy or the file has been archived. Second, it is *expensive*: international background-check vendors charge between US $25 and US $80 per credential audited, with the cost ultimately passed to the candidate or the employer. Third, and most consequentially, it is *forgery-friendly*: a PDF is a sequence of bytes, every byte of which is in principle editable, and the visual cues an untrained verifier uses to spot a fake (a misaligned stamp, a font drift, a too-clean background) can be defeated with a few minutes of work in any modern PDF editor. Independent surveys conducted by international background-check firms over the last decade have consistently found that between 8 % and 14 % of credential dossiers contain at least one materially-altered document, with the most common alterations being the date of conferral, the class of award, and the institution's name itself.

The problem is structural. The canonical record of a degree lives in a private institutional database that no third party can directly query, so every verification interaction must be mediated by a human at the institution. A long-running ambition — one that pre-dates blockchain by decades — has been to build a public, queryable index of academic records so that any third party could verify a claim *without* a phone call. Two technical generations of this ambition exist: a generation of centralised digi-locker systems run by national governments, and a much newer generation built on public blockchains. Centralised digi-lockers cover only a fraction of institutions and inherit the availability characteristics of the government portal that hosts them. Public blockchains, by contrast, are permanently available by construction: any node in the network can answer a verification query, and no operator can withdraw the answer.

Recent maturity in three specific Ethereum primitives makes a blockchain credential-verification system tractable in 2026. First, the **ERC-721** non-fungible token standard [9] gives a clean per-asset model that maps naturally onto a per-certificate model. Second, the proposal of **Soulbound Tokens** by Weyl, Ohlhaver, and Buterin [11] in early 2022, and its formalisation as **ERC-5114** [10], gives the design pattern for non-transferable tokens — a property without which the credential use-case collapses (a transferable degree would mean a degree that could be sold, which is incoherent). Third, the maturation of low-cost L1 testnets — particularly **Sepolia** [16], which migrated to proof-of-stake in October 2023 and now offers fast block times, free test ETH from public faucets, and full Etherscan-indexed contract verification — gives an operational target on which a final-year project can be developed and demonstrated end-to-end without the cost or risk of mainnet deployment.

The **Ediproof** DApp developed for this project is a focused application of these three primitives. It is a small Node.js + TypeScript + Solidity codebase that:

1. accepts a certificate file (typically a PDF) from an authorised institution wallet via a Next.js front-end that gates the page on MetaMask connection and Sepolia chain-id (`frontend/src/app/issue/page.tsx`, gated by `frontend/src/components/WalletGate.tsx`);
2. proxies the file to Pinata's IPFS V3 API through an Express backend (`backend/src/pinata.js:8-43`) so that the institution's Pinata JWT never reaches the browser;
3. recovers from Pinata an `ipfs://` URI;
4. computes off-chain an indicative `keccak256(abi.encodePacked(studentName, courseName, institution, ipfsURI))` for live preview (`frontend/src/lib/hash.ts:13-17`) using `ethers.solidityPackedKeccak256` so the user can see the same hash that the contract will compute;
5. submits an `issueCertificate(...)` transaction to the Sepolia contract (`EdiproofCertificate.sol:85-114`) which mints a soulbound ERC-721 token to the student's wallet and stores the certificate struct + hash on-chain;
6. exposes a wallet-less verifier page (`frontend/src/app/verify/page.tsx`) through which any third party can submit the four certificate fields and receive a tuple `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)` from the contract's `view` function `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208`, reached via a read-only Alchemy `JsonRpcProvider` at `frontend/src/hooks/useContract.ts:17-20`;
7. allows the issuing institution to revoke (`:116-124`) or to reissue (`:126-176`) a certificate, with the reissue physically burning the old token and recording a `replacedBy[old] = new` lineage so that a verifier presenting an out-of-date hash receives a deterministic *"revoked, replaced by N"* answer rather than a confusing *"not found"*;
8. ships with a small Express analytics backend (`backend/src/server.js`, port 8787) that logs each on-chain event into a single SQLite `events` table (`backend/src/db.js:14-22`) for dashboard purposes only — the chain remains the source of truth, and verification continues to work even when the backend is offline.

The complete codebase totals approximately 1500 lines of Solidity, JavaScript, and TypeScript distributed across four directories (`contracts/`, `backend/`, `frontend/`, `design/`). The system is documented in three top-level files (`README.md`, `CLAUDE.md`, this report) and is launched from a fresh clone with one of two one-shot scripts (`start.bat` on Windows, `start.sh` on Unix-likes) that detect Node, install dependencies, warn about missing env files, start both servers, and open the browser.

---

## 1.2 Existing Problem

A short survey of the contemporary credential-verification landscape clarifies the gap that **Ediproof** addresses.

**Manual telephone verification** remains the default at most Indian institutions. The verifier (typically an HR coordinator) emails or telephones the registrar's office of the issuing institution, which then either confirms or denies the credential against its internal database. This path has the structural failure modes named in §1.1 — slow, expensive, business-hours-only, and entirely dependent on the goodwill and staffing of the registrar's office. The institution itself receives no analytics: it cannot tell, after the fact, which of its degrees have been verified or how often.

**National digi-locker systems** — India's *DigiLocker*, the EU-wide *European Blockchain Services Infrastructure*, the US *DXC Technology* federated transcript service — go some distance toward solving the lookup problem by exposing a centralised online index. Their failure modes are inherited from their centralised architecture: limited institutional coverage (DigiLocker, despite a decade of operation, still indexes only a fraction of Indian institutions), occasional portal-level downtime, and the requirement that both the issuing institution and the verifier have signed up in advance. None of them gives the verifier a self-contained cryptographic guarantee against tampering — they give a *lookup* against an external authority, which the verifier must continue to trust.

**Centralised blockchain-credential platforms** such as Blockcerts (MIT) and Accredify (Singapore) take the natural next step of anchoring credential hashes on a public blockchain, but they typically operate as walled gardens: the verifier uses a vendor-supplied app or website, which queries the chain on the verifier's behalf. The cryptographic guarantee is genuine — the on-chain hash is real — but the operational guarantee depends on the vendor remaining in business, since the consumer-facing verification UI is theirs.

**Generic NFT-based credential experiments** built on standard ERC-721 contracts solve the on-chain anchoring but fail the *non-transferability* requirement: a transferable degree is conceptually nonsensical and operationally dangerous (a candidate could buy a degree from an alumna who no longer needs it). This is the gap that **soulbound** tokens [10, 11] specifically close. An ERC-721 with a `_update` override that blocks every transfer except mint and burn — five lines of Solidity, reproduced verbatim at `EdiproofCertificate.sol:410-420` — turns a generic NFT into a credential-suitable container.

The gap that the **Ediproof** DApp fills is therefore very specific: a self-hosted, code-inspectable, single-contract reference implementation that combines the soulbound non-transferability guarantee with an immediate, wallet-less, public verification surface, served from a small Next.js front-end with no vendor lock-in. The codebase is small enough (approximately 1500 LOC across four sub-projects) to be read in a single afternoon, and the architecture is deliberately conservative — one Solidity contract, one SQLite table, one IPFS pinning service, one wallet — so that the cost of *understanding* the system is low and the cost of *extending* it (Chapter 5, §5.4) is correspondingly bounded.

A secondary gap that the project addresses is the absence in the open-source ecosystem of complete, end-to-end SBT credential demos that include a *wallet-less* verifier path. Most public examples assume the verifier already has a wallet, which is operationally incompatible with the most common verification scenario (a non-crypto-native HR coordinator at an employer). Ediproof's reliance on `ethers.JsonRpcProvider` against a public Alchemy endpoint at `frontend/src/hooks/useContract.ts:9, :17-20` makes the verifier path zero-friction, which is the first thing an examiner of this project should test during the viva.

---

## 1.3 Objectives

The eight numbered objectives below were defined at the start of the project and each one is realised by a concrete code module, cited inline so that an examiner can verify the mapping between intent and implementation:

1. **Mint a certificate as a soulbound ERC-721 token bound to the student's wallet, with the four certificate fields anchored by an on-chain `keccak256` hash.** Realised by `issueCertificate(...)` at `contracts/contracts/EdiproofCertificate.sol:85-114`, which calls `_computeHash(...)` (`:399-406`), checks for duplicates via the `hashToTokenId` mapping (`:29`, `:94-95`), persists the `Certificate` struct (`:98-108`), mints to the student via OpenZeppelin's `_safeMint` (`:111`), and emits `CertificateIssued` (`:113`).

2. **Prevent every transfer of an issued certificate** through a soulbound-enforcement layer that allows mint and burn but reverts every other transfer. Realised by the `_update` override at `EdiproofCertificate.sol:410-420`, whose body is the five-line condition

   ```solidity
   address from = _ownerOf(tokenId);
   if (from != address(0) && to != address(0)) {
       revert SoulboundTransferBlocked();
   }
   return super._update(to, tokenId, auth);
   ```

   This single condition is the entirety of the soulbound contract. The custom error `SoulboundTransferBlocked()` is declared at `:55` and asserted by `test/EdiproofCertificate.test.ts:119-141`.

3. **Implement a wallet-less hash-based verification path** that any third party can use without holding cryptocurrency or installing a wallet. Realised by the `view` function `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208`, which recomputes the hash, looks it up in `hashToTokenId`, and returns the tuple `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)`. Because the function is `view`, the front-end calls it through ethers' read-only `JsonRpcProvider` at `frontend/src/hooks/useContract.ts:17-20` — no wallet, no signature, no gas. The corresponding UI lives at `frontend/src/app/verify/page.tsx`.

4. **Whitelist institution wallets through an owner-controlled mapping** so that only authorised institutions can mint. Realised by the `approvedInstitutions` mapping at `EdiproofCertificate.sol:30`, the `addInstitution` / `removeInstitution` setters at `:71-79`, and the `onlyApprovedInstitution` modifier at `:57-60`. The seed script at `contracts/scripts/seed.ts:24-32` pre-approves the deployer as the demonstration institution.

5. **Implement reissuance as a burn-and-remint flow** with an audit trail that allows verifiers presenting an old hash to be told *"revoked, replaced by N"* rather than *"not found"*. Realised by `reissueCertificate(...)` at `EdiproofCertificate.sol:126-176`. The function (a) marks the old certificate revoked at `:138-141`, (b) computes the new hash and rejects duplicates at `:143-150`, (c) persists the new struct with `reissuedFrom = oldTokenId` at `:152-163`, (d) sets `replacedBy[oldTokenId] = newTokenId` at `:165`, (e) physically burns the old token at `:170` (so the student's wallet shows only the corrected certificate), and (f) mints the new token at `:172`.

6. **Generate fully-on-chain, self-contained `tokenURI`** containing JSON metadata and a base64-encoded SVG image, eliminating any off-chain metadata pinning dependency. Realised by `tokenURI(...)` at `EdiproofCertificate.sol:243-290`, supported by `_buildSVG(...)` at `:292-327` and the JSON / XML escape helpers `_escapeJSON` / `_escapeXML` at `:343-393` which protect against malicious payloads in user-supplied fields.

7. **Expose an Express backend that proxies file uploads to Pinata** while keeping the JWT server-side, and that logs on-chain events into a local SQLite analytics store with WAL mode enabled for concurrent reads. Realised by `POST /api/upload` at `backend/src/routes.js:21-36`, the Pinata V3 multipart proxy at `backend/src/pinata.js:8-43`, and the SQLite `events` table at `backend/src/db.js:14-22` with three secondary indexes at `:23-25`. The JWT is read from `process.env.PINATA_JWT` at `pinata.js:9-12` and never reaches the response.

8. **Provide a Next.js 14 front-end with three role-specific surfaces** — institution issuance, student portfolio, public verifier — and an EIP-6963-aware wallet picker that disambiguates MetaMask from competing injected providers (OKX, Coinbase, Trust). Realised by the four App-Router pages at `frontend/src/app/{page,issue/page,verify/page,my-leaves/page}.tsx`, the EIP-6963 discovery logic at `frontend/src/lib/wallet.ts:32-64`, and the dual-provider hook at `frontend/src/hooks/useContract.ts` (read-only `JsonRpcProvider` for verifiers; `BrowserProvider` for issuance/student writes).

A ninth, transverse objective — *to make the system runnable on a fresh Windows or Unix machine with one double-click* — is realised by `start.bat` (Windows, 87 lines) and `start.sh` (Unix), which detect Node, install both backend and front-end dependencies, warn if `backend/.env` is missing, launch the two servers in independent terminal windows, wait fifteen seconds for boot-up, and open the browser at `http://localhost:3000`.

---

## 1.4 Proposed System Architecture (Model)

The proposed system is organised as **three loosely-coupled tiers** stacked on top of two external services. Figure 2.1 in the next chapter renders the architecture visually; the prose below explains it conceptually.

### 1.4.1 The Smart Contract Tier

The contract is a single Solidity 0.8.28 file, `contracts/contracts/EdiproofCertificate.sol`, deployed to Sepolia at address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` (per `contracts/deployments/sepolia.json:3`). It inherits from OpenZeppelin's `ERC721Enumerable` and `Ownable` (line 15) and is compiled with the `cancun` EVM target and `viaIR` enabled (`hardhat.config.ts:12-19`) — both flags were necessary for OpenZeppelin v5 compilation, as recorded in commit `86c3aa8`.

The contract's external surface is summarised in Table 1.4.

| Group | Function | Visibility | Gating |
|---|---|---|---|
| Institution mgmt | `addInstitution`, `removeInstitution` | external | `onlyOwner` |
| Lifecycle | `issueCertificate` | external | `onlyApprovedInstitution` |
| Lifecycle | `revokeCertificate` | external | issuer or owner equality check |
| Lifecycle | `reissueCertificate` | external | `onlyApprovedInstitution` + issuer/owner check |
| Read | `verifyCertificate` | external `view` | none — wallet-less |
| Read | `getCertificate` | external `view` | none |
| Read | `getCertificatesByOwner` | external `view` | none |
| Read | `totalCertificates` | external `view` | none |
| Read | `tokenURI`, `supportsInterface`, `balanceOf`, `ownerOf`, `tokenOfOwnerByIndex` | inherited from ERC-721 + Enumerable | standard |

Every state-changing call emits an event — `InstitutionAdded`, `InstitutionRemoved`, `CertificateIssued`, `CertificateRevoked`, `CertificateReissued` — declared at `:35-48`. Events are the contract's *observability surface*: the backend listens for them, indexers can index them, and the front-end displays them in the activity strip.

### 1.4.2 The Backend Tier

The backend is a small Express 4 application bound to port 8787 (`backend/src/server.js:7, :33-35`) with a CORS middleware (`:9`), a 1 MB JSON body parser (`:10`), and a global error handler that returns `500` with the error message (`:28-31`). All six application routes are mounted at the `/api` prefix and live in `backend/src/routes.js`. The most consequential route is `POST /api/upload` at `:21-36`, which uses multer with in-memory storage and a 15 MB per-file limit (`:6-9`) to receive a multipart upload, then delegates to `uploadToPinata(buffer, originalname, mimetype)` at `backend/src/pinata.js:8`. The Pinata JWT is read from `process.env.PINATA_JWT` at `pinata.js:9` and is never returned to the client; the response is a tidy three-field object `{ cid, ipfsURI, gatewayURL }` constructed at `:37-42`.

All persistent state lives in a single SQLite file (`ediproof.db`, default location `backend/`) opened with WAL mode at `backend/src/db.js:11`. The schema is one table, `events`, with seven columns (`id`, `kind`, `token_id`, `tx_hash`, `actor`, `institution`, `created_at`) at `:14-22` and three secondary indexes (`idx_events_kind`, `idx_events_institution`, `idx_events_created_at`) at `:23-25`. Four prepared statements at `:28-59` provide the only data-access path: `insertEvent`, `selectStats`, `selectActivity`, `selectByInstitution`. The `kind` column takes one of four past-tense values — `issued`, `revoked`, `reissued`, `verified` — aligned across backend and front-end in commit `ec9c904`.

### 1.4.3 The Front-end Tier

The front-end is a Next.js 14.2.4 application using the App Router, with React 18.3, TypeScript 5, and Ethers v6.13.4 as the only runtime dependencies (`frontend/package.json:11-14`). Four pages live under `frontend/src/app/`:

- `page.tsx` — landing page with the project's masthead-style branding and a navigation strip pointing at the three role-specific surfaces.
- `issue/page.tsx` — institution issuance page, gated by the `WalletGate` component, with an `IssueForm` supporting three modes (`issue`, `reissue`, `revoke`), a file-upload widget that calls `POST /api/upload`, a live keccak256 hash preview computed by `computeCertHash` at `frontend/src/lib/hash.ts:7-17`, and a transaction-status indicator that surfaces `txHash`.
- `verify/page.tsx` — public verifier page with three input modes (by details, by token id, by wallet), all reading through the read-only `JsonRpcProvider` returned by `useContract()` at `frontend/src/hooks/useContract.ts:17-20`. **No wallet is required to load or use this page.** A `GLOSSARY` constant at `verify/page.tsx:31-56` provides plain-English explanations of *Soulbound Token*, *IPFS*, *keccak256*, *Sepolia*, *Revocation*, and *Reissue* for non-technical verifiers.
- `my-leaves/page.tsx` — student's permanent portfolio, gated by `WalletGate`, listing every certificate the student's wallet owns by querying `getCertificatesByOwner(...)` and filtering by status (`all` / `active` / `revoked` / `reissued`).

Five reusable components live under `frontend/src/components/`: `Masthead.tsx` (newspaper-style header), `WalletChip.tsx` (compact connected-wallet indicator), `WalletGate.tsx` (the page-level connection prompt), `ActivityStrip.tsx` (recent-events ticker reading from the backend's `/api/activity`), and `Colophon.tsx` (footer).

Two custom hooks compose the wallet integration: `useWallet` at `frontend/src/hooks/useWallet.ts:41-124` performs EIP-6963 discovery, falls back to legacy `window.ethereum.providers[]` enumeration, and finally to a strict `isMetaMask` check; it also handles the Sepolia chain-switch flow at `:16-39` (sending `wallet_switchEthereumChain` first, falling back to `wallet_addEthereumChain` if the chain is unknown). `useContract` at `frontend/src/hooks/useContract.ts:16-23` returns a read-only contract via `JsonRpcProvider`, while a separate exported function `getSignedContract()` at `:30-38` returns a `BrowserProvider`-backed signed contract for write operations.

### 1.4.4 The Two External Services

**Ethereum Sepolia** is the target chain. ChainId `11155111` is configured at `hardhat.config.ts:26` and at `frontend/src/hooks/useWallet.ts:14`. The front-end's read-only path uses an Alchemy Sepolia RPC URL hard-coded at `useContract.ts:9`; the deployer's Sepolia RPC is read from the `ALCHEMY_SEPOLIA_RPC` environment variable at `hardhat.config.ts:7`.

**Pinata IPFS V3** is the pinning service. The endpoint `https://uploads.pinata.cloud/v3/files` is hard-coded at `backend/src/pinata.js:1`. The default gateway `https://gateway.pinata.cloud` is at `:2`, but the operator can override it through the `PINATA_GATEWAY` environment variable for institutions that pay for a dedicated Pinata gateway (which gives faster reads and a custom domain).

### 1.4.5 Architectural Rationale

The choice of three loosely-coupled tiers is deliberate. The contract is the *source of truth*: every claim Ediproof makes about a certificate is grounded in contract storage, and every claim is independently re-verifiable by reading the contract directly through Etherscan or any RPC client. The backend exists *only* to (a) hide the Pinata JWT and (b) cache event data for the dashboard — its absence does not break the verification path. The front-end is a *thin* orchestrator that composes wallet, backend, and contract calls into role-specific UIs. This separation pays for itself in the testing chapter (Chapter 4): the contract is exercisable in isolation through Hardhat + Chai, the backend through `curl`, and the front-end through the live UI, without any one of the three depending on the others being live.

---

## 1.5 Software Specification

The system runs end-to-end on Node.js 22 LTS (the upper bound `< 24` is a hard constraint from `backend/package.json:12-14` because `better-sqlite3` does not currently compile on Node 24). The complete technology stack is summarised in Table 1.1.

| Layer | Component | Version | Citation |
|---|---|---|---|
| Smart-contract language | Solidity | 0.8.28 | `hardhat.config.ts:13` |
| EVM target | cancun | — | `hardhat.config.ts:16` |
| Optimiser | viaIR + 200 runs | — | `hardhat.config.ts:15, :17` |
| Contract base library | OpenZeppelin Contracts | ^5.6.1 | `contracts/package.json:16`, [20] |
| Build & test framework | Hardhat | ^2.22.0 | `contracts/package.json:23`, [19] |
| Hardhat toolbox | @nomicfoundation/hardhat-toolbox | ^5.0.0 | `contracts/package.json:15` |
| Test assertion | Chai | ^4.4.1 | `contracts/package.json:20` |
| RPC + signer SDK | Ethers.js | ^6.16.0 (contracts), ^6.13.4 (front-end) | `contracts/package.json:22`, `frontend/package.json:14`, [21] |
| Target network | Ethereum Sepolia | chainId 11155111 | `hardhat.config.ts:26`, [16] |
| Block explorer | Etherscan v2 | API | `hardhat.config.ts:30-42`, [17] |
| RPC provider | Alchemy | Sepolia | `frontend/src/hooks/useContract.ts:9` |
| Backend runtime | Node.js | 22 LTS, `>=22 <24` | `backend/package.json:12-14` |
| Backend HTTP | Express | ^4.21.0 | `backend/package.json:19`, [24] |
| Multipart parser | multer | ^1.4.5-lts.1 | `backend/package.json:20`, [25] |
| SQLite driver | better-sqlite3 | ^12.0.0 | `backend/package.json:16`, [27] |
| CORS middleware | cors | ^2.8.5 | `backend/package.json:17` |
| Env loader | dotenv | ^16.4.5 | `backend/package.json:18` |
| IPFS pinning | Pinata V3 | API | `backend/src/pinata.js:1`, [14] |
| Front-end framework | Next.js | 14.2.29 | `frontend/package.json:11`, [22] |
| UI library | React | ^18.3.1 | `frontend/package.json:12`, [23] |
| TypeScript | TypeScript | ^5 | `frontend/package.json:20`, [29] |
| Wallet protocol | EIP-1193 + EIP-6963 | — | `frontend/src/lib/wallet.ts`, [12] |
| Wallet client | MetaMask | ≥ 11 | runtime, [26] |
| Operating system | Windows 11 (development); Linux/macOS (compatible) | — | — |

The complete dependency manifests are reproduced verbatim in §3.7 (backend) and §3.8 (front-end) of Chapter 3. All Node dependencies install with `npm install` from each sub-project root. Front-end dependencies are notably small — the `dependencies` block of `frontend/package.json` is exactly four entries (`next`, `react`, `react-dom`, `ethers`), keeping the supply-chain attack surface minimal.

The system has no compile-time GPU dependency. It performs no AI/ML inference. The only runtime network dependencies are (a) the Sepolia RPC endpoint at Alchemy (front-end and Hardhat), (b) the Pinata V3 endpoint (backend only), and (c) the Etherscan v2 endpoint (only at contract-verification time). All three degrade gracefully — verification still works against any other Sepolia RPC, file uploads still work against any IPFS pinning service that exposes a multipart V3-compatible API, and Etherscan verification is a post-deployment convenience rather than an operational requirement.

---

## 1.6 Hardware Specification

Because the heavy compute happens on Ethereum nodes and on Pinata's IPFS infrastructure, the local hardware footprint of **Ediproof** is intentionally modest. The following two columns give the *minimum* configuration on which the system has been tested end-to-end and the *recommended* configuration for comfortable development with both Hardhat and Next.js dev servers running side-by-side.

| Resource | Minimum | Recommended | Notes |
|---|---|---|---|
| CPU | x86-64, 2 cores, 2.0 GHz | x86-64 / Apple Silicon, 4 cores, 3.0 GHz | Hardhat compilation is the heaviest local task |
| RAM | 4 GB | 8 GB | Next.js dev server is the dominant consumer |
| Disk | 1 GB free | 5 GB free | `node_modules/` totals ~700 MB across both Node sub-projects |
| GPU | Not required | Not required | No on-chain compute is local |
| Network | 2 Mbps stable | 10 Mbps stable | Latency to Alchemy and Pinata dominates wall-clock time of writes |
| Operating system | Windows 10/11, Ubuntu 22.04+, macOS 14+ | Same | `start.bat` for Windows, `start.sh` for Unix-likes |
| Display | 1280 × 720 | 1920 × 1080 or higher | The verifier UI's three-tab layout is comfortable from 1280 px upward |

Storage requirements scale linearly with the number of `events` rows logged by the backend: a typical demonstration run produces at most a few dozen events, occupying under 100 KB of SQLite storage including WAL overhead. The contract's on-chain storage cost is borne by the Sepolia network and is paid for in test ETH from a faucet — `0.1 ETH` is sufficient for several hundred issuance + revocation operations.

The system has been developed primarily on Windows 11 Home Single-Language (build 26200) with the bash shell from Git for Windows. No platform-specific code paths exist outside of the Windows-only `start.bat` (which has a Unix counterpart `start.sh`). The CRLF/LF line-ending issue encountered with `start.bat` during development is recorded in commit `3970843` and resolved by the project's `.gitattributes` policy.

---

> *Chapter summary.* This chapter introduced the **Ediproof** DApp, motivated the project against the gap left by manual telephone verification, centralised digi-lockers, and walled-garden blockchain credential platforms, listed the eight concrete objectives the system fulfils with citations to the corresponding code modules, and laid out the proposed three-tier architecture together with the complete software and hardware specification. Chapter 2 now turns to the diagrammatic design of the system, walking through the block diagram, the entity-relationship diagram, the data-flow diagrams, the use-case diagram, the activity diagram, and the two principal sequence diagrams.
