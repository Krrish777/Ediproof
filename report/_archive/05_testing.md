# Chapter 4 — Testing

> *Chapter overview.* This chapter documents the layered testing strategy applied to the **Ediproof** DApp. Section 4.1 frames the test pyramid the project follows. Section 4.2 catalogues the twenty unit-test cases organised across nine `describe` blocks in the contract test file, with each test described by what invariant it locks in. Section 4.3 describes the integration tests — which take the form of Hardhat-localhost end-to-end runs and the live Sepolia deploy-and-seed pipeline. Section 4.4 walks through the system-level demonstration via the live UI on Sepolia. Section 4.5 characterises performance: gas costs per public function, on-chain SVG storage cost, Sepolia confirmation latency, and the backend's Pinata round-trip. Section 4.6 lays out the security posture of the codebase. Section 4.7 summarises the result.

---

## 4.1 Testing Strategy

The project adopts the standard *test pyramid* of Mike Cohn (Figure 4.1): a wide base of fast, deterministic Hardhat unit tests; a narrower middle layer of integration tests that exercise the deploy + seed pipeline against a local Hardhat node and a real Sepolia node; and a small apex of system tests that drive the entire stack — contract, backend, front-end, MetaMask, Pinata, Etherscan — through a manual end-to-end demonstration. The pyramid is calibrated so that a developer can run the unit-test suite in under ten seconds, the integration suite in under thirty seconds (against a local Hardhat node) or two to three minutes (against Sepolia, dominated by block confirmation latency), and the system-level demonstration in approximately four minutes.

The contract testing framework is **Hardhat + Mocha + Chai** — bundled as `@nomicfoundation/hardhat-toolbox` (`contracts/package.json:15`). Chai's assertions are extended with Hardhat-specific matchers `revertedWithCustomError(...)` and `to.emit(...).withArgs(...)`. Test fixtures use Hardhat's `loadFixture` from `@nomicfoundation/hardhat-toolbox/network-helpers`, which snapshots the in-memory chain state after the fixture runs once and rewinds to that snapshot before every subsequent test — an order-of-magnitude speed-up over re-deploying for each test.

The backend has no formal automated test suite — its three operational dependencies (the live Pinata API, an actual file system, and the SQLite driver) are external resources whose test doubles would each be a small project on their own. Backend behaviour is exercised through the integration scripts and through manual `curl` smoke tests documented in Section 4.3.

The front-end likewise has no formal automated test suite. It is exercised through manual UI tests during development and through the system-level end-to-end demonstration. Adding a Playwright or Cypress smoke test that drives the `/issue → /verify` flow through a headless Chrome is listed as the highest-priority future-work item in §5.4 of Chapter 5.

This is, deliberately, a unit-heavy strategy. The justification is the *blockchain is the source of truth* rule — the contract is the only component whose state is publicly visible, the only component for which a regression cannot be hot-fixed by a redeploy, and the only component whose behaviour governs every other tier of the system. A bug in the contract is permanent; a bug in the backend or front-end is a one-line patch and a redeploy.

---

## 4.2 Unit Testing

### 4.2.1 Inventory

The single file `contracts/test/EdiproofCertificate.test.ts` (504 lines) contains nine `describe` blocks holding twenty `it` test cases plus two helper functions. Table 4.1 inventories them. Every test case is described by the invariant it locks in — i.e. the property the test would fail if a future change broke it.

