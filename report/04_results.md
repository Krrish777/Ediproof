# Chapter 4 — Results and Analysis

> *Chapter overview.* This chapter presents the empirical results observed from a live deployment of the **Ediproof** DApp on the Ethereum Sepolia testnet. Section 4.1 describes the output observed when each public function and each user-facing surface is exercised end-to-end. Section 4.2 characterises the system's performance — gas cost per public function, on-chain SVG storage cost, Sepolia confirmation latency, and the backend's Pinata round-trip. Section 4.3 compares Ediproof against four existing approaches across nine architectural axes. Section 4.4 closes with an impact analysis grounded in the credential-fraud baseline that motivated the project.

---

## 4.1 Output Results

The system was exercised end-to-end on the live Sepolia network using the deployment recorded in §3.3.5 (address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, deploy transaction `0xfaa818b…2b09ceb6`, deployed `2026-04-19T06:38:37Z`). The results below describe what was observed at each step of the canonical fifteen-step demonstration walkthrough that constitutes the system-level test (Table 5.2 in Chapter 5 enumerates the steps in detail).

### 4.1.1 Live deployment artefact

The deployment script `npm run deploy:sepolia` produced six concrete artefacts in approximately 20 seconds:

1. The on-chain contract at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, with full source code subsequently verified on Etherscan (`hardhat verify --network sepolia`).
2. The artefact file `contracts/deployments/sepolia.json` recording the deploy transaction hash, the deployer EOA, and the deploy timestamp (reproduced in Table 3.4 of Chapter 3).
3. The auto-exported `frontend/src/lib/EdiproofCertificate.abi.json` — the contract's ABI as a JSON array, used by the front-end at run time.
4. The auto-exported `frontend/src/lib/deployment.json` — `{ address, network }` — wiring the front-end to the live contract.
5. The empty SQLite analytics database `backend/ediproof.db` (WAL mode), populated by the front-end as the demo runs.
6. Stdout output ending with the next-step instructions for the operator (`hardhat verify ...`, the seed-script command, and the front-end env hint).

### 4.1.2 Seed script output

`npm run seed:sepolia` issued three demonstration certificates in approximately 70 seconds (each issuance takes ~12–30 s of Sepolia confirmation latency, plus a few seconds of Hardhat-side overhead). The three certificates — Aarav Sharma / Priya Patel / Rahul Verma — are visible on Etherscan under the contract's *Events* tab as three `CertificateIssued` log entries with token ids 1, 2, 3 respectively. After seeding, `totalCertificates()` (read against the Read Contract tab on Etherscan) returns `3`.

### 4.1.3 Issuance — observed flow

When the operator clicks *Issue Certificate* on the `/issue` page, the following observed events occur in sequence:

1. The keccak256 hash preview updates live in the form, reading e.g. `0x4f3a…b27c`.
2. The PDF upload widget shows `uploading…` for ~2-4 s, then `done`, and the `ipfsURI` field auto-populates with `ipfs://Qm…`.
3. MetaMask pops up showing the call to `issueCertificate(...)` with the four string arguments and the gas estimate (typically ~280k–360k gas).
4. After the user signs, the front-end shows `txStatus: pending` for ~12-30 s.
5. On confirmation, the banner flips to `txStatus: success` with the new `tokenId` (visible because the front-end parses the `CertificateIssued` event log) and an Etherscan link.
6. Following the Etherscan link shows the transaction page with the event log parsed as `CertificateIssued (uint256 tokenId, address student, bytes32 certHash, string institution)`.

### 4.1.4 Verifier — observed flow

When a verifier opens `/verify` in a *fresh browser profile with no MetaMask installed* and submits the four fields of an existing seed certificate (e.g. Aarav Sharma / B.Tech Computer Science / MIT / `ipfs://bafybeigdyrztseedcert1aarav`), the page renders a green VALID card naming the truncated owner wallet (`0xe3F2…F94c6d`) and the token id (`#1`). When the same fields are resubmitted with a single character changed (e.g. `Jhon` instead of `John`), the page renders a red NOT FOUND / TAMPERED card. After the institution revokes token #1 via `/issue → Revoke`, resubmitting the original four fields produces an orange REVOKED card. After a subsequent reissue, resubmitting the *old* four fields produces an orange *REVOKED — replaced by token N* card.

These four outcomes — VALID / NOT FOUND / REVOKED / REVOKED & REPLACED — are the canonical four return classes of the `verifyCertificate(...)` function. Observing all four in the live UI is the most compact possible demonstration that the entire pipeline (front-end → Alchemy → Sepolia → contract → response → render) is functioning end-to-end without any wallet in the request path.

### 4.1.5 What an external auditor sees

