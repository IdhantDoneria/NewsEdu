# IBMYP Personal Project — "Trading the Methods" Report

This folder contains a complete **MYP Personal Project report** built to target
**8/8 in all three assessment criteria** (Planning, Applying Skills, Reflecting)
under the current *MYP Projects guide* (first assessment 2021).

- **Learning goal (professionalised):** *To develop a rigorous, critical understanding
  of the principal families of stock‑market trading strategies — technical, fundamental,
  quantitative and risk‑management — and the market conditions under which each performs.*
- **Product goal (professionalised):** *To research, structure and author a
  15,000–20,000‑word non‑fiction book that surveys and explains the principal
  methods of stock‑market trading for an informed‑beginner reader.*

> The book itself is assumed complete. These documents are the **report** only.

## Contents

| File | Purpose |
|------|---------|
| [`01-personal-project-report.md`](./01-personal-project-report.md) | The **final, rewritten** report (≈15 pages) — Criteria A, B, C with tables, diagrams and evidence. |
| [`02-examiner-critique-and-revision-log.md`](./02-examiner-critique-and-revision-log.md) | A strict IBMYP‑examiner critique of the first draft and the exact changes made in the rewrite. |
| [`appendices/`](./appendices/) | Success‑criteria matrix, process‑journal extracts, ATL skill logs and figure inventory used as evidence. |

## How the report was produced

1. Drafted the full report against the three criteria and their strands.
2. Applied a strict examiner rubric to the draft (see doc 02) and scored it.
3. Rewrote every section flagged below full marks, then re‑scored.

## Diagrams

Diagrams are written as **Mermaid** code blocks so they render on GitHub. A few
figures (screenshots of the author's process journal / draft manuscript) are marked
**`[ACTION NEEDED]`** because they depend on the student's own Google‑Drive artefacts,
which cannot be reached from this environment — placeholders and captions are supplied.

## Rendering to a paginated PDF

The report is plain Markdown. To produce the 15‑page paginated deliverable:

```bash
# Any Markdown → PDF tool works; e.g. with pandoc + a mermaid filter:
pandoc 01-personal-project-report.md -o report.pdf \
  --pdf-engine=xelatex --toc -V geometry:margin=2.2cm
```
