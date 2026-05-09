# Chapter 2 — System Design and Methodology

> *Chapter overview.* This is the longest chapter of the report. It walks through the system's design at every level: the high-level **block diagram** of the three-tier architecture, per-**module** descriptions, the multi-level **data-flow diagrams (DFD)**, the **flowchart** of the issuance happy path, the consolidated **technology stack** reference, the **methodology** under which the project was developed, the end-to-end **workflow** narrative, the **algorithm / process logic** behind the cryptographic hash and the soulbound enforcement, and finally the **integration** contract that pins how the six modules combine. Where a constant or an algorithmic detail is referenced, the corresponding source-file location is given so that the reader can cross-check the design against the implementation.

---

## 2.1 System Architecture

**Figure 2.1** is the highest-level view of the system. It depicts three vertical tiers, left to right: the **Browser Tier**, the **Backend Tier**, and the **Blockchain & Storage Tier**. The choice of three loosely-coupled tiers is deliberate: the contract is the source of truth, the backend is best-effort analytics + JWT custody, and the front-end is a thin orchestrator that stitches the two together for human users.

### 2.1.1 The Browser Tier

The Browser Tier is the user-facing surface. It contains the Next.js 14 front-end (`frontend/`), the MetaMask browser extension, and the user's keyboard. The front-end renders four pages — landing (`/`), institution issuance (`/issue`), public verifier (`/verify`), and student portfolio (`/my-leaves`). Two of the four are wallet-gated through the `WalletGate` component (`frontend/src/components/WalletGate.tsx`), which prompts the user to install MetaMask and switch to the Sepolia chain (chainId `11155111`, hex `0xaa36a7`, switching logic at `frontend/src/hooks/useWallet.ts:16-39`). One of the four — the verifier — is *deliberately* not wallet-gated; it loads, runs, and serves verification results to anyone, with no MetaMask dependency.

The browser tier itself contains three logical sub-components: the wallet integration (`useWallet` + `lib/wallet.ts`), the contract integration (`useContract`), and the backend HTTP client (`lib/api.ts`). The wallet integration is the most subtle of the three because of the EIP-6963 multi-injected-provider problem, discussed in detail in §2.6.4 and §2.8.3. The contract integration exposes both a read-only `JsonRpcProvider` and a signed `BrowserProvider` so that wallet-less and wallet-gated paths share the same code.

### 2.1.2 The Backend Tier

The Backend Tier is a single Express 4 process listening on `http://localhost:8787` (`backend/src/server.js:7, :33-35`). It exposes six routes (Table 3.1 in Chapter 3 enumerates them with line numbers). It maintains a single SQLite database file (`ediproof.db`, WAL mode at `backend/src/db.js:11`) holding one table (`events`, schema at `:14-22`). Its only outbound network calls are to the Pinata V3 endpoint at `https://uploads.pinata.cloud/v3/files` (`backend/src/pinata.js:1`).

The backend has two architectural responsibilities and only two: (a) hide the Pinata JWT from any browser, by mediating every multipart upload through the `POST /api/upload` route; and (b) cache on-chain events into a queryable analytics store so the institution dashboard can answer questions like *"how many certificates have we issued this month?"* without paying the gas cost of repeatedly enumerating the contract's storage. The chain remains the source of truth: the analytics store is *advisory*, and a corruption or loss of `ediproof.db` does not affect any certificate's verifiability.

### 2.1.3 The Blockchain & Storage Tier

The Blockchain & Storage Tier holds the system's two external services. The first is the **Ethereum Sepolia testnet**, accessed both by the front-end (read-only `JsonRpcProvider` against an Alchemy RPC at `frontend/src/hooks/useContract.ts:9`) and by the institution wallet (write `BrowserProvider` through MetaMask). The deployed contract `EdiproofCertificate` lives at address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` (recorded in `contracts/deployments/sepolia.json:3`). The second is **Pinata IPFS**, which holds the actual certificate files (typically PDFs) at content-addressed `ipfs://<cid>` URIs. The contract stores the `ipfsURI` string, *not* the file contents: the file lives on IPFS and is retrievable through any IPFS gateway (Pinata, Cloudflare, or a self-hosted node).

### 2.1.4 The Three Classes of Arrow

Three classes of arrow appear in Figure 2.1:

- *Solid* arrows represent the synchronous request path of a single user action. The institution-issuance arrow runs **Browser → Backend → Pinata → Browser → MetaMask → Sepolia → Browser**, terminating with a transaction-status banner.
- *Dashed* arrows represent the wallet-less verification path. The verifier arrow runs **Browser → Sepolia (read-only RPC) → Browser**, with no backend hop and no wallet involvement.
- *Dotted* arrows represent the optional analytics side-channel. After every successful state-changing transaction, the front-end fires a `POST /api/log` against the backend to append a row to the `events` table; this is best-effort and the chain remains the source of truth.

### 2.1.5 Failure Mode Decomposition

The three-tier separation is deliberate. A blocked Pinata endpoint manifests in the backend tier, breaking new uploads but leaving verification intact. A blocked Alchemy endpoint manifests in the storage tier, breaking the read paths but leaving the contract itself unchanged on Sepolia. A backend crash manifests in the backend tier and is recoverable by restarting the Node process; the on-chain state is unaffected. This is what is meant by *the blockchain is the source of truth* in `README.md:89`: the architectural rule that *removing any component except the contract leaves the verification surface intact* is what makes Ediproof's promise to verifiers credible.

