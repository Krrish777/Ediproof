# Chapter 5 — Testing

> *Chapter overview.* This chapter documents the layered testing strategy applied to the **Ediproof** DApp. Section 5.1 lists the testing objectives that the strategy is designed to meet. Section 5.2 frames the test pyramid the project follows and enumerates the four classes of test that sit on it. Section 5.3 catalogues the twenty unit-test cases organised across nine `describe` blocks in the contract test file plus the fifteen-step manual demonstration that constitutes system testing. Section 5.4 reports the test-execution results from a clean run. Section 5.5 closes with the project's error-handling and debugging strategy.

---

## 5.1 Testing Objectives

The testing strategy was constructed to satisfy six distinct objectives, listed below in the order in which they were prioritised during development.

1. **Pin down the contract's invariants.** The contract is the only component whose state survives a redeploy. A bug in the contract is, in production, permanent. The first objective of the test suite is to lock in every architectural invariant — soulbound enforcement, hash sensitivity, duplicate prevention, the burn-and-remint reissue, the metadata escape — so that a future change cannot break any of them silently.
2. **Make the test suite fast enough to run on every save.** The unit-test suite executes in ~8.7 s on a development laptop, which is fast enough for the developer to keep a `npm test` window open during contract editing and to retain TDD as a viable methodology.
3. **Exercise the cross-component path against a real chain.** The deploy-and-seed integration pipeline runs against the live Sepolia network and produces externally-visible artefacts (the Etherscan-verified contract, three on-chain `CertificateIssued` events) that any reader of this report can re-verify.
4. **Make the system-level demonstration repeatable.** The fifteen-step manual walkthrough in Table 5.2 covers every one of the contract's external surfaces and every one of the backend's six routes; running through it end-to-end is the closest the project comes to a regression test of the integrated system.
5. **Defend against the known security threats.** OWASP Top 10 mapping, SQL injection defence via prepared statements, JWT confidentiality, soulbound enforcement, and JSON / SVG injection in `tokenURI` are each covered by a specific test or a specific code-level defence (see §6.1.5 of Chapter 6 for the OWASP coverage matrix).
6. **Surface failures helpfully when they do occur.** Error messages produced by the system (backend 5xx responses, front-end "backend unreachable" toasts, MetaMask transaction-failure paths) must be specific enough that the operator can triage without reading the source — this objective is met by the error-handling pattern documented in §5.5.

---

## 5.2 Types of Testing

The project adopts the standard *test pyramid* of Mike Cohn (Figure 4.1): a wide base of fast, deterministic unit tests; a narrower middle layer of integration tests; and a small apex of system tests. Four classes of test live on the pyramid.

### 5.2.1 Unit testing (Hardhat + Mocha + Chai)

The contract testing framework is **Hardhat + Mocha + Chai** — bundled as `@nomicfoundation/hardhat-toolbox` (`contracts/package.json:15`). Chai's assertions are extended with Hardhat-specific matchers `revertedWithCustomError(...)` and `to.emit(...).withArgs(...)`. Test fixtures use Hardhat's `loadFixture` from `@nomicfoundation/hardhat-toolbox/network-helpers`, which snapshots the in-memory chain state after the fixture runs once and rewinds to that snapshot before every subsequent test — an order-of-magnitude speed-up over re-deploying for each test.

The unit test file (`contracts/test/EdiproofCertificate.test.ts`, 504 lines) holds twenty test cases across nine `describe` blocks plus two helper functions (`anyBytes32()`, `decodeJsonDataURI()`). Each test is paired with a single invariant — the property the test would fail if a future change broke it. The full inventory is reproduced in §5.3.

### 5.2.2 Integration testing — local Hardhat

The first integration path is `npm run compile && npm test` from `contracts/`, which runs the entire test file against an in-process Hardhat chain. This gives a sub-ten-second integration check that exercises the contract, the OpenZeppelin base library, the EVM target (`cancun`), and the `viaIR` IR pipeline against a known-good fresh chain. A passing run is high-confidence evidence that the merge of recent changes has not broken any contract-level invariant.

### 5.2.3 Integration testing — live Sepolia

