# Phase 03 — Capsule selection & arm prep (host-based smoke test)

This phase picks ONE tractable BixBench capsule for a host-based (no-Docker)
smoke test of the Cairn × BixBench harness, downloads + unzips it into two arm
project dirs, initializes the Cairn store in arm B, and stamps a Cairn wrapper.

All BixBench source/data lives under `/tmp` and is NEVER committed (verified:
final `git status` shows only `docs/notes/bixbench-eval/` and `tests/eval/`).

---

## Chosen capsule

| field | value |
|---|---|
| **question_id** | `bix-10-q1` |
| **capsule_uuid** | `fbe0e950-76f2-4eb7-a216-a2d377970922` |
| **data_folder** | `CapsuleFolder-fbe0e950-76f2-4eb7-a216-a2d377970922.zip` |
| **eval_mode** | `range_verifier` |
| **ideal (TARGET)** | `(1.50,1.54)` — numeric range; grade=1 iff predicted odds ratio ∈ [1.50, 1.54] |

### Full QUESTION text (handed verbatim to the agent)

> What is the odds ratio of higher COVID-19 severity (encoded in the column
> AESEV) associated with BCG vaccination in a multivariable ordinal logistic
> regression model that includes patient interaction frequency variables as
> covariates?

(Study hypothesis, for context only — NOT shown to the agent:
"Tuberculosis BCG re-vaccination reduces COVID-19 disease severity among
healthcare workers." Source: BCG-CORONA trial, TASK008.)

---

## Data files (placed at the ROOT of each arm dir)

Capsule unzips to 6 files (3 CSV + their `.xlsx` twins). Reference notebooks
were stripped by `fetch.py` (anti-cheat parity with BixBench) — confirmed none
present. Total ~2.3 MB.

| file | bytes | role |
|---|---|---|
| `TASK008_BCG-CORONA_AE.csv`  | 859,820 | Adverse Events — **contains `AESEV`** (severity, ordinal 1–4) |
| `TASK008_BCG-CORONA_AE.xlsx` | 306,921 | same, Excel |
| `TASK008_BCG-CORONA_DM.csv`  | 98,308  | Demographics — `TRTGRP` (BCG/Placebo), `SEX`, `Age`, `work_hours`, `patients_seen`, `expect_interact` |
| `TASK008_BCG-CORONA_DM.xlsx` | 47,820  | same, Excel |
| `TASK008_BCG-CORONA_EX.csv`  | 860,309 | Exposure (dosing) records |
| `TASK008_BCG-CORONA_EX.xlsx` | 194,788 | same, Excel |

Key columns verified by direct inspection:
- `AE.AESEV` ordinal values present: `{1.0, 2.0, 3.0, 4.0}` → the ordinal response.
- `DM.TRTGRP` values: `{'BCG', 'Placebo'}` → the BCG-vaccination predictor.
- `DM` has all three "patient interaction frequency" covariates the question
  asks for: `work_hours`, `patients_seen`, `expect_interact` (1000 rows).

### Encoding gotcha (note for the analysis arms)
`TASK008_BCG-CORONA_DM.csv` is **latin-1**, not UTF-8 (a byte `0xe9` in the
RACE/education columns breaks default `pd.read_csv`). The agent must read it as
`pd.read_csv(..., encoding="latin-1")`. The `.xlsx` twin sidesteps this. This
is a real, intended part of the task difficulty — left as-is.

---

## Why this capsule is HOST-TRACTABLE

Selected by scanning all 205 questions (`fetch.py` + a keyword tractability
scorer) and inspecting the top candidates' on-disk data:

1. **Pure tabular stats.** The answer is a coefficient from an *ordinal logistic
   regression* over three clinical CSVs. No genome alignment, no FASTQ/BAM/VCF,
   no imaging, no large reference downloads, no Docker.
2. **Tooling already present.** `statsmodels 0.14.6` ships
   `statsmodels.miscmodels.ordinal_model.OrderedModel` (verified import OK),
   which fits exactly this model. `pandas 2.3.3`, `scipy`, `numpy`, `openpyxl`
   all present in `~/.claude/python`.
3. **Small, self-contained data** (~2.3 MB, 3 tables, joinable on `USUBJID`).
4. **Deterministic, tight target.** `range_verifier` with `(1.50, 1.54)` — the
   judge needs no LLM; grading is a numeric containment check (`judge.py`
   `range_verifier` path).
5. **Short, unambiguous question** — minimal prompt-engineering surface.

### Rejected alternates (for the record)
- `bix-16-q1` (Spearman corr, str_verifier `'CDKN1A'`): data is **1.05 GB**
  (`CRISPRGeneEffect.csv` 429 MB + expression matrix 616 MB) → too heavy.
- `bix-51-q3` (logistic-regression p-value, range `(0.0024,0.0026)`): viable
  fallback — single 22 KB `data.xlsx`, also pure `statsmodels`. Kept as backup
  if `bix-10-q1` proves flaky.
- All WGS / Phylogenetics / Variant-calling / Imaging capsules: avoided
  (heavy bioinformatics pipelines / unavailable tooling).

---

## Dependencies installed this phase

- `mord==0.7` — installed best-effort via
  `uv pip install --python ~/.claude/python/bin/python mord`.
  **Convenience only / NON-FATAL.** The analysis does not require it:
  `statsmodels.OrderedModel` is the primary path and was already present. Logged
  here for reproducibility.

No other installs. No system packages. R 4.4.1 (`/usr/local/bin/R`) is available
but not needed for this capsule.

---

## Arm project dirs (prepared & verified)

Both arms received the SAME capsule data at their root (identical 6 files,
notebooks stripped). They are out-of-tree under `/tmp/bixbench-run/`.

### Arm A — control (capsule data only)
```
/private/tmp/bixbench-run/armA
  TASK008_BCG-CORONA_AE.csv  / .xlsx
  TASK008_BCG-CORONA_DM.csv  / .xlsx
  TASK008_BCG-CORONA_EX.csv  / .xlsx
```
No Cairn. The agent's cwd for the control run is this dir.

### Arm B — treatment (capsule data + Cairn store)
```
/private/tmp/bixbench-run/armB
  cairn/                      <- `cairn init` store (claims/ estimands/ confounds/ snapshots/ config.json index.md log.md)
  TASK008_BCG-CORONA_AE.csv  / .xlsx
  TASK008_BCG-CORONA_DM.csv  / .xlsx
  TASK008_BCG-CORONA_EX.csv  / .xlsx
```
- Initialized with `bun run /Users/wang.13246/Documents/GitHub/cairn-e2e/src/cli.ts init`
  run from inside `armB` (store discovery walks UP from cwd, so the store lands
  at `armB/cairn`).
- Store is **pristine** for the run: `status` reports
  `canonical:0  drafts:0  ungrounded drafts:0  open contradictions:0`.
  (An earlier write probe — `add-estimand --def …` — confirmed the asserter env
  propagates, then the store was wiped and re-`init`ed.)

### Cairn wrapper
```
/tmp/bixbench-run/cc-armB          (chmod +x, 815 bytes)
```
- **Named `cc-armB`, NOT `cairn`, and lives OUTSIDE armB** — a wrapper named
  `cairn` next to/inside the project would collide with the `armB/cairn/` store
  dir and break the UP-walking store discovery. (The "wrapper gotcha.")
- Sets `export CAIRN_ASSERTER="${CAIRN_ASSERTER:-bixbench-cairn}"` and
  `exec bun run …/src/cli.ts "$@"` — forwards every arg unchanged.
- **Must be invoked from INSIDE `armB`** so discovery finds `armB/cairn`.
  Verified: `cd armB && /tmp/bixbench-run/cc-armB status` finds the right store;
  a write recorded `by bixbench-cairn` in `cairn/log.md` and the estimand's
  `who:` field.

---

## Verification summary (all passed)

- `fetch.py` loaded 205 questions; scorer ranked `bix-10-q1` top among
  host-tractable candidates.
- Capsule downloaded anonymously (`token=False`) + unzipped into both arms; 6
  data files at root, notebooks stripped.
- `AESEV` (1–4), `TRTGRP` (BCG/Placebo), and all three interaction covariates
  confirmed in the data; DM latin-1 encoding noted.
- `statsmodels.OrderedModel` import OK; `mord` installed best-effort.
- armB `cairn init` OK; asserter `bixbench-cairn` propagation confirmed; store
  reset to pristine.
- Wrapper executable, args forward, store discovery correct.
- `git status` (worktree) shows only `docs/notes/bixbench-eval/` and
  `tests/eval/` — no `/tmp` data leaked.

---

## Handoff to Phase 04 (the smoke run)

Run the SAME task in both arms, host-based, cwd = the arm dir:

- **Arm A (control):** agent works in `/private/tmp/bixbench-run/armA`, no Cairn.
- **Arm B (treatment):** agent works in `/private/tmp/bixbench-run/armB`, uses
  the Cairn wrapper `/tmp/bixbench-run/cc-armB <verb>` (from inside armB) to
  record estimand/claim/confound. `CAIRN_ASSERTER=bixbench-cairn` is preset.
- **Task text:** the QUESTION above (verbatim).
- **Grade:** feed the agent's final numeric answer to
  `judge.py::grade(question, target="(1.50,1.54)", predicted=<answer>,
  eval_mode="range_verifier")` → deterministic range check, no LLM needed.
- Interpreter for any analysis scaffolding: `~/.claude/python/bin/python`.