---

## 2.2 Module Description

The system is composed of six modules whose responsibilities are summarised in Table 2.1 and decomposed in detail below. **Figure 2.2** is the module-interaction overview corresponding to this table.

| # | Module | Source location | Lines | Primary responsibility |
|---|---|---|---|---|
| M1 | Smart Contract | `contracts/contracts/EdiproofCertificate.sol` | 438 | Issue / revoke / reissue / verify; soulbound enforcement; on-chain `tokenURI` |
| M2 | Backend Proxy | `backend/src/{server,routes,db,pinata}.js` | ~220 | Pinata JWT custody; SQLite analytics; six HTTP routes |
| M3 | Front-end SPA | `frontend/src/` | ~1100 | Three role-specific UIs; wallet integration; live hash preview |
| M4 | Design System | `design/styles.css` + 4 HTML wireframes | ~600 | Archival visual language; design tokens reused as React components |
| M5 | Deployment + Seeding | `contracts/scripts/{deploy,seed}.ts` | ~140 | Persist deployment metadata; auto-export ABI; seed three demo certificates |
| M6 | One-shot Launchers | `start.bat` + `start.sh` | ~150 | Install dependencies, start both servers, open browser |

### 2.2.1 Module M1 — Smart Contract

The contract is the canonical record of every certificate. Its public surface is nine externally callable functions (three institution-management, three certificate-lifecycle, three reads), the standard ERC-721 + ERC-721Enumerable surface (`balanceOf`, `ownerOf`, `tokenOfOwnerByIndex`, `tokenURI`, `supportsInterface`), and the `Ownable` accessors (`owner`, `transferOwnership`, `renounceOwnership`). Five events are emitted on every state-changing call. Six custom errors carry diagnostic data on every revert. Four mappings hold the contract's persistent state: `certificates` (id → struct), `hashToTokenId` (hash → id, the verifier's inverse index), `approvedInstitutions` (EOA → bool), and `replacedBy` (oldId → newId).

The two cryptographic / access-control primitives — `_computeHash(...)` at `:399-406` and the `_update(...)` override at `:410-420` — are the heart of the module. They are described in §2.8 below.

### 2.2.2 Module M2 — Backend Proxy

The backend is 220 lines of plain JavaScript across four files. It is deliberately minimal — Ediproof's design rule is that the backend is *not* on the critical path for verification. If it goes offline, only file uploads (which require Pinata) and the analytics dashboard stop working; the verifier path continues to function unchanged.

The four files split responsibilities cleanly: `server.js` bootstraps Express, mounts CORS and JSON middleware, attaches the route bundle, and listens on the configured port; `routes.js` defines the six HTTP routes; `db.js` opens the SQLite database in WAL mode and prepares the four data-access statements; `pinata.js` exposes one function — `uploadToPinata(buffer, filename, mimetype)` — that hides the JWT and proxies to Pinata's V3 multipart endpoint.

### 2.2.3 Module M3 — Front-end SPA

The front-end is a Next.js 14.2.29 application using the App Router. Four pages live under `frontend/src/app/` (landing, issue, verify, my-leaves); five reusable components live under `frontend/src/components/` (Masthead, WalletChip, WalletGate, ActivityStrip, Colophon); two custom hooks compose the wallet integration (`useWallet`, `useContract`); three lib modules hold cross-cutting code (`api.ts`, `hash.ts`, `wallet.ts`). The runtime dependency list is exactly four entries (`next`, `react`, `react-dom`, `ethers`), keeping the supply-chain attack surface minimal.

### 2.2.4 Module M4 — Design System

The `design/` directory contains four standalone HTML wireframes (`01-landing.html`, `02-issue.html`, `03-verify.html`, `04-my-certificates.html`) and a single shared stylesheet (`styles.css`). The chosen design language is *archival*: a parchment cream background, an oxblood red for emphasis, an ink black for body text, and a brass brown for borders. The typography is a serif for body text, an italic small-caps for the masthead, and a monospace for hashes and addresses. The Next.js implementation reuses the same CSS custom properties (`var(--ink)`, `var(--oxblood)`, `var(--font-display)`) defined in the global stylesheet, keeping the design tokens centralised.

### 2.2.5 Module M5 — Deployment + Seeding

The deploy script (`contracts/scripts/deploy.ts`) writes `contracts/deployments/sepolia.json` with five fields (`network`, `address`, `deployer`, `deployedAt`, `txHash`), exports the ABI to `frontend/src/lib/EdiproofCertificate.abi.json`, and exports the address to `frontend/src/lib/deployment.json`. The contract is therefore the single upstream of both the on-chain bytecode and the front-end's ABI binding — they cannot drift. The seed script (`contracts/scripts/seed.ts`) approves the deployer wallet as the demonstration institution and issues three sample certificates (Aarav Sharma / Priya Patel / Rahul Verma).

### 2.2.6 Module M6 — One-shot Launchers

`start.bat` (Windows, 87 lines) and `start.sh` (Unix) are the on-ramp for non-developer audiences. They detect Node, run `npm install` in both `backend/` and `frontend/` if `node_modules` is missing, warn if `backend/.env` does not exist, launch the two servers in independent terminal windows, wait fifteen seconds for boot-up, and open `http://localhost:3000` in the default browser. The Windows variant resolves the CRLF / line-ending and path-with-spaces issues recorded in commits `3970843`, `f0e0d78`, and `7ff8979`.

