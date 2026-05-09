# Chapter 1 — Introduction and System Overview

> *Chapter overview.* This chapter situates the **Ediproof** DApp within the contemporary landscape of academic-credential verification, articulates the operational gaps that motivate the project, enumerates the objectives it sets out to achieve, sketches the proposed three-tier system architecture at a conceptual level, and closes with the software/hardware specification, the headline features, and the chapter map of the report. Subsequent chapters drill into the design diagrams (Chapter 2), the implementation (Chapter 3), the observed results (Chapter 4), the testing strategy (Chapter 5), the advantages and limitations (Chapter 6), and the conclusion together with future scope (Chapter 7).

---

## 1.1 Background of the Project

Every higher-education institution issues, every academic year, hundreds or thousands of degree certificates that the recipient is then expected to show to employers, scholarship committees, and other institutions for the rest of their working life. The mechanical question — *is this degree real?* — has remained surprisingly hard to answer. The traditional answer is a paper certificate signed and stamped by the institution; the contemporary answer is a PDF with the same signatures and stamps; and in both cases the verification path of last resort is a telephone call from the verifier's office to the registrar of the issuing institution.

This is unsatisfactory on three counts. First, it is *slow*: the registrar's office is staffed during business hours only, and a verification telephone call typically takes several days to resolve. Second, it is *expensive*: international background-check vendors charge between US $25 and US $80 per credential audited, with the cost ultimately passed to the candidate or the employer. Third, and most consequentially, it is *forgery-friendly*: a PDF is a sequence of bytes, every byte of which is in principle editable, and the visual cues an untrained verifier uses to spot a fake (a misaligned stamp, a font drift, a too-clean background) can be defeated with a few minutes of work in any modern PDF editor. Independent surveys conducted by international background-check firms over the last decade have consistently found that between 8 % and 14 % of credential dossiers contain at least one materially-altered document, with the most common alterations being the date of conferral, the class of award, and the institution's name itself.

The problem is structural. The canonical record of a degree lives in a private institutional database that no third party can directly query, so every verification interaction must be mediated by a human at the institution. A long-running ambition — one that pre-dates blockchain by decades — has been to build a public, queryable index of academic records so that any third party could verify a claim *without* a phone call. Two technical generations of this ambition exist: a generation of centralised digi-locker systems run by national governments, and a much newer generation built on public blockchains. Centralised digi-lockers cover only a fraction of institutions and inherit the availability characteristics of the government portal that hosts them. Public blockchains, by contrast, are permanently available by construction: any node in the network can answer a verification query, and no operator can withdraw the answer.

Recent maturity in three specific Ethereum primitives makes a blockchain credential-verification system tractable in 2026. First, the **ERC-721** non-fungible token standard [9] gives a clean per-asset model that maps naturally onto a per-certificate model. Second, the proposal of **Soulbound Tokens** by Weyl, Ohlhaver, and Buterin [11] in early 2022, and its formalisation as **ERC-5114** [10], gives the design pattern for non-transferable tokens — a property without which the credential use-case collapses (a transferable degree would mean a degree that could be sold, which is incoherent). Third, the maturation of low-cost L1 testnets — particularly **Sepolia** [16], which migrated to proof-of-stake in October 2023 and now offers fast block times, free test ETH from public faucets, and full Etherscan-indexed contract verification — gives an operational target on which a final-year project can be developed and demonstrated end-to-end without the cost or risk of mainnet deployment.

---

## 1.2 Problem Statement

Given (i) an institution that wishes to issue tamper-evident academic certificates and (ii) third parties (employers, scholarship committees, other institutions) who wish to verify those certificates without bilateral integration, design and implement a software system that satisfies the following eight functional requirements simultaneously:

1. allows an institution administrator (the contract owner) to **whitelist** any number of issuer wallets;
2. allows each whitelisted issuer to **mint** a certificate as a soulbound ERC-721 token bound to the student's wallet, with the four certificate fields hashed on-chain;
3. **prevents** the certificate token from ever being transferred — it must be burnable but never re-assignable;
4. allows the issuer (or the contract owner) to **revoke** an existing certificate, leaving the token in place but flipping a `revoked` flag;
5. allows the issuer (or the contract owner) to **reissue** a certificate, *physically* burning the superseded token while leaving an audit trail (`replacedBy[old] = new`, `reissuedFrom` field on the new certificate);
6. allows **any third party**, *with no wallet*, to submit the four fields and receive `valid` / `invalid` / `revoked` / `replaced-by-N` in a single read-only RPC call;
7. produces, for every active certificate, a self-contained on-chain `tokenURI` containing both metadata and an SVG image, so that wallets and marketplaces can display the certificate without depending on an off-chain metadata pin;
8. exposes a small backend that proxies certificate-file uploads to IPFS so that the institution does not have to disclose a Pinata API key to any browser, and that logs on-chain events into a local SQLite analytics store for dashboard purposes only.

