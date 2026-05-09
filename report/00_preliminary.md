# EDIPROOF

### A Blockchain-Based Academic Certificate Verification DApp Using Soulbound Tokens on the Ethereum Sepolia Testnet

---

**A Project Report**

submitted in partial fulfilment of the requirements
for the award of the degree of

**Bachelor of Technology / Master of Computer Applications**

*(strike through whichever does not apply)*

in

**Computer Science and Engineering**

---

**Submitted by**

**Krrish &lt;Surname&gt;**
Roll No. _________________

**Under the Guidance of**

**Prof. ______________**
Department of Computer Science and Engineering

---

**&lt;Name of Department&gt;**
**&lt;Name of College / University&gt;**
**&lt;City, State – PIN&gt;**

**May 2026**

---

\pagebreak

## Certificate

This is to certify that the project report entitled **"Ediproof: A Blockchain-Based Academic Certificate Verification DApp Using Soulbound Tokens on the Ethereum Sepolia Testnet"** submitted by **Krrish &lt;Surname&gt;** (Roll No. ________) in partial fulfilment of the requirements for the award of the degree of **Bachelor of Technology / Master of Computer Applications** in **Computer Science and Engineering** is a bonafide record of work carried out by the candidate under my supervision and guidance.

The contents of this report, in full or in part, have not been submitted to any other institution or university for the award of any degree or diploma.

Place: ____________________
Date: ____________________

\
\
\

| Project Guide | Head of Department |
|---|---|
| Prof. ____________________ | Prof. ____________________ |
| Department of CSE | Department of CSE |

External Examiner

____________________________________

\pagebreak

## Candidate's Declaration

I hereby declare that the project report entitled **"Ediproof: A Blockchain-Based Academic Certificate Verification DApp Using Soulbound Tokens on the Ethereum Sepolia Testnet"** is the result of my own work carried out at &lt;Name of College&gt;, under the supervision of Prof. ____________________.

I further declare that to the best of my knowledge, this report does not contain any part of any work that has been submitted for the award of any degree at any other university or institution. All sources used and consulted have been duly acknowledged in the references section. The smart contract whose deployment underpins the experimental section of this report is publicly inspectable on the Ethereum Sepolia testnet at address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, and any reader of this report may verify the deployment by following the Etherscan link reproduced in §3.3 and §9.4.

Place: ____________________
Date: ____________________

\
\

____________________________________

(Krrish &lt;Surname&gt;)

Roll No. ________________

\pagebreak

## Acknowledgement

I take this opportunity to express my profound gratitude and deep regard to my project guide **Prof. ____________________**, Department of Computer Science and Engineering, for their exemplary guidance, monitoring, and constant encouragement throughout the course of this project. Their valuable suggestions, critical feedback, and willingness to engage with the technical depth of an experimental decentralised-application project — spanning Solidity, the Ethereum Virtual Machine, and a modern JavaScript front-end stack — shaped the direction of this work.

I would also like to thank the **Head of the Department**, **Prof. ____________________**, for providing the laboratory infrastructure and workstation access necessary to develop, deploy, and test the system end-to-end against a public Ethereum testnet, and for fostering an academic environment in which independent project work that ventures outside the syllabus is taken seriously.

I extend my thanks to the faculty and the technical staff of the department for their assistance during the various stages of design, implementation, and evaluation. I am grateful to my classmates for spirited discussions on token standards, soulbound mechanics, content addressing, and wallet-injection conflicts that contributed many small refinements to the final architecture — most notably the EIP-6963 wallet-discovery fix that closed the OKX/MetaMask provider conflict on multi-wallet machines.

I further acknowledge the open-source projects on which this work is built — OpenZeppelin Contracts v5, Hardhat, Ethers.js v6, Next.js 14, Pinata, and the broader Ethereum developer ecosystem — without which a project of this scope would not have been completable in the time available.

Finally, I would like to thank my family for their unconditional support and encouragement, without which this work would not have been possible.

Krrish &lt;Surname&gt;

\pagebreak

## Abstract

The verification of academic credentials remains, in 2026, a stubbornly manual and forgery-prone process. A prospective employer who receives a PDF degree certificate has only three realistic paths to verifying it — telephoning the issuing institution, routing the document through a paid background-check service, or simply trusting the candidate. Each path is slow, expensive, and provides no cryptographic guarantee against tampering.

This project presents **Ediproof**, an end-to-end decentralised application (DApp) that issues academic certificates as **Soulbound Tokens (SBTs)** — non-transferable ERC-721 tokens permanently bound to a student's Ethereum wallet — and exposes a wallet-less public path through which any third party can verify the authenticity of a certificate by recomputing its on-chain hash. The system comprises a single Solidity 0.8.28 smart contract (`EdiproofCertificate.sol`, 436 lines) deployed to the Ethereum Sepolia testnet at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, an Express + better-sqlite3 backend that proxies certificate-file uploads to Pinata's IPFS V3 API while keeping the JWT server-side, and a Next.js 14 + React 18 + Ethers v6 front-end that serves three distinct user roles: institutions (who issue, revoke, and reissue), students (who view their permanent portfolio), and verifiers (who confirm authenticity without ever opening a wallet).

