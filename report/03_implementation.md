# Chapter 3 — Implementation

> *Chapter overview.* This chapter documents how the system was actually built: the development environment in which it lives (§3.1), implementation details across the three tiers (§3.2), the experimental / application setup including build-and-run commands and the live deployment record (§3.3), and screenshots of the working model in operation (§3.4). The longer code listings extracted from the smart contract and the backend live in Appendix §9.2 — this chapter focuses on architecture and configuration, with `file:line` citations where the reader can drill in.

---

## 3.1 Development Environment

### 3.1.1 Hardware host

The project was developed primarily on a Windows 11 Home Single-Language laptop (build 26200) with the Bash shell from Git for Windows. Compilation, testing, and the local Hardhat node all run comfortably on a 4-core CPU with 8 GB RAM; the dominant memory consumers during development are the Next.js dev server and Hardhat's compiler. No platform-specific code paths exist in the source tree outside of `start.bat` (Windows) and `start.sh` (Unix), which are paired siblings of each other.

### 3.1.2 Toolchain

| Tool | Version | Role |
|---|---|---|
| Node.js | 22 LTS | Runtime for backend, front-end, and Hardhat |
| npm | bundled with Node | Package manager (one `package.json` per sub-project) |
| Git | 2.x | Version control |
| Visual Studio Code | latest | Primary editor; Solidity + ESLint extensions |
| MetaMask browser extension | ≥ 11 | User-facing wallet |
| Chrome / Edge | latest | Browser host for the front-end |
| PowerShell + Git Bash | bundled | Shell environments |

Node.js 22 LTS is mandatory: `better-sqlite3` does not currently compile against Node 24, and the constraint is hard-coded at `backend/package.json:12-14` as `"engines": { "node": ">=22.0.0 <24.0.0" }`. Attempting to run the backend under Node 24 produces a clean install-time failure rather than a confusing runtime crash.

### 3.1.3 Project layout

The project root contains four sub-projects (`contracts/`, `backend/`, `frontend/`, `design/`), two one-shot launchers (`start.bat`, `start.sh`), and three documentation files (`README.md`, `CLAUDE.md`, this report under `report/`). The annotated tree (Figure 3.1) is shown below at depth 2:

```
Ediproof/
├── README.md                       # Project overview + setup
├── CLAUDE.md                       # Architecture brief
├── start.bat                       # Windows one-shot launcher
├── start.sh                        # Unix one-shot launcher
├── wireframes.html                 # Two design variations
│
├── contracts/                      # Hardhat 2 + OpenZeppelin v5
│   ├── contracts/EdiproofCertificate.sol
│   ├── scripts/{deploy,seed}.ts
│   ├── test/EdiproofCertificate.test.ts
│   ├── deployments/sepolia.json
│   ├── hardhat.config.ts
│   └── .env.example
│
├── backend/                        # Express 4 + better-sqlite3 + Pinata
│   ├── src/{server,routes,db,pinata}.js
│   └── .env.example
│
├── frontend/                       # Next.js 14 + React 18 + Ethers v6
│   ├── src/app/{layout,page,issue/page,verify/page,my-leaves/page}.tsx
│   ├── src/components/{Masthead,WalletChip,WalletGate,ActivityStrip,Colophon}.tsx
│   ├── src/hooks/{useWallet,useContract}.ts
│   └── src/lib/{api,hash,wallet,EdiproofCertificate.abi,deployment}.{ts,json}
│
└── design/                         # Pre-implementation HTML wireframes
    ├── 01-landing.html / 02-issue.html / 03-verify.html / 04-my-certificates.html
    └── styles.css
```

Two design choices in this layout are worth highlighting. First, the front-end intentionally has *no* state-management library (no Redux, no Zustand, no React Query). All state is component-local; cross-component state lives in `useWallet` or in `useContract`. Second, the `frontend/src/lib/EdiproofCertificate.abi.json` and `frontend/src/lib/deployment.json` files are **not** authored by hand; they are auto-exported by `contracts/scripts/deploy.ts:35-51` immediately after the contract is deployed. The contract is therefore the single upstream of both the on-chain bytecode and the front-end's ABI binding — they cannot drift.

---

## 3.2 Implementation Details

The implementation is broken across three tiers. Each is described below at the level of *what the file contains* and *why it is structured that way*; full code listings appear in Appendix §9.2.

### 3.2.1 Smart Contract Tier (`contracts/`)

The contract `EdiproofCertificate.sol` (438 lines) inherits from OpenZeppelin's `ERC721Enumerable` and `Ownable`, and uses `Strings` for `uint`-to-string conversion and `Base64` for the `tokenURI` data-URI encoding. Its public surface (Table 2.3 in §2.2.1) consists of nine externally callable application functions plus the inherited ERC-721 surface. Five state-changing functions emit events; six custom errors carry diagnostic data on every revert.