Every step must be auditable — every state-changing call must emit an event — and the verification surface must remain available even if the backend is offline. The blockchain is the source of truth; every other tier of the system must be replaceable without losing the canonical record of any certificate.

---

## 1.3 Objectives of the Project

The eight numbered objectives below were defined at the start of the project and each one is realised by a concrete code module, cited inline so that an examiner can verify the mapping between intent and implementation.

1. **Mint a certificate as a soulbound ERC-721 token bound to the student's wallet, with the four certificate fields anchored by an on-chain `keccak256` hash.** Realised by `issueCertificate(...)` at `contracts/contracts/EdiproofCertificate.sol:85-114`, which calls `_computeHash(...)` (`:399-406`), checks for duplicates via the `hashToTokenId` mapping (`:29`, `:94-95`), persists the `Certificate` struct (`:98-108`), mints to the student via OpenZeppelin's `_safeMint` (`:111`), and emits `CertificateIssued` (`:113`).

2. **Prevent every transfer of an issued certificate** through a soulbound-enforcement layer that allows mint and burn but reverts every other transfer. Realised by the `_update` override at `EdiproofCertificate.sol:410-420`, whose body is a single five-line condition that raises the custom error `SoulboundTransferBlocked()` whenever both `from` and `to` are non-zero. The custom error is declared at `:55` and asserted by `test/EdiproofCertificate.test.ts:119-141`.

3. **Implement a wallet-less hash-based verification path** that any third party can use without holding cryptocurrency or installing a wallet. Realised by the `view` function `verifyCertificate(...)` at `EdiproofCertificate.sol:182-208`, which recomputes the hash, looks it up in `hashToTokenId`, and returns the tuple `(valid, tokenId, ownerAddr, revoked, replacedByTokenId)`. Because the function is `view`, the front-end calls it through ethers' read-only `JsonRpcProvider` at `frontend/src/hooks/useContract.ts:17-20` — no wallet, no signature, no gas.

4. **Whitelist institution wallets through an owner-controlled mapping** so that only authorised institutions can mint. Realised by the `approvedInstitutions` mapping at `EdiproofCertificate.sol:30`, the `addInstitution` / `removeInstitution` setters at `:71-79`, and the `onlyApprovedInstitution` modifier at `:57-60`. The seed script at `contracts/scripts/seed.ts:24-32` pre-approves the deployer as the demonstration institution.

5. **Implement reissuance as a burn-and-remint flow** with an audit trail that allows verifiers presenting an old hash to be told *"revoked, replaced by N"* rather than *"not found"*. Realised by `reissueCertificate(...)` at `EdiproofCertificate.sol:126-176`. The function (a) marks the old certificate revoked at `:138-141`, (b) computes the new hash and rejects duplicates at `:143-150`, (c) persists the new struct with `reissuedFrom = oldTokenId` at `:152-163`, (d) sets `replacedBy[oldTokenId] = newTokenId` at `:165`, (e) physically burns the old token at `:170`, and (f) mints the new token at `:172`.

6. **Generate fully-on-chain, self-contained `tokenURI`** containing JSON metadata and a base64-encoded SVG image, eliminating any off-chain metadata pinning dependency. Realised by `tokenURI(...)` at `EdiproofCertificate.sol:243-290`, supported by `_buildSVG(...)` at `:292-327` and the JSON / XML escape helpers `_escapeJSON` / `_escapeXML` at `:343-393` which protect against malicious payloads in user-supplied fields.

7. **Expose an Express backend that proxies file uploads to Pinata** while keeping the JWT server-side, and that logs on-chain events into a local SQLite analytics store with WAL mode enabled for concurrent reads. Realised by `POST /api/upload` at `backend/src/routes.js:21-36`, the Pinata V3 multipart proxy at `backend/src/pinata.js:8-43`, and the SQLite `events` table at `backend/src/db.js:14-22` with three secondary indexes at `:23-25`. The JWT is read from `process.env.PINATA_JWT` at `pinata.js:9-12` and never reaches the response.