The smart contract anchors each certificate by storing `keccak256(abi.encodePacked(studentName, courseName, institution, ipfsURI))` on-chain, so any tampering of even a single character produces a different hash and an instant verification failure. Soulbound enforcement is implemented as a five-line override of OpenZeppelin's ERC-721 `_update()` hook that allows mint and burn but reverts every other transfer. Reissuance is implemented as a burn-and-remint flow that physically removes the superseded token while retaining its hash mapping and a `replacedBy` link, so a verifier presenting an old hash receives the deterministic answer "revoked, replaced by token N". Token metadata is fully on-chain — the `tokenURI` returns a base64-encoded JSON document whose `image` field is itself a base64-encoded SVG built from contract storage, eliminating any external metadata-pinning dependency.

The contract's Hardhat + Mocha + Chai test suite locks in twenty test cases across nine `describe` blocks, executing in approximately 8.7 seconds with zero failures. A live deploy-and-seed pipeline against Sepolia produces three Etherscan-visible certificate-issuance transactions in approximately 90 seconds. The complete codebase totals approximately 1500 lines of Solidity, JavaScript, and TypeScript across four sub-projects. The deployment record at `contracts/deployments/sepolia.json` is independently re-verifiable on Etherscan; every claim in this report is grounded in a concrete `file:line` citation in the code base.

\pagebreak

## Table of Contents

| Chapter | Title | Page |
|---|---|---|
|  | Certificate | i |
|  | Candidate's Declaration | ii |
|  | Acknowledgement | iii |
|  | Abstract | iv |
|  | Table of Contents | v |
|  | List of Figures | vii |
|  | List of Tables | viii |
|  | List of Abbreviations | ix |
| **1** | **Introduction and System Overview** | 1 |
| 1.1 | Background of the Project | 1 |
| 1.2 | Problem Statement | 2 |
| 1.3 | Objectives of the Project | 3 |
| 1.4 | Scope of the Application | 4 |
| 1.5 | Motivation | 5 |
| 1.6 | Existing Systems and Technologies | 6 |
| 1.7 | Limitations of Existing Systems | 7 |
| 1.8 | Proposed System Overview | 8 |
| 1.9 | Key Features of the Proposed System | 9 |
| 1.10 | Organization of the Report | 10 |
| **2** | **System Design and Methodology** | 11 |
| 2.1 | System Architecture | 11 |
| 2.2 | Module Description | 14 |
| 2.3 | Data Flow Diagrams | 17 |
| 2.4 | Flowchart of the System | 21 |
| 2.5 | Technology Stack / Tools Used | 23 |
| 2.6 | Overall Methodology | 25 |
| 2.7 | System Workflow | 27 |
| 2.8 | Algorithm / Process Logic | 29 |
| 2.9 | Integration of Modules | 31 |
| **3** | **Implementation** | 33 |
| 3.1 | Development Environment | 33 |
| 3.2 | Implementation Details | 35 |
| 3.3 | Experimental Setup / Application Setup | 39 |
| 3.4 | Screenshots / Working Model | 42 |
| **4** | **Results and Analysis** | 45 |
| 4.1 | Output Results | 45 |
| 4.2 | Performance Analysis | 47 |
| 4.3 | Comparison with Existing Systems | 49 |
| 4.4 | Impact Analysis | 51 |
| **5** | **Testing** | 53 |
| 5.1 | Testing Objectives | 53 |
| 5.2 | Types of Testing | 54 |
| 5.3 | Test Cases | 56 |
| 5.4 | Test Results | 58 |
| 5.5 | Error Handling and Debugging | 59 |
| **6** | **Advantages and Limitations** | 60 |
| 6.1 | Advantages | 60 |
| 6.2 | Limitations | 62 |
| 6.3 | Challenges Faced | 63 |
| **7** | **Conclusion and Future Scope** | 65 |
| 7.1 | Conclusion | 65 |
| 7.2 | Key Findings | 66 |
| 7.3 | Future Scope | 67 |
| **8** | **References** | 68 |
| **9** | **Appendix** | 71 |
| 9.1 | Additional Data | 71 |
| 9.2 | Source Code | 73 |
| 9.3 | Screenshots / Diagrams | 75 |
| 9.4 | Certificates / Permissions | 77 |

\pagebreak

## List of Figures

