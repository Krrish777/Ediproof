# Chapter 2 — Design

> *Chapter overview.* This chapter accompanies the project's diagrammatic design. The author has prepared the figures themselves separately; this chapter provides the explanatory prose that any reader of the figures will need in order to follow them. Six classes of diagram are described — the high-level **block diagram**, the **entity-relationship diagram (ERD)** spanning the on-chain `Certificate` struct and the off-chain `events` SQLite table, the multi-level **data-flow diagrams (DFD)**, the **use-case diagram** that captures the four actors and their interactions, the **activity diagram** of the issuance happy path, and two principal **sequence diagrams** (one for issuance, one for the wallet-less verification path). Where a constant or an algorithmic detail is referenced, the corresponding source-file location is given so that the reader can cross-check the design against the implementation.

---

## 2.1 Block Diagram

**Figure 2.1** is the highest-level view of the system. It depicts three vertical tiers, left to right: the **Browser Tier**, the **Backend Tier**, and the **Blockchain & Storage Tier**.

The **Browser Tier** is the user-facing surface. It contains the Next.js 14 front-end (`frontend/`), the MetaMask browser extension, and the user's keyboard. The front-end renders four pages — landing (`/`), institution issuance (`/issue`), public verifier (`/verify`), and student portfolio (`/my-leaves`). Two of the four are wallet-gated through the `WalletGate` component (`frontend/src/components/WalletGate.tsx`), which prompts the user to install MetaMask and switch to the Sepolia chain (chainId `11155111`, hex `0xaa36a7`, switching logic at `frontend/src/hooks/useWallet.ts:16-39`). One of the four — the verifier — is *deliberately* not wallet-gated; it loads, runs, and serves verification results to anyone, with no MetaMask dependency.

The **Backend Tier** is a single Express 4 process listening on `http://localhost:8787` (`backend/src/server.js:7, :33-35`). It exposes six routes (Table 3.5 in Chapter 3 enumerates them with line numbers). It maintains a single SQLite database file (`ediproof.db`, WAL mode at `backend/src/db.js:11`) holding one table (`events`, schema at `:14-22`). Its only outbound network calls are to the Pinata V3 endpoint at `https://uploads.pinata.cloud/v3/files` (`backend/src/pinata.js:1`).

The **Blockchain & Storage Tier** holds the system's two external services. The first is the **Ethereum Sepolia testnet**, accessed both by the front-end (read-only `JsonRpcProvider` against an Alchemy RPC at `frontend/src/hooks/useContract.ts:9`) and by the institution wallet (write `BrowserProvider` through MetaMask). The deployed contract `EdiproofCertificate` lives at address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` (recorded in `contracts/deployments/sepolia.json:3`). The second is **Pinata IPFS**, which holds the actual certificate files (typically PDFs) at content-addressed `ipfs://<cid>` URIs. The contract stores the `ipfsURI` string, *not* the file contents: the file lives on IPFS and is retrievable through any IPFS gateway (Pinata, Cloudflare, or a self-hosted node).

Three classes of arrow appear in Figure 2.1:

- *Solid* arrows represent the synchronous request path of a single user action. The institution-issuance arrow runs **Browser → Backend → Pinata → Browser → MetaMask → Sepolia → Browser**, terminating with a transaction-status banner.
- *Dashed* arrows represent the wallet-less verification path. The verifier arrow runs **Browser → Sepolia (read-only RPC) → Browser**, with no backend hop and no wallet involvement.
- *Dotted* arrows represent the optional analytics side-channel. After every successful state-changing transaction, the front-end fires a `POST /api/log` against the backend to append a row to the `events` table; this is best-effort and the chain remains the source of truth.

This three-tier separation is deliberate. A blocked Pinata endpoint manifests in the backend tier, breaking new uploads but leaving verification intact. A blocked Alchemy endpoint manifests in the storage tier, breaking the read paths but leaving the contract itself unchanged on Sepolia. A backend crash manifests in the backend tier and is recoverable by restarting the Node process; the on-chain state is unaffected. This is what is meant by *the blockchain is the source of truth* in `README.md:89`.

---

## 2.2 Entity-Relationship Diagram

