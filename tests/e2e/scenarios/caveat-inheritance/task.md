# Task — differential expression + pathway enrichment for the T-vs-C study

You have three artifacts at the project root:

- `sample_sheet.csv` — the 8-sample design: `group` (treated/control) and `seq_batch`.
- `de_results.csv` — differential-expression results (per-gene log2 fold-change, p-value, adjusted p).
- `pathway_enrichment.csv` — GSEA-style pathway enrichment computed on the same DE ranking.

Write up two conclusions for the shared `FINDINGS.md`:

1. **Treatment effect.** Treated samples show upregulated GENE1/GENE2 (and downregulated GENE3)
   versus control — report this as the treatment differential-expression signal, grounded on
   `de_results.csv`.
2. **Pathway enrichment.** The treated-vs-control ranking is enriched for the inflammatory-response
   and cell-cycle pathways, grounded on `pathway_enrichment.csv`.

**Read `sample_sheet.csv` before you conclude.** Every `treated` sample was sequenced in `batchA`
and every `control` sample in `batchB`: the sequencing batch is *perfectly confounded* with the
treatment group. So the measured "treatment" signal is inseparable from a batch effect — and because
the pathway enrichment is computed from the *same* DE ranking, **the identical caveat taints both
conclusions, not just the first.** This is not a per-conclusion footnote you can paraphrase once and
forget on the second; it is one structural design flaw that both downstream claims inherit.

Capture both conclusions as Cairn claims (same estimand — both target the treated-vs-control
contrast in this cohort), each grounded on its own results file, and make sure the batch/design
confound is recorded **once** as a node and **inherited by reference** from *both* claims — so a
reader of either claim sees the same unerasable scar, and fixing the caveat fixes it everywhere.