The second integration path is the deploy-and-seed pipeline: `npm run deploy:sepolia && npm run seed:sepolia` from `contracts/`, executed against a funded Sepolia EOA. This is a substantively heavier test because it exercises (a) the Hardhat → Alchemy RPC transport, (b) the Etherscan v2 API endpoint (post-deploy verification, optional), (c) the full deploy script's ABI export to `frontend/src/lib/`, (d) the seed script's three real `issueCertificate(...)` transactions on a real chain, and (e) block-confirmation latency. A successful run produces the artefact at `contracts/deployments/sepolia.json` and three new rows in the contract's `certificates` mapping with token ids 1, 2, 3.

### 5.2.4 System testing — manual end-to-end

System testing is performed through a manual end-to-end demonstration that drives the entire stack — contract, backend, front-end, MetaMask, Pinata, Etherscan — through a single coherent fifteen-step scenario. The scenario is documented in `README.md:100-102` and reproduced in Table 5.2 below. It covers ten of the twenty contract invariants documented in §5.3 and exercises every one of the six backend endpoints.

### 5.2.5 What is *not* covered

The backend has *no* formal automated test suite — its three operational dependencies (the live Pinata API, an actual file system, and the SQLite driver) are external resources whose test doubles would each be a small project on their own. The backend is exercised through the integration scripts and through manual `curl` smoke tests (`README.md:54-57`).

The front-end likewise has no formal automated test suite; it is exercised through manual UI tests during development and through the system-level demonstration. Adding a Playwright or Cypress smoke test that drives the `/issue → /verify` flow through a headless Chrome is listed as the highest-priority future-work item in §7.3 of Chapter 7.

This is, deliberately, a unit-heavy strategy. The justification is the *blockchain is the source of truth* rule — the contract is the only component whose state is publicly visible, the only component for which a regression cannot be hot-fixed by a redeploy, and the only component whose behaviour governs every other tier of the system.

---

## 5.3 Test Cases

### 5.3.1 Unit-test inventory

Table 5.1 catalogues the twenty unit-test cases. Every test is described by the invariant it locks in.

| `describe` | `it` | File:line | Invariant |
|---|---|---|---|
| Institution mgmt | only owner can add institutions | `:27-32` | `addInstitution` reverts with `OwnableUnauthorizedAccount` for non-owner callers |
| | added institution is approved, removed is not | `:34-40` | `approvedInstitutions[addr]` is `true` after `addInstitution`, `false` after `removeInstitution` |
| Issue | happy path: approved institution can issue | `:44-59` | An approved institution can mint; receipt status = 1; student owns token 1 |
| | emits CertificateIssued with correct args | `:61-76` | The event's args are `(1, student, anyBytes32, institution)` |
| | unapproved caller reverts | `:78-91` | A non-approved caller is rejected with `NotApprovedInstitution` |
| | duplicate hash reverts | `:93-115` | Same `(name, course, institution, ipfsURI)` cannot be minted twice |
| Soulbound | safeTransferFrom reverts | `:119-141` | `safeTransferFrom` reverts with `SoulboundTransferBlocked` — the headline soulbound invariant |
| Revoke | issuer can revoke | `:145-161` | Issuer can revoke; `CertificateRevoked` is emitted with `(1, issuer)`; `getCertificate(1).revoked == true` |
| | stranger cannot revoke | `:163-179` | A non-issuer non-owner caller is rejected with `NotIssuerOrOwner` |
| Reissue | marks old revoked, mints new with replacedBy link | `:183-214` | After reissue: old.`revoked == true`, `replacedBy[1] == 2`, new.`reissuedFrom == 1`, student owns token 2 |
| verifyCertificate | returns valid=true for genuine certs | `:218-239` | Re-submitting the original four fields returns `(true, 1, student, false, 0)` |
| | returns valid=false for tampered input | `:241-260` | `"Jhon Doe"` (vs `"John Doe"`) returns `(false, 0, address(0), false, 0)` |
| | returns valid=false for revoked certs | `:262-282` | After `revokeCertificate(1)`, the same hash returns `(valid=false, revoked=true)` |
| Reissue burns old | ownerOf(oldId) reverts after reissue | `:286-314` | Old token is *physically* burned; `ownerOf(1)` reverts with `ERC721NonexistentToken` |
| | old struct + replacedBy still readable | `:316-350` | After burn, `getCertificate(1)` still returns the old struct with `revoked=true`; `replacedBy(1) == 2` |
| tokenURI | returns base64-encoded JSON data URI | `:354-384` | URI starts with `data:application/json;base64,`; decoded JSON contains four fields and four attributes |
| | flips Status to Revoked after revoke | `:386-414` | After `revokeCertificate`, the URI's `Status` attribute is `"Revoked"`; SVG body contains literal `REVOKED` |
| | reverts for nonexistent (burned) old token | `:416-440` | `tokenURI(1)` after reissue reverts with `ERC721NonexistentToken` |
| | escapes JSON-special characters | `:442-458` | Issuing with name `Alice "The Hacker" O\Brien` produces a URI that parses cleanly as JSON |
| getCertificatesByOwner | returns all tokens for a student | `:462-484` | After two issuances to the same student, the helper returns `[1, 2]` |