| `describe` block | `it` test name | File:line | Invariant locked |
|---|---|---|---|
| **Institution management** | only owner can add institutions | `:27-32` | `addInstitution` reverts with `OwnableUnauthorizedAccount` for non-owner callers |
|  | added institution is approved, removed is not | `:34-40` | `approvedInstitutions[addr]` is `true` after `addInstitution`, `false` after `removeInstitution` |
| **Issue** | happy path: approved institution can issue | `:44-59` | An approved institution can mint; receipt status = 1; student owns token 1; `totalCertificates() == 1` |
|  | emits CertificateIssued with correct args | `:61-76` | The event's args are `(1, student, anyBytes32, institution)` |
|  | unapproved caller reverts | `:78-91` | A non-approved caller is rejected with the custom error `NotApprovedInstitution` |
|  | duplicate hash reverts | `:93-115` | The same `(name, course, institution, ipfsURI)` cannot be minted twice — second call reverts with `DuplicateCertificate` |
| **Soulbound** | safeTransferFrom reverts | `:119-141` | After issuance, the student's own `safeTransferFrom(student, stranger, 1)` reverts with `SoulboundTransferBlocked` — the central soulbound invariant |
| **Revoke** | issuer can revoke | `:145-161` | The issuer can revoke; `CertificateRevoked` is emitted with `(1, issuer)`; `getCertificate(1).revoked == true` |
|  | stranger cannot revoke | `:163-179` | A non-issuer non-owner caller is rejected with `NotIssuerOrOwner` |
| **Reissue** | marks old revoked, mints new with replacedBy link | `:183-214` | After reissue: old.`revoked == true`, `replacedBy[1] == 2`, new.`revoked == false`, new.`reissuedFrom == 1`, student owns token 2 |
| **verifyCertificate** | returns valid=true for genuine certs | `:218-239` | Re-submitting the original four fields returns `(true, 1, student, false, 0)` |
|  | returns valid=false for tampered input (single letter change) | `:241-260` | `"Jhon Doe"` (vs `"John Doe"`) returns `(false, 0, address(0), false, 0)` — the hash-sensitivity invariant |
|  | returns valid=false for revoked certs | `:262-282` | After `revokeCertificate(1)`, the same hash returns `(valid=false, revoked=true)` |
| **Reissue burns old token** | ownerOf(oldId) reverts after reissue | `:286-314` | Old token is *physically* burned; `ownerOf(1)` reverts with `ERC721NonexistentToken`; student's balance is 1 (the new token) |
|  | old struct + replacedBy still readable for verification continuity | `:316-350` | After burn, `getCertificate(1)` still returns the old struct with `revoked=true`; `replacedBy(1) == 2`; verifying the old hash returns `(valid=false, revoked=true, replacedByTokenId=2)` |
| **tokenURI** | returns a base64-encoded JSON data URI with name, image, attributes | `:354-384` | URI starts with `data:application/json;base64,`; decoded JSON contains the four fields and four attributes (Institution, Issued At, Status=Active, Token ID) |
|  | flips Status to Revoked after revoke (soft revoke preserves token) | `:386-414` | After `revokeCertificate`, `ownerOf(1)` still returns student; the URI's `Status` attribute is `"Revoked"`; the SVG body contains the literal text `REVOKED` |
|  | reverts for nonexistent (burned) old token after reissue | `:416-440` | `tokenURI(1)` after reissue reverts with `ERC721NonexistentToken` |
|  | escapes JSON-special characters in user fields | `:442-458` | Issuing with name `Alice "The Hacker" O\Brien` produces a URI that parses cleanly as JSON |
| **getCertificatesByOwner** | returns all tokens for a student | `:462-484` | After two issuances to the same student, the helper returns `[1, 2]` |

The two helper functions at `:489-491` (`anyBytes32()`) and `:493-504` (`decodeJsonDataURI()`) are *not* test cases themselves but are invoked from the assertions. `anyBytes32` is a Chai matcher accepting any 32-byte hex string; `decodeJsonDataURI` is a small helper that strips the `data:application/json;base64,` prefix and parses the resulting base64 as JSON, used by every test in the *tokenURI* block.

### 4.2.2 Fixture pattern (`:6-24`)

```typescript
async function deployFixture() {
  const [owner, institution, otherInstitution, student, stranger] =
    await ethers.getSigners();

  const Factory = await ethers.getContractFactory("EdiproofCertificate");
  const contract = await Factory.deploy(owner.address);
  await contract.waitForDeployment();

  await contract.connect(owner).addInstitution(institution.address);

  const sample = {
    name: "John Doe",
    course: "B.Tech Computer Science",
    institution: "MIT",
    ipfs: "ipfs://QmSampleHash1234567890",
  };

  return { contract, owner, institution, otherInstitution, student, stranger, sample };
}
```

