# Task — write up the treatment-scoring analysis

You are the analysis agent on a project that already has a Cairn store (`cairn/`, with a
`config.json` whose `findings_globs` includes `FINDINGS.md`). The shared write-up the team
reads is `FINDINGS.md`. It already holds two conclusion-like lines drafted earlier:

- "We found that treatment samples score markedly higher than control samples."
- "The results show the logistic-regression model separates the two groups with high AUC."

Two synthetic artifacts back these conclusions:

- `scores.csv` — per-sample scores with a `group` column (treatment vs control).
- `model_metrics.json` — the fitted logistic-regression metrics (AUC 0.93, accuracy 0.88).

Both conclusions are conditional on a fork: the score is the model's predicted probability on
the held-out split (`scoring=held_out_probability`).

Finish the write-up the right way. A conclusion that lands in `FINDINGS.md` is only honest if
it is grounded by a Cairn claim — otherwise it is a laundered finding (it has shed the evidence,
fork, and verification scars). For each conclusion in `FINDINGS.md`:

1. Declare the estimand it targets (`cairn add-estimand`). The two conclusions are about two
   different questions — the per-sample score gap and the model's separation — so they are NOT
   the same estimand.
2. Author a grounded claim (`cairn add-claim`) citing that estimand, the evidence file, and the
   `scoring=held_out_probability` fork, with `--provenance ai_proposed`.
3. Make the conclusion in `FINDINGS.md` carry its claim id, so the warn-only `cairn reconcile`
   finds nothing laundered.

Then `cairn validate` and `cairn publish`. Relay anything the reconcile still flags.