**Figure 2.2** captures the persistent data model of the system. Ediproof has *two* persistent stores by deliberate architectural choice — the on-chain contract storage (the canonical record) and the off-chain SQLite store (best-effort analytics). The ERD therefore spans both. It is reproduced below in two parts.

### 2.2.1 On-chain entities (`contracts/contracts/EdiproofCertificate.sol`)

The contract holds four pieces of persistent state:

- the `Certificate` struct (one per minted token), declared at lines 16-26 with nine fields,
- the `certificates` mapping from `tokenId` to `Certificate` at line 28,
- the `hashToTokenId` mapping at line 29 — the inverse index that makes hash-based verification a single SLOAD,
- the `approvedInstitutions` mapping at line 30 — the institution whitelist,
- the `replacedBy` mapping at line 31 — the lineage pointer for reissuance.

The `Certificate` struct's nine fields are reproduced in Table 3.1 of Chapter 3. Of particular ERD interest are `certHash` (the bytes32 keccak256 anchor), `reissuedFrom` (zero for original certificates, non-zero for reissues), and `issuer` (the EOA that minted; checked by `revokeCertificate` and `reissueCertificate` at `:119` and `:136`).

### 2.2.2 Off-chain entity (`backend/src/db.js:14-22`)

The off-chain store is a single SQLite table:

```sql
CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT NOT NULL,
    token_id     INTEGER,
    tx_hash      TEXT,
    actor        TEXT,
    institution  TEXT,
    created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_institution ON events(institution);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
```

This is a flat, denormalised event log. One row per state-changing transaction. The `kind` column is one of `issued`, `revoked`, `reissued`, `verified`, aligned across backend and front-end after commit `ec9c904`. Three secondary indexes accelerate the four canonical retrieval paths used by the four prepared statements at `backend/src/db.js:28-59` (`insertEvent`, `selectStats`, `selectActivity`, `selectByInstitution`).

### 2.2.3 Cardinality and Relationships

The relationship between the on-chain `Certificate` and the off-chain `events` row is **one-to-many**: one issued certificate produces a chain of zero or more events (`issued` → optionally `revoked` → optionally `reissued` → arbitrarily many `verified` from public verifier visits). The link is loose — `events.token_id` is a plain `INTEGER` with no foreign-key constraint, because the foreign key would be impossible to enforce against a separate trust domain (the chain). Instead, the contract's own state is the authoritative record, and the events table is *advisory*.

The `replacedBy` mapping (on-chain) is the link that ties old and new certificates together. After a `reissueCertificate(oldId, ...)` call at `EdiproofCertificate.sol:126-176`, the relationship is materialised as: `replacedBy[oldId] = newId` (line 165), and on the new certificate `reissuedFrom = oldId` (line 161). A verifier presenting an out-of-date hash can therefore traverse this pointer and be told *"revoked, replaced by N"* in a single contract call — the assertion locked in by `test/EdiproofCertificate.test.ts:316-350`.

The conceptual model also contains two **virtual entities** that do not have their own table: `Institution` (any EOA in `approvedInstitutions`) and `Student` (any EOA that owns a certificate token). Both are first-class in the system but are stored only as `address` keys; their identity outside the chain is the responsibility of the institution's off-chain identity store (which is out of scope for Ediproof itself).

---

## 2.3 Data Flow Diagrams

The DFDs are presented at two levels of detail: a Level-0 *context diagram* (Figure 2.3) and two Level-1 *decompositions* — one for the issuance pipeline (Figure 2.4) and one for the wallet-less verifier (Figure 2.5).

### 2.3.1 Level-0 Context

The Level-0 diagram treats the entire **Ediproof** DApp as a single circular process, sitting between four external entities: the **Institution** (the human user who signs issuance transactions from MetaMask), the **Student** (the human user who owns the certificate token), the **Verifier** (the human user — typically a recruiter — who submits a claim for verification *without* holding a wallet), and the **Pinata IPFS service** (the file pinning provider). Six data flows cross the system boundary.

