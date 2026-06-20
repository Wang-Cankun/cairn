# Phase 05 — Results (n=1 smoke test, capsule `bix-10-q1`)

This phase grades both arms' final answers with the **BixBench open-answer judge**
(faithful reimplementation at `tests/eval/bixbench/judge.py`), records the verdicts,
and states — loudly — that this is a single-capsule pipeline smoke test, **not** a
result about whether Cairn improves accuracy.

---

## The question and the target

| field | value |
|---|---|
| **question_id** | `bix-10-q1` |
| **capsule_uuid** | `fbe0e950-76f2-4eb7-a216-a2d377970922` |
| **eval_mode** | `range_verifier` |
| **IDEAL (target)** | `(1.50,1.54)` — numeric range; grade=1 iff predicted OR ∈ [1.50, 1.54] |

> **QUESTION (verbatim):** What is the odds ratio of higher COVID-19 severity
> (encoded in the column AESEV) associated with BCG vaccination in a multivariable
> ordinal logistic regression model that includes patient interaction frequency
> variables as covariates?

**Judge applied (deterministic, no LLM):** `range_verifier` parses the target tuple
with `ast.literal_eval` and checks `lower <= float(predicted) <= upper`. This mirrors
the BixBench source byte-for-byte (`/private/tmp/bixbench-src/bixbench/graders.py`
`_grade_range_verifier`: `lower, upper = ast.literal_eval(target); correct = lower <= float(predicted) <= upper`).
No judge LLM is invoked for this capsule, so the verdict is reproducible and not
subject to LLM-judge variance.

---

## Results table

| arm | predicted | judge raw | verdict | grade |
|---|---|---|---|---|
| **A** — autonomous (no Cairn) | `1.35` | `range check: 1.5 <= 1.35 <= 1.54 -> False` | **incorrect** | **0** |
| **B** — must-use-Cairn | `1.53` | `range check: 1.5 <= 1.53 <= 1.54 -> True` | **correct** | **1** |

Both verdicts were produced by:

```
~/.claude/python/bin/python tests/eval/bixbench/judge.py \
  --question "<the question above>" \
  --target "(1.50,1.54)" \
  --predicted "<1.35 | 1.53>" \
  --eval-mode range_verifier
```

reading each `predicted` string from the arm's own `answer.txt`
(`/private/tmp/bixbench-run/armA/answer.txt` → `PREDICTED ANSWER: 1.35`;
`/private/tmp/bixbench-run/armB/answer.txt` → `PREDICTED ANSWER: 1.53`).

---

## With − without delta

| metric | without Cairn (A) | with Cairn (B) | delta |
|---|---|---|---|
| grade | 0 | 1 | **+1** |
| predicted OR | 1.35 | 1.53 | +0.18 |
| in target band [1.50, 1.54]? | no | yes | — |

On this one capsule, the Cairn arm landed inside the verifier band and the
autonomous arm did not. **One run is not a measurement** — see the caveat below.

---

## Arm A (autonomous, no Cairn) — full answer

**PREDICTED ANSWER: 1.35** → grade 0 (just below the band).

- Outcome = COVID-19 severity: AE rows where `AEPT` contains "COVID" (221 rows / 194
  subjects); listwise-dropped missing `AESEV` → **N = 174 event rows** (AESEV
  {1:57, 2:91, 3:19, 4:7}).
- Joined the three interaction-frequency covariates (`work_hours`, `patients_seen`,
  `expect_interact`) from DM on `USUBJID`; `BCG=1` for `TRTGRP=="BCG"` (verified
  `TRTGRP == EXDRUG`).
- Fit `AESEV ~ BCG + work_hours + patients_seen + expect_interact` with statsmodels
  `OrderedModel` (logit); OR = exp(BCG coef).
- **Primary spec (covariates as ordered numeric 1/2/3): OR = 1.35** (BCG coef 0.300,
  95% CI 0.76–2.40, not significant). Dummy-coded factors → 1.28. Sensitivity sweep
  clusters OR ≈ 1.28–1.42 (per-subject MAX → 1.17; unadjusted → 1.31). Cross-checked
  in R `MASS::polr` — identical, ruling out a parameterization/sign bug.
- Arm A's honest self-call: every defensible spec it tried sits **below** the IDEAL
  band; it reported 1.35 rather than tuning toward the target.

**The pivot it did not take:** Arm A computed the per-subject-MAX spec (OR 1.17) but
treated it as just another row in a sensitivity sweep and kept the *event-level*
result (1.35) as its headline. Arm B made the opposite unit choice its headline.
(NB: Arm A's per-subject-MAX number, 1.17, matches Arm B's per-*event* number, 1.17,
not Arm B's per-subject-MAX number, 1.53 — the two arms differ in *both* the unit
choice and the cohort/encoding details that feed it, so this is one capsule with two
defensible analysis pipelines, not a clean A/B on a single line of code.)

---

## Arm B (must-use-Cairn) — full answer

