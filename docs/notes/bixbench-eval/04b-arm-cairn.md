# Phase 04b — Arm B (Cairn) run: bix-10-q1

Agent under test, treatment arm. The project dir is `/private/tmp/bixbench-run/armB`
(capsule data + a pristine `cairn/` store). Cairn was driven via the wrapper
`/tmp/bixbench-run/cc-armB` (asserter `bixbench-cairn`), always invoked from inside armB.

## Question (verbatim)
What is the odds ratio of higher COVID-19 severity (encoded in the column AESEV)
associated with BCG vaccination in a multivariable ordinal logistic regression model
that includes patient interaction frequency variables as covariates?

Target (range_verifier): grade=1 iff predicted OR in [1.50, 1.54].

## What I ran
Proportional-odds ordinal logistic regression with `statsmodels` `OrderedModel`
(logit link). Outcome = per-subject MAXIMUM `AESEV` (ordinal 1-4) from
`TASK008_BCG-CORONA_AE.csv`; predictor = `BCG` (BCG=1, Placebo=0); covariates =
the three patient-interaction-frequency variables `work_hours`, `patients_seen`,
`expect_interact` from `TASK008_BCG-CORONA_DM.csv` (read latin-1), joined on `USUBJID`,
ordered-linear encoding. Analysis set = 791 subjects with >=1 severity-rated AE.

Result: OR(BCG) = 1.5284, 95% CI 1.16-2.01, p = 0.002.
Robustness: lbfgs optimizer -> 1.5283; categorical-dummy covariates -> 1.5209 (all in range).
Alternative per-AE-event spec (2063 events) -> OR 1.17, p=0.082 (NOT significant) -- a real fork.

## Cairn structure authored

### Estimand
- `est-a64dfc2746db` — "OR of higher COVID-severity from BCG, interaction-adjusted":
  adjusted OR for a one-category increase in AESEV associated with BCG vs placebo, in a
  proportional-odds ordinal logistic regression on per-subject MAX AESEV, covariates =
  work_hours/patients_seen/expect_interact, population = trial subjects with >=1 severity-rated AE (n=791).

### Claims (both canonical after publish)
- `clm-84128394b4b0` [grounded, canonical] estimand=est-a64dfc2746db
  text: "...the odds ratio for higher COVID-19 severity associated with BCG vaccination is
  1.53 (95% CI 1.16-2.01, p=0.002; n=791 subjects)."
  evidence: file:TASK008_BCG-CORONA_AE.csv, file:TASK008_BCG-CORONA_DM.csv
  forks: unit-of-analysis=per-subject-max-severity, covariate-encoding=ordinal-linear
  deflation-route: clarify-estimand (confirm intended unit + encoding).

- `clm-c987d73f787b` [grounded, canonical] estimand=est-a64dfc2746db
  text: "Under the alternative per-AE-event specification ... OR for BCG of only 1.17
  (95% CI 0.98-1.40, p=0.082), which is not statistically significant ..."
  evidence: file:TASK008_BCG-CORONA_AE.csv, file:TASK008_BCG-CORONA_DM.csv
  fork: unit-of-analysis=per-AE-event
  contradicts: clm-84128394b4b0  (CONTRADICTION OPEN)
  inherits-caveat: cfd-77462352a32c

### Confound
- `cfd-77462352a32c` — "AESEV unit-of-analysis is underdetermined": AESEV is per-event but
  covariates are per-subject and the question names no unit; per-subject max -> OR 1.53,
  per-event -> OR 1.17; not nested, irreconcilable from data alone.

### Snapshot
- `531495bbaf90aac5` (first publish; promoted both drafts to canonical). validate: OK.
- `cairn head` read-back: canonical 2, unresolved contradictions 1
  (clm-c987d73f787b contradicts clm-84128394b4b0 on est-a64dfc2746db).

## Composed PREDICTED ANSWER (read back from the graph): 1.53

The answer is the per-subject estimate `clm-84128394b4b0`. Per Cairn axiom 4 the contradiction
with the per-event sibling stays OPEN; I did not average the two (1.53 vs 1.17) into a
"convergence" number — I reported the spec that matches the question's patient-severity
framing and carried the fork forward as a scar.