The two architecturally significant primitives are `_computeHash(...)` at `:399-406` (the `keccak256(abi.encodePacked(...))` over the four certificate fields) and the `_update(...)` override at `:410-420` (the five-line soulbound enforcement). Both are reproduced in §2.8 of Chapter 2 and both are stress-tested by the unit-test suite. The `tokenURI(...)` function at `:243-290` returns a `data:application/json;base64,...` URI whose `image` field is itself a `data:image/svg+xml;base64,...` URI synthesised by `_buildSVG` at `:292-327` from contract storage on every read; user-supplied fields flow through `_escapeJSON` (`:343-365`) and `_escapeXML` (`:367-393`) before being inlined.

The Hardhat configuration (`contracts/hardhat.config.ts`, 52 lines) pins three blocks: the Solidity 0.8.28 compiler with `cancun` EVM target, `viaIR: true`, and `optimizer.runs: 200` (`:12-19`); the `sepolia` network conditional on `ALCHEMY_SEPOLIA_RPC` being set, with `chainId: 11155111` (`:20-29`); and the Etherscan v2 customChains override that routes `hardhat verify --network sepolia` to the v2 API endpoint (`:30-42`).

The unit-test file (`test/EdiproofCertificate.test.ts`, 504 lines) holds twenty test cases across nine `describe` blocks plus two helper functions (`anyBytes32()`, `decodeJsonDataURI()`). The fixture pattern at `:6-24` deploys a fresh contract, pre-approves a single institution wallet, and bundles five named signers and one sample certificate object — `loadFixture` snapshots the state after the first invocation and rewinds for every subsequent test.

### 3.2.2 Backend Tier (`backend/`)

The backend is 220 lines of plain JavaScript across four files. The Express application is bootstrapped in five lines at `backend/src/server.js:7-12` (`express()`, port from `process.env.PORT` defaulting to 8787, CORS, JSON body parser capped at 1 MB, mount `/api` router); a discovery route at `:14-26` returns a self-describing JSON listing the six endpoints; a global error handler at `:28-31` catches uncaught route errors and returns `500 { error: <message> }`.

`backend/src/routes.js` (78 lines) exposes the six routes summarised in Table 3.1.

| Method | Path | File:line | Purpose |
|---|---|---|---|
| GET | `/api/health` | `:13-15` | `{ ok: true, service: "ediproof-backend" }` |
| POST | `/api/upload` | `:21-36` | Multipart → Pinata, returns `{ cid, ipfsURI, gatewayURL }` |
| POST | `/api/log` | `:43-56` | Insert a row into `events` |
| GET | `/api/stats` | `:58-67` | Aggregate counts by kind + distinct institution count |
| GET | `/api/activity` | `:69-72` | Last `limit` events (clamped to 100) |
| GET | `/api/institution/:address` | `:74-77` | Per-institution issuance count + last-active timestamp |

Multer is configured at `:6-9` with in-memory storage and a 15 MB per-file limit. The most complex route is `POST /api/upload`, which (a) validates a `file` field is present, (b) calls `uploadToPinata(buffer, originalname, mimetype)`, (c) returns the three-field result on success or surfaces the Pinata-side error message verbatim on failure (the surfacing was added in commit `76a851d`).

`backend/src/db.js` (62 lines) opens the SQLite database with `new Database(DB_PATH)` (line 9), enables WAL mode at line 11, creates the `events` table and three secondary indexes idempotently at `:13-26`, and exposes four prepared statements (`insertEvent`, `selectStats`, `selectActivity`, `selectByInstitution`) at `:28-59`. The prepared statements are the *only* data-access path in the codebase, defending against SQL injection by construction.

`backend/src/pinata.js` (44 lines) exports one function — `uploadToPinata(buffer, filename, mimetype)` — that reads `process.env.PINATA_JWT` at line 9 (and throws if missing), constructs a multipart `FormData` with `file` / `network: "public"` / `name` fields at `:14-18`, posts to `https://uploads.pinata.cloud/v3/files` with a `Bearer` Authorization header at `:20-24`, validates the response at `:26-35`, and returns `{ cid, ipfsURI, gatewayURL }` at `:37-42`. There is no caching, no retry, no Pinata SDK dependency.

### 3.2.3 Front-end Tier (`frontend/`)

The front-end is a Next.js 14.2.29 application using the App Router. Table 3.2 inventories its source files.