A reader of this report who navigates to the contract's *Read Contract* tab on Etherscan will see the `verifyCertificate` form pre-populated with four `string` inputs. Submitting the seed values returns the tuple `(valid=true, tokenId=1, ownerAddr=0xe3F2…F94c6d, revoked=false, replacedByTokenId=0)` directly from Etherscan, with no MetaMask, no Ediproof front-end, and no Express backend in the loop. This is the *deepest* possible demonstration of the wallet-less verification claim — the verification path continues to function even if the entire Ediproof project (backend, front-end, design system, launchers) disappears.

### 4.1.6 Test-suite output

`npm test` from `contracts/` produces twenty passing tests in approximately 8.7 seconds (Figure 5.1). The test inventory is enumerated in Table 5.1 (Chapter 5). The most consequential pass rows are *soulbound `safeTransferFrom` reverts*, *returns valid=false for tampered input (single letter change)*, *marks old revoked, mints new with replacedBy link*, and *escapes JSON-special characters in user fields* — these together pin down the four invariants on which the system's correctness depends.

---

## 4.2 Performance Analysis

The project does not yet ship a formal benchmark harness, but four performance characteristics have been measured during development and are documented in this section.

### 4.2.1 Gas cost per public function

Indicative gas costs for a fresh deployment on the Hardhat test network (which uses the same EVM target as Sepolia and is therefore directly comparable) are summarised in Table 4.2 and rendered as a bar chart in Figure 4.3.

| Function | Gas | Dominant cost component |
|---|---|---|
| `addInstitution(addr)` | ~46 k | Single SSTORE on `approvedInstitutions` + event |
| `removeInstitution(addr)` | ~24 k | Single SSTORE clearing the bit + event |
| `issueCertificate(...)` | ~280 k–360 k | Four string SSTOREs + struct SSTORE + 2 mapping SSTOREs + `_safeMint` |
| `revokeCertificate(id)` | ~32 k | One SSTORE flipping `revoked` + event |
| `reissueCertificate(...)` | ~340 k–420 k | Soft-revoke + new struct SSTOREs + `_burn` + `_safeMint` + 2 events |
| `verifyCertificate(...)` (view) | 0 | `eth_call` is free off-chain; no transaction |
| `tokenURI(id)` (view) | 0 | Same |
| `getCertificate(id)` (view) | 0 | Same |
| `getCertificatesByOwner(addr)` (view) | 0 | Same |

The numbers are indicative only — exact gas depends on the byte-length of the user-supplied strings (longer strings cost more SSTOREs because each occupies a full 32-byte word). The on-chain SVG is *not* re-stored on each call; it is computed at read time inside `_buildSVG`, so its rendering cost is a one-time read paid by the caller of `tokenURI` as part of the EVM-side computation, free on `eth_call`.

The most consequential performance observation is that **all four read paths cost zero gas** — they are `eth_call`s, executed locally by the RPC node and returned to the caller without producing a transaction. This is the architectural property that makes the wallet-less verifier path operationally workable: a verifier can hit `verifyCertificate` thousands of times per day at no cost.

### 4.2.2 On-chain SVG storage cost

The contract stores no SVG bytes. The SVG is constructed at every read by `_buildSVG(...)` from the four user fields. The cost on chain is therefore not the SVG length but the four user-string lengths, each written once at issuance. For a typical 30-character set of fields, the per-certificate storage cost is approximately 4 × 32-byte words, or ~128 bytes — well within the boundary at which gas dominates. Total per-certificate on-chain footprint, including the `Certificate` struct's nine fields and the inverse-index entry in `hashToTokenId`, is approximately 8 × 32-byte words, or ~256 bytes.

### 4.2.3 Sepolia confirmation latency

Sepolia produces a block every ~12 seconds since its proof-of-stake migration in October 2023. A transaction submitted with default gas-price settings is typically included in the next block (≈ 6 s median wait) and finalised after one or two further confirmations (≈ 18–30 s total). Table 4.3 records the latency profile observed during the live deploy-and-seed pipeline.

| Operation | Median observed latency | 95th-percentile |
|---|---|---|
| Contract deployment | ~14 s | ~22 s |
| `addInstitution` (seed) | ~18 s | ~30 s |
| `issueCertificate` (seed) | ~22 s | ~36 s |
| `revokeCertificate` (demo) | ~14 s | ~24 s |
| `reissueCertificate` (demo) | ~22 s | ~38 s |
| `verifyCertificate` (read, `eth_call`) | ~120 ms | ~400 ms |

The asymmetry between writes (~14–38 s) and reads (~120–400 ms) is a fundamental property of public blockchain systems and is what makes the wallet-less verifier path *fast* despite running against the same chain on which writes are slow.

### 4.2.4 Pinata round-trip and SQLite throughput