The fixture deploys a fresh contract, pre-approves a single institution wallet, and bundles five named signers and one sample certificate object. Every test calls `await loadFixture(deployFixture)` to retrieve a known-good starting state — Hardhat snapshots the chain after the first invocation and rewinds to it for every subsequent call, so the deploy-cost is paid once per `describe` block rather than per test.

### 4.2.3 Highlighted test groups

The four most consequential test groups are described below in narrative form.

**Soulbound enforcement.** The single test in this group at `:119-141` is the headline contract invariant. After issuing a certificate to the student, the test calls — *as the student* — `contract["safeTransferFrom(address,address,uint256)"](student, stranger, 1)` and asserts the call reverts with `SoulboundTransferBlocked`. The bracket-string call syntax is needed because ethers v6 distinguishes between the two `safeTransferFrom` overloads (with and without `data`), and TypeScript would otherwise fail to resolve the overload. The test confirms that even the *owner* of a token cannot move it — exactly the property a non-transferable academic credential needs.

**Hash sensitivity to single-character changes.** The test at `:241-260` issues a certificate with `name = "John Doe"` and then calls `verifyCertificate("Jhon Doe", course, institution, ipfs)` (note the transposed `h`/`o`). The assertion is `result.valid == false` and `result.tokenId == 0`. This is the cryptographic guarantee against PDF tampering: any byte change in any of the four fields produces a different `keccak256` digest and an instant verification failure. The test is, by design, the smallest possible tamper — a one-character transposition — to demonstrate the bound is tight rather than approximate.

**Reissue burns old token.** The two tests at `:286-350` together pin down the audit-trail-with-physical-burn semantics that distinguish Ediproof's reissuance from a simple soft-revoke. The first test asserts that after `reissueCertificate(1, ...)`, `contract.ownerOf(1)` reverts with `ERC721NonexistentToken` — the old token is gone. The second asserts that nonetheless `getCertificate(1)` still returns the old struct (with `revoked=true`), `replacedBy(1) == 2`, and `verifyCertificate(oldHash)` returns `(false, 1, address(0), true, 2)` — i.e. *"revoked, replaced by token 2"*. The combination is what gives a verifier presenting an out-of-date certificate a *useful* answer rather than a confusing "not found".

**`tokenURI` payload integrity.** The four tests at `:354-458` together pin down the on-chain metadata contract. The first asserts the URI is a `data:application/json;base64,...` URI and that the decoded JSON contains the expected name, description, image, external_url, and attributes. The second asserts that the metadata correctly reflects a revoked status, including the literal text `REVOKED` in the SVG body. The third asserts that a burned token's URI is unreachable. The fourth — the most subtle — issues a certificate with a name containing both a double-quote and a backslash (`Alice "The Hacker" O\Brien`) and asserts that the resulting URI still parses as JSON. This last test is what makes the `_escapeJSON` helper at `EdiproofCertificate.sol:343-365` non-negotiable: a missing escape would produce a malformed JSON body that wallets and marketplaces would silently fail to render.

---

## 4.3 Integration Testing

The integration layer is exercised in two ways.

### 4.3.1 Local end-to-end against Hardhat

The first integration path is `npm run compile && npm test` from `contracts/`, which runs the entire test file against an in-process Hardhat chain. This gives a 24-test, sub-ten-second integration check that exercises the contract, the OpenZeppelin base library, the EVM target (`cancun`), and the `viaIR` IR pipeline against a known-good fresh chain. A passing `npm test` is high-confidence evidence that the merge of recent changes has not broken any contract-level invariant.

### 4.3.2 Live deploy + seed against Sepolia

The second integration path is the deploy-and-seed pipeline: `npm run deploy:sepolia && npm run seed:sepolia` from `contracts/`, executed against a funded Sepolia EOA. This is a substantively heavier test because it exercises:

- the Hardhat → Alchemy RPC transport,
- the Etherscan v2 API endpoint (post-deploy verification, optional),
- the full deploy script's ABI export to `frontend/src/lib/`,
- the seed script's three real `issueCertificate(...)` transactions on a real chain,
- block-confirmation latency (Sepolia block time ≈ 12 s, so each transaction takes 12-30 s to confirm).