| Group | File | Purpose |
|---|---|---|
| Page | `src/app/page.tsx` | Landing |
| Page | `src/app/issue/page.tsx` | Institution: issue / reissue / revoke (wallet-gated) |
| Page | `src/app/verify/page.tsx` | Public verifier (no wallet required) |
| Page | `src/app/my-leaves/page.tsx` | Student portfolio (wallet-gated) |
| Component | `src/components/Masthead.tsx` | Newspaper-style header |
| Component | `src/components/WalletGate.tsx` | Page-level connection prompt + Sepolia switch |
| Component | `src/components/{WalletChip,ActivityStrip,Colophon}.tsx` | Header chip, recent-events ticker, footer |
| Hook | `src/hooks/useWallet.ts` (124 lines) | EIP-6963 discovery + Sepolia chain-switch |
| Hook | `src/hooks/useContract.ts` (38 lines) | Read-only `JsonRpcProvider` + signed `BrowserProvider` |
| Lib | `src/lib/api.ts` | Backend HTTP client (5 functions) |
| Lib | `src/lib/hash.ts` | `solidityPackedKeccak256` + display helpers |
| Lib | `src/lib/wallet.ts` | EIP-6963 provider listener + getMetaMaskProvider |
| Auto | `src/lib/EdiproofCertificate.abi.json`, `deployment.json` | Exported by `deploy.ts` |

The wallet integration is the most subtle piece. `lib/wallet.ts` implements the EIP-6963 multi-injected-provider-discovery handshake: on script load it adds a `eip6963:announceProvider` listener that pushes each announcement onto an `announced` array, then dispatches `eip6963:requestProvider` to invite all installed wallets to announce themselves. The `getMetaMaskProvider()` function (`:46-64`) selects the announcement whose `info.rdns === 'io.metamask'`, falling back to the legacy `window.ethereum.providers[]` array if no EIP-6963 announcements arrived, and finally to a strict `window.ethereum.isMetaMask` check. This three-step fallback ensures the picker works against MetaMask installations of every vintage and was the fix introduced in commit `8fe44f9`.

`useWallet` (`hooks/useWallet.ts:41-124`) returns `{ address, chainId, isConnecting, error, connect }`. On mount (lines 85-121) it subscribes to MetaMask's `accountsChanged` and `chainChanged` events. The `connect()` callback (lines 47-83) sequences (i) pick the MetaMask provider via `getMetaMaskProvider()`, (ii) request `eth_requestAccounts`, (iii) read the current `eth_chainId`, (iv) if not Sepolia, call `switchToSepolia(provider)` (helper at lines 16-39) which sends `wallet_switchEthereumChain` and falls back to `wallet_addEthereumChain` if Sepolia is unknown to the wallet (error code `4902`).

`useContract` (`hooks/useContract.ts`) exposes two paths. The hook (lines 16-23) returns a memoised read-only contract via `ethers.JsonRpcProvider(ALCHEMY_URL)` — the wallet-less verifier path. The exported `getSignedContract()` function (lines 30-38) returns a contract bound to the MetaMask `BrowserProvider`'s signer — used by the issuance and student pages for write operations. The contract address is loaded from `deployment.json` (line 5) and the ABI from `EdiproofCertificate.abi.json` (line 6); updating the contract requires only re-running `npm run deploy:sepolia` from `contracts/`.

The off-chain hash preview at `lib/hash.ts:7-17` (`computeCertHash(name, course, institution, ipfsURI)`) wraps `ethers.solidityPackedKeccak256(['string','string','string','string'], [...])` to reproduce the on-chain hash exactly, in the browser, with no contract round-trip. The institution sees the live hash update as they type — a useful debugging aid.

---

## 3.3 Experimental Setup / Application Setup

This section records the runtime configuration and the build / run / test commands needed to reproduce the system from a clean clone.

### 3.3.1 Environment files

Two `.env.example` files document the operator-facing configuration.

**`contracts/.env.example`** — three variables:

```
ALCHEMY_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_KEY
```

**`backend/.env.example`** — four variables (only `PINATA_JWT` is mandatory):

```
PORT=8787
DB_PATH=./ediproof.db
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PINATA_GATEWAY=https://gateway.pinata.cloud
```

Both `.env.example` files are copied to `.env` and filled with real values before any deploy or start command is run. `.env` is gitignored.

### 3.3.2 Build, run, and test commands

Table 3.3 lists every npm script available across the three sub-projects.

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

### 3.3.3 Deployment script behaviour

`contracts/scripts/deploy.ts` (63 lines) runs end-to-end in approximately twenty seconds from a clean state, divided into five steps. (1) Identify the deployer and log balance (lines 5-10). (2) Deploy the contract with `Factory.deploy(deployer.address)` (lines 12-14). (3) Persist the deployment metadata to `contracts/deployments/{network.name}.json` (lines 21-33). (4) Export the ABI to `frontend/src/lib/EdiproofCertificate.abi.json` and the address to `frontend/src/lib/deployment.json` (lines 35-51), wrapped in a `try`/`catch` so the script continues if the front-end directory does not yet exist. (5) Print next-step instructions (lines 53-56) — the exact `hardhat verify` command and a pointer to the seed script.