---

## 2.3 Data Flow Diagrams

The DFDs are presented at two levels of detail: a Level-0 *context diagram* (Figure 2.3) and two Level-1 *decompositions* — one for the issuance pipeline (Figure 2.4) and one for the wallet-less verifier (Figure 2.5).

### 2.3.1 Level-0 Context (Figure 2.3)

The Level-0 diagram treats the entire **Ediproof** DApp as a single circular process, sitting between four external entities: the **Institution** (the human user who signs issuance transactions from MetaMask), the **Student** (the human user who owns the certificate token), the **Verifier** (the human user — typically a recruiter — who submits a claim for verification *without* holding a wallet), and the **Pinata IPFS service** (the file pinning provider). Six data flows cross the system boundary.

- *Certificate file*, *student wallet address*, *student name*, *course name*, *institution name* flow inward from the Institution.
- *IPFS URI* flows inward from Pinata in response to the multipart upload.
- *Transaction signature* flows inward from the Institution (via MetaMask) and *Receipt + tokenId + tx-hash* flows back outward.
- *Verification claim (4 fields)* flows inward from the Verifier and *valid / invalid / revoked / replaced-by-N* flows outward.
- *Soulbound certificate token* is conceptually owned by the Student and surfaces in the Student's wallet UI — but is not part of the data-flow boundary because it lives on chain.
- A separate *Activity log* output is written to `backend/ediproof.db` and is the artefact the institution dashboard reads.

This level is sufficient to communicate the system to a non-technical stakeholder. It deliberately hides the three-tier architecture inside.

### 2.3.2 Level-1 Decomposition — Issuance (Figure 2.4)

Inside the issuance process, Figure 2.4 expands the single circle into eight numbered processes and three persistent stores:

- **1.0 Render `/issue` page** — the front-end's `IssuePage` component (`frontend/src/app/issue/page.tsx`) is loaded; the `WalletGate` prompts MetaMask connection and Sepolia chain-switch.
- **2.0 Upload certificate file** — the institution attaches a PDF; the file is sent as `multipart/form-data` to `POST /api/upload` at the backend.
- **3.0 Pinata multipart upload** — the backend's `uploadToPinata(...)` helper at `backend/src/pinata.js:8-43` constructs a `FormData`, sets the Bearer token from `process.env.PINATA_JWT`, posts to `https://uploads.pinata.cloud/v3/files`, and returns `{ cid, ipfsURI, gatewayURL }`.
- **4.0 Live hash preview** — the front-end calls `computeCertHash(name, course, institution, ipfsURI)` (`frontend/src/lib/hash.ts:7-17`) to give the institution an immediate visual confirmation of the same hash that the contract will compute.
- **5.0 Build issuance transaction** — `getSignedContract()` at `frontend/src/hooks/useContract.ts:30-38` constructs a `BrowserProvider`-backed Contract instance against the EIP-6963-discovered MetaMask provider; the front-end calls `contract.issueCertificate(...)`, which prompts MetaMask.
- **6.0 Sepolia mint** — the contract executes `issueCertificate(...)` at `EdiproofCertificate.sol:85-114`, which recomputes the hash, checks for duplicates against `hashToTokenId`, persists the `Certificate` struct, mints to the student via `_safeMint`, and emits `CertificateIssued`.
- **7.0 Receive receipt** — the front-end awaits `tx.wait()`, extracts the new `tokenId` from the `CertificateIssued` event log, and displays a success banner with a link to Etherscan.
- **8.0 Log event** — the front-end fires `POST /api/log` with `{ kind: "issued", tokenId, txHash, actor, institution }` (`frontend/src/lib/api.ts:31-43`); the backend writes a row into the `events` table via the `insertEvent` prepared statement at `backend/src/db.js:28-31`.

The persistent stores written during the flow are the **on-chain contract storage** (D1), the **off-chain `events` SQLite table** (D2), and the **Pinata data store** (D3, conceptually external).

### 2.3.3 Level-1 Decomposition — Verifier (Figure 2.5)

The verifier's DFD is intentionally short — the absence of a backend hop is the *point* of the design.

- **9.0 Render `/verify` page** — the page loads with no wallet check (`frontend/src/app/verify/page.tsx`).
- **10.0 Submit claim** — the verifier enters the four fields (or a token id, or a wallet address; three tabs at `verify/page.tsx:8`) and clicks Verify.
- **11.0 Read-only RPC call** — the front-end uses `useContract().readContract.verifyCertificate(...)` (`frontend/src/hooks/useContract.ts:17-20`), constructed from `ethers.JsonRpcProvider` against the Alchemy Sepolia URL. **No wallet, no signature, no gas.**
- **12.0 Contract evaluation** — the contract executes `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208`, recomputes the hash, looks it up in `hashToTokenId`, returns the tuple `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)`.
- **13.0 Render result** — the front-end displays one of four outcomes: *valid*, *invalid*, *revoked*, or *revoked & replaced by N*.
- **14.0 (optional) Log verified** — the front-end fires `POST /api/log` with `kind: "verified"` so the institution dashboard can count verifications.

The **D1** on-chain store is *read* but never written by the verifier; **D2** is appended to optionally; **D3** Pinata is not touched at all.