- *Certificate file*, *student wallet address*, *student name*, *course name*, *institution name* flow inward from the Institution.
- *IPFS URI* flows inward from Pinata in response to the multipart upload.
- *Transaction signature* flows inward from the Institution (via MetaMask) and *Receipt + tokenId + tx-hash* flows back outward.
- *Verification claim (4 fields)* flows inward from the Verifier and *valid / invalid / revoked / replaced-by-N* flows outward.
- *Soulbound certificate token* is conceptually owned by the Student and surfaces in the Student's wallet UI — but is not part of the data-flow boundary because it lives on chain.
- A separate *Activity log* output is written to `backend/ediproof.db` and is the artefact the institution dashboard reads.

This level is sufficient to communicate the system to a non-technical stakeholder. It deliberately hides the three-tier architecture inside.

### 2.3.2 Level-1 Decomposition — Issuance

Inside the issuance process, Figure 2.4 expands the single circle into eight numbered processes and one persistent store:

- **1.0 Render `/issue` page** — the front-end's `IssuePage` component (`frontend/src/app/issue/page.tsx`) is loaded; the WalletGate prompts MetaMask connection and Sepolia chain-switch.
- **2.0 Upload certificate file** — the institution attaches a PDF; the file is sent as `multipart/form-data` to `POST /api/upload` at the backend.
- **3.0 Pinata multipart upload** — the backend's `uploadToPinata(...)` helper at `backend/src/pinata.js:8-43` constructs a `FormData`, sets the Bearer token from `process.env.PINATA_JWT`, posts to `https://uploads.pinata.cloud/v3/files`, and returns `{ cid, ipfsURI, gatewayURL }`.
- **4.0 Live hash preview** — the front-end calls `computeCertHash(name, course, institution, ipfsURI)` (`frontend/src/lib/hash.ts:7-17`) to give the institution an immediate visual confirmation of the same hash that the contract will compute.
- **5.0 Build issuance transaction** — `getSignedContract()` at `frontend/src/hooks/useContract.ts:30-38` constructs a `BrowserProvider`-backed Contract instance against the EIP-6963-discovered MetaMask provider; the front-end calls `contract.issueCertificate(...)`, which prompts MetaMask.
- **6.0 Sepolia mint** — the contract executes `issueCertificate(...)` at `EdiproofCertificate.sol:85-114`, which recomputes the hash, checks for duplicates against `hashToTokenId`, persists the `Certificate` struct, mints to the student via `_safeMint`, and emits `CertificateIssued`.
- **7.0 Receive receipt** — the front-end awaits `tx.wait()`, extracts the new `tokenId` from the `CertificateIssued` event log, and displays a success banner with a link to Etherscan.
- **8.0 Log event** — the front-end fires `POST /api/log` with `{ kind: "issued", tokenId, txHash, actor, institution }` (`frontend/src/lib/api.ts:31-43`); the backend writes a row into the `events` table via the `insertEvent` prepared statement at `backend/src/db.js:28-31`.

The two persistent stores written during the flow are the **on-chain contract storage** (D1) and the **off-chain `events` SQLite table** (D2). The Pinata data store (D3) is conceptually external; the IPFS CID returned at step 3.0 lives on Pinata's infrastructure.

### 2.3.3 Level-1 Decomposition — Verifier

The verifier's DFD (Figure 2.5) is intentionally short — the absence of a backend hop is the *point* of the design.

- **9.0 Render `/verify` page** — the page loads with no wallet check (`frontend/src/app/verify/page.tsx`).
- **10.0 Submit claim** — the verifier enters the four fields (or a token id, or a wallet address; three tabs at `verify/page.tsx:8`) and clicks Verify.
- **11.0 Read-only RPC call** — the front-end uses `useContract().readContract.verifyCertificate(...)` (`frontend/src/hooks/useContract.ts:17-20`), constructed from `ethers.JsonRpcProvider` against the Alchemy Sepolia URL. **No wallet, no signature, no gas.**
- **12.0 Contract evaluation** — the contract executes `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208`, recomputes the hash, looks it up in `hashToTokenId`, returns the tuple `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)`.
- **13.0 Render result** — the front-end displays one of four outcomes: *valid*, *invalid*, *revoked*, or *revoked & replaced by N*.
- **14.0 (optional) Log verified** — the front-end fires `POST /api/log` with `kind: "verified"` so the institution dashboard can count verifications.