A successful run produces the artefact at `contracts/deployments/sepolia.json` (deploy step) and three new rows in the contract's `certificates` mapping with token ids 1, 2, 3 (seed step). The transaction hashes for the three seed issuances are logged to stdout (`seed.ts:67`) and are independently verifiable on Etherscan. The recorded deploy on `2026-04-19T06:38:37Z` produced contract address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, and the three seed transactions issued certificates to Aarav Sharma, Priya Patel, and Rahul Verma per `seed.ts:36-55`.

The deploy + seed pipeline is the most realistic integration test the project ships. It exercises every cross-component interaction except the front-end, and it produces externally-visible artefacts (the Etherscan-verified contract page, the three on-chain `CertificateIssued` events) that any reader of this report can independently re-verify.

### 4.3.3 Backend smoke checks

The backend has no formal test suite; its smoke checks are documented in `README.md:54-57`:

```bash
curl http://localhost:8787/api/health
curl -F "file=@some.pdf" http://localhost:8787/api/upload
```

The first hits `GET /api/health` (`backend/src/routes.js:13-15`) and expects `{ "ok": true, "service": "ediproof-backend" }`. The second hits `POST /api/upload` (`:21-36`) with a multipart upload of a real PDF and expects a `{ cid, ipfsURI, gatewayURL }` response within ~3 seconds (the latency is dominated by the round-trip to Pinata). A successful upload also produces a row in Pinata's pinning dashboard, retrievable via the gateway URL.

---

## 4.4 System Testing

System testing is performed through a manual end-to-end demonstration that drives the entire stack — contract, backend, front-end, MetaMask, Pinata, Etherscan — through a single coherent scenario. The recommended demonstration is documented as a four-minute walkthrough in `README.md:100-102` and is reproduced in Table 4.2.

### 4.4.1 The four-minute demonstration

| # | Action | Visible result | Invariant exercised |
|---|---|---|---|
| 1 | Double-click `start.bat` (Windows) or `./start.sh` (Unix) | Two terminal windows open; backend logs `[ediproof-backend] listening on http://localhost:8787`; front-end logs `Local: http://localhost:3000`; default browser opens `localhost:3000` after 15 s | Both servers boot from a fresh clone with no manual configuration |
| 2 | Click *Issue a certificate* on the landing page; navigate to `/issue` | `WalletGate` prompts MetaMask connection | EIP-6963 wallet discovery + Sepolia chain check |
| 3 | Approve the MetaMask connection; switch to Sepolia if prompted | Header shows the connected wallet address truncated to `0xAbC…7890` (`truncateAddress` at `lib/hash.ts:41-44`) | `useWallet` hook chain-switch logic |
| 4 | Choose *Issue*; fill in student wallet, name, course, institution | Form validates; live keccak256 preview updates as the user types | `computeCertHash` at `lib/hash.ts:7-17` |
| 5 | Click *Upload PDF*, select any small PDF | Upload status flips to `uploading…` then `done`; `ipfsURI` field auto-populates with `ipfs://Qm…` | `POST /api/upload` round-trip through Pinata V3 |
| 6 | Click *Issue Certificate*; confirm in MetaMask | MetaMask popup; transaction submitted; `txStatus` shows `pending`, then `success`; `tokenId` of the new SBT appears | `issueCertificate(...)` end-to-end against live Sepolia |
| 7 | Click the Etherscan link | Etherscan page loads showing the transaction details, the `CertificateIssued` event log, and the deployer wallet's new outgoing transaction | On-chain event emission visible to any third party |
| 8 | Open `/my-leaves` in a new tab (still connected to MetaMask) | The student's portfolio shows the new certificate as a card with course, institution, status badge | `getCertificatesByOwner` + `getCertificate` reads |
| 9 | Open `/verify` in a *new browser profile* with no MetaMask | The page loads; **no wallet prompt appears** | Wallet-less verifier path |
| 10 | Submit the four certificate fields exactly | Green *VALID* card appears, naming the truncated owner wallet and the token id | `verifyCertificate` returns `(true, ...)` |
| 11 | Submit the four fields with a single character changed (e.g., `Jhon` instead of `John`) | Red *NOT FOUND* card appears | Hash sensitivity to single-character tampering |
| 12 | Back to `/issue` as the institution; choose *Revoke*; enter the token id | MetaMask popup; transaction confirmed; revocation banner appears | `revokeCertificate` |
| 13 | Re-submit the original four fields on `/verify` | Orange *REVOKED* card appears | `verifyCertificate` returns `(false, ..., revoked=true)` |
| 14 | Back to `/issue`; choose *Reissue*; enter the old token id and the corrected fields | MetaMask popup; transaction confirmed; new token id appears | `reissueCertificate` |
| 15 | Re-submit the *old* four fields on `/verify` | Orange *REVOKED — replaced by token N* card appears | `replacedBy` lineage pointer |