### 3.3.4 Seed script behaviour

`contracts/scripts/seed.ts` (78 lines) runs after `deploy.ts` and serves two purposes. First, it approves the deployer wallet as the demonstration institution (lines 24-32). Second, it issues three sample certificates to populate the front-end with visible data:

| # | Student | Course | Institution | IPFS URI |
|---|---|---|---|---|
| 1 | Aarav Sharma | B.Tech Computer Science | MIT | `ipfs://bafybeigdyrztseedcert1aarav` |
| 2 | Priya Patel | M.Sc Data Science | Stanford University | `ipfs://bafybeigdyrztseedcert2priya` |
| 3 | Rahul Verma | B.E. Electronics Engineering | IIT Delhi | `ipfs://bafybeigdyrztseedcert3rahul` |

Source: `seed.ts:36-55`. The student wallet for all three is the deployer itself (line 35) — *"for demo, issue to self"* — which is convenient for a demonstration where the same operator needs to inspect each certificate from a single wallet. In a real deployment the institution would pass the actual student's wallet address.

### 3.3.5 Live deployment artefact

The contract is deployed to Sepolia at the address recorded in `contracts/deployments/sepolia.json` (Table 3.4):

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

## 3.4 Screenshots / Working Model

This section presents screenshots of the four main UI surfaces in the system. Caption placeholders are included so the figures can be inserted in their final positions during PDF rendering. The figures themselves are reproduced at higher resolution in Appendix §9.3.

### 3.4.1 Landing page (Figure 3.2)

The landing page renders the project's archival masthead — *EDIPROOF*, set in italic small caps with a parchment background, an oxblood-red rule, and the tagline *"the ledger of verified learning, impressed in ink that cannot be unwritten."* Three navigation cards below the masthead point at the three role-specific pages: *Issue a certificate*, *Verify a certificate*, *My certificates*. The activity strip at the foot of the page lists the most recent on-chain events read from `GET /api/activity`.

> **[Figure 3.2 — Landing page screenshot — to be inserted]**

### 3.4.2 Issue page (Figure 3.3)

The `/issue` page is the institution-side surface. It is gated by `WalletGate`: if MetaMask is not installed, the page shows an *"Install MetaMask"* prompt; if MetaMask is installed but the wallet is on a non-Sepolia chain, a *"Switch to Sepolia"* button is rendered. Once gated, the page exposes a three-mode form (issue / reissue / revoke) with a file-upload widget, a live keccak256 hash preview that updates as the user types, and a transaction-status banner with the resulting `txHash` and Etherscan link.

> **[Figure 3.3 — Issue page screenshot — to be inserted]**

### 3.4.3 Verify page (Figure 3.4)

The `/verify` page is the project's headline surface — the wallet-less verifier. It does *not* render `WalletGate` and never prompts for MetaMask. Three tabs at the top let the verifier search by *Details* (the four certificate fields), by *Token ID*, or by *Wallet address*. A `GLOSSARY` constant at `verify/page.tsx:31-56` provides plain-English explanations of *Soulbound Token*, *IPFS*, *keccak256*, *Sepolia*, *Revocation*, and *Reissue* for non-technical verifiers. The result card is one of four colours: green VALID, red NOT FOUND / TAMPERED, orange REVOKED, or orange REVOKED — REPLACED BY TOKEN N.

> **[Figure 3.4 — Verify page screenshot — to be inserted]**

### 3.4.4 My-leaves page (Figure 3.5)

The `/my-leaves` page is the student's permanent portfolio. It is wallet-gated. Once connected, it lists every certificate the student's wallet owns by querying `getCertificatesByOwner(...)` and rendering a card per token with the course name, institution, status badge, and a thumbnail of the on-chain SVG. A status-filter row at the top lets the student show *all* / *active* / *revoked* / *reissued* certificates.

> **[Figure 3.5 — My-leaves page screenshot — to be inserted]**

---

> *Chapter summary.* The implementation is organised across four sub-projects (`contracts/`, `backend/`, `frontend/`, `design/`) totalling approximately 1500 lines of Solidity, JavaScript, and TypeScript. The smart contract is the canonical record (438 lines, twenty unit tests) and the only component whose state survives a redeploy. The backend is intentionally minimal (220 lines, four files) and not on the critical path for verification. The front-end is a four-page Next.js application with two custom hooks composing the wallet integration. The development environment is Windows 11 + Node 22 LTS + MetaMask + Chrome; the live deployment record is publicly inspectable at the Etherscan URL quoted above. Chapter 4 now turns to the results obtained from the live deployment and characterises the system's performance against four benchmarks.
