# Chapter 6 — Advantages and Limitations

> *Chapter overview.* This chapter takes stock of the system in its current form: the seven distinctive advantages that distinguish **Ediproof** from the existing landscape (§6.1), the eight current limitations that an external auditor or reviewer should be aware of (§6.2), and the engineering challenges encountered during the build with the fixes that resolved them (§6.3). The advantages are written so they map directly onto the comparison table in §4.3 of Chapter 4; the limitations are written so they map directly onto the future-work agenda in §7.3 of Chapter 7.

---

## 6.1 Advantages

### 6.1.1 An end-to-end wallet-less verification path

The combination of (a) a `view`-only `verifyCertificate(...)` function on the contract, (b) ethers' read-only `JsonRpcProvider` against a public Alchemy RPC, and (c) a Next.js page that *deliberately omits* the WalletGate, gives any third party — most importantly, a non-crypto-native HR coordinator — a one-page, one-click verification path with no wallet, no signature, no gas. This is the project's headline architectural feature and is what makes Ediproof operationally appropriate for the credential-verification use case. The verifier's median response latency is ~120 ms, the 95th-pct latency is ~400 ms, and the verifier's per-call cost is *zero*.

### 6.1.2 Five-line soulbound enforcement

The `_update` override at `EdiproofCertificate.sol:410-420` is the entirety of the soulbound contract — five lines including the closing brace. Because OpenZeppelin's ERC-721 funnels every transfer-shaped operation through `_update`, this single check defends against every transfer surface, including future ERC-721 extensions that may be added by OpenZeppelin. The minimalism is its own advantage: a soulbound implementation small enough to be audited at a glance, with no chance of a per-function gating bug going unnoticed.

### 6.1.3 Burn-and-remint reissue with audit trail

`reissueCertificate(...)` at `EdiproofCertificate.sol:126-176` *physically* burns the old token while *retaining* the old struct, the old hash mapping, and a `replacedBy[old] = new` lineage pointer. A verifier presenting an out-of-date hash receives a useful answer ("revoked, replaced by token N") rather than a confusing "not found", *and* the student's wallet shows only the corrected certificate. The two tests at `test/EdiproofCertificate.test.ts:286-350` lock both halves of this contract in.

### 6.1.4 Fully on-chain metadata

`tokenURI(...)` at `EdiproofCertificate.sol:243-290` returns a `data:application/json;base64,...` URI whose `image` field is itself a `data:image/svg+xml;base64,...` URI, with the SVG synthesised on each call from contract storage by `_buildSVG` at `:292-327`. No off-chain metadata pin is required — the certificate is renderable in any ERC-721-aware wallet (MetaMask, Rainbow, OpenSea-Sepolia) without any further infrastructure. The JSON and SVG escape helpers at `:343-393` defend against malicious payloads in user-supplied fields. The advantage over a typical NFT design (which stores metadata at an off-chain URL) is that the certificate's display survives the loss of any off-chain pinning service, indefinitely.

### 6.1.5 Server-side Pinata JWT and OWASP coverage

The Pinata JWT is read from `process.env.PINATA_JWT` at `backend/src/pinata.js:9` and is *only* attached to the outbound `Authorization: Bearer …` header at line 22. It is never returned in any response, never logged, and never exposed through any of the six routes. The threat of a malicious frontend extracting the JWT through a backend response is architecturally precluded.

The system's defences map onto the OWASP Top 10 (2021) in Table 6.1.

| OWASP risk | Defence in Ediproof |
|---|---|
| A01: Broken Access Control | Institution whitelist + `Ownable` + per-token `issuer` check on revoke/reissue |
| A02: Cryptographic Failures | `keccak256` anchor for tamper-detection; JWT kept server-side |
| A03: Injection | Prepared statements throughout; JSON/XML escape helpers in `tokenURI` |
| A07: Identification & Authentication Failures | Wallet-based authentication via EIP-1193 + EIP-6963 |
| A08: Software & Data Integrity Failures | OpenZeppelin v5 audited base; pinned solc 0.8.28 + cancun + viaIR |
| A09: Security Logging & Monitoring | All state changes emit events; backend logs them into a queryable WAL-mode SQLite |