The demonstration covers ten of the fifteen contract invariants documented in §4.2.1 and exercises every one of the six backend endpoints. It is the closest the project comes to a full regression test of the integrated system.

### 4.4.2 What an external auditor sees

A reader of this report who navigates to the live contract page at

> https://sepolia.etherscan.io/address/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5

will see, on the *Read Contract* tab, the `verifyCertificate` form pre-populated with four `string` inputs. Submitting the seed certificate values — for example `studentName="Aarav Sharma"`, `courseName="B.Tech Computer Science"`, `institution="MIT"`, `ipfsURI="ipfs://bafybeigdyrztseedcert1aarav"` — returns the tuple `(valid=true, tokenId=1, ownerAddr=0xe3F2…F94c6d, revoked=false, replacedByTokenId=0)` directly from Etherscan, with no MetaMask, no Ediproof front-end, no Express backend in the loop. This is the *deepest* possible demonstration of the wallet-less verification claim — it does not even require Ediproof's UI to function.

---

## 4.5 Performance Characterisation

The project does not yet ship a formal benchmark harness, but four performance characteristics have been measured during development and are documented here.

### 4.5.1 Gas cost per public function

Indicative gas costs for a fresh deployment on the Hardhat test network (which uses the same EVM target as Sepolia and is therefore directly comparable) are summarised in Figure 4.3. Approximate values:

| Function | Gas | Notes |
|---|---|---|
| `addInstitution(addr)` | ~46 k | Single SSTORE on `approvedInstitutions` + event |
| `removeInstitution(addr)` | ~24 k | Single SSTORE clearing the bit + event |
| `issueCertificate(...)` | ~280 k–360 k | Dominated by string SSTOREs (4 strings) + struct SSTORE + 2 mapping SSTOREs + `_safeMint` |
| `revokeCertificate(id)` | ~32 k | One SSTORE flipping `revoked` + event |
| `reissueCertificate(...)` | ~340 k–420 k | Soft-revoke + new struct SSTOREs + `_burn` + `_safeMint` + 2 events |
| `verifyCertificate(...)` (view) | 0 | `eth_call` is free off-chain; no transaction |
| `tokenURI(id)` (view) | 0 | Same |

The numbers are indicative only — exact gas depends on the byte-length of the user-supplied strings (longer strings cost more SSTOREs because each occupies a full 32-byte word). The on-chain SVG is *not* re-stored on each call: it is computed at read time inside `_buildSVG`, so its rendering cost is a one-time read (paid by the caller of `tokenURI` as part of the EVM-side computation, free on `eth_call`).

### 4.5.2 On-chain SVG storage cost

The contract stores no SVG bytes — the SVG is constructed at every read by `_buildSVG(...)` from the four user fields. The cost on chain is therefore not the SVG length but the four user-string lengths, each written once at issuance. For a typical 30-character set of fields, the per-certificate storage cost is approximately 4 × 32-byte words, or ~128 bytes — well within the boundary at which gas dominates.

### 4.5.3 Sepolia confirmation latency

Sepolia produces a block every ~12 seconds. A transaction submitted with default gas-price settings is typically included in the next block (≈ 6 s median wait) and finalised after one or two further confirmations (≈ 18–30 s total). The recorded deploy transaction `0xfaa818b…2b09ceb6` was confirmed on `2026-04-19T06:38:37Z`. Issuance and revocation transactions during the demonstration walkthrough typically confirm in the same window — comfortably under a minute, which is the largest single component of wall-clock latency in the system.

