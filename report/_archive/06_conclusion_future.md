# Chapter 5 — Conclusion and Future Scope

> *Chapter overview.* This concluding chapter recapitulates the work undertaken in the project, lists the distinctive technical contributions that the **Ediproof** DApp makes over the existing landscape of credential-verification tools, acknowledges the limitations that remain at the time of submission, and lays out a structured agenda for future extension. A short closing section places the project in the broader context of self-sovereign identity and the ongoing migration of academic record-keeping onto public blockchains.

---

## 5.1 Summary of Work Done

The project set out to address the operational bottleneck that sits at the centre of every credential-verification interaction: the unavailability of a public, queryable, tamper-evident index of academic records that any third party can consult without bilateral integration with the issuing institution. Eight numbered objectives were defined at the start of the project (§1.3 of Chapter 1) and each has been delivered by an identifiable code module, listed once more in compact form below for convenience.

| # | Objective | Module that delivers it |
|---|---|---|
| 1 | Mint certificate as soulbound ERC-721 with on-chain hash | `EdiproofCertificate.sol:85-114` (issuance) + `:399-406` (hash) |
| 2 | Block transfers via `_update` override | `EdiproofCertificate.sol:410-420` |
| 3 | Wallet-less hash-based verification | `EdiproofCertificate.sol:182-208` + `frontend/src/hooks/useContract.ts:17-20` |
| 4 | Owner-controlled institution whitelist | `EdiproofCertificate.sol:71-79` + modifier `:57-60` |
| 5 | Burn-and-remint reissue with audit trail | `EdiproofCertificate.sol:126-176` |
| 6 | Fully on-chain `tokenURI` (JSON + SVG) | `EdiproofCertificate.sol:243-290` + `_buildSVG` `:292-327` |
| 7 | Pinata proxy + SQLite analytics backend | `backend/src/{routes,pinata,db}.js` |
| 8 | Three-page Next.js front-end with EIP-6963 wallet picker | `frontend/src/app/{issue,verify,my-leaves}/page.tsx` + `lib/wallet.ts` |

The cross-cutting goal — *to be installable and runnable on a fresh Windows or Unix machine with one double-click* — has been delivered through `start.bat` / `start.sh`, which detect Node, install both backend and front-end dependencies, warn on missing `.env` files, launch the two servers, and open the browser at `http://localhost:3000`.

