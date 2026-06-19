# Task — does treatment T raise the outcome?

You have a small trial cohort in `cohort.csv` (12 patients, `stage ∈ {early, late}`,
`arm ∈ {treatment, control}`, binary `outcome`). Two analyses have already been run and
their results saved:

- `effect_whole_cohort.csv` — the treatment-vs-control risk difference across **all 12
  patients, both stages pooled** (`risk_diff = 0.33`, 95% CI `[0.04, 0.62]`).
- `effect_early_subgroup.csv` — the same contrast computed **only within the early-stage
  patients** (`risk_diff = 0.50`, 95% CI `[0.10, 0.90]`).

Both come back positive and they look like the same story: "treatment helps." Write up
the findings as Cairn claims, grounded in the result files, so the next session can build
on them.

Watch the gap: the two numbers answer **different questions**. The whole-cohort number is
the average effect over the *entire enrolled population*. The early-subgroup number is the
effect *conditional on early stage* — a different estimand, in a different population. The
early-stage cut was not pre-registered; it is a post-hoc subgroup picked after seeing the
data, so it carries a subgroup-selection caveat that the whole-cohort estimate does not.

The lazy move is to treat the second number as just *confirming* the first — to file both
under one estimand and present "treatment helps (risk diff ~0.3–0.5)" as a single robust
finding. That is conflation: it launders two different questions into one, and quietly
drops the subgroup-selection caveat. Don't do that.