The Level-1 diagrams are explicitly *isomorphic* to the implementation: each numbered process corresponds to a single function or component in the source tree. This isomorphism is what lets the testing chapter (Chapter 5) write one targeted assertion per process and claim end-to-end DFD coverage.

---

## 2.4 Flowchart of the System

**Figure 2.6** is a flowchart of the issuance happy path. Where the activity diagram of §2.7 emphasises *control flow*, the flowchart here is the canonical procedural decomposition: rectangles for processes, diamonds for decisions, parallelograms for inputs/outputs, and a single bullseye final node.

### 2.4.1 Top-level flowchart

The flowchart begins at *Open `/issue` page*. Two early decisions branch the flow:

- *Decision 1 — Is MetaMask installed?* On the *no* branch, the flow terminates at *Show "Install MetaMask" prompt* (rendered by `WalletGate`). On the *yes* branch, the flow proceeds.
- *Decision 2 — Is the connected chain Sepolia (chainId 11155111)?* On the *no* branch, the flow proceeds to *Switch to Sepolia* (handled by `switchToSepolia(provider)` at `frontend/src/hooks/useWallet.ts:16-39`); the helper itself contains an inner decision *Is Sepolia known to this wallet?* which falls back to `wallet_addEthereumChain` if not. On the *yes* branch (or after a successful switch), the flow proceeds.

Once the wallet is connected and on Sepolia, the flow proceeds linearly through *Fill issuance form* → *Upload certificate file (Pinata round-trip)* → *Compute live hash preview* → *Submit `issueCertificate(...)` transaction*. A third decision diamond appears at *Decision 3 — MetaMask user accepts?* either routing to *Cancel and surface error* (terminal) or to *Wait for confirmation* (loop containing `tx.wait()` polling). On receipt the flow proceeds to *Extract `tokenId` from event log* → *Log event to backend* → *Show success banner with Etherscan link* (terminal, bullseye final node).

### 2.4.2 Verifier flowchart

A second flowchart, drawn alongside the first for comparison, covers the verifier path. It has only three boxes — *Open `/verify` page* → *Submit claim* → *Display verdict* — and *no* decision diamond related to wallet state, because the verifier path never opens a wallet. The two flowcharts placed side by side make the asymmetry of the system visible at a glance: issuance traverses three decision diamonds, while verification traverses zero.

### 2.4.3 Side effects

The flowchart also shows two side-effect arrows. The first records a write to the **on-chain contract storage** whenever the *Submit `issueCertificate(...)` transaction* node completes successfully; the second records a write to the **`events` SQLite table** whenever *Log event to backend* completes. These side effects are intentional: they decouple the canonical on-chain record from the best-effort off-chain dashboard, so that even if the backend crashes, the on-chain state survives.

### 2.4.4 Entity-Relationship Notes

Although a separate ERD is not included as a figure (the schema is small enough that a table is sufficient), the persistent data model has two stores. **On-chain** the contract holds the `Certificate` struct (one per token) and four mappings — `certificates`, `hashToTokenId`, `approvedInstitutions`, `replacedBy`. **Off-chain** the backend holds a single SQLite `events` table with seven columns and three secondary indexes. The relationship between an on-chain `Certificate` and the off-chain `events` rows is **one-to-many**: one issued certificate produces a chain of zero or more events (`issued` → optionally `revoked` → optionally `reissued` → arbitrarily many `verified`). The link is loose — `events.token_id` is a plain `INTEGER` with no foreign-key constraint, because the foreign key cannot be enforced across trust domains. The contract's own state is the authoritative record, and the events table is *advisory*.

---

## 2.5 Technology Stack / Tools Used

The complete technology stack used during development is summarised below, grouped into four layers with versions and citations to the corresponding documentation references in Chapter 8.

### 2.5.1 Smart-contract layer

| Component | Version | Citation |
|---|---|---|
| Solidity language | 0.8.28 | [4] — `hardhat.config.ts:13` |
| EVM target | cancun | `hardhat.config.ts:16` |
| Optimiser | viaIR + 200 runs | `hardhat.config.ts:15, :17` |
| OpenZeppelin Contracts | ^5.6.1 | [20] — `contracts/package.json:16` |
| Hardhat | ^2.22.0 | [19] — `contracts/package.json:23` |
| Hardhat toolbox | ^5.0.0 | `contracts/package.json:15` |
| Chai (assertions) | ^4.4.1 | `contracts/package.json:20` |
| Ethers.js | ^6.16.0 | [21] — `contracts/package.json:22` |
| Sepolia testnet | chainId 11155111 | [16] — `hardhat.config.ts:26` |
| Etherscan v2 | API | [17] — `hardhat.config.ts:30-42` |
| Alchemy Sepolia RPC | — | [18] — `frontend/src/hooks/useContract.ts:9` |

### 2.5.2 Backend layer

| Component | Version | Citation |
|---|---|---|
| Node.js | 22 LTS, `>=22 <24` | `backend/package.json:12-14` |
| Express | ^4.21.0 | [24] — `backend/package.json:19` |
| multer | ^1.4.5-lts.1 | [25] — `backend/package.json:20` |
| better-sqlite3 | ^12.0.0 | [27] — `backend/package.json:16` |
| cors | ^2.8.5 | `backend/package.json:17` |
| dotenv | ^16.4.5 | `backend/package.json:18` |
| Pinata V3 (IPFS) | API | [14] — `backend/src/pinata.js:1` |