### 5.3.2 The four most consequential test groups

**Soulbound enforcement.** The single test at `:119-141` is the headline contract invariant. After issuing a certificate to the student, the test calls — *as the student* — `safeTransferFrom(student, stranger, 1)` and asserts the call reverts with `SoulboundTransferBlocked`. The bracket-string call syntax is needed because ethers v6 distinguishes between the two `safeTransferFrom` overloads. The test confirms that even the *owner* of a token cannot move it.

**Hash sensitivity to single-character changes.** The test at `:241-260` issues a certificate with `name = "John Doe"` and then calls `verifyCertificate("Jhon Doe", course, institution, ipfs)` (note the transposed `h`/`o`). The assertion is `result.valid == false` and `result.tokenId == 0`. This is the cryptographic guarantee against PDF tampering, demonstrated at the smallest possible tamper width.

**Reissue burns old token.** The two tests at `:286-350` together pin down the audit-trail-with-physical-burn semantics. The first asserts that after `reissueCertificate(1, ...)`, `ownerOf(1)` reverts with `ERC721NonexistentToken` — the old token is gone. The second asserts that nonetheless `getCertificate(1)` still returns the old struct (with `revoked=true`), `replacedBy(1) == 2`, and `verifyCertificate(oldHash)` returns `(false, 1, address(0), true, 2)` — i.e. *"revoked, replaced by token 2"*.

**`tokenURI` payload integrity.** The four tests at `:354-458` together pin down the on-chain metadata contract — that the URI is base64 JSON, that revocation flips the SVG stamp, that a burned token is unreachable, and that JSON-special characters in user fields are escaped cleanly. The last test is what makes `_escapeJSON` non-negotiable: a missing escape would produce a malformed JSON body that wallets and marketplaces would silently fail to render.

### 5.3.3 The fifteen-step system demonstration

Table 5.2 enumerates the fifteen-step manual end-to-end demonstration that constitutes system testing.

| # | Action | Visible result | Invariant exercised |
|---|---|---|---|
| 1 | Run `start.bat` / `./start.sh` | Both servers boot; browser opens `localhost:3000` after 15 s | One-shot launcher |
| 2 | Click *Issue a certificate* → `/issue` | `WalletGate` prompts MetaMask | EIP-6963 + Sepolia chain check |
| 3 | Approve MetaMask; switch to Sepolia | Header shows truncated wallet address | `useWallet` chain-switch |
| 4 | Choose *Issue*; fill form fields | Live keccak256 preview updates | `computeCertHash` |
| 5 | Click *Upload PDF* | `ipfsURI` field auto-populates | `POST /api/upload` round-trip |
| 6 | Click *Issue Certificate*; sign | `txStatus: pending → success`; `tokenId` appears | `issueCertificate(...)` end-to-end |
| 7 | Click Etherscan link | Etherscan shows the `CertificateIssued` log | Event emission visible to third parties |
| 8 | Open `/my-leaves` (still connected) | Portfolio shows the new certificate card | `getCertificatesByOwner` |
| 9 | Open `/verify` in a *new browser profile with no MetaMask* | Page loads; **no wallet prompt** | Wallet-less verifier path |
| 10 | Submit the four fields exactly | Green VALID card | `verifyCertificate` returns `(true, ...)` |
| 11 | Submit with one character changed | Red NOT FOUND card | Hash sensitivity to tampering |
| 12 | Back to `/issue`; choose *Revoke*; enter token id | Banner confirms revocation | `revokeCertificate` |
| 13 | Re-submit original four fields on `/verify` | Orange REVOKED card | `verifyCertificate` returns `revoked=true` |
| 14 | Choose *Reissue*; enter old id and corrected fields | New token id appears | `reissueCertificate` |
| 15 | Re-submit *old* four fields on `/verify` | Orange REVOKED — replaced by token N card | `replacedBy` lineage pointer |

### 5.3.4 Backend smoke checks