8. **Provide a Next.js 14 front-end with three role-specific surfaces** — institution issuance, student portfolio, public verifier — and an EIP-6963-aware wallet picker that disambiguates MetaMask from competing injected providers (OKX, Coinbase, Trust). Realised by the four App-Router pages at `frontend/src/app/{page,issue/page,verify/page,my-leaves/page}.tsx`, the EIP-6963 discovery logic at `frontend/src/lib/wallet.ts:32-64`, and the dual-provider hook at `frontend/src/hooks/useContract.ts` (read-only `JsonRpcProvider` for verifiers; `BrowserProvider` for issuance/student writes).

A ninth, transverse objective — *to make the system runnable on a fresh Windows or Unix machine with one double-click* — is realised by `start.bat` (Windows) and `start.sh` (Unix), which detect Node, install both backend and front-end dependencies, warn if `backend/.env` is missing, launch the two servers in independent terminal windows, and open the browser at `http://localhost:3000`.

---

## 1.4 Scope of the Application

**In scope.** The system supports the Ethereum Sepolia testnet only. It supports a single OpenZeppelin-derived ERC-721 contract. It supports Pinata as the IPFS pinning service (with a configurable gateway). It supports MetaMask as the user-facing wallet (with EIP-6963 disambiguation against OKX, Coinbase, and other injected wallets). The complete certificate lifecycle — issue, revoke, reissue, verify — is end-to-end working. Three role-specific UIs (institution, student, verifier) are implemented; the verifier path is deliberately wallet-less. A small Express + SQLite analytics backend is included for institution dashboards but is not on the critical path for verification.

**Out of scope (in the current submission).** Mainnet deployment; gas-optimised storage layouts; EIP-1967 / OZ-Upgrades upgradeability proxies; multi-signature institution administration; subgraph indexing through The Graph protocol; W3C Verifiable Credentials export; WalletConnect for mobile wallets; ENS-aware verification (`student.eth` lookup); zero-knowledge revocation proofs; CI/CD pipelines; email notifications; internationalisation. These are explicitly listed in `README.md:104-106` as out of scope for a focused demonstration build and are revisited as concrete future-work items in §7.3.

**Operational dependencies.** A funded Sepolia EOA (≈ 0.1 ETH from a public faucet is sufficient for several hundred issuance + revocation operations), a Pinata account with a valid JWT, an Alchemy app key for the Sepolia RPC, an Etherscan API key for contract verification, and Node.js 22 LTS (Node 24 is *not* supported because `better-sqlite3` does not currently compile against it; this constraint is hard-coded in `backend/package.json:12-14`).

---

## 1.5 Motivation

Three observations together motivated the choice of this project.

First, **the credential-verification problem is universal but unglamorous.** Every working professional has — at some point — had to wait several days for an HR coordinator to *call back* after an institution's registrar's office finally answered a verification request. The cost of those delays is borne diffusely (by candidates, by employers, by the institution's overworked registrar's-office staff) but it is large in aggregate. A small, focused software project that closed even part of this gap felt like work that *mattered* in a way that an exotic-but-pointless technical exercise would not.

Second, **the architectural fit between an academic degree and a soulbound token is unusually clean.** Most token use-cases involve trade-offs — fungibility versus uniqueness, permissioned versus public minting, transferability versus binding. A degree certificate is exactly *one point* on each of those axes: it is unique to a person, mintable only by an authorised institution, and conceptually nonsensical when transferable. ERC-721 + soulbound + on-chain hash matches the requirement so precisely that the contract ends up at 436 lines of Solidity, with the entirety of the soulbound contract fitting in a five-line `_update` override. A project that *fits its primitives* this well is a project worth building, because the cost of building it is bounded and the result has a real chance of being correct.

Third, **the existing public examples of SBT credential systems do not include a wallet-less verifier path.** Most demonstrations of soulbound credential systems published on GitHub or in academic papers assume that the verifier has already onboarded to a wallet, which is operationally backwards: the verifier (typically a non-crypto-native HR coordinator at an employer) is the *least* likely actor in the system to want to install MetaMask. Demonstrating that the verifier can be served by a single `view` function call against a public RPC, with no wallet anywhere in the request path, was the architectural insight on which the project was structured.

A fourth, smaller motivation is the institutional moment. Indian higher education is in the early stages of a long migration of credential record-keeping away from paper-and-PDF and onto digital ledgers. The DPDP Act's rules around personal-data retention, the UGC's recurrent push for digital transcripts, and the steady mainstreaming of crypto wallets among recent graduates all point in the same direction. A reference implementation that demonstrates the end-to-end architecture — small enough to read in an afternoon, complete enough to be deployed in a day — is a useful artefact to contribute to that conversation, regardless of whether any specific institution chooses to adopt this particular design.