### 2.5.3 Front-end layer

| Component | Version | Citation |
|---|---|---|
| Next.js | 14.2.29 | [22] — `frontend/package.json:11` |
| React | ^18.3.1 | [23] — `frontend/package.json:12` |
| TypeScript | ^5 | [29] — `frontend/package.json:20` |
| Ethers.js | ^6.13.4 | [21] — `frontend/package.json:14` |
| Wallet protocol | EIP-1193 + EIP-6963 | [12] — `frontend/src/lib/wallet.ts` |
| Wallet client | MetaMask ≥ 11 | [26] — runtime |

### 2.5.4 Build, deploy, and supporting tools

| Tool | Purpose |
|---|---|
| Git | Version control |
| Visual Studio Code | Primary IDE |
| Windows PowerShell + Git Bash | Shell environments on the Windows development host |
| Hardhat console | Live REPL for ad-hoc contract calls |
| MetaMask | User-facing wallet (Sepolia funded via public faucet) |
| Etherscan v2 (Sepolia) | Post-deploy contract verification + *Read Contract* tab demo |
| `start.bat` / `start.sh` | One-shot launcher for non-developer audiences |

The system has *no* compile-time GPU dependency, *no* AI/ML inference path, and *no* paid runtime dependencies aside from a Pinata account (free tier sufficient for the demonstration). All Node dependencies install with `npm install` from each sub-project root; the Solidity dependencies are managed transitively by Hardhat.

---

## 2.6 Overall Methodology

The development methodology adopted for the project was a **focused, three-day iterative build** structured as a contract-first, test-driven pipeline. The choice was not waterfall (no anticipatory specification document) and not pure-agile (no sprints, no daily stand-ups, no retrospectives) — it was instead a constrained, single-developer iteration in which the architectural decision to put the contract first dominated every subsequent choice.

### 2.6.1 Contract-first ordering

The contract was developed before the backend, the front-end, or any deployment tooling. The justification was that the contract is the *only* component whose state survives a redeploy. A bug in the backend or front-end is a one-line patch; a bug in the contract is, in production, permanent. By starting with the contract, the project's other components were free to follow the contract's surface — and not the other way around.

### 2.6.2 Test-driven contract development

Within the contract layer the work proceeded test-driven. The full unit-test file (`contracts/test/EdiproofCertificate.test.ts`, 504 lines, twenty test cases across nine `describe` blocks) was developed in parallel with the contract. Each new lifecycle function was paired with at least one test asserting its happy-path behaviour and one test asserting its primary failure mode. The test pyramid documented in §5.1 was thus established by construction: the unit tests are wide and deep because they were written together with the code they exercise, while the higher tiers (integration, system) layer on top of a verified contract.

### 2.6.3 Three-day timeline

The major commits in the git log map cleanly onto the three development days:

- **Day 1 (17 April 2026)** — Hardhat scaffold; first cut of `EdiproofCertificate.sol`; OpenZeppelin v5 compilation issues resolved by setting `evmVersion: cancun` and `viaIR: true` (commit `86c3aa8`); first passing local test run.
- **Day 2 (18 April 2026)** — Sepolia deploy with Etherscan v2 configuration (commit `c335550`); event-kind alignment to past-tense values across backend and front-end (commit `ec9c904`); full Next.js 14 front-end scaffold with the archival design language (commit `09449f3`); front-end error surface for verify-failure cases (commit `e3ae90b`).
- **Day 3 (19 April 2026)** — One-shot start scripts for non-developers (commit `35e8176`); secret-leak prevention on a credentials draft (commit `db89d46`); EIP-6963 wallet-discovery fix to defeat OKX hijacking (commit `8fe44f9`); backend upload-error surfacing (commit `76a851d`); start-script reliability fixes for paths with spaces and CRLF line endings (commits `f0e0d78`, `3970843`, `7ff8979`).

The choice of a 3-day window was deliberate: the project's positioning is as a *demonstration* of a working architecture rather than a production platform, with a clear path to production listed in §7.3.

### 2.6.4 Tools-driven feedback loops

Three external feedback loops shaped the methodology in practice:

1. **The Hardhat in-process chain** — `npm test` executes in approximately 8.7 s; each save-test cycle is fast enough to make TDD viable for contract development.
2. **The Sepolia public network** — once a feature passed local tests, deploying it to Sepolia and observing the Etherscan-verified receipt was the second feedback loop, with a typical 12–30 s confirmation latency per transaction.
3. **The browser** — the Next.js dev server's hot-reload (`npm run dev` at `frontend/`) gave a sub-second feedback loop on UI tweaks.

The tight inner loop (Hardhat) was preferred wherever possible; the Sepolia loop was reserved for verifying that the locally-passing code also worked against a real chain, real wallet, and real RPC provider.

---

## 2.7 System Workflow

The two principal end-to-end workflows are issuance and wallet-less verification. The two are described below in the form of sequence-diagram narratives that complement Figures 2.8 and 2.9.

### 2.7.1 Issuance — End-to-End Sequence (Figure 2.8)

