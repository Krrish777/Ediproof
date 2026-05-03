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

**April 2026**

---

\pagebreak

## Certificate

This is to certify that the project report entitled **"Ediproof: A Blockchain-Based Academic Certificate Verification DApp Using Soulbound Tokens on the Ethereum Sepolia Testnet"** submitted by **Krrish &lt;Surname&gt;** (Roll No. ________) in partial fulfilment of the requirements for the award of the degree of **Bachelor of Technology / Master of Computer Applications** in **Computer Science and Engineering** is a bonafide record of work carried out by the candidate under my supervision and guidance.

The contents of this report, in full or in part, have not been submitted to any other institution or university for the award of any degree or diploma.

Place: ____________________
Date: 19 April 2026

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

I further declare that to the best of my knowledge, this report does not contain any part of any work that has been submitted for the award of any degree at any other university or institution. All sources used and consulted have been duly acknowledged in the references section. The smart contract whose deployment underpins the experimental section of this report is publicly inspectable on the Ethereum Sepolia testnet at address `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, and any reader of this report may verify the deployment by following the Etherscan link reproduced in §3.12 and §6.

Place: ____________________
Date: 19 April 2026

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

The verification of academic credentials remains, in 2026, a stubbornly manual and forgery-prone process. A prospective employer who receives a PDF degree certificate has only three realistic paths to verifying it — telephone the issuing institution, route the document through a paid background-check service, or simply trust the candidate. Each path is slow, expensive, and provides no cryptographic guarantee against tampering. The volume of fraudulent credentials in circulation, documented in successive reports by India's University Grants Commission and by international background-check vendors, makes a more rigorous architecture necessary.

This project presents **Ediproof**, an end-to-end decentralised application (DApp) that issues academic certificates as **Soulbound Tokens (SBTs)** — non-transferable ERC-721 tokens permanently bound to a student's Ethereum wallet — and exposes a wallet-less public path through which any third party can verify the authenticity of a certificate by recomputing its on-chain hash. The system comprises a single Solidity 0.8.28 smart contract (`EdiproofCertificate.sol`, 436 lines) deployed to the Ethereum Sepolia testnet at `0x14Cf79F1ef984db755f0803E215FB12038Ad64d5`, an Express + better-sqlite3 backend that proxies certificate-file uploads to Pinata's IPFS V3 API while keeping the JWT server-side, and a Next.js 14 + React 18 + Ethers v6 front-end that serves three distinct user roles: institutions (who issue, revoke, and reissue), students (who view their permanent portfolio), and verifiers (who confirm authenticity without ever opening a wallet).

The smart contract anchors each certificate by storing `keccak256(abi.encodePacked(studentName, courseName, institution, ipfsURI))` on-chain, so any tampering of even a single character in any of the four fields produces a different hash and an instant verification failure. Soulbound enforcement is implemented as a five-line override of OpenZeppelin's ERC-721 `_update()` hook that allows mint and burn but reverts on every other transfer with a custom `SoulboundTransferBlocked()` error. Reissuance is implemented as a burn-and-remint flow that physically removes the superseded token while retaining its hash mapping and a `replacedBy` link, so a verifier presenting an old hash receives the deterministic answer "revoked, replaced by token N". Token metadata is fully on-chain — the `tokenURI` returns a base64-encoded JSON document whose `image` field is itself a base64-encoded SVG built from contract storage, eliminating any external metadata-pinning dependency.

The implementation totals approximately 1500 lines of Solidity, JavaScript, and TypeScript across four sub-projects (`contracts/`, `backend/`, `frontend/`, `design/`). The contract's Hardhat + Mocha + Chai test suite locks in twenty test cases across nine `describe` blocks, including dedicated assertions for soulbound enforcement, hash sensitivity to single-character tampering, duplicate prevention, the burn-and-remint reissue flow, and four metadata invariants. The deployment artefact at `contracts/deployments/sepolia.json` records the deploy transaction hash `0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6` and timestamp `2026-04-19T06:38:37Z`, both of which are independently verifiable on Etherscan.

The report documents the complete lifecycle of the project: motivation, system architecture, design diagrams, implementation walkthrough across all three layers (contract, backend, front-end), the layered testing strategy, observed results from the live Sepolia deployment, and avenues for future extension including mainnet deployment with gas-optimised storage, EIP-712-based delegated issuance for batch graduation events, ENS-aware verification, and zero-knowledge revocation proofs for privacy-preserving credential checks.

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
|  | **Synopsis** | 1 |
| 1 | **Introduction** | 9 |
| 1.1 | About the Project | 9 |
| 1.2 | Existing Problem | 11 |
| 1.3 | Objectives | 13 |
| 1.4 | Proposed System Architecture | 14 |
| 1.5 | Software Specification | 17 |
| 1.6 | Hardware Specification | 18 |
| 2 | **Design** | 19 |
| 2.1 | Block Diagram | 19 |
| 2.2 | Entity-Relationship Diagram | 21 |
| 2.3 | Data Flow Diagrams | 23 |
| 2.4 | Use Case Diagram | 25 |
| 2.5 | Activity Diagram | 26 |
| 2.6 | Sequence Diagrams | 27 |
| 3 | **Implementation** | 29 |
| 3.1 | Project Layout | 29 |
| 3.2 | The Smart Contract | 30 |
| 3.3 | Hash Construction and Soulbound Enforcement | 35 |
| 3.4 | Hardhat Configuration | 37 |
| 3.5 | Deployment Script | 38 |
| 3.6 | Seed Script | 39 |
| 3.7 | Backend (Express + Pinata + SQLite) | 40 |
| 3.8 | Front-end (Next.js 14 + Ethers v6) | 43 |
| 3.9 | Design System and Wireframes | 46 |
| 3.10 | Configuration and Environment Files | 47 |
| 3.11 | Build, Run, and Test Commands | 47 |
| 3.12 | Live Deployment Artefact | 48 |
| 4 | **Testing** | 49 |
| 4.1 | Testing Strategy | 49 |
| 4.2 | Unit Testing | 50 |
| 4.3 | Integration Testing | 56 |
| 4.4 | System Testing | 58 |
| 4.5 | Performance Characterisation | 62 |
| 4.6 | Security and Threat Model | 64 |
| 4.7 | Test Results Summary | 66 |
| 5 | **Conclusion and Future Scope** | 68 |
| 5.1 | Summary of Work Done | 68 |
| 5.2 | Key Contributions | 69 |
| 5.3 | Limitations | 70 |
| 5.4 | Future Scope | 70 |
| 5.5 | Closing Remarks | 72 |
| 6 | **References** | 73 |

\pagebreak

## List of Figures

| Fig. No. | Title | Page |
|---|---|---|
| 2.1 | Three-tier block diagram (Browser/MetaMask → Backend → Sepolia + IPFS) | 19 |
| 2.2 | Hybrid ERD: on-chain `Certificate` struct + off-chain `events` SQLite table | 21 |
| 2.3 | Level-0 Data Flow Diagram (context) | 23 |
| 2.4 | Level-1 DFD — Issue flow | 24 |
| 2.5 | Level-1 DFD — Verify (wallet-less) flow | 24 |
| 2.6 | Use case diagram (4 actors, 9 use cases) | 25 |
| 2.7 | Activity diagram of the issuance happy path | 26 |
| 2.8 | Sequence diagram — issue: wallet, backend, Pinata, contract | 27 |
| 2.9 | Sequence diagram — verify: read-only `JsonRpcProvider`, no wallet | 28 |
| 4.1 | Test pyramid adopted in the project | 49 |
| 4.2 | Etherscan view of the deployed contract | 60 |
| 4.3 | Indicative gas profile per public function | 62 |

## List of Tables

| Tab. No. | Title | Page |
|---|---|---|
| 1.1 | Software stack | 17 |
| 1.2 | Hardware specification | 18 |
| 3.1 | `Certificate` struct field reference | 31 |
| 3.2 | `events` SQLite table column reference | 41 |
| 3.3 | Public-function inventory of `EdiproofCertificate.sol` | 33 |
| 3.4 | Custom errors raised by the contract | 34 |
| 3.5 | Express route inventory | 41 |
| 3.6 | Front-end pages, components, hooks, and libs | 44 |
| 4.1 | Unit-test inventory (`describe`/`it` blocks) | 51 |
| 4.2 | End-to-end demonstration steps | 59 |
| 4.3 | OWASP-style threat coverage | 65 |
| 6.1 | References by category | 73 |

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
| DPoS | Delegated Proof of Stake |
| EIP | Ethereum Improvement Proposal |
| ENS | Ethereum Name Service |
| EOA | Externally Owned Account |
| ERC | Ethereum Request for Comments |
| ERD | Entity-Relationship Diagram |
| EVM | Ethereum Virtual Machine |
| FIDE | (n/a here) |
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
| UI | User Interface |
| URI | Uniform Resource Identifier |
| URL | Uniform Resource Locator |
| UTC | Coordinated Universal Time |
| VC | Verifiable Credentials (W3C) |
| WAL | Write-Ahead Logging (SQLite) |
| WORM | Write Once Read Many |
| ZK | Zero-Knowledge |

\pagebreak