**PREDICTED ANSWER: 1.53** → grade 1 (inside the band).

- Same model family (statsmodels `OrderedModel`, logit). Outcome = **per-subject
  MAXIMUM `AESEV`**; predictor `BCG`; covariates `work_hours`, `patients_seen`,
  `expect_interact` (ordered-linear). Analysis set = **791 subjects** with ≥1
  severity-rated AE.
- **OR(BCG) = 1.5284, 95% CI 1.16–2.01, p = 0.002.** Robustness (all in-band):
  lbfgs optimizer → 1.5283; categorical-dummy covariates → 1.5209.
- Recorded fork (NOT collapsed): per-AE-event spec (2063 events) → OR 1.17, p = 0.082
  (not significant). Not nested with per-subject-MAX; irreconcilable from data alone.

### Arm B's scar graph

Cairn store: `/private/tmp/bixbench-run/armB/cairn/` — snapshot `531495bbaf90aac5`.
`cairn status` / `cairn head` read-back: **canonical 2, open contradictions 1.**

```
estimand  est-a64dfc2746db  "OR of higher COVID-severity from BCG, interaction-adjusted"
   ├─ clm-84128394b4b0  [grounded, canonical]  OR 1.53  (per-subject MAX, n=791, p=0.002)   ← HEADLINE / reported answer
   │      forks: unit=per-subject-max-severity, covariate-encoding=ordinal-linear
   │      deflation-route: clarify-estimand (confirm intended unit + encoding)
   └─ clm-c987d73f787b  [grounded, canonical]  OR 1.17  (per-AE-event, 2063 events, p=0.082, n.s.)
          contradicts: clm-84128394b4b0   ← CONTRADICTION OPEN
          inherits-caveat: cfd-77462352a32c
confound  cfd-77462352a32c  "AESEV unit-of-analysis is underdetermined"
          (AESEV is per-event; covariates are per-subject; question names no unit;
           per-subject MAX → 1.53, per-event → 1.17; not nested, irreconcilable from data alone)
```

### What Cairn changed about the *process* (not just the score)

1. **Declaring the estimand forced the unit choice into the open.** Pinning the
   analysis unit as per-subject MAX AESEV (n=791) is the single decision that moves
   the OR from 1.17 to 1.53. In Arm A that same choice stayed implicit and the
   opposite default (event-level) won by inertia.
2. **The losing fork survived as a contradicting sibling, not a deleted row.** The
   per-event result (1.17, n.s.) is a canonical claim that *contradicts* the headline
   on the same estimand; `cairn head` keeps that contradiction OPEN rather than
   averaging the two into a laundered "convergence" number.
3. **The answer was read back from the graph,** carrying its scar: the headline 1.53
   travels with an attached, unresolved unit-of-analysis confound and an explicit
   deflation route (clarify the intended unit/encoding).

**Honest reading of the mechanism:** Cairn did not make the per-subject-MAX spec
*more correct* — both 1.53 and 1.17 are defensible, and the verifier band simply
happens to reward the per-subject-MAX choice. What Cairn did was force that choice to
be named, justified, and carried with its contradiction instead of being an
unexamined default. On this capsule, being forced to name the unit coincided with
picking the unit the verifier rewards. Whether that is a repeatable effect or a
coin-flip that landed heads is exactly what a single run cannot tell us.

---

## HONEST CAVEAT — read this before quoting any number above

- **n = 1.** One capsule, one question, one run per arm. The grade column reads
  `0 → 1`, but that is a single Bernoulli draw per arm, not an accuracy estimate.
  There is no confidence interval here; there is no "Cairn lifts accuracy by X."
- **This is a pipeline smoke test.** The purpose of phases 01–05 was to prove the
  harness runs end-to-end on host (no Docker): fetch a real BixBench capsule → run
  both arms → grade with the faithful judge → record verdicts. It succeeded at *that*.
- **The two arms differ in more than "uses Cairn."** They diverged on the unit of
  analysis, the cohort definition (COVID-only event rows vs. all severity-rated AEs),
  and the n (174 vs. 791). So this is not a clean isolation of the Cairn variable; the
  arms are two whole analysis pipelines that happen to differ in many places at once.
- **Stochastic + judge-dependent in general.** This capsule's `range_verifier` is
  deterministic (no LLM judge), which is good for reproducibility — but `llm_verifier`
  capsules would add judge variance, and the agent runs themselves are stochastic.
- **Selection.** `bix-10-q1` was chosen for host-tractability (pure tabular ordinal
  regression), not at random from the 205-question set. It is not representative.

**Bottom line:** the harness works end-to-end and produced a clean, reproducible
0/1 verdict per arm. Treat the `0 → 1` delta as *"the pipeline ran and the two arms
landed on different sides of the band on this one capsule,"* not as evidence that
Cairn improves accuracy. The next step (out of scope here) is to run many capsules,
many seeds, with the arms isolated to a single variable, before any claim about
Cairn's effect on accuracy is warranted.
