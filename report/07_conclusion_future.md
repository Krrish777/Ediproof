# Chapter 7 — Conclusion and Future Scope

> *Chapter overview.* This concluding chapter recapitulates the work undertaken in the project (§7.1), distils the project's key findings — the small set of empirical claims an examiner can evaluate quickly (§7.2) — and lays out a structured ten-item agenda for future extension (§7.3). A short closing note places the project in the broader context of self-sovereign identity and the ongoing migration of academic record-keeping onto public blockchains.

---

## 7.1 Conclusion

The project set out to address the operational bottleneck that sits at the centre of every credential-verification interaction: the unavailability of a public, queryable, tamper-evident index of academic records that any third party can consult without bilateral integration with the issuing institution. Eight numbered objectives were defined at the start of the project (§1.3 of Chapter 1) and each has been delivered by an identifiable code module, summarised in compact form below.

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

The cross-cutting goal — *to be installable and runnable on a fresh Windows or Unix machine with one double-click* — has been delivered through `start.bat` / `start.sh`. The system has been validated end-to-end on the Ethereum Sepolia testnet. The deployed contract at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5` (deploy transaction `0xfaa818b…2b09ceb6`, recorded `2026-04-19T06:38:37Z`) is publicly inspectable on Etherscan and is callable by any reader of this report through the *Read Contract* tab without any wallet, any front-end, or any back-end in the loop.

The project deliberately positions itself as a *demonstration* of a working architecture rather than as a production platform. The focused-build window was not a deadline to compromise quality against — it was a constraint that forced every architectural decision to be small, conservative, and easy to reason about. The contract is one Solidity file. The backend is four JavaScript files. The front-end's runtime dependency list is four entries. The deployment target is one testnet. The wallet is one extension. None of these constraints are accidents; they are choices that keep the cost of *understanding* the system bounded and the cost of *extending* it tractable.

Academic credentials are an unusually clean fit for blockchain verification. Unlike financial transactions, where the value of the asset depends on its transferability, a degree's value depends on its *non*-transferability. Unlike most token use-cases, where the issuer's identity is opaque, an institution's identity is the central thing the verifier wants to confirm. Unlike NFT art, where the token's uniqueness is its point, a degree's uniqueness is incidental — what matters is that *this person* received *this degree* on *this date* from *this institution*. ERC-721 + soulbound + on-chain hash is the minimal architecture that delivers exactly these properties, and Ediproof is its embodiment.

---

## 7.2 Key Findings

The project's experimental basis can be condensed into five empirical findings that an examiner can evaluate independently in under five minutes.

**(F1) The contract is independently re-verifiable on Etherscan.** Following https://sepolia.etherscan.io/address/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5 and clicking *Read Contract* exposes every public function of the contract, including `verifyCertificate`. Submitting any of the seed certificate's four fields — for instance `studentName="Aarav Sharma"`, `courseName="B.Tech Computer Science"`, `institution="MIT"`, `ipfsURI="ipfs://bafybeigdyrztseedcert1aarav"` — returns `(valid=true, tokenId=1, ownerAddr=0xe3F2…F94c6d, revoked=false, replacedByTokenId=0)` directly from Etherscan, with no MetaMask, no Ediproof front-end, and no backend in the loop. Tampering any single character of any field flips the result to `(valid=false, tokenId=0, ...)`.

**(F2) The unit-test suite passes deterministically in ~8.7 s.** `npm test` from `contracts/` executes twenty test cases across nine `describe` blocks with zero failures and zero skips. The four most consequential rows — *soulbound `safeTransferFrom` reverts*, *returns valid=false for tampered input*, *marks old revoked, mints new with replacedBy link*, and *escapes JSON-special characters in user fields* — together pin down the four invariants on which the system's correctness depends.

**(F3) Single-byte tampering of any of the four fields produces a different `keccak256` digest with overwhelming probability.** This is the central security property of the verification path, exercised by `test/EdiproofCertificate.test.ts:241-260` against a one-character transposition (`Jhon Doe` vs `John Doe`) and observable on the live deployment via the verifier UI.

**(F4) The wallet-less verifier path completes in ~120–400 ms at zero gas cost.** The `verifyCertificate` function is a `view` function, executed locally by the RPC node and returned to the caller without producing a transaction. A verifier can issue thousands of verifications per day without holding cryptocurrency, without installing a wallet, and without any agreement with the issuing institution.

**(F5) The reissuance burn-and-remint flow leaves a deterministic audit trail.** A verifier presenting an old hash after a reissue receives the deterministic answer *"revoked, replaced by token N"* rather than a confusing *"not found"*. The two tests at `test/EdiproofCertificate.test.ts:286-350` lock both halves of this contract in: that the old token is *physically* burned (`ownerOf(oldId)` reverts with `ERC721NonexistentToken`), and that nonetheless the old struct, the old hash mapping, and the `replacedBy` lineage pointer remain readable.

These five findings together constitute the project's evidentiary basis. Every one of them is grounded either in code that an examiner can read or in on-chain state that an examiner can independently re-verify.

---

## 7.3 Future Scope

Ten concrete extensions, ordered roughly by difficulty, define the agenda for the next phase of work.

**(FS1) Mainnet deployment with a gas-optimised contract variant.** The single most consequential extension is deploying to Ethereum mainnet (or to an L2 such as Base, Optimism, or Arbitrum). The current contract's per-issuance gas cost is dominated by string SSTOREs; an optimised variant could store hashes of the strings rather than the strings themselves, with the original strings reconstructed from off-chain IPFS storage at read time. Coupled with deployment to an L2 (where gas costs are an order of magnitude lower), the per-certificate cost could fall to a few cents.

**(FS2) Multi-signature institution administration via Safe.** Replace the single-EOA `Institution` model with a `Safe`-compatible interface so that an institution can mandate `M-of-N` co-signers for issuance. The implementation would replace the `onlyApprovedInstitution` modifier with a check against `IERC1271.isValidSignature(...)` so any signature scheme (ECDSA, EIP-1271 contract signatures) can be used.

**(FS3) Subgraph indexer through The Graph.** Author a subgraph that indexes the five contract events (`InstitutionAdded`, `InstitutionRemoved`, `CertificateIssued`, `CertificateRevoked`, `CertificateReissued`) and exposes a GraphQL endpoint. The front-end's analytics paths could then query the subgraph directly, eliminating the SQLite analytics backend.

**(FS4) W3C Verifiable Credentials export.** The W3C Verifiable Credentials specification [30] defines a portable JSON-LD format for verifiable claims. Adding an export step that wraps each Ediproof certificate as a VC with the on-chain hash as the `credentialStatus` would let Ediproof certificates be carried into systems that already speak VC (notably national identity wallets in the EU's eIDAS 2.0 framework).

**(FS5) ENS-aware verification.** The verifier currently identifies students by 0x-prefixed wallet address. Adding an ENS reverse-resolution step (`ensProvider.lookupAddress(addr)`) would let the verifier UI display *"Aarav Sharma — held by aarav.eth"* instead of the truncated hex.

**(FS6) WalletConnect for mobile wallets.** Adding WalletConnect v2 support would let mobile wallets (Trust, Rainbow, Coinbase Wallet, MetaMask Mobile) participate in issuance and student-portfolio flows. The verifier path is unaffected because it does not need a wallet.

**(FS7) Zero-knowledge revocation proofs.** A privacy-preserving extension: rather than publishing every revocation as a public event, batch revocations into a Merkle tree and publish only the tree root. A revoked student would receive a Merkle inclusion proof. The verifier could then check *"is this certificate revoked?"* without learning *which* other certificates have been revoked.

**(FS8) EIP-712 delegated batch issuance.** For graduating cohorts (potentially thousands of certificates issued in one ceremony), batch issuance via an EIP-712-signed message would let the institution sign one message authorising N issuances and have a delegated relayer submit the N transactions.

**(FS9) Additional certificate types via struct extension.** A future extension could parameterise the `Certificate` struct with an extensible `bytes` payload or a registered `templateId` so that the contract supports arbitrary credential schemas (course completions, attendance, professional certifications) without redeployment.

**(FS10) CI/CD and Playwright smoke tests.** The lowest-cost-highest-value engineering item is a GitHub Actions pipeline that runs `npm test` on every PR (currently this happens locally only) and a Playwright smoke test that drives the full UI flow against a Hardhat-localhost contract. Together they would catch ~90 % of regressions before they reach Sepolia. This is the most concrete and tractable item on the list and should be the *first* thing implemented after the current submission.

### 7.3.1 Closing note

Whether or not the broader migration of credential record-keeping onto public ledgers ends up using Ediproof's specific architectural choices, the project's evidence — a fifteen-step end-to-end demonstration that produces an Etherscan-verifiable contract, three on-chain seed certificates, and a wallet-less verifier path that any third party can use — is offered in support of the underlying thesis: that the routine, mechanical part of staying credible — issuing tamper-evident certificates and letting any third party verify them on demand — is a task that public blockchains can now perform reliably, cheaply, and with full audit trails.

I am grateful for the opportunity to have undertaken this work, and I look forward to the questions of the external examiner.

---

> *Chapter summary.* The project has delivered a complete end-to-end DApp that issues academic certificates as soulbound ERC-721 tokens on the Ethereum Sepolia testnet, validated by a live deployment whose address is publicly inspectable on Etherscan. Five empirical findings — Etherscan re-verifiability, deterministic 8.7 s test pass, single-byte tamper detection, sub-second wallet-less verification, deterministic reissue audit trail — together constitute the evidentiary basis of the project. Ten concrete future-work items have been laid out, ordered by difficulty, with CI/CD + Playwright smoke tests identified as the most tractable next step. The next chapter lists the full bibliography in IEEE numeric style, with stable identifiers (EIPs, DOIs, RFCs, official documentation URLs) supplied wherever available so that every claim made in this report can be independently verified.