---

## 1.6 Existing Systems and Technologies

A short survey of the contemporary credential-verification landscape clarifies the gap that **Ediproof** addresses.

**Manual telephone verification** remains the default at most Indian institutions. The verifier (typically an HR coordinator) emails or telephones the registrar's office of the issuing institution, which then either confirms or denies the credential against its internal database. The path has the structural failure modes named in §1.1 — slow, expensive, business-hours-only, and entirely dependent on the goodwill and staffing of the registrar's office. The institution itself receives no analytics: it cannot tell, after the fact, which of its degrees have been verified or how often.

**National digi-locker systems** — India's *DigiLocker* [34], the EU-wide *European Blockchain Services Infrastructure*, the US *DXC Technology* federated transcript service — go some distance toward solving the lookup problem by exposing a centralised online index. Their failure modes are inherited from their centralised architecture: limited institutional coverage (DigiLocker, despite a decade of operation, still indexes only a fraction of Indian institutions), occasional portal-level downtime, and the requirement that both the issuing institution and the verifier have signed up in advance. None of them gives the verifier a self-contained cryptographic guarantee against tampering — they give a *lookup* against an external authority, which the verifier must continue to trust.

**Centralised blockchain-credential platforms** such as Blockcerts (MIT) and Accredify (Singapore) take the natural next step of anchoring credential hashes on a public blockchain, but they typically operate as walled gardens: the verifier uses a vendor-supplied app or website, which queries the chain on the verifier's behalf. The cryptographic guarantee is genuine — the on-chain hash is real — but the operational guarantee depends on the vendor remaining in business, since the consumer-facing verification UI is theirs.

**Generic NFT-based credential experiments** built on standard ERC-721 contracts solve the on-chain anchoring but fail the *non-transferability* requirement. A transferable degree is conceptually nonsensical and operationally dangerous (a candidate could buy a degree from an alumna who no longer needs it). This is the gap that **soulbound** tokens [10, 11] specifically close. An ERC-721 with a `_update` override that blocks every transfer except mint and burn — five lines of Solidity — turns a generic NFT into a credential-suitable container.

**Standards-track alternatives.** The W3C Verifiable Credentials Data Model 2.0 [30] and the Decentralised Identifiers (DIDs) v1.0 specification [31] give a portable, JSON-LD format for credentials that is independent of any specific blockchain. The two are complementary to (rather than competing with) Ediproof's on-chain anchoring; §7.3 lists *VC export* as a concrete future-work item that would let Ediproof certificates be carried into VC-speaking systems such as the EU's eIDAS 2.0 wallets.

---

## 1.7 Limitations of Existing Systems

Each existing approach surveyed in §1.6 has at least one structural limitation that Ediproof is designed to address.

| System class | Structural limitation |
|---|---|
| Telephone / email verification | Slow (days), business-hours-only, no cryptographic guarantee, no analytics for the institution |
| National digi-lockers | Centralised, fractional institutional coverage, depends on portal uptime, requires bilateral signup |
| Walled-garden blockchain platforms | Cryptographic guarantee genuine, but operational guarantee depends on vendor; vendor lock-in |
| Generic NFT credentials | Transferable — conceptually wrong; tokens can be sold or gifted, breaking the credential semantic |
| W3C VC + DID-only systems | Excellent portability; but no native, queryable on-chain index that any third party can hit cold |

The gap that the **Ediproof** DApp fills is therefore very specific: a self-hosted, code-inspectable, single-contract reference implementation that combines the soulbound non-transferability guarantee with an immediate, wallet-less, public verification surface, served from a small Next.js front-end with no vendor lock-in. The codebase is small enough (approximately 1500 LOC across four sub-projects) to be read in a single afternoon, and the architecture is deliberately conservative — one Solidity contract, one SQLite table, one IPFS pinning service, one wallet — so that the cost of *understanding* the system is low and the cost of *extending* it (Chapter 7, §7.3) is correspondingly bounded.

A secondary gap that the project addresses is the absence in the open-source ecosystem of complete, end-to-end SBT credential demos that include a *wallet-less* verifier path. Ediproof's reliance on `ethers.JsonRpcProvider` against a public Alchemy endpoint at `frontend/src/hooks/useContract.ts:9, :17-20` makes the verifier path zero-friction.