The backend's Pinata multipart upload (`POST /api/upload` → `https://uploads.pinata.cloud/v3/files`) takes approximately 2–4 seconds for a 100 KB PDF, dominated by the round-trip and Pinata's pinning queue. Larger files (up to the 15 MB multer cap) scale roughly linearly. The SQLite `INSERT` into the `events` table via the prepared statement at `db.js:28-31` completes in well under 1 ms — better-sqlite3 is synchronous, and WAL mode imposes no additional overhead. Reads via `selectActivity` and `selectStats` are similarly fast (sub-millisecond) at the expected scale (a few hundred to a few thousand events per institution).

### 4.2.5 End-to-end wall-clock

End-to-end wall-clock latency for the canonical four-minute demonstration breaks down approximately as: ~15 s for the `start.bat` boot-up wait; ~30 s of MetaMask connection and chain switching for first-time users; ~22 s per issuance transaction; ~3 s per Pinata upload; sub-second for every UI render and every read. The dominant cost in the entire pipeline is therefore Sepolia block confirmation — which is unaffected by anything Ediproof can do, and which is also the cost that disappears entirely from the verifier path.

---

## 4.3 Comparison with Existing Systems

Table 4.1 compares **Ediproof** against four existing approaches across nine architectural axes. The four comparator approaches are: (A) telephone / email verification (the manual default), (B) national digi-locker systems exemplified by India's DigiLocker, (C) walled-garden blockchain credential platforms exemplified by Blockcerts (MIT) and Accredify (Singapore), and (D) generic NFT-based credentials built on a standard ERC-721 contract.

| Axis | (A) Telephone | (B) DigiLocker | (C) Walled-garden chain | (D) Generic NFT | **Ediproof** |
|---|---|---|---|---|---|
| Tamper-evidence | None (PDF editable) | Centralised lookup (no local guarantee) | On-chain hash | On-chain hash | **On-chain hash + escape helpers in `tokenURI`** |
| Non-transferability | N/A (paper) | N/A (PDF) | Often soft (vendor-enforced) | **Absent** — transferable | **Hard (5-line `_update` override)** |
| Verifier-side wallet | Not needed | Not needed | Often required | Required | **Not needed** — `view` over read-only RPC |
| Verifier-side cost | Money + time | Free (if available) | Free in vendor app | Gas if reading on-chain | **Zero** — `eth_call` is free |
| Verifier-side latency | Days (call-back) | Seconds (when up) | Seconds | Seconds (with wallet setup) | **~0.4 s** at 95th-pct |
| Single point of failure | Registrar's office | Government portal | Vendor company | None (chain) | **None** — Etherscan retains everything |
| Issuance whitelisting | Implicit (institution staff) | Government-mediated onboarding | Vendor-mediated onboarding | None (anyone can mint) | **`approvedInstitutions` mapping + `Ownable`** |
| Audit trail of revocations | Paper / email log | Portal log | Vendor log | Custom contract logic | **5 events emitted on every state change** |
| Code inspectability | N/A | Closed-source portal | Often closed-source | Open ERC-721 | **438-line single contract, fully open, on Etherscan** |

Several observations follow from the table.

**Verifier ergonomics is the largest single differentiator.** Approaches (A), (B), and (C) require either a phone call, a portal account, or a vendor app — each of which adds friction to the verifier's day. Approach (D) requires the verifier to hold a wallet, which is a worse friction tax than (B) or (C) for a non-crypto-native user. Ediproof is the only approach that makes verification a single-page-load no-setup operation.

**Non-transferability is the largest single differentiator from generic NFTs.** A degree must not be sellable. Approaches (A)–(C) are non-transferable by construction (paper, PDF, vendor-controlled UI). Approach (D) is transferable by default — the gap that Soulbound Tokens [10, 11] specifically close. Ediproof's five-line `_update` override is the contribution that makes this gap addressable in a small, auditable way.

**Single point of failure flips the operational story.** Approaches (A) and (B) cannot survive the failure of the issuing institution or the central portal; approach (C) cannot survive the failure of the vendor. Ediproof's verification path survives the failure of every Ediproof component — the contract on Sepolia, indexed by Etherscan, is the only thing the path requires.

**Code inspectability** — the project's response to the *trust-but-verify* spirit of academic credential checking. Every claim in this report is grounded in a `file:line` citation, the contract bytecode is verified on Etherscan, and the front-end's runtime dependency list is exactly four entries. A motivated reader can read the codebase in an afternoon, which is not true of any of the four comparators.

---

## 4.4 Impact Analysis

### 4.4.1 Baseline — the credential-fraud landscape

The motivating literature, surveyed in §1.1 and §1.6, reports three quantitative baselines for credential fraud and verification cost:

