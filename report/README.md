# Project Report — Ediproof

This directory contains the complete project report, structured according to the standard 9-chapter institutional template (~70–80 pages). The report is broken into separate markdown files for ease of editing, printing, and conversion to other formats.

## File order

Read or print the files in this exact order:

| # | File | Section | Page budget |
|---|---|---|---|
| 1 | `00_preliminary.md` | Cover, certificate, declaration, acknowledgement, abstract, TOC, lists, abbreviations | 5–7 |
| 2 | `01_introduction.md` | Chapter 1 — Introduction and System Overview | 8–10 |
| 3 | `02_design.md` | Chapter 2 — System Design and Methodology | 18–22 |
| 4 | `03_implementation.md` | Chapter 3 — Implementation | 10–12 |
| 5 | `04_results.md` | Chapter 4 — Results and Analysis | 8–10 |
| 6 | `05_testing.md` | Chapter 5 — Testing | 6–8 |
| 7 | `06_advantages_limitations.md` | Chapter 6 — Advantages and Limitations | 4–5 |
| 8 | `07_conclusion_future.md` | Chapter 7 — Conclusion and Future Scope | 3–4 |
| 9 | `08_references.md` | Chapter 8 — References (IEEE, 41 entries) | 2–3 |
| 10 | `09_appendix.md` | Chapter 9 — Appendix (Data, Source Code, Diagrams, Certificates) | 6–8 |

The previous 6-chapter version of the report has been preserved under `_archive/` for reference.

## Conversion to Word (.docx)

If `pandoc` is installed:

```bash
cd report
pandoc 00_preliminary.md 01_introduction.md 02_design.md 03_implementation.md \
       04_results.md 05_testing.md 06_advantages_limitations.md \
       07_conclusion_future.md 08_references.md 09_appendix.md \
       -o final_report.docx --toc --toc-depth=3
```

If a custom Word template (`template.docx`) is required by the institution, add `--reference-doc=template.docx`.

## Conversion to PDF

The simplest path is to print each Markdown file from VS Code's built-in Markdown preview (right-click → "Open Preview" → Ctrl-P → "Print"). This produces a clean PDF that respects all tables, headings, and code blocks.

For a single combined PDF via pandoc + LaTeX:

```bash
pandoc 00_preliminary.md 01_introduction.md 02_design.md 03_implementation.md \
       04_results.md 05_testing.md 06_advantages_limitations.md \
       07_conclusion_future.md 08_references.md 09_appendix.md \
       -o final_report.pdf \
       --pdf-engine=xelatex --toc --toc-depth=3 \
       -V geometry:a4paper,margin=1in -V mainfont="Calibri"
```

## Inserting the prepared diagrams

The figures listed in `00_preliminary.md` (List of Figures) and indexed in `09_appendix.md` (§9.3) are prepared separately. Insert each figure at its marked position by replacing the corresponding `> **[Figure X.Y — caption — to be inserted]**` line.

For Word output: Insert → Pictures → choose file. For pandoc-PDF: replace the line with `![Caption](path/to/figure.png)` and re-render.

## Word-count check

Run from this directory (PowerShell on Windows):

```powershell
Get-ChildItem *.md | ForEach-Object {
    "{0,-40} {1,8} words" -f $_.Name, ((Get-Content $_ -Raw) -split '\s+').Count
}
```

Or under bash / Git Bash:

```bash
wc -w *.md
```

Approximate page count: total words ÷ 300 (at 12 pt, 1.5 line spacing on A4). Target: 70–80 pages, ~21,000–24,000 words.

## Notes for the viva

- Every numbered objective in §1.3 maps to a concrete `file:line` location — be ready to open the file at that line and explain the code. The most important locations to memorise:
  - `EdiproofCertificate.sol:399-406` — the `keccak256` anchor (one line of body)
  - `EdiproofCertificate.sol:410-420` — the `_update` soulbound override (five lines)
  - `EdiproofCertificate.sol:182-208` — `verifyCertificate` (the wallet-less surface)
  - `EdiproofCertificate.sol:126-176` — `reissueCertificate` (burn-and-remint with audit trail)
- The deployed contract on Sepolia is independently re-verifiable. Prepare to open these two URLs in front of the examiner:
  - https://sepolia.etherscan.io/address/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5 (contract page; *Read Contract* tab is the best demonstration of wallet-less verification)
  - https://sepolia.etherscan.io/tx/0xfaa818b302f4866e8c9779bf2f0dcb880b1e704d0cb50c1823a5c8ac2b09ceb6 (deploy transaction)
- The full unit-test suite (20 tests across 9 `describe` blocks) is reproducible with `cd contracts && npm test`. The expected output is reproduced verbatim in §5.4.
- The fifteen-step system demonstration in Table 5.2 of Chapter 5 is the recommended live demo. It exercises every public function of the contract and every backend route. The single most impactful step is step 9 — opening `/verify` in a *fresh browser profile with no MetaMask installed* — which makes the wallet-less verification path visible at a glance.
- The EIP-6963 wallet-discovery fix (commit `8fe44f9`) is the most subtle engineering decision in the project; if asked about wallet-injection conflicts, walk through `frontend/src/lib/wallet.ts` (challenge C4 in §6.3 explains the symptom and fix in detail).
- The 41-entry references list in `08_references.md` uses EIP numbers, DOIs, and official documentation URLs wherever available. The Etherscan contract URL is the single most authoritative external reference.