The OWASP risks A04 (Insecure Design), A05 (Security Misconfiguration), A06 (Vulnerable & Outdated Components), and A10 (SSRF) are addressed by the architecture itself: the contract is small, audited, and pinned; the backend has minimal attack surface; the front-end issues only outbound calls to two known endpoints (Alchemy and the local backend).

### 6.1.6 EIP-6963 wallet-injection fix

`frontend/src/lib/wallet.ts` implements EIP-6963 multi-injected-provider-discovery to defeat the OKX/MetaMask `window.ethereum`-overwrite race that was the root cause of a user-reported bug. The implementation listens for `eip6963:announceProvider` events, dispatches a `eip6963:requestProvider` event to invite all installed wallets to announce themselves, and selects the announcement whose `info.rdns === 'io.metamask'`. The fix is small (73 lines including types) but is what makes Ediproof reliably usable on a multi-wallet machine. The detailed challenge story is in §6.3.

### 6.1.7 Archival design language

The design system (`design/styles.css`, reused as React components in the Next.js front-end) eschews the standard *web3 + dark mode + neon accents* aesthetic in favour of a deliberately *archival* visual language — parchment cream, oxblood, ink black, brass borders, italic small caps, monospace hashes — that mirrors the institutional gravity of a paper degree certificate. This is a UX advantage rather than a technical one, but it materially improves the system's *perceived* trustworthiness to non-crypto-native users (the 90 % of credential verifiers who will never own a wallet).

---

## 6.2 Limitations

The system in its current form has the following limitations that an external auditor or reviewer should be aware of.

### 6.2.1 (L1) Sepolia testnet only

The deployment target is Sepolia. No mainnet contract has been deployed, and the contract has not been audited against the gas-cost expectations of mainnet usage. The `README.md:104-106` explicitly lists mainnet deployment, gas optimisation, and upgradeability proxies as out-of-scope for this focused demonstration build.

### 6.2.2 (L2) Single-issuer institution model

Each `Institution` in the contract is a single EOA; there is no on-chain support for multi-signature institution administration or for revoking a compromised institution wallet without owner intervention. A real institution would typically operate with a `Safe` (Gnosis multisig) for issuance authority — adding such support is listed in §7.3 below.

### 6.2.3 (L3) No subgraph indexer

Verifiers and analytics consumers query the contract directly via `eth_call`. For institutions issuing thousands of certificates, the absence of a The Graph subgraph means that listing operations (e.g. *"all certificates issued by MIT in 2025"*) require enumerating every token, which is `O(n)` and slow. A subgraph that indexes the five contract events would close this gap.

### 6.2.4 (L4) Pinata as the only IPFS pinning service

The backend's `uploadToPinata` helper is hard-coded against the Pinata V3 endpoint. A more robust deployment would support multiple pinning services (Pinata + Infura + a self-hosted IPFS node) for redundancy against any single provider's downtime or pricing change.

### 6.2.5 (L5) Front-end exercised manually

There is no Playwright / Cypress / WebdriverIO test suite for the front-end. The fifteen-step manual demonstration (Table 5.2) is the closest the project comes to a regression suite for the integrated UI. Adding a headless smoke test that drives the `/issue → /verify → /my-leaves` flow is the highest-priority future-work item.

### 6.2.6 (L6) No mobile wallet support

The wallet integration assumes a desktop browser with MetaMask installed. Mobile wallets that connect via WalletConnect (Trust, Rainbow, MetaMask Mobile) would require an additional integration layer. The verifier path is unaffected because it does not need a wallet.

### 6.2.7 (L7) Pinata JWT is single-tenant

A single backend deployment serves all institutions, and they all share the same Pinata JWT (and therefore the same Pinata billing account). For a multi-institution production deployment, the backend would need a per-institution credential map.

### 6.2.8 (L8) `CLAUDE.md` is partly stale

The `CLAUDE.md` file at the repository root contains a sentence indicating that the front-end is *"not yet scaffolded"*, which has been false since commit `09449f3`. The `CLAUDE.md` file is consumed by automated tooling but does not affect the running system; it is a documentation freshness gap rather than a functional defect, listed here for completeness.