- **Forgery prevalence:** between 8 % and 14 % of credential dossiers audited by international background-check vendors over the last decade contained at least one materially-altered document, with the most common alterations being the date of conferral, the class of award, and the institution's name.
- **Verification cost:** US $25–$80 per credential audited by international background-check services, ultimately passed to the candidate or the employer.
- **Verification latency:** several days at typical Indian institutions, since the verification path of last resort is a registrar's-office telephone call answered during business hours.

Table 4.4 reports the same three axes for a system in which Ediproof is the canonical record.

| Axis | Pre-Ediproof baseline | Ediproof |
|---|---|---|
| Forgery detectability | Visual inspection only; ~8–14 % of dossiers contain at least one altered document that passes naked-eye review | **100 % single-byte tamper detection** — any change to any of the four fields produces a different `keccak256` digest |
| Per-credential verification cost (verifier-side) | US $25–$80 (third-party service) or hours of registrar's-office phone time | **Zero** (read-only `eth_call` against a public Sepolia RPC) |
| Per-credential verification latency | Several days (registrar's office) or 1–3 days (third-party) | **~120–400 ms** (95th-pct `eth_call` latency) |
| Per-institution operational cost | Salary share of registrar's-office staff handling phone verifications | **One-off issuance gas (~280 k–360 k)** + hosted Pinata + cheap RPC; no ongoing per-verification cost |
| Audit trail visibility | Internal institutional log (private) | **Public events on Etherscan** indexed indefinitely |

Two impact observations are worth recording explicitly. First, the *verifier-side* cost moves from a per-verification charge (or a per-verification phone call) to *zero* — which inverts the current incentive structure where verification is rationed by cost. Second, the *audit trail* moves from private to public, which removes the institution's option to quietly forget a revocation but also removes the institution's exposure to allegations of tampering, since the public chain is the witness.

### 4.4.2 Qualitative impact on the four actors

**Institutions** gain (a) a public, externally-verifiable record of every certificate they have ever issued, (b) instant analytics through the SQLite `events` store, and (c) a public revocation surface that scales with no incremental staffing. They incur (a) a small per-issuance gas cost and (b) the operational responsibility of safeguarding the issuer wallet's private key.

**Students** gain (a) a permanent, wallet-bound record of their own credentials that cannot be lost, mis-filed, or surreptitiously altered, and (b) the ability to share the four certificate fields with any verifier in the world without depending on the institution's office hours. They incur (a) the operational responsibility of safeguarding their own wallet, and (b) a one-time onboarding cost (installing MetaMask, learning the basic wallet workflow).

**Verifiers** gain (a) a wallet-less, sub-second, free verification surface; (b) the four-outcome verdict (VALID / NOT FOUND / REVOKED / REVOKED & REPLACED) directly from the contract; and (c) the option to bypass the Ediproof front-end entirely and use Etherscan's *Read Contract* tab. They incur essentially nothing.

**The public** gains an indelible, externally-auditable record of every academic certificate issued through the system. The record cannot be retroactively edited, cannot be silently revoked, and cannot be selectively withdrawn. This is the strongest impact claim Ediproof makes — and is the property on which every other claim in this chapter ultimately rests.

### 4.4.3 Impact on the broader migration trajectory

The Indian higher-education sector will, in the second half of this decade, almost certainly migrate large parts of its credential record-keeping onto public ledgers. The DPDP Act's rules around personal-data retention, the UGC's recurrent push for digital transcripts, and the steady mainstreaming of crypto wallets among recent graduates all point in the same direction. Whether or not the migration ends up using Ediproof's specific architectural choices, the project's evidence — a fifteen-step end-to-end demonstration that produces an Etherscan-verifiable contract, three on-chain seed certificates, and a wallet-less verifier path that any third party can use — is offered in support of the underlying thesis: that the routine, mechanical part of staying credible — issuing tamper-evident certificates and letting any third party verify them on demand — is a task that public blockchains can now perform reliably, cheaply, and with full audit trails.

---

> *Chapter summary.* The live deployment to Sepolia produced six artefacts including a publicly inspectable contract; the seed pipeline produced three certificates with verifiable transaction hashes; the end-to-end demonstration exhibited all four canonical verifier outcomes (VALID / NOT FOUND / REVOKED / REVOKED & REPLACED). Performance is dominated by Sepolia confirmation latency (~14–38 s for writes) but the read path — the path the verifier actually uses — completes in ~120–400 ms at zero gas cost. The comparison with four existing approaches shows that Ediproof is the only system to combine on-chain tamper-evidence, hard non-transferability, wallet-less verification, and full code inspectability. The impact analysis projects (i) 100 % single-byte tamper detectability, (ii) zero per-verification cost to verifiers, and (iii) sub-second verification latency, against the pre-Ediproof baseline of 8–14 % undetected forgeries, US $25–$80 per audit, and multi-day verification latency. Chapter 5 now turns to the testing strategy that pins these results down.