The diagram shows seven lifelines arranged left to right: **Institution (human)**, **Browser (Next.js)**, **MetaMask**, **Express Backend**, **Pinata V3**, **Sepolia (EVM)**, and **SQLite (events)**. The sequence begins with the Institution opening the `/issue` page in the browser and clicking *Connect Wallet*. The browser's `useWallet` hook fires an EIP-6963 `eip6963:requestProvider` event (`frontend/src/lib/wallet.ts:39`), receives announcements from each installed wallet on the `eip6963:announceProvider` event (`:33-38`), and selects the provider whose `info.rdns === 'io.metamask'` (`:50`). MetaMask's pop-up appears; the user approves; the browser's `useWallet` then calls `wallet_switchEthereumChain` for Sepolia (`hooks/useWallet.ts:18-21`).

The sequence then continues with the upload-and-issue flow:

1. The Institution selects a certificate file and clicks Upload. The browser sends `POST /api/upload` (`multipart/form-data`) to the Express backend.
2. The backend's `upload.single("file")` middleware (multer with 15 MB cap, `routes.js:6-9`) buffers the file into memory.
3. The backend's `uploadToPinata(...)` helper builds a new `FormData`, attaches the file as a Blob with the original filename and MIME type (`pinata.js:14-18`), and sends `POST https://uploads.pinata.cloud/v3/files` with the Bearer JWT in the `Authorization` header (`:20-24`).
4. Pinata responds with `{ data: { cid: "Qm…" } }`. The backend extracts the CID, constructs `ipfsURI = "ipfs://" + cid` and `gatewayURL = "<gateway>/ipfs/" + cid` (`pinata.js:37-42`), and returns the three-field object to the browser.
5. The browser fills the IPFS URI into the form, computes the live keccak256 hash preview off-chain (`hash.ts:13-17`), and waits for the user to click *Issue*.
6. On click, the browser obtains a signed contract via `getSignedContract()` (`hooks/useContract.ts:30-38`), which constructs an `ethers.BrowserProvider` against the MetaMask provider. The browser calls `contract.issueCertificate(student, name, course, institution, ipfsURI)`. MetaMask pops up.
7. The user signs. MetaMask submits the transaction to the Sepolia network via its own RPC. The browser receives a `tx` object and calls `tx.wait()`.
8. Sepolia's validators (PoS since October 2023) include the transaction in a block. The contract executes `issueCertificate(...)` at `EdiproofCertificate.sol:85-114`: it computes the hash, checks for duplicates, persists the struct, mints to the student, and emits `CertificateIssued(tokenId, student, certHash, institution)`.
9. `tx.wait()` returns a receipt. The browser parses the receipt's logs to extract the new `tokenId`.
10. The browser fires `POST /api/log` with `{ kind: "issued", tokenId, txHash, actor: institution-address, institution: institution-name }`. The backend's `insertEvent.run({...})` (`db.js:28-31`) appends a row to the `events` table.
11. The browser displays a success banner with a link to `https://sepolia.etherscan.io/tx/<txHash>`.

### 2.7.2 Verifier — Wallet-less Sequence (Figure 2.9)

The verifier diagram is shorter. Three lifelines: **Verifier (human)**, **Browser (Next.js)**, **Sepolia (EVM)**. There is no MetaMask, no backend, no Pinata.

The sequence begins with the Verifier opening `/verify`. The browser loads the page (`frontend/src/app/verify/page.tsx`) and calls `useContract()`, whose `readContract` member is a fresh `ethers.Contract(CONTRACT_ADDRESS, abi, new ethers.JsonRpcProvider(ALCHEMY_URL))` (`hooks/useContract.ts:16-23`). The Verifier types the four fields into the *Details* tab and clicks Verify. The browser calls `readContract.verifyCertificate(name, course, institution, ipfsURI)`.

Ethers serialises the call as `eth_call` and posts it to the Alchemy RPC over HTTPS. Alchemy routes it to a Sepolia archive node, which executes `verifyCertificate(...)` against state at the latest block. The function (a) recomputes `certHash = keccak256(abi.encodePacked(...))`, (b) looks up `tokenId = hashToTokenId[certHash]`, (c) if `tokenId == 0` returns `(false, 0, address(0), false, 0)` — *invalid*; (d) otherwise, reads the certificate's `revoked` flag and `replacedBy[tokenId]`, and returns `(valid = !revoked, tokenId, ownerAddr, revoked, replacedByTokenId)`.

The result tuple is encoded by ethers and returned to the browser. The browser renders one of four outcomes — green VALID, red NOT FOUND, orange REVOKED, or orange REVOKED — REPLACED BY TOKEN N — and optionally fires `POST /api/log` with `kind: "verified"` for the institution dashboard. Even that single backend call is fire-and-forget; if the backend is offline, the verification result is unaffected.

### 2.7.3 The Asymmetry

The asymmetry between Figures 2.8 and 2.9 — issuance touches seven lifelines, verification touches three — is what makes Ediproof operationally appropriate for the credential-verification use case. A bona-fide employer with no crypto experience can verify any certificate in two clicks, while the institution and student paths retain the full guarantees of a write-capable wallet flow.

### 2.7.4 Use Case Summary (Figure 2.7)

Four primary actors interact with the system: **Owner** (the EOA that deployed the contract; can add or remove institutions), **Institution** (any EOA the owner has approved; can issue, revoke, reissue), **Student** (any EOA that owns a certificate token; read-only), and **Verifier** (any third party with a browser; holds no wallet). Nine use cases cluster around these actors: *Add Institution*, *Remove Institution*, *Upload Certificate File*, *Issue Certificate*, *Revoke Certificate*, *Reissue Certificate*, *View Own Certificates*, *Verify by Details / Token / Wallet*, *View Stats / Activity*. The diagram includes one `<<include>>` relationship (Issue includes Upload) and two `<<extend>>` relationships (Reissue extends Revoke; Verify extends a notional Compute-Hash use case).