| Fig. No. | Title | Page |
|---|---|---|
| 2.1 | Three-tier block diagram (Browser/MetaMask → Backend → Sepolia + IPFS) | 12 |
| 2.2 | Module-interaction overview (six modules + two external services) | 15 |
| 2.3 | Level-0 Data Flow Diagram (context) | 17 |
| 2.4 | Level-1 DFD — Issue flow | 19 |
| 2.5 | Level-1 DFD — Verify (wallet-less) flow | 20 |
| 2.6 | System flowchart — issuance happy path with wallet/chain decisions | 21 |
| 2.7 | Use case diagram (4 actors, 9 use cases) | 26 |
| 2.8 | Sequence diagram — issue: wallet, backend, Pinata, contract | 27 |
| 2.9 | Sequence diagram — verify: read-only `JsonRpcProvider`, no wallet | 28 |
| 3.1 | Project layout tree (`Ediproof/` four sub-projects) | 33 |
| 3.2 | Landing page screenshot (placeholder) | 42 |
| 3.3 | Issue page screenshot (placeholder) | 43 |
| 3.4 | Verify page screenshot (placeholder) | 43 |
| 3.5 | My-leaves page screenshot (placeholder) | 44 |
| 4.1 | Test pyramid adopted in the project | 53 |
| 4.2 | Etherscan view of the deployed contract | 46 |
| 4.3 | Indicative gas profile per public function | 47 |
| 5.1 | Hardhat + Mocha + Chai test execution output | 58 |

## List of Tables

| Tab. No. | Title | Page |
|---|---|---|
| 1.1 | Software stack | 9 |
| 1.2 | Hardware specification | 9 |
| 2.1 | Six modules and their source paths | 14 |
| 2.2 | `Certificate` struct field reference | 31 |
| 2.3 | Public-function inventory of `EdiproofCertificate.sol` | 30 |
| 3.1 | Express route inventory | 36 |
| 3.2 | Front-end pages, components, hooks, and libs | 37 |
| 3.3 | Build, run, and test commands | 41 |
| 3.4 | Live deployment artefact (Sepolia) | 41 |
| 4.1 | Comparison: Ediproof vs four existing approaches | 50 |
| 4.2 | Indicative gas costs per public function | 47 |
| 4.3 | Sepolia confirmation latency profile | 48 |
| 4.4 | Impact analysis — credential-fraud baseline vs Ediproof | 52 |
| 5.1 | Unit-test inventory (`describe`/`it` blocks) | 56 |
| 5.2 | End-to-end demonstration steps | 57 |
| 5.3 | Test execution summary | 58 |
| 6.1 | OWASP-style threat coverage | 61 |
| 6.2 | Engineering challenges encountered and resolutions | 64 |
| 8.1 | References by category | 68 |

## List of Abbreviations

| Acronym | Expansion |
|---|---|
| ABI | Application Binary Interface |
| API | Application Programming Interface |
| BIP | Bitcoin Improvement Proposal |
| CID | Content Identifier (IPFS) |
| CRUD | Create, Read, Update, Delete |
| CSS | Cascading Style Sheets |
| DApp | Decentralised Application |
| DDL | Data Definition Language |
| DFD | Data Flow Diagram |
| DNS | Domain Name System |
| DPDP | Digital Personal Data Protection (Act, India) |
| DPoS | Delegated Proof of Stake |
| EIP | Ethereum Improvement Proposal |
| ENS | Ethereum Name Service |
| EOA | Externally Owned Account |
| ERC | Ethereum Request for Comments |
| ERD | Entity-Relationship Diagram |
| EVM | Ethereum Virtual Machine |
| HTML | HyperText Markup Language |
| HTTP | HyperText Transfer Protocol |
| IPFS | InterPlanetary File System |
| JS | JavaScript |
| JSON | JavaScript Object Notation |
| JWT | JSON Web Token |
| keccak | Keccak hash family (SHA-3 winner) |
| L2 | Layer-2 blockchain |
| LOC | Lines of Code |
| LTS | Long-Term Support |
| NFT | Non-Fungible Token |
| OWASP | Open Worldwide Application Security Project |
| OZ | OpenZeppelin |
| PDF | Portable Document Format |
| PII | Personally Identifiable Information |
| PoS | Proof of Stake |
| RDNS | Reverse-DNS identifier (used by EIP-6963) |
| RPC | Remote Procedure Call |
| SBT | Soulbound Token |
| SDK | Software Development Kit |
| SHA | Secure Hash Algorithm |
| SPA | Single-Page Application |
| SQL | Structured Query Language |
| SVG | Scalable Vector Graphics |
| TS | TypeScript |
| TX | Transaction |
| UGC | University Grants Commission (India) |
| UI | User Interface |
| URI | Uniform Resource Identifier |
| URL | Uniform Resource Locator |
| UTC | Coordinated Universal Time |
| VC | Verifiable Credentials (W3C) |
| WAL | Write-Ahead Logging (SQLite) |
| WORM | Write Once Read Many |
| ZK | Zero-Knowledge |

\pagebreak