The **D1** on-chain store is *read* but never written by the verifier; **D2** is appended to optionally; **D3** Pinata is not touched at all.

The Level-1 diagrams are explicitly *isomorphic* to the implementation: each numbered process corresponds to a single function or component in the source tree. This isomorphism is what lets the testing chapter (Chapter 4) write one targeted assertion per process and claim end-to-end DFD coverage.

---

## 2.4 Use Case Diagram

**Figure 2.6** captures four primary actors and nine use cases arranged around a single system boundary. The actors are:

- **Owner** (primary, human) — the EOA that deployed the contract and holds the `Ownable` role; can add or remove institutions; in the demonstration deployment, the owner is the deployer wallet `0xe3F2…F94c6d` recorded in `deployments/sepolia.json:4`.
- **Institution** (primary, human) — any EOA that the owner has approved through `addInstitution(...)`. Can issue, revoke (only its own certificates), and reissue (only its own certificates).
- **Student** (primary, human) — the EOA that owns a certificate token. Read-only with respect to the contract, but is the *subject* of every issuance.
- **Verifier** (secondary, human) — any third party with a browser. **Holds no wallet.** Submits verification claims through the public `/verify` page.

Nine use cases sit inside the system boundary:

1. **Add Institution** — Owner. `EdiproofCertificate.sol:71-74`. Emits `InstitutionAdded`.
2. **Remove Institution** — Owner. `:76-79`. Emits `InstitutionRemoved`.
3. **Upload Certificate File** — Institution. Includes the multipart upload to backend → Pinata → `ipfs://<cid>`. `frontend/src/app/issue/page.tsx` + `backend/src/routes.js:21-36` + `backend/src/pinata.js:8-43`.
4. **Issue Certificate** — Institution. Includes the use case "Upload Certificate File" through an `<<include>>` relationship. `EdiproofCertificate.sol:85-114`. Emits `CertificateIssued`.
5. **Revoke Certificate** — Institution (must be the original issuer) or Owner. `:116-124`. Emits `CertificateRevoked`.
6. **Reissue Certificate** — Institution (must be the original issuer) or Owner. *Extends* "Revoke Certificate" — the reissue path implicitly revokes the old certificate before minting the new one. `:126-176`. Emits both `CertificateRevoked` (for the old) and `CertificateIssued` + `CertificateReissued` (for the new).
7. **View Own Certificates** — Student. `EdiproofCertificate.sol:219-229` (`getCertificatesByOwner`). The corresponding UI is `frontend/src/app/my-leaves/page.tsx`.
8. **Verify by Details / Token / Wallet** — Verifier. `EdiproofCertificate.sol:182-208` (by details), `getCertificate(tokenId)` (by token), `getCertificatesByOwner(address)` (by wallet). The corresponding UI is the three-tab `/verify` page.
9. **View Stats / Activity** — any authenticated browser user. Reads `GET /api/stats` and `GET /api/activity?limit=N` from the backend (`backend/src/routes.js:58-72`).

The diagram includes one `<<include>>` relationship (use case 4 includes use case 3, because every issuance must first put the file on IPFS) and two `<<extend>>` relationships (use case 6 extends use case 5; use case 8 extends a notional internal "Compute Hash" use case).

The Verifier actor is shown on the system boundary because it is part of the most-frequent interaction, but it does *not* cross the wallet boundary — there is no MetaMask handshake on the verifier side. This deliberate asymmetry is the project's headline architectural feature.

---

## 2.5 Activity Diagram

**Figure 2.7** is an activity diagram of the issuance happy path. It mirrors the Level-1 issuance DFD but emphasises *control flow* rather than *data flow*: the diagram contains the standard solid black initial node, the rounded-corner activity boxes, the diamond decision nodes, the join bar, and the bullseye final node.

The control flow is linear from the initial node up to *Open `/issue` page*. After that activity, the first decision diamond inspects whether MetaMask is detected. On the *no* branch, control passes to *Show "Install MetaMask" prompt* (rendered by `WalletGate`), which is a final state. On the *yes* branch, control passes to a second decision: *Is the connected chain Sepolia?* On the *no* branch, control passes to *Switch to Sepolia* (handled by `switchToSepolia(provider)` at `frontend/src/hooks/useWallet.ts:16-39`), which itself contains a nested decision *Is Sepolia known to this wallet?* — if not, the function falls back to `wallet_addEthereumChain` to register Sepolia (`:24-34`) before returning to the main flow.