---

## 6.3 Challenges Faced

The git log records seven distinct engineering challenges encountered during the three-day build. Each is summarised in Table 6.2 with its observed symptom and the commit that resolved it.

| # | Challenge | Symptom | Resolution commit |
|---|---|---|---|
| C1 | OpenZeppelin v5 + Solidity 0.8.28 fails to compile | `hardhat compile` errored with EVM-target mismatch | `86c3aa8` — set `evmVersion: cancun` and `viaIR: true` |
| C2 | Etherscan v1 endpoint deprecated mid-project | `hardhat verify --network sepolia` returned 410 | `c335550` — Etherscan v2 customChains in `hardhat.config.ts` |
| C3 | Past-tense vs present-tense `kind` field divergence | Front-end wrote `issue`, backend stats expected `issued` | `ec9c904` — canonicalise to past-tense across both tiers |
| C4 | OKX wallet hijacks `window.ethereum` from MetaMask | Issuance transaction sent to wrong wallet | `8fe44f9` — EIP-6963 multi-injected-provider-discovery |
| C5 | Pinata upload errors swallowed by generic 500 handler | User saw "internal server error" with no detail | `76a851d` — surface upstream status + body verbatim |
| C6 | `start.bat` fails on paths with spaces (e.g. `Desktop\Ediproof`) | Windows error: *"the system cannot find the path specified"* | `f0e0d78` → `3970843` → `7ff8979` — final fix uses `start /D "<path>"` |
| C7 | Credentials draft accidentally committed | `git diff HEAD~1` showed a JWT in plaintext | `db89d46` — add `.env*` to `.gitignore`; rotate the leaked token |

### 6.3.1 (C1) OZ v5 + 0.8.28 compilation

The first cut of `EdiproofCertificate.sol` imported OpenZeppelin v5 contracts and pinned Solidity to 0.8.28 (the latest stable at the time). `npx hardhat compile` failed with a stack-too-deep error inside OZ's `ERC721Enumerable`. The diagnosis was that OZ v5 internally uses features whose IR codegen requires `viaIR: true`, and the EVM target needs to be `cancun` (the post-Dencun fork target) for the combination to compile cleanly. The fix was a four-line addition to `hardhat.config.ts` (`evmVersion: "cancun"`, `viaIR: true`) and the test suite passed on the first re-run. Resolution: commit `86c3aa8`.

### 6.3.2 (C2) Etherscan v2 migration

Mid-project, the Etherscan v1 contract-verification API endpoint that Hardhat's verification plugin had used by default since 2020 began returning HTTP 410 responses — Etherscan had migrated to a v2 endpoint structure that takes the chainId as a query parameter rather than as a hostname. The fix was a `customChains` block in `hardhat.config.ts:30-42` overriding the default Etherscan URL pair to `https://api.etherscan.io/v2/api?chainid=11155111` and `https://sepolia.etherscan.io`. Resolution: commit `c335550`.

### 6.3.3 (C3) `kind` field tense alignment

The backend's `events` table held a `kind` column whose values were originally `issue` / `revoke` / `reissue` / `verified` (mixed tenses). The front-end wrote past-tense `issued` / `revoked` / `reissued` / `verified` consistently. The mismatch surfaced when the institution-dashboard's *"total issued"* count was always zero despite visible activity. The fix was to canonicalise to past tense across both tiers — the prepared statements at `db.js:32-44` and the front-end's `logEvent(...)` calls were updated together. Resolution: commit `ec9c904`.

### 6.3.4 (C4) The EIP-6963 OKX/MetaMask wallet hijack

This was the most subtle bug encountered during the build. The user-reported symptom was *"the issuance transaction goes to the OKX wallet even though I selected MetaMask"*. The root cause was that on multi-wallet machines, every wallet extension races to inject itself into `window.ethereum`, and OKX in particular has been observed to overwrite the slot *after* MetaMask. Code that read `window.ethereum.isMetaMask` therefore returned `true` (because OKX set the field) but the provider was OKX's, not MetaMask's.