The backend's manual smoke checks are documented in `README.md:54-57`:

```bash
curl http://localhost:8787/api/health
curl -F "file=@some.pdf" http://localhost:8787/api/upload
```

The first hits `GET /api/health` and expects `{ "ok": true, "service": "ediproof-backend" }`. The second hits `POST /api/upload` with a multipart upload and expects a `{ cid, ipfsURI, gatewayURL }` response within ~3 seconds.

---

## 5.4 Test Results

Table 5.3 summarises the test-execution results from a clean run on the development machine (Windows 11 Home, Node 22.x, pinned dependency versions per `contracts/package.json`).

| Layer | File | `describe` / `it` count | Pass | Fail | Skip | Wall clock |
|---|---|---|---|---|---|---|
| Unit (Hardhat + Chai) | `test/EdiproofCertificate.test.ts` | 9 / 20 | 20 | 0 | 0 | ~8.7 s |
| Integration (local) | (same file run against local Hardhat chain) | — | included above | — | — | — |
| Integration (live) | `npm run deploy:sepolia && npm run seed:sepolia` | 1 deploy + 3 seed tx | 4 | 0 | 0 | ~90 s |
| System (manual demo) | Table 5.2, 15 steps | 15 | 15 | 0 | 0 | ~4 min |
| **Total** | — | **39 distinct invariants exercised** | **39** | **0** | **0** | **~5 min** |

The unit-test suite is fully deterministic — the Hardhat in-process chain has no clock drift, no network jitter, and no peer-dependent block production. The integration step is non-deterministic with respect to wall-clock time (Sepolia confirmation latency varies from ~12 s to ~30 s per block) but deterministic with respect to outcome — the same seed inputs produce the same on-chain state.

A representative `npm test` tail (Figure 5.1):

```
  EdiproofCertificate
    Institution management
      ✔ only owner can add institutions
      ✔ added institution is approved, removed is not
    Issue
      ✔ happy path: approved institution can issue
      ✔ emits CertificateIssued with correct args
      ✔ unapproved caller reverts
      ✔ duplicate hash reverts
    Soulbound
      ✔ safeTransferFrom reverts
    Revoke
      ✔ issuer can revoke
      ✔ stranger cannot revoke
    Reissue
      ✔ marks old revoked, mints new with replacedBy link
    verifyCertificate
      ✔ returns valid=true for genuine certs
      ✔ returns valid=false for tampered input (single letter change)
      ✔ returns valid=false for revoked certs
    Reissue burns old token
      ✔ ownerOf(oldId) reverts after reissue
      ✔ old struct + replacedBy still readable for verification continuity
    tokenURI
      ✔ returns a base64-encoded JSON data URI with name, image, attributes
      ✔ flips Status to Revoked after revoke (soft revoke preserves token)
      ✔ reverts for nonexistent (burned) old token after reissue
      ✔ escapes JSON-special characters in user fields
    getCertificatesByOwner
      ✔ returns all tokens for a student

  20 passing (8s)
```

---

## 5.5 Error Handling and Debugging

The system surfaces failures through three concentric error-handling layers: the contract's custom errors, the backend's HTTP error responses, and the front-end's user-facing error toasts.

### 5.5.1 Contract-level errors (six custom errors)

The contract uses Solidity 0.8.4+ custom errors throughout. Six are declared at `EdiproofCertificate.sol:50-55`:

| Error | Where raised | Carries diagnostic data |
|---|---|---|
| `NotApprovedInstitution()` | `onlyApprovedInstitution` modifier | No |
| `DuplicateCertificate(bytes32, uint256)` | `issueCertificate`, `reissueCertificate` | Yes — the conflicting hash + the existing token id |
| `NotIssuerOrOwner()` | `revokeCertificate`, `reissueCertificate` | No |
| `InvalidTokenId()` | Lifecycle functions on unknown id | No |
| `AlreadyRevoked()` | `revokeCertificate` | No |
| `SoulboundTransferBlocked()` | `_update` on transfer | No |

Custom errors are preferred over `require(..., "string")` because the encoded payload is shorter (a 4-byte selector + arguments instead of a string) and because they let the test suite assert with `revertedWithCustomError(...)` rather than against a free-form string. `DuplicateCertificate(certHash, existingTokenId)` carries diagnostic data so a caller can look up the conflict without an extra read.

### 5.5.2 Backend-level errors (global handler + per-route specifics)