---

## 1.8 Proposed System Overview

The proposed system is organised as **three loosely-coupled tiers** stacked on top of two external services. Figure 2.1 in the next chapter renders the architecture visually; the prose below explains it conceptually.

**The Smart Contract Tier** is a single Solidity 0.8.28 contract, `EdiproofCertificate.sol`, deployed to Sepolia at address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`. It inherits from OpenZeppelin's `ERC721Enumerable` and `Ownable` and is compiled with the `cancun` EVM target and `viaIR` enabled. It exposes nine externally callable functions — three institution-management (`addInstitution`, `removeInstitution`, owner-only); three certificate-lifecycle (`issueCertificate`, `revokeCertificate`, `reissueCertificate`); and three reads (`verifyCertificate`, `getCertificate`, `getCertificatesByOwner`). Every state-changing call emits an event.

**The Backend Tier** is a small Express 4 application bound to port 8787 with a global JSON middleware capped at 1 MB and a single multer-backed multipart route capped at 15 MB per upload. Six HTTP routes are exposed (health, upload, log, stats, activity, per-institution). All persistent state lives in a single SQLite file with WAL mode enabled, holding one `events` table. The backend's only persistent dependency is the Pinata JWT, which it reads from `process.env.PINATA_JWT` and never returns to the client.

**The Front-end Tier** is a Next.js 14.2 + React 18 + TypeScript 5 + Ethers v6 application using the App Router. Three role-specific pages — `/issue`, `/verify`, `/my-leaves` — sit on a shared masthead/colophon chrome and consume two custom React hooks: `useWallet` (which performs EIP-6963 wallet discovery) and `useContract` (which constructs a read-only `JsonRpcProvider` for the verifier path and a signed `BrowserProvider` for the issuance path). The verifier page never touches MetaMask: it only ever calls the read-only contract.

**The two external services** are Pinata IPFS (V3 endpoint `https://uploads.pinata.cloud/v3/files`, accessed only by the backend) and an Alchemy Sepolia RPC (used by both the front-end's read-only verifier path and the contract's deploy-time tooling). Both degrade gracefully — verification still works against any other Sepolia RPC, and file uploads still work against any IPFS pinning service that exposes a multipart V3-compatible API.

**Architectural rationale.** The contract is the *source of truth*. The backend exists *only* to (a) hide the Pinata JWT and (b) cache event data for the dashboard — its absence does not break the verification path. The front-end is a *thin* orchestrator. The separation pays for itself in the testing chapter (Chapter 5): the contract is exercisable in isolation through Hardhat + Chai, the backend through `curl`, and the front-end through the live UI, without any one of the three depending on the others being live.

---

## 1.9 Key Features of the Proposed System

| # | Feature | Distinguishing property |
|---|---|---|
| 1 | Soulbound ERC-721 enforcement | Five-line `_update` override — minimal, future-proof against new ERC-721 extensions |
| 2 | Wallet-less verifier path | Read-only `eth_call` against `verifyCertificate(...)`; no MetaMask, no signature, no gas |
| 3 | On-chain `keccak256` anchor | Single-byte tampering of any field produces a different digest; instant verification failure |
| 4 | Burn-and-remint reissue | Old token physically destroyed; old hash + `replacedBy[old] = new` retained for audit trail |
| 5 | Fully on-chain `tokenURI` | JSON + base64 SVG synthesised on read; no off-chain metadata pin required |
| 6 | Server-side Pinata JWT | Browser never sees the token; backend is the only holder; precludes JWT exfiltration |
| 7 | EIP-6963 wallet discovery | Defeats the OKX/MetaMask `window.ethereum`-overwrite race on multi-wallet machines |
| 8 | Three role-specific UIs | Institution / student / verifier — each tailored to its single use case |
| 9 | One-shot launchers | `start.bat` / `start.sh` install dependencies, start both servers, open the browser |
| 10 | Independent Etherscan re-verification | Anyone can hit the *Read Contract* tab and call `verifyCertificate` directly |

The combination of features (1)–(4) is what makes Ediproof technically distinctive against the existing landscape; the combination of features (2), (5), and (10) is what makes it operationally distinctive — the verification surface continues to function even if every part of the Ediproof project disappears tomorrow, because Etherscan and the on-chain bytecode survive.

### 1.9.1 Software Specification

The complete technology stack is summarised in Table 1.1.