The system has been validated end-to-end on the Ethereum Sepolia testnet. The deployed contract at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` (deploy transaction `0xfaa818b…2b09ceb6`, recorded `2026-04-19T06:38:37Z`) is publicly inspectable on Etherscan and is callable by any reader of this report through the *Read Contract* tab without any wallet, any front-end, or any back-end in the loop. The full unit-test suite (20 tests across 9 `describe` blocks) executes in approximately 8.7 seconds with zero failures. The deploy-and-seed integration pipeline produces three Etherscan-visible certificate-issuance transactions in approximately 90 seconds.

The implementation totals approximately 1500 lines of Solidity, JavaScript, and TypeScript across four sub-projects (`contracts/`, `backend/`, `frontend/`, `design/`). All Node dependencies install with `npm install` from each sub-project root; the Solidity dependencies are managed transitively by Hardhat. The codebase has been developed primarily on Windows 11; no Windows-only paths exist in the source aside from the Windows-specific `start.bat`, which has a Unix counterpart `start.sh`.

---

## 5.2 Key Contributions

The following seven contributions are distinctive enough to be worth highlighting on their own.

**(C1) An end-to-end wallet-less verification path.** The combination of (a) a `view`-only `verifyCertificate(...)` function on the contract, (b) ethers' read-only `JsonRpcProvider` against a public Alchemy RPC, and (c) a Next.js page that *deliberately omits* the WalletGate, gives any third party — most importantly, a non-crypto-native HR coordinator — a one-page, one-click verification path with no wallet, no signature, no gas. This is the project's headline architectural feature and is what makes Ediproof operationally appropriate for the credential-verification use case.

**(C2) Five-line soulbound enforcement.** The `_update` override at `EdiproofCertificate.sol:410-420` is the entirety of the soulbound contract — five lines including the closing brace. Because OpenZeppelin's ERC-721 funnels every transfer-shaped operation through `_update`, this single check defends against every transfer surface, including future ERC-721 extensions that may be added by OZ. The minimalism is its own contribution: a soulbound implementation that is small enough to be audited at a glance.

**(C3) Burn-and-remint reissue with audit trail.** `reissueCertificate(...)` at `EdiproofCertificate.sol:126-176` *physically* burns the old token while *retaining* the old struct, the old hash mapping, and a `replacedBy[old] = new` lineage pointer. A verifier presenting an out-of-date hash receives a useful answer ("revoked, replaced by token N") rather than a confusing "not found", *and* the student's wallet shows only the corrected certificate. The two tests at `test/EdiproofCertificate.test.ts:286-350` lock both halves of this contract in.

**(C4) Fully on-chain metadata.** `tokenURI(...)` at `EdiproofCertificate.sol:243-290` returns a `data:application/json;base64,...` URI whose `image` field is itself a `data:image/svg+xml;base64,...` URI, with the SVG synthesised on each call from contract storage by `_buildSVG` at `:292-327`. No off-chain metadata pin is required — the certificate is renderable in any ERC-721-aware wallet (MetaMask, Rainbow, OpenSea-Sepolia) without any further infrastructure. The JSON and SVG escape helpers at `:343-393` defend against malicious payloads in user-supplied fields.

**(C5) Server-side Pinata JWT.** The Pinata JWT is read from `process.env.PINATA_JWT` at `backend/src/pinata.js:9` and is *only* attached to the outbound `Authorization: Bearer …` header at line 22. It is never returned in any response, never logged, and never exposed through any of the six routes. The threat of a malicious frontend extracting the JWT through a backend response is architecturally precluded.

**(C6) EIP-6963 wallet-injection fix.** The `frontend/src/lib/wallet.ts` module implements EIP-6963 multi-injected-provider-discovery to defeat the OKX/MetaMask `window.ethereum`-overwrite race that was the root cause of a user-reported bug. The implementation listens for `eip6963:announceProvider` events, dispatches a `eip6963:requestProvider` event to invite all installed wallets to announce themselves, and selects the announcement whose `info.rdns === 'io.metamask'` (`:50`). The fix is small (73 lines including types) but is what makes Ediproof reliably usable on a multi-wallet machine.

**(C7) Archival design language.** The design system (`design/styles.css`, reused as React components in the Next.js front-end) eschews the standard *web3 + dark mode + neon accents* aesthetic in favour of a deliberately *archival* visual language — parchment cream, oxblood, ink black, brass borders, italic small caps, monospace hashes — that mirrors the institutional gravity of a paper degree certificate. This is a UX contribution rather than a technical one, but it materially improves the system's *perceived* trustworthiness to non-crypto-native users (the 90 % of credential verifiers who will never own a wallet).

---

## 5.3 Limitations

The system in its current form has the following limitations that an external auditor or reviewer should be aware of.

**(L1) Sepolia testnet only.** The deployment target is Sepolia. No mainnet contract has been deployed, and the contract has not been audited against the gas-cost expectations of mainnet usage. The `README.md:104-106` explicitly lists mainnet deployment, gas optimisation, and upgradeability proxies as out-of-scope for this 3-day demonstration build.

**(L2) Single-issuer institution model.** Each `Institution` in the contract is a single EOA; there is no on-chain support for multi-signature institution administration or for revoking a compromised institution wallet without owner intervention. A real institution would typically operate with a `Safe` (Gnosis multisig) for issuance authority — adding such support is listed in §5.4 below.

**(L3) No subgraph indexer.** Verifiers and analytics consumers query the contract directly via `eth_call`. For institutions issuing thousands of certificates, the absence of a The Graph subgraph means that listing operations (e.g. *"all certificates issued by MIT in 2025"*) require enumerating every token, which is `O(n)` and slow. A subgraph that indexes the five contract events would close this gap.

**(L4) Pinata as the only IPFS pinning service.** The backend's `uploadToPinata` helper is hard-coded against the Pinata V3 endpoint. A more robust deployment would support multiple pinning services (Pinata + Infura + a self-hosted IPFS node) for redundancy against any single provider's downtime or pricing change.

**(L5) Front-end exercised manually.** There is no Playwright / Cypress / WebdriverIO test suite for the front-end. The fifteen-step manual demonstration (Table 4.2 in Chapter 4) is the closest the project comes to a regression suite for the integrated UI. Adding a headless smoke test that drives the `/issue → /verify → /my-leaves` flow is the highest-priority future-work item.

**(L6) No mobile wallet support.** The wallet integration assumes a desktop browser with MetaMask installed. Mobile wallets that connect via WalletConnect (Trust, Rainbow, MetaMask Mobile) would require an additional integration layer.

**(L7) Pinata JWT is single-tenant.** A single backend deployment serves all institutions, and they all share the same Pinata JWT (and therefore the same Pinata billing account). For a multi-institution production deployment, the backend would need a per-institution credential map.

**(L8) `CLAUDE.md` is partly stale.** The `CLAUDE.md` file at the repository root contains a sentence indicating that the front-end is *"not yet scaffolded"*, which has been false since commit `09449f3`. The `CLAUDE.md` file is consumed by automated tooling but does not affect the running system; it is a documentation freshness gap rather than a functional defect, listed here for completeness.

---

## 5.4 Future Scope

Ten concrete extensions, ordered roughly by difficulty, define the agenda for the next phase of work.

### 5.4.1 Mainnet deployment with a gas-optimised contract variant

The single most consequential extension is deploying to Ethereum mainnet (or to an L2 such as Base, Optimism, or Arbitrum). The current contract's per-issuance gas cost is dominated by string SSTOREs; an optimised variant could store hashes of the strings rather than the strings themselves, with the original strings reconstructed from off-chain IPFS storage at read time. This would reduce per-issuance gas by approximately 70 % at the cost of slightly more complex verification logic. Coupled with deployment to an L2 (where gas costs are an order of magnitude lower again), the per-certificate cost could fall to a few cents — workable for institutional production use.

### 5.4.2 Multi-signature institution administration via Safe

Replace the single-EOA `Institution` model with a `Safe`-compatible interface so that an institution can mandate `M-of-N` co-signers for issuance. This is operationally important for real institutions, where no single registrar should hold unilateral issuance authority. The implementation would replace the `onlyApprovedInstitution` modifier with a check against `IERC1271.isValidSignature(...)` so any signature scheme (ECDSA, EIP-1271 contract signatures) can be used.

### 5.4.3 Subgraph indexer through The Graph

Author a subgraph that indexes the five contract events (`InstitutionAdded`, `InstitutionRemoved`, `CertificateIssued`, `CertificateRevoked`, `CertificateReissued`) and exposes a GraphQL endpoint. The front-end's analytics paths (`ActivityStrip`, the institution dashboard at `GET /api/institution/:address`) could then query the subgraph directly, eliminating the SQLite analytics backend entirely.

### 5.4.4 W3C Verifiable Credentials export

The W3C Verifiable Credentials specification [30] defines a portable JSON-LD format for verifiable claims. Adding an export step that wraps each Ediproof certificate as a VC with the on-chain hash as the `credentialStatus` would let Ediproof certificates be carried into systems that already speak VC (notably national identity wallets in the EU's eIDAS 2.0 framework).

### 5.4.5 ENS-aware verification

The verifier currently identifies students by 0x-prefixed wallet address. Adding an ENS reverse-resolution step (`ensProvider.lookupAddress(addr)`) would let the verifier UI display *"Aarav Sharma — held by aarav.eth"* instead of the truncated hex. This is a small change with disproportionate UX impact.

### 5.4.6 WalletConnect for mobile wallets

The current wallet integration assumes a desktop browser with MetaMask installed. Adding WalletConnect v2 support would let mobile wallets (Trust, Rainbow, Coinbase Wallet, MetaMask Mobile) participate in issuance and student-portfolio flows. The verifier path is unaffected because it does not need a wallet.

### 5.4.7 Zero-knowledge revocation proofs

A privacy-preserving extension: rather than publishing every revocation as a public event, batch revocations into a Merkle tree and publish only the tree root. A revoked student would receive a Merkle inclusion proof. The verifier could then check *"is this certificate revoked?"* without learning *which* other certificates have been revoked. This is significantly more complex than the other items on this list but is the natural endpoint for a privacy-conscious credential-verification system.

### 5.4.8 EIP-712 delegated batch issuance

For graduating cohorts (potentially thousands of certificates issued in one ceremony), batch issuance via an EIP-712-signed message would let the institution sign one message authorising N issuances and have a delegated relayer submit the N transactions. This shifts the gas burden away from the institution and lets the relayer batch-submit during off-peak hours.

### 5.4.9 Additional certificate types via struct extension

The `Certificate` struct's nine fields are appropriate for degrees but limit other credential types (course completions, attendance, professional certifications). A future extension could parameterise the struct with an extensible `bytes` payload or a registered `templateId` so that the contract supports arbitrary credential schemas without redeployment.

### 5.4.10 CI/CD and Playwright smoke tests

The lowest-cost-highest-value engineering item is a GitHub Actions pipeline that runs `npm test` on every PR (currently this happens locally only) and a Playwright smoke test that drives the full UI flow against a Hardhat-localhost contract. Together they would catch ~90 % of regressions before they reach Sepolia. This is the most concrete and tractable item on the list and should be the *first* thing implemented after the current submission.

---

## 5.5 Closing Remarks

The project deliberately positions itself as a *demonstration* of a working architecture rather than as a production platform. The 3-day development window (17–19 April 2026) was not a deadline to compromise quality against — it was a constraint that forced every architectural decision to be small, conservative, and easy to reason about. The contract is one Solidity file. The backend is four JavaScript files. The front-end's runtime dependency list is four entries. The deployment target is one testnet. The wallet is one extension. None of these constraints are accidents; they are choices that keep the cost of *understanding* the system bounded and the cost of *extending* it (per §5.4) tractable.

Academic credentials are an unusually clean fit for blockchain verification. Unlike financial transactions, where the value of the asset depends on its transferability, a degree's value depends on its *non*-transferability. Unlike most token use-cases, where the issuer's identity is opaque, an institution's identity is the central thing the verifier wants to confirm. Unlike NFT art, where the token's uniqueness is its point, a degree's uniqueness is incidental — what matters is that *this person* received *this degree* on *this date* from *this institution*. ERC-721 + soulbound + on-chain hash is the minimal architecture that delivers exactly these properties — no more, no less — and Ediproof is its embodiment.

The Indian higher-education sector will, in the second half of this decade, almost certainly migrate large parts of its credential record-keeping onto public ledgers. The DPDP Act's rules around personal-data retention, the UGC's recurrent push for digital transcripts, and the steady mainstreaming of crypto wallets among recent graduates all point in the same direction. Whether or not the migration ends up using Ediproof's specific architectural choices, the project's evidence — a fifteen-step end-to-end demonstration that produces an Etherscan-verifiable contract, three on-chain seed certificates, and a wallet-less verifier path that any third party can use — is offered in support of the underlying thesis: that the routine, mechanical part of staying credible — issuing tamper-evident certificates and letting any third party verify them on demand — is a task that public blockchains can now perform reliably, cheaply, and with full audit trails.

I am grateful for the opportunity to have undertaken this work, and I look forward to the questions of the external examiner.

---

> *Chapter summary.* The project has delivered a complete end-to-end DApp that issues academic certificates as soulbound ERC-721 tokens on the Ethereum Sepolia testnet, validated by a live deployment whose address is publicly inspectable on Etherscan. Seven distinctive technical contributions have been highlighted; eight current limitations have been acknowledged; and ten concrete future-work items have been laid out, ordered by difficulty. The next chapter lists the full bibliography in IEEE numeric style, with stable identifiers (EIPs, DOIs, RFCs, and official documentation URLs) supplied wherever available so that every claim made in this report can be independently verified.
