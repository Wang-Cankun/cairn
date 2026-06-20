# BixBench × Cairn eval — step-doc index

A host-based (no-Docker) **smoke test** of the Cairn × BixBench harness: take one
real BixBench capsule, run the same bioinformatics question in two arms (autonomous
vs. must-use-Cairn), grade both with BixBench's own open-answer judge, and record the
verdicts. This directory is the written trail; read the docs in order.

> **Scope reminder (n=1):** this is a *pipeline* smoke test, not a result about Cairn's
> effect on accuracy. See `05-results.md` § HONEST CAVEAT.

## The capsule under test

- **question_id:** `bix-10-q1` · **capsule_uuid:** `fbe0e950-76f2-4eb7-a216-a2d377970922`
- **eval_mode:** `range_verifier` · **IDEAL target:** `(1.50,1.54)`
- **Question:** odds ratio of higher COVID-19 severity (`AESEV`) associated with BCG
  vaccination in a multivariable ordinal logistic regression adjusting for
  patient-interaction-frequency covariates.

## Steps

| # | doc | what it covers |
|---|---|---|
| 01 | [`01-design.md`](01-design.md) | Eval design / contract: arms (autonomous vs. Cairn), the two metrics, the faithful-judge plan, how BixBench grades open answers. Design only — no runs. |
| 02 | [`02-build.md`](02-build.md) | Harness build + verification: `tests/eval/bixbench/` (`fetch.py`, `judge.py`), the BixBench open-answer judge reimplemented (str/range/llm verifiers), pluggable LLM with a no-crash `NO_JUDGE_LLM` fallback. |
| 03 | [`03-capsule.md`](03-capsule.md) | Capsule selection (`bix-10-q1`) + arm prep: download/unzip into `armA`/`armB`, notebooks stripped, `cairn init` in armB (pristine store), the `cc-armB` wrapper + the "wrapper gotcha", DM latin-1 encoding note. |
| 04a | [`04a-arm-autonomous.md`](04a-arm-autonomous.md) | Arm A run (no Cairn): event-level ordinal logit, sensitivity sweep OR ≈ 1.28–1.42, R cross-check. **Predicted 1.35.** |
| 04b | [`04b-arm-cairn.md`](04b-arm-cairn.md) | Arm B run (must-use-Cairn): per-subject-MAX ordinal logit; estimand + 2 contradicting canonical claims + 1 open unit-of-analysis confound; snapshot `531495bbaf90aac5`. **Predicted 1.53.** |
| 05 | [`05-results.md`](05-results.md) | Grading both arms with the `range_verifier` judge, results table, with−without delta, Arm B's scar graph, and the n=1 honest caveat. **A: incorrect (0) · B: correct (1).** |

## Result at a glance

| arm | predicted | verdict | grade |
|---|---|---|---|
| A — autonomous | 1.35 | incorrect | 0 |
| B — must-use-Cairn | 1.53 | correct | 1 |

Judge: deterministic `range_verifier` (`1.50 <= predicted <= 1.54`), no LLM. See
`05-results.md` for why the `0 → 1` delta is a pipeline-runs proof, **not** a claim
that Cairn improves accuracy.

## Out-of-tree artifacts (NEVER committed — live under `/tmp`)

- Arm A project dir: `/private/tmp/bixbench-run/armA` (+ `answer.txt`, `FINDINGS.md`)
- Arm B project dir: `/private/tmp/bixbench-run/armB` (+ `answer.txt`, `FINDINGS.md`, `cairn/` store)
- Cairn wrapper: `/tmp/bixbench-run/cc-armB`
- BixBench source / dataset: `/private/tmp/bixbench-src`, `/private/tmp/*.jsonl`, capsule zips

Committed harness code lives under `tests/eval/bixbench/`; written step-docs under
`docs/notes/bixbench-eval/`. `git status` for the worktree shows only those two paths.