---

## 2.8 Algorithm / Process Logic

Two primitives — the certificate hash and the soulbound `_update` override — are the cryptographic and access-control core of the project. They are reproduced here in full because every other piece of the design rests on them.

### 2.8.1 The certificate hash

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

`abi.encodePacked` concatenates the four strings without padding. `keccak256` then produces a 32-byte digest. Any change to *any* byte of *any* of the four fields produces a different digest with overwhelming probability — the central security property of the verification path. The same primitive is invoked by the front-end at `frontend/src/lib/hash.ts:13-17`, which wraps `ethers.solidityPackedKeccak256(['string','string','string','string'], [...])` to give the institution a live hash preview that is bit-identical to the contract's computation. The test at `test/EdiproofCertificate.test.ts:241-260` ("returns valid=false for tampered input (single letter change)") locks this property down by issuing a certificate with `name = "John Doe"` and then calling `verifyCertificate("Jhon Doe", course, institution, ipfs)` (a one-character transposition) and asserting that the result is `(valid=false, tokenId=0)`.

The choice of `keccak256` (rather than `sha256` or `sha3-256`) is dictated by the EVM: `keccak256` is the only hash function with a precompile that produces the same digest as the SHA-3 finalists' Keccak parameterisation [5, 6]. Using it avoids a precompile / library mismatch, and reproducing it in JavaScript requires only `ethers.solidityPackedKeccak256`, which is exposed by every modern ethers build.

### 2.8.2 The soulbound `_update` override

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

OpenZeppelin's ERC-721 funnels every transfer-shaped operation through `_update`: `_mint` (called from `_safeMint`) calls it with `from == 0`; `_burn` calls it with `to == 0`; `transferFrom` and `safeTransferFrom` call it with both `from != 0` and `to != 0`. The override above lets the first two through (mint and burn) and reverts the third — the entirety of the soulbound contract, in five lines including the closing brace. The custom error `SoulboundTransferBlocked()` is asserted by `test/EdiproofCertificate.test.ts:119-141` ("safeTransferFrom reverts").

Because `_update` is the *only* path through which an ERC-721 token's owner can change, this single override blocks every transfer surface — including `safeTransferFrom`, `transferFrom`, the token-managed approval flows, marketplace clear-and-claim patterns, and any future ERC-721 operation that may be added through OZ extensions. The minimalism is its own contribution: a soulbound implementation small enough to be audited at a glance.

### 2.8.3 The EIP-6963 wallet-picker algorithm

A third process-logic primitive is the EIP-6963 multi-injected-provider-discovery handshake used by `frontend/src/lib/wallet.ts`. The pseudocode is:

```
on script load:
    announced := []
    addEventListener('eip6963:announceProvider', evt → announced.push(evt.detail))
    dispatchEvent(new Event('eip6963:requestProvider'))

on connect-wallet click:
    if exists p in announced where p.info.rdns == 'io.metamask':
        return p.provider
    if window.ethereum.providers && p in providers where p.isMetaMask:
        return p
    if window.ethereum.isMetaMask:
        return window.ethereum
    error 'MetaMask not detected'
```

Each wallet announces itself separately on a custom event; the application picks the announcement whose `info.rdns === 'io.metamask'` (the canonical RDNS for MetaMask). The three-step fallback handles legacy MetaMask installations that do not yet support EIP-6963.

### 2.8.4 The reissuance state machine

Reissuance is a small state machine over the certificate's `revoked` flag and the `replacedBy` mapping. The pseudocode is:

```
reissueCertificate(oldId, name, course, institution, ipfsURI, newWallet):
    require c := certificates[oldId] exists
    require msg.sender == c.issuer or msg.sender == owner

    if not c.revoked:
        c.revoked := true
        emit CertificateRevoked(oldId, msg.sender)

    newHash := _computeHash(name, course, institution, ipfsURI)
    require hashToTokenId[newHash] == 0    // duplicate guard

    newId := _nextTokenId++
    certificates[newId] := Certificate(..., reissuedFrom = oldId, ...)
    hashToTokenId[newHash] := newId
    replacedBy[oldId] := newId

    _burn(oldId)
    _safeMint(newWallet, newId)

    emit CertificateIssued(newId, newWallet, newHash, institution)
    emit CertificateReissued(oldId, newId, msg.sender)
```

The two structural subtleties are (i) the deliberate retention of `certificates[oldId]` and `hashToTokenId[oldHash]` after `_burn`, so that `verifyCertificate(oldHash)` continues to return a useful "revoked, replaced by N" answer; and (ii) the order — `_burn` *before* `_safeMint` — so that the recipient's `onERC721Received` hook (if any) cannot re-enter the contract during a state where two tokens share the same student wallet.

---

## 2.9 Integration of Modules

The six modules of §2.2 do not stand alone; each interacts with at least two others through a small and explicit contract. This section pins down those contracts so that an examiner can trace a single user action through the codebase without guessing.

### 2.9.1 M1 (Smart Contract) ↔ M5 (Deployment + Seeding)