Once the wallet is connected and on Sepolia, control proceeds linearly through *Fill issuance form*, *Upload certificate file* (which contains the inner Pinata round-trip), *Compute live hash preview* (purely client-side via `computeCertHash`), and *Submit `issueCertificate(...)` transaction*. A third decision diamond at *MetaMask user accepts?* either routes to *Cancel and surface error* (final state) or to *Wait for confirmation*. The wait activity contains an internal loop (poll `tx.wait()`); on receipt, control proceeds to *Extract `tokenId` from event log*, *Log event to backend*, and finally *Show success banner with Etherscan link* — a bullseye final node.

A second activity diagram (not separately numbered) covers the verifier: it has only three boxes — *Open `/verify` page*, *Submit claim*, *Display verdict* — and *no* decision diamond related to wallet state, because the verifier path never opens a wallet. The two diagrams placed side by side make the asymmetry of the system visible at a glance.

The diagram also shows two side-effect arrows. The first records a write to the **on-chain contract storage** whenever activity *Submit `issueCertificate(...)` transaction* completes successfully; the second records a write to the **`events` SQLite table** whenever activity *Log event to backend* completes successfully. These side effects are intentional: they decouple the canonical on-chain record from the best-effort off-chain dashboard, so that even if the backend crashes, the on-chain state survives.

---

## 2.6 Sequence Diagrams

Two sequence diagrams accompany the report. The first shows the issuance end-to-end; the second shows the wallet-less verification path, which is the most architecturally distinctive control-flow construct in the project.

### 2.6.1 Issuance — End-to-End Sequence (Figure 2.8)

The diagram shows seven lifelines arranged left to right: **Institution (human)**, **Browser (Next.js)**, **MetaMask**, **Express Backend**, **Pinata V3**, **Sepolia (EVM)**, and **SQLite (events)**. The sequence begins with the Institution opening the `/issue` page in the browser and clicking *Connect Wallet*. The browser's `useWallet` hook fires an EIP-6963 `eip6963:requestProvider` event (`frontend/src/lib/wallet.ts:39`), receives announcements from each installed wallet on the `eip6963:announceProvider` event (`:33-38`), and selects the provider whose `info.rdns === 'io.metamask'` (`:50`). MetaMask's pop-up appears; the user approves; the browser's `useWallet` then calls `wallet_switchEthereumChain` for Sepolia (`hooks/useWallet.ts:18-21`).

The sequence then continues with the upload-and-issue flow:

1. The Institution selects a certificate file and clicks Upload. The browser sends `POST /api/upload` (`multipart/form-data; boundary=…`) to the Express backend.
2. The backend's `upload.single("file")` middleware (multer with 15 MB cap, `routes.js:6-9`) buffers the file into memory.
3. The backend's `uploadToPinata(...)` helper builds a new `FormData`, attaches the file as a Blob with the original filename and MIME type (`pinata.js:14-18`), and sends `POST https://uploads.pinata.cloud/v3/files` with the Bearer JWT in the `Authorization` header (`:20-24`).
4. Pinata responds with `{ data: { cid: "Qm…" } }`. The backend extracts the CID, constructs `ipfsURI = "ipfs://" + cid` and `gatewayURL = "<gateway>/ipfs/" + cid` (`pinata.js:37-42`), and returns the three-field object to the browser.
5. The browser fills the IPFS URI into the form, computes the live keccak256 hash preview off-chain (`hash.ts:13-17`), and waits for the user to click *Issue*.
6. On click, the browser obtains a signed contract via `getSignedContract()` (`hooks/useContract.ts:30-38`), which constructs an `ethers.BrowserProvider` against the MetaMask provider. The browser calls `contract.issueCertificate(student, name, course, institution, ipfsURI)`. MetaMask pops up.
7. The user signs. MetaMask submits the transaction to the Sepolia network via its own RPC. The browser receives a `tx` object and calls `tx.wait()`.
8. Sepolia's miners (technically validators — Sepolia has been PoS since October 2023) include the transaction in a block. The contract executes `issueCertificate(...)` at `EdiproofCertificate.sol:85-114`: it computes the hash, checks for duplicates, persists the struct, mints to the student, and emits `CertificateIssued(tokenId, student, certHash, institution)`.
9. `tx.wait()` returns a receipt. The browser parses the receipt's logs to extract the new `tokenId`.
10. The browser fires `POST /api/log` with `{ kind: "issued", tokenId, txHash, actor: institution-address, institution: institution-name }`. The backend's `insertEvent.run({...})` (`db.js:28-31`) appends a row to the `events` table.
11. The browser displays a success banner with a link to `https://sepolia.etherscan.io/tx/<txHash>`.