The fix was to switch from the global-slot pattern to the EIP-6963 multi-injected-provider-discovery protocol. Each wallet announces itself separately on the `eip6963:announceProvider` window event with a `{ info: { uuid, name, icon, rdns }, provider }` detail. The application listens for these announcements, dispatches `eip6963:requestProvider` to invite all installed wallets to announce themselves, and then selects the announcement whose `info.rdns === 'io.metamask'`. The implementation is 73 lines including types (`frontend/src/lib/wallet.ts`) and the test that locks it in is the *"system test step 3"* of Table 5.2 (the connection on a machine with both OKX and MetaMask installed). Resolution: commit `8fe44f9`.

### 6.3.5 (C5) Pinata error surfacing

Initial code in `backend/src/routes.js` caught Pinata-side failures with a bare `try`/`catch` that returned `500 { error: "internal server error" }`. The user-facing symptom was a generic toast with no actionable information. The fix was to (a) re-throw the upstream error from `pinata.js:26-35` with the Pinata status code and body included in the message, and (b) let the global error handler surface that message verbatim. The user now sees, for instance, *"Pinata 401: invalid JWT"* — actionable. Resolution: commit `76a851d`.

### 6.3.6 (C6) `start.bat` reliability on Windows

Three separate fixes were needed before `start.bat` ran reliably on a fresh Windows installation. The first fix (`f0e0d78`) addressed the case where the repository sat at a path containing spaces (`C:\Users\777kr\Desktop\Ediproof` is fine, but `C:\My Projects\Ediproof` was not, because the `cd` invocation inside the script was unquoted). The second fix (`3970843`) addressed line-ending normalisation: a `.bat` file with LF-only endings produced *"unexpected token"* errors on cmd.exe; the fix was `git add --renormalize` after the appropriate `.gitattributes` line. The third fix (`7ff8979`) replaced the brittle `cd /d <path> && command` pattern with `start /D "<path>" command`, which lets cmd.exe handle path quoting itself. Resolution: commits `f0e0d78`, `3970843`, `7ff8979`.

### 6.3.7 (C7) Credentials-draft secret leak

A credentials draft (intended as a sketch of `backend/.env`) was accidentally committed with a real Pinata JWT in plaintext. The leak was caught by a routine `git diff HEAD~1` review before pushing. The fix was three steps: (a) `git reset` to remove the leaked content from the working tree, (b) add `.env*` to the repository's `.gitignore` so the pattern could not recur, and (c) rotate the JWT in the Pinata dashboard so the leaked one was no longer valid. The rotation is the operational lesson: a JWT in a draft commit must be assumed compromised even if the commit is reverted before pushing. Resolution: commit `db89d46`.

### 6.3.8 Lessons captured

Three patterns recur across the seven challenges. **Pin every external API surface.** Etherscan, MetaMask, OZ, and Solidity all moved during the build; pinning the version, the EVM target, and the explicit endpoint URL each prevented at least one further incident. **Surface upstream errors verbatim.** Generic 500s waste both the operator's and the user's time; the four-line cost of including the upstream status code and body pays for itself the first time a Pinata failure mode changes. **Trust nothing about `window.ethereum`.** The global-slot pattern was the canonical way to interact with web3 wallets for years; EIP-6963 is a clean replacement, but the institution that runs Ediproof in production should expect at least one further round of churn at this layer over the next twelve months.

---

> *Chapter summary.* Seven distinctive technical advantages (wallet-less verification, five-line soulbound enforcement, burn-and-remint reissue, on-chain metadata, server-side JWT, EIP-6963 fix, archival design language) distinguish Ediproof from the existing landscape. Eight current limitations (Sepolia-only, single-EOA institutions, no subgraph, Pinata-only, manual front-end testing, no mobile wallets, single-tenant JWT, stale `CLAUDE.md`) are acknowledged for the external auditor and map directly onto the future-work items of §7.3. Seven engineering challenges encountered during the three-day build (OZ v5 compilation, Etherscan v2 migration, kind-field tense alignment, OKX wallet hijack, Pinata error surfacing, `start.bat` reliability, credentials leak) have been documented with their symptoms and the commits that resolved them. Chapter 7 now closes the report with the conclusion, the key findings, and the future-scope agenda.