The deploy script (`contracts/scripts/deploy.ts`) is the *only* writer of `contracts/deployments/sepolia.json`, `frontend/src/lib/EdiproofCertificate.abi.json`, and `frontend/src/lib/deployment.json`. Re-running `npm run deploy:sepolia` after a contract change is therefore the single command that updates the front-end's view of the contract — they cannot drift. The seed script (`contracts/scripts/seed.ts`) reads the same `deployments/sepolia.json` (lines 6-17) to identify the contract address and the deployer wallet, and issues three demonstration certificates to populate the front-end with visible data.

### 2.9.2 M1 (Smart Contract) ↔ M3 (Front-end SPA)

The contract surface reaches the front-end through two channels. **At build time**, the deploy script writes the ABI and the address into `frontend/src/lib/`. **At run time**, the `useContract` hook (`frontend/src/hooks/useContract.ts`) constructs two `ethers.Contract` instances from those artefacts: a read-only one over `JsonRpcProvider` for the verifier path, and a signed one over `BrowserProvider` for the issuance and student-portfolio paths. The two share the same ABI and the same address — the only difference is the provider.

### 2.9.3 M2 (Backend) ↔ M3 (Front-end SPA)

The backend exposes six HTTP routes; the front-end consumes them through `frontend/src/lib/api.ts`, which wraps `fetch` in five typed helper functions (`fetchStats`, `fetchActivity`, `logEvent`, `uploadFile`, `fetchInstitutionStats`). The base URL is hard-coded at `api.ts:1` (`http://localhost:8787`), which is appropriate for a same-machine demonstration but would be configurable for a hosted deployment. The `uploadFile` function in particular has a verbose error-handling path (commit `76a851d`) so that the *"backend not running"* failure surfaces a helpful message rather than `TypeError: Failed to fetch`.

### 2.9.4 M2 (Backend) ↔ External: Pinata IPFS

The backend reaches Pinata through exactly one function: `uploadToPinata(buffer, filename, mimetype)` at `backend/src/pinata.js:8-43`. The function reads the JWT from `process.env.PINATA_JWT`, attaches it as a Bearer token, posts to `https://uploads.pinata.cloud/v3/files`, and returns `{ cid, ipfsURI, gatewayURL }`. There is no caching, no retry, no Pinata SDK dependency — just `fetch`. If Pinata is replaced by another pinning service, this is the *only* file that changes.

### 2.9.5 M3 (Front-end SPA) ↔ External: MetaMask + Sepolia

The front-end reaches MetaMask through `frontend/src/lib/wallet.ts` (EIP-6963 discovery) and `frontend/src/hooks/useWallet.ts` (chain-switch + account/chain change subscriptions). It reaches Sepolia through two paths: writes go through MetaMask → MetaMask's RPC → Sepolia; reads go through `JsonRpcProvider` → Alchemy → Sepolia. The two paths use the *same contract* (the same address, the same ABI), so a write and a read of the same field are guaranteed to agree once the write is confirmed.

### 2.9.6 M4 (Design System) ↔ M3 (Front-end SPA)

The design system's tokens are exposed to React as CSS custom properties (`--ink`, `--oxblood`, `--parchment`, `--brass`, `--font-display`, `--font-body`, `--font-mono`), defined in the global stylesheet and consumed through `style={{ color: 'var(--ink)' }}` patterns inside React components. This indirection lets the design language be retuned in a single CSS file without touching any TypeScript.

### 2.9.7 M6 (Launchers) ↔ M2 + M3

The one-shot launchers detect Node, run `npm install` in `backend/` and `frontend/` if `node_modules` is absent, warn if `backend/.env` is missing, open two terminal windows (`start /D "<path>"` on Windows after the fix in commit `7ff8979`; `gnome-terminal` / `xterm` / equivalent on Unix), wait fifteen seconds, and then call `start http://localhost:3000` (Windows) or `xdg-open` (Unix). The launcher does *not* start the contract or interact with Sepolia — it assumes the contract is already deployed and the front-end's `deployment.json` is current.

### 2.9.8 The integration testability claim

Because each module-to-module interaction is mediated by a small and explicit contract — an ABI, a JSON file, a fetch URL, a CSS variable name — the integration testing strategy of Chapter 5 can substitute any one module for a mock without touching the others. In particular, the contract is testable against an in-process Hardhat chain (no backend, no front-end); the backend is testable against `curl` (no contract, no front-end); the front-end is testable against a fixture-rendered ABI (no Sepolia, no Pinata). This separation is what makes the project's testing strategy tractable in spite of its three-tier architecture.

---

> *Chapter summary.* This chapter has documented the system's design at every level. The block diagram lays out the three-tier architecture; six modules are described with their source-tree locations, line counts, and primary responsibilities; multi-level DFDs map the system's processes one-to-one onto its source files; the flowchart traces the issuance happy path with explicit decisions for MetaMask presence and Sepolia chain-id; the technology stack consolidates every dependency in one place; the methodology section frames the contract-first, test-driven, three-day timeline under which the work was built; the workflow section walks through the seven-lifeline issuance choreography and the deliberately-shorter three-lifeline verifier choreography; the algorithm/process-logic section reproduces verbatim the two cryptographic primitives and the EIP-6963 wallet-picker pseudocode that govern the system's correctness; and the integration section pins down the explicit contract by which the six modules combine. With the design now fully described, Chapter 3 turns to the implementation, presenting the development environment, the implementation details across all three tiers, the experimental setup, and screenshots of the working model.