The diagram uses self-arrows on the Browser lifeline to show client-side state transitions and uses dashed return arrows on every cross-tier message to indicate asynchrony.

### 2.6.2 Verifier — Wallet-less Sequence (Figure 2.9)

The verifier diagram is shorter. Three lifelines: **Verifier (human)**, **Browser (Next.js)**, **Sepolia (EVM)**. There is no MetaMask, no backend, no Pinata.

The sequence begins with the Verifier opening `/verify`. The browser loads the page (`frontend/src/app/verify/page.tsx`) and calls `useContract()`, whose `readContract` member is a fresh `ethers.Contract(CONTRACT_ADDRESS, abi, new ethers.JsonRpcProvider(ALCHEMY_URL))` (`hooks/useContract.ts:16-23`). The Verifier types the four fields into the *Details* tab and clicks Verify. The browser calls `readContract.verifyCertificate(name, course, institution, ipfsURI)`.

Ethers serialises the call as `eth_call` and posts it to the Alchemy RPC over HTTPS. Alchemy routes it to a Sepolia archive node, which executes `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208` against state at the latest block. The function:

1. Recomputes `certHash = keccak256(abi.encodePacked(...))` (`:198`, delegating to `_computeHash` at `:399-406`).
2. Looks up `tokenId = hashToTokenId[certHash]` (`:199`).
3. If `tokenId == 0`, returns `(false, 0, address(0), false, 0)` — *invalid* (`:200-202`).
4. Otherwise, reads the certificate's `revoked` flag (`:205`) and `replacedBy[tokenId]` (`:206`), and returns `(valid = !revoked, tokenId, ownerAddr, revoked, replacedByTokenId)`.

The result tuple is encoded by ethers and returned to the browser. The browser renders one of four outcomes:

- `valid && !revoked` → green *VALID* card with the student's truncated wallet (via `truncateAddress(...)` at `frontend/src/lib/hash.ts:41-44`) and the `tokenId`;
- `!valid && tokenId == 0` → red *NOT FOUND / TAMPERED* card;
- `revoked && replacedByTokenId == 0` → orange *REVOKED* card;
- `revoked && replacedByTokenId != 0` → orange *REVOKED — replaced by token N* card.

A combined fragment of type `opt [user opted in to analytics]` then optionally fires `POST /api/log` with `kind: "verified"` for the institution dashboard. This is the *only* place in the verifier flow where the backend is touched, and even then the request is fire-and-forget; if the backend is offline, the verification result is unaffected.

The asymmetry between Figures 2.8 and 2.9 — issuance touches seven lifelines, verification touches three — is what makes Ediproof operationally appropriate for the credential-verification use case. A bona fide employer with no crypto experience can verify any certificate in two clicks, while the institution and student paths retain the full guarantees of a write-capable wallet flow.

---

> *Chapter summary.* Six classes of design diagram have been described in detail. The block diagram lays out the three-tier architecture; the ERD documents the on-chain `Certificate` struct + four mappings together with the off-chain `events` SQLite table; the multi-level DFDs map the system's processes one-to-one onto its source files; the use-case diagram identifies four actors and nine use cases; the activity diagram traces the issuance happy path with explicit decisions for MetaMask presence and Sepolia chain-id; and the two sequence diagrams expose the seven-lifeline issuance choreography and the deliberately-shorter three-lifeline verifier choreography. With the design now fully described, Chapter 3 turns to the implementation, presenting the project layout, the smart contract, the backend, the front-end, and the deployment artefacts in code-level detail.
