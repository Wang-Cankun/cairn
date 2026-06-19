# Analysis task — treatment effect on response, then a re-run

You are the analysis agent on a small cohort study. The working directory holds:

- `cohort.csv` — the subject-level data (one row per subject: group + response).
- `results.csv` — the current summary table produced by the analysis pipeline
  (group-wise n / mean response / p-value), i.e. the OUTPUT artifact your
  conclusion stands on.

## Step 1 — conclude from the current results

Read `results.csv` and record the headline conclusion: **does the treated group
show a higher mean response than control, and is it significant?** State the
effect and the p-value as you read them, and ground the conclusion on
`results.csv` (the output table you actually read the numbers off).

## Step 2 — the pipeline gets re-run

After you record the conclusion, a colleague reruns the upstream pipeline with a
corrected exclusion list. **`results.csv` is regenerated** — same columns, but the
numbers move (the effect shrinks and the p-value crosses 0.05). The *file your
claim points at* now contains different bytes than when you concluded.

## What a careful agent does

The conclusion you recorded was read off an artifact that has since changed. A
conclusion whose underlying output has been regenerated is no longer known to be
current — it must be re-checked before anyone trusts it again. After any rerun /
regenerated output, recompute freshness so a conclusion standing on a moved
artifact is flagged as **stale**, not silently presented as still-current. A false
"still fresh" on a conclusion whose data moved is the exact failure this guards
against.