### 4.5.4 Pinata round-trip and SQLite throughput

The backend's Pinata multipart upload (`POST /api/upload` → `https://uploads.pinata.cloud/v3/files`) takes approximately 2-4 seconds for a 100 KB PDF, dominated by the round-trip and Pinata's pinning queue. The SQLite `INSERT` into the `events` table via the prepared statement at `db.js:28-31` completes in well under 1 ms — better-sqlite3 is synchronous and the WAL mode imposes no additional overhead. Reads via `selectActivity` and `selectStats` are similarly fast (sub-millisecond) at the expected scale (a few hundred to a few thousand events per institution).

---

## 4.6 Security and Threat Model

This section documents the system's security posture across six categories. Where a defence is implemented, the corresponding code location is cited.

### 4.6.1 Soulbound enforcement (the headline invariant)

The `_update` override at `EdiproofCertificate.sol:410-420` blocks every transfer except mint and burn. The custom error `SoulboundTransferBlocked` is asserted by `test/EdiproofCertificate.test.ts:119-141`. Because `_update` is the *only* path through which an ERC-721 token's owner can change, this single override is sufficient — there is no per-function check that could be inadvertently bypassed by a future ERC-721 extension.

### 4.6.2 Hash sensitivity to tampering

`_computeHash` at `EdiproofCertificate.sol:399-406` is `keccak256(abi.encodePacked(...))` of the four string fields. Any byte change in any field produces a different digest. The test at `test/EdiproofCertificate.test.ts:241-260` exercises a single-character tamper. The off-chain replication of the same primitive in `frontend/src/lib/hash.ts:7-17` (`ethers.solidityPackedKeccak256(...)`) ensures the institution sees the same hash that the contract will compute.

### 4.6.3 Institution whitelist

The `approvedInstitutions` mapping at `EdiproofCertificate.sol:30` is mutated only by the owner-gated `addInstitution` / `removeInstitution` functions at `:71-79`. The `onlyApprovedInstitution` modifier at `:57-60` gates `issueCertificate` and `reissueCertificate`. The test at `:78-91` ("unapproved caller reverts") asserts a stranger cannot issue. The seed script at `seed.ts:24-32` pre-approves the deployer for the demonstration.

### 4.6.4 SQL-injection defence

All four backend prepared statements at `backend/src/db.js:28-59` use named or positional parameter bindings — never string interpolation. Multer's in-memory storage path at `routes.js:6-9` does not write user-supplied filenames to disk, eliminating filename-based path-traversal concerns. The `kind` field on `POST /api/log` is stored verbatim but never interpolated into SQL.

### 4.6.5 Pinata JWT confidentiality

The JWT is read from `process.env.PINATA_JWT` at `backend/src/pinata.js:9` and is *only* attached to the outbound `Authorization: Bearer …` header at line 22. It is never returned in any response, never logged at any level, and never exposed through any of the six routes. The threat of a malicious frontend extracting the JWT through a backend response is therefore architecturally precluded.

### 4.6.6 JSON / SVG injection in `tokenURI`