`backend/src/server.js:28-31` installs a global Express error handler that catches any uncaught route error and returns `500 { error: <message> }`. Three per-route error specifics layer above it:

- **`POST /api/upload`** validates that a `file` field is present (`routes.js:23-25`). A missing file produces a `400 { error: "Missing 'file' field" }`. A Pinata-side failure surfaces the upstream status code and body verbatim through the global handler — the surfacing was added in commit `76a851d`.
- **`POST /api/log`** validates that `kind` is present (`routes.js:46-48`). A missing kind produces a `400 { error: "Missing required field 'kind'" }`.
- **Multer file-size overruns** (15 MB cap at `routes.js:6-9`) produce a `413 Payload Too Large` automatically.

The Pinata proxy (`backend/src/pinata.js:9-12`) throws if `process.env.PINATA_JWT` is missing — a clean operator-facing failure rather than a confusing runtime crash.

### 5.5.3 Front-end-level errors (toast banners + verbose messages)

The front-end's most visible error path is `frontend/src/lib/api.ts:45-71` (`uploadFile`). If the backend is unreachable (a typical mistake when only one of the two `start.bat` windows has been opened), the user sees a helpful message — *"Backend unreachable at http://localhost:8787. Is the backend server running? Start it by double-clicking start.bat..."* — rather than a cryptic `TypeError: Failed to fetch`. The pattern was added in commit `76a851d`.

The MetaMask transaction-failure path is handled at the issuance form. If the user rejects the MetaMask popup, the error code (4001) is mapped to a friendly *"Transaction cancelled by user"* message; if the user is on a non-Sepolia chain, the transaction is blocked client-side before the popup fires (the `WalletGate` component handles this); if the user is not on the institution whitelist, MetaMask itself will fail with the contract's `NotApprovedInstitution` revert reason.

The verifier page surfaces all four canonical outcomes explicitly. A `try`/`catch` around the `verifyCertificate(...)` call also catches RPC-level failures (Alchemy outage, malformed payload) and renders a *"verification failed — please retry"* card, distinct from the four certificate-state outcomes.

### 5.5.4 Debugging workflow

Three tooling-level debugging primitives were used during development:

1. **Hardhat console** (`npx hardhat console --network sepolia`) — interactive REPL for ad-hoc contract calls. Used during development to confirm that the seed certificates were minted at the expected token ids and that `verifyCertificate(...)` returned the expected tuples.
2. **Etherscan event logs** — every state-changing call emits an event, and Etherscan's event-log decoder gives a human-readable view of the indexed and non-indexed args. Used during development to confirm that `CertificateReissued` was emitted with the correct `(oldTokenId, newTokenId, issuer)` triple.
3. **Browser developer console** — the front-end's network panel shows the full request/response of every backend call, and the console panel surfaces ethers-side stack traces when a `tx.wait()` fails. Used during development to debug the EIP-6963 wallet-discovery handshake by logging every `eip6963:announceProvider` event the page received.

The most subtle bug encountered during development — the OKX/MetaMask `window.ethereum` overwrite — surfaced as *"the issuance transaction goes to the OKX wallet even though I selected MetaMask"*. The diagnosis path was (a) console-log every event the page receives during connect, (b) observe two separate announcements with `info.rdns === 'com.okx.wallet'` and `info.rdns === 'io.metamask'`, (c) confirm that `window.ethereum` had been overwritten by OKX, (d) replace the global-slot lookup with the EIP-6963 announced-provider lookup. The fix was committed as `8fe44f9` and is described in detail in §6.3.

---

> *Chapter summary.* The Ediproof DApp ships with a layered test suite — twenty Hardhat unit tests, a deploy-and-seed integration pipeline against live Sepolia, and a fifteen-step manual system demonstration — that together exercise every public function of the contract, every backend route, the wallet-based and wallet-less front-end paths, the EIP-6963 wallet-discovery fix, the burn-and-remint reissuance flow, the metadata escape helpers, and the institution whitelist. A canonical `npm test` run completes in approximately 8.7 seconds with twenty passes and zero failures; the live deploy-and-seed pipeline produces an Etherscan-verifiable contract whose `verifyCertificate` view function is callable from any third party with no wallet. Error handling is structured into three concentric layers (contract custom errors, backend HTTP errors, front-end toasts) that together surface specific, actionable failure messages rather than generic stack traces. Chapter 6 now turns to the system's distinctive advantages, its current limitations, and the engineering challenges encountered during the build.