| Layer | Component | Version |
|---|---|---|
| Smart-contract language | Solidity | 0.8.28 |
| EVM target / IR | cancun + viaIR + 200 runs | — |
| Contract base | OpenZeppelin Contracts | ^5.6.1 |
| Build & test | Hardhat | ^2.22.0 |
| Test assertions | Chai (via hardhat-toolbox) | ^4.4.1 |
| RPC + signer | Ethers.js | ^6.13.4 / ^6.16.0 |
| Target network | Ethereum Sepolia | chainId 11155111 |
| Block explorer | Etherscan v2 | API |
| RPC provider | Alchemy | Sepolia |
| Backend runtime | Node.js | 22 LTS, `>=22 <24` |
| Backend HTTP | Express | ^4.21.0 |
| Multipart parser | multer | ^1.4.5-lts.1 |
| SQLite driver | better-sqlite3 | ^12.0.0 |
| IPFS pinning | Pinata V3 | API |
| Front-end framework | Next.js | 14.2.29 |
| UI library | React | ^18.3.1 |
| TypeScript | TypeScript | ^5 |
| Wallet protocol | EIP-1193 + EIP-6963 | — |
| Wallet client | MetaMask | ≥ 11 |

### 1.9.2 Hardware Specification

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | x86-64, 2 cores, 2.0 GHz | x86-64 / Apple Silicon, 4 cores, 3.0 GHz |
| RAM | 4 GB | 8 GB |
| Disk | 1 GB free | 5 GB free |
| GPU | Not required | Not required |
| Network | 2 Mbps stable | 10 Mbps stable |
| OS | Windows 10/11, Ubuntu 22.04+, macOS 14+ | Same |
| Display | 1280 × 720 | 1920 × 1080 or higher |

The system has no compile-time GPU dependency, no AI/ML inference path, and no platform-specific runtime code aside from the Windows-only `start.bat` (paired with the Unix-only `start.sh`).

---

## 1.10 Organization of the Report

The remainder of this report is organised into eight further chapters and an appendix.

**Chapter 2 — System Design and Methodology** (longest chapter) walks through the system's diagrammatic design: block diagram of the three-tier architecture (§2.1), per-module descriptions (§2.2), Level-0 and Level-1 data-flow diagrams (§2.3), the system flowchart with wallet/chain decisions (§2.4), the technology stack consolidated as a single reference (§2.5), the development methodology (§2.6), the end-to-end workflow narrative (§2.7), the algorithm/process logic for the hash and the soulbound override (§2.8), and the integration contract between the six modules (§2.9).

**Chapter 3 — Implementation** covers the development environment (§3.1), implementation details for each tier (§3.2), the experimental and application setup including build/run/test commands (§3.3), and screenshots of the working model (§3.4).

**Chapter 4 — Results and Analysis** presents the output observed from a live deployment to Sepolia (§4.1), performance characterisation across gas, latency, and throughput (§4.2), a comparison of Ediproof against four existing approaches (§4.3), and an impact analysis grounded in the credential-fraud baseline (§4.4).

**Chapter 5 — Testing** documents the testing objectives (§5.1), the test pyramid spanning unit / integration / system / security testing (§5.2), the unit-test inventory (§5.3), the test-execution results (§5.4), and the error-handling and debugging strategy (§5.5).

**Chapter 6 — Advantages and Limitations** lists seven distinctive advantages (§6.1), eight current limitations (§6.2), and the engineering challenges encountered during the build with their resolutions (§6.3).

**Chapter 7 — Conclusion and Future Scope** recapitulates the work delivered (§7.1), distils the key findings (§7.2), and lays out a structured ten-item agenda for future extension (§7.3).

**Chapter 8 — References** contains the IEEE-format bibliography (41 entries) grouped into five thematic sections.

**Chapter 9 — Appendix** holds additional data (§9.1), illustrative source-code listings extracted from `EdiproofCertificate.sol` and the backend (§9.2), supplementary screenshots and diagrams (§9.3), and the live deployment record together with the Etherscan URLs that any reader can follow to independently re-verify the evidentiary basis of every claim made in the body of this report (§9.4).

---

> *Chapter summary.* This chapter introduced the **Ediproof** DApp, motivated the project against the gap left by manual telephone verification, centralised digi-lockers, walled-garden blockchain credential platforms, and generic NFT credentials, listed the eight concrete objectives the system fulfils with citations to the corresponding code modules, scoped the application against what is and is not covered in the current submission, summarised the headline features, fixed the software and hardware specifications, and walked through the structure of the rest of the report. Chapter 2 now turns to the diagrammatic design of the system.