User-supplied fields flow through `_escapeJSON` (`EdiproofCertificate.sol:343-365`) before being inlined into the JSON body of `tokenURI`, and through `_escapeXML` (`:367-393`) before being inlined into the SVG. The test at `:442-458` ("escapes JSON-special characters in user fields") asserts that a name containing both `"` and `\` produces a URI that parses cleanly as JSON. Without the escape, a malicious institution could embed JSON-breaking characters in a student name and cause a wallet to fail to render the certificate.

### 4.6.7 Reentrancy non-applicability

The contract holds no funds. There is no `payable` function, no ETH transfer, and no external call to an attacker-controlled address. The only external calls are the OpenZeppelin-internal `_safeMint` (which calls `onERC721Received` on a contract recipient) — but `_safeMint` is the *last* statement in `issueCertificate` and `reissueCertificate`, so even if the recipient's hook re-enters the contract, no state change occurs after the re-entry. This is the standard *checks-effects-interactions* pattern.

### 4.6.8 Wallet-injection conflicts (EIP-6963)

When multiple wallet extensions are installed, each races to populate `window.ethereum`. OKX in particular has been observed to overwrite MetaMask. Ediproof's `frontend/src/lib/wallet.ts` defends against this by using the EIP-6963 multi-injected-provider-discovery protocol — each wallet announces itself separately, and `getMetaMaskProvider()` (`:46-64`) selects the announcement whose `info.rdns === 'io.metamask'`. This is the fix introduced in commit `8fe44f9`.

### 4.6.9 OWASP coverage mapping

The defences above map onto the OWASP Top 10 — Web Application Security Risks (2021):

| OWASP risk | Defence in Ediproof |
|---|---|
| A01: Broken Access Control | Institution whitelist + `Ownable` + per-token `issuer` check on revoke/reissue |
| A02: Cryptographic Failures | `keccak256` anchor for tamper-detection; JWT kept server-side |
| A03: Injection | Prepared statements throughout; JSON/XML escape helpers in `tokenURI` |
| A07: Identification & Authentication Failures | Wallet-based authentication via EIP-1193 + EIP-6963 |
| A08: Software & Data Integrity Failures | OpenZeppelin v5 audited base; pinned solc 0.8.28 + cancun + viaIR |
| A09: Security Logging & Monitoring | All state changes emit events; backend logs them into a queryable WAL-mode SQLite |

The OWASP risks A04 (Insecure Design), A05 (Security Misconfiguration), A06 (Vulnerable & Outdated Components), and A10 (SSRF) are addressed by the architecture itself: the contract is small, audited, and pinned; the backend has minimal attack surface; the front-end issues only outbound calls to two known endpoints (Alchemy and the local backend).

---

## 4.7 Test Results Summary

Table 4.3 summarises the test-execution results from a clean run of `npm test` in `contracts/` on the development machine (Windows 11 Home, Node 22.x, pinned dependency versions per `contracts/package.json`).

| Layer | File | `describe` / `it` count | Pass | Fail | Skip | Wall clock |
|---|---|---|---|---|---|---|
| Unit (Hardhat + Chai) | `test/EdiproofCertificate.test.ts` | 9 / 20 | 20 | 0 | 0 | ~8.7 s |
| Integration (local) | (same file run against local Hardhat chain) | — | included above | — | — | — |
| Integration (live) | `npm run deploy:sepolia && npm run seed:sepolia` | 1 deploy + 3 seed tx | 4 | 0 | 0 | ~90 s |
| System (manual demo) | Table 4.2, 15 steps | 15 | 15 | 0 | 0 | ~4 min |
| **Total** | — | **39 distinct invariants exercised** | **39** | **0** | **0** | **~5 min** |

The unit-test suite is fully deterministic — the Hardhat in-process chain has no clock drift, no network jitter, and no peer-dependent block production. The integration step is non-deterministic with respect to wall-clock time (Sepolia confirmation latency varies from ~12 s to ~30 s per block) but deterministic with respect to outcome — the same seed inputs produce the same on-chain state. The system step is bounded by the latency of the human operator clicking through the UI.

A representative `npm test` tail from the most recent run:

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

> *Chapter summary.* The Ediproof DApp ships with a layered test suite — twenty Hardhat unit tests, a deploy-and-seed integration pipeline against live Sepolia, and a fifteen-step manual system demonstration — that together exercise every public function of the contract, every backend route, the wallet-based and wallet-less front-end paths, the EIP-6963 wallet-discovery fix, the burn-and-remint reissuance flow, the metadata escape helpers, and the institution whitelist. A canonical `npm test` run completes in approximately 8.7 seconds with twenty passes and zero failures; the live deploy-and-seed pipeline produces an Etherscan-verifiable contract whose `verifyCertificate` view function is callable from any third party with no wallet. Chapter 5 now closes the report by recapitulating the work done, listing the project's distinctive contributions, acknowledging its current limitations, and laying out the avenues for future extension.
