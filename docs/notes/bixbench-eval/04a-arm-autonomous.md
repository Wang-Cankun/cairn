# 04a — Arm A (Autonomous, no Cairn)

Project dir: `/private/tmp/bixbench-run/armA`
Question: `bix-10-q1` (eval_mode `range_verifier`, IDEAL target `(1.50,1.54)`)

> What is the odds ratio of higher COVID-19 severity (encoded in the column AESEV)
> associated with BCG vaccination in a multivariable ordinal logistic regression model
> that includes patient interaction frequency variables as covariates?

## Approach
Free-form, no Cairn. Engine: `~/.claude/python/bin/python`
(`statsmodels.miscmodels.ordinal_model.OrderedModel`), cross-checked with R `MASS::polr`.

1. Read the three capsule tables. DM is latin-1, read with `encoding="latin-1"`.
   - AE: 2694 adverse-event rows; `AESEV` ordinal 1-4 (1238/741/64/20; 631 NaN overall).
   - DM: 1000 subjects; `TRTGRP` BCG(500)/Placebo(500); interaction-frequency covariates
     `work_hours` (1-40 / 41-80 / >80), `patients_seen` (1-50 / 51-100 / >100),
     `expect_interact` (Yes/No).
   - EX: dosing only.
2. Defined outcome = COVID-19 severity: AE rows where `AEPT` contains "COVID"
   (COVID-19, COVID-19 pneumonia, Asymptomatic COVID-19) -> 221 rows / 194 subjects.
3. Joined the 3 interaction covariates from DM on `USUBJID` (dropping DM's duplicate
   `TRTGRP` to avoid an `_x/_y` clash — a gotcha that bit me twice).
4. Listwise-dropped missing `AESEV` -> **N = 174** COVID-19 AE rows
   (AESEV {1:57, 2:91, 3:19, 4:7}).
5. `BCG = 1` if TRTGRP=="BCG" else 0. Verified TRTGRP perfectly matches `EXDRUG`
   (Bacillus Calmette-Guerin vs 0.9% NaCl), so the exposure coding is unambiguous.
6. Fit proportional-odds ordinal logit
   `AESEV ~ BCG + work_hours + patients_seen + expect_interact` (logit link).
   Odds ratio = exp(BCG coefficient).

## Key commands
- `python` OrderedModel fit (primary): covariates as ordered numeric scores 1/2/3,
  expect_interact 0/1.
- Alternative: `patsy` dummy-coded ordered factors.
- R cross-check: `MASS::polr(AESEV ~ BCG + work_hours + patients_seen + expect_interact)`.

## Results
| spec (event-level, logit ordinal)        | N   | OR(BCG) |
|------------------------------------------|-----|---------|
| AEPT~COVID, covariates **numeric** (primary) | 174 | **1.35** |
| AEPT~COVID, covariates as factors        | 174 | 1.28    |
| AEPT == "COVID-19" exact, numeric        | 163 | 1.28    |
| COVID|SARS|corona, numeric               | 176 | 1.42    |
| unadjusted (BCG only)                    | 174 | 1.31    |
| per-subject MAX AESEV, numeric           | 151 | 1.17    |

- Primary: BCG coef = 0.300, **OR = 1.35**, 95% CI for OR ≈ 0.76–2.40 (not significant).
- R `polr` reproduces python exactly (1.350 numeric / 1.284 factor) — rules out a
  parameterization/sign bug.

All defensible specifications cluster in **OR ≈ 1.28–1.42**, direction-consistent
(BCG → somewhat higher COVID-19 severity) but never reaching the IDEAL band (1.50, 1.54).
I report my honest best estimate rather than tuning toward the target.

## PREDICTED ANSWER
**OR = 1.35** (primary specification: COVID-19 AE rows, ordinal logit, interaction
covariates as ordered numeric scores). Falls just below the verifier target (1.50, 1.54)
-> would score grade=0.

Deliverables in project dir:
- `/private/tmp/bixbench-run/armA/answer.txt` -> `PREDICTED ANSWER: 1.35`
- `/private/tmp/bixbench-run/armA/FINDINGS.md`
