# Project Report — Ediproof

This directory contains the complete project report, broken into chapter files for ease of editing, printing, and conversion to other formats.

## File order

Read or print the files in this exact order:

| # | File | Section |
|---|---|---|
| 1 | `00_cover_and_toc.md` | Cover, certificate, declaration, acknowledgement, abstract, TOC, lists |
| 2 | `01_synopsis.md` | Standalone Synopsis (7-8 pages) |
| 3 | `02_introduction.md` | Chapter 1 — Introduction |
| 4 | `03_design.md` | Chapter 2 — Design |
| 5 | `04_implementation.md` | Chapter 3 — Implementation |
| 6 | `05_testing.md` | Chapter 4 — Testing |
| 7 | `06_conclusion_future.md` | Chapter 5 — Conclusion and Future Scope |
| 8 | `07_references.md` | Chapter 6 — References |

## Conversion to Word (.docx)

If `pandoc` is installed:

```bash
cd report
pandoc 00_cover_and_toc.md 01_synopsis.md 02_introduction.md \
       03_design.md 04_implementation.md 05_testing.md \
       06_conclusion_future.md 07_references.md \
       -o final_report.docx --toc --toc-depth=3
```

If a custom Word template (`template.docx`) is required by the institution, add `--reference-doc=template.docx`.

## Conversion to PDF

The simplest path is to print each Markdown file from VS Code's built-in Markdown preview (right-click → "Open Preview" → Ctrl-P → "Print"). This produces a clean PDF that respects all tables, headings and code blocks.

For a single combined PDF via pandoc + LaTeX:

```bash
pandoc 00_cover_and_toc.md ... 07_references.md -o final_report.pdf \
       --pdf-engine=xelatex --toc --toc-depth=3 \
       -V geometry:a4paper,margin=1in -V mainfont="Calibri"
```

## Inserting the prepared diagrams

The user has prepared the following figures separately (see Chapter 2 captions). Insert each figure at the marked position by replacing the corresponding paragraph header in `03_design.md`:

| Caption | Insert in | After heading |
|---|---|---|
| Fig. 2.1 — Three-tier block diagram (Browser/MetaMask → Backend → Sepolia + IPFS) | `03_design.md` | "## 2.1 Block Diagram" |
| Fig. 2.2 — Hybrid ERD (on-chain `Certificate` struct + off-chain `events` SQLite table) | `03_design.md` | "## 2.2 Entity-Relationship Diagram" |
| Figs. 2.3-2.5 — DFDs (Level-0 context, Level-1 issuance, Level-1 verifier) | `03_design.md` | "## 2.3 Data Flow Diagrams" |
| Fig. 2.6 — Use Case Diagram (4 actors, 9 use cases) | `03_design.md` | "## 2.4 Use Case Diagram" |
| Fig. 2.7 — Activity Diagram of the issuance happy path | `03_design.md` | "## 2.5 Activity Diagram" |
| Figs. 2.8-2.9 — Sequence Diagrams (issuance + wallet-less verifier) | `03_design.md` | "## 2.6 Sequence Diagrams" |

For Word: Insert → Pictures → choose file. For pandoc-PDF: replace the heading line with `![Caption](path/to/figure.png)` and re-render.

Two further figures are referenced in Chapter 4 (`05_testing.md`):

| Caption | Insert in | After heading |
|---|---|---|
| Fig. 4.1 — Test pyramid adopted in the project | `05_testing.md` | "## 4.1 Testing Strategy" |
| Fig. 4.2 — Etherscan view of the deployed contract | `05_testing.md` | "## 4.4 System Testing" |
| Fig. 4.3 — Indicative gas profile per public function | `05_testing.md` | "## 4.5 Performance Characterisation" |

## Word-count and page-count check

Run from this directory:

```bash
wc -w *.md
```

Approximate page count: total words ÷ 300 (at 12 pt, 1.5 line spacing on A4).

## Notes for the viva

- Every numbered objective in §1.3 is mapped to a concrete `file:line` location — be ready to open the file at that line and explain the code. The most important locations to memorise are:
  - `EdiproofCertificate.sol:399-406` — the keccak256 anchor (one line)
  - `EdiproofCertificate.sol:410-420` — the `_update` soulbound override (five lines)
  - `EdiproofCertificate.sol:182-208` — `verifyCertificate` (the wallet-less surface)
  - `EdiproofCertificate.sol:126-176` — `reissueCertificate` (burn-and-remint with audit trail)
- The deployed contract on Sepolia is independently re-verifiable. Prepare to open these two URLs in front of the examiner:
  - https://sepolia.etherscan.io/address/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5 (contract page; *Read Contract* tab is the best demonstration of wallet-less verification)
  - https://sepolia.etherscan.io/tx/0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6 (deploy transaction)
- The full unit-test suite (20 tests across 9 `describe` blocks) is reproducible with `cd contracts && npm test`. The expected output is reproduced verbatim in §4.7.
- The 4-minute system demonstration documented in Table 4.2 of Chapter 4 is the recommended live demo. It exercises every public function of the contract and every backend route. The single most impactful step is step 9 — opening `/verify` in a *fresh browser profile with no MetaMask installed* — which makes the wallet-less verification path visible at a glance.
- The EIP-6963 wallet-discovery fix (commit `8fe44f9`) is the most subtle engineering decision in the project; if asked about wallet-injection conflicts, walk through `frontend/src/lib/wallet.ts:32-64`.
- The 41-entry references list in `07_references.md` uses EIP numbers, DOIs, and official documentation URLs wherever available. The Etherscan contract URL is the single most authoritative external reference.
