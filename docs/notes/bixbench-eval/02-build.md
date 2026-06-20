# BixBench × Cairn — Harness build (phase 02)

Status: harness built + verified. No eval run yet (that is phase 03). This doc
records exactly what was built, why, and the verify output, so the owner can
check the work without re-running anything.

Worktree: `/Users/wang.13246/Documents/GitHub/cairn-e2e` (branch
`experiment/e2e-harness`). Harness: `tests/eval/bixbench/`. Design contract:
`01-design.md` (this dir). BixBench source + data live under `/tmp` and are
**never committed**.

---

## What was built

Three files under `tests/eval/bixbench/`:

| file | role | lines | LLM |
|---|---|---|---|
| `fetch.py` | load tasks/targets; download+unzip a capsule into a project dir; return a manifest | ~340 | no |
| `judge.py` | faithful reimplementation of the BixBench open-answer grader | ~330 | pluggable |
| `README.md` | how the pieces fit + how the two arms are invoked + env contract | — | — |

This implements the §2 "parts supplier" split from the design: reuse only
(a) tasks+targets (`BixBench.jsonl`) and (b) the open-answer judge
(`OPEN_ENDED_GRADING_PROMPT`); discard the `litellm`/`aviary` runner.

---

## `fetch.py` — capsule fetcher (no LLM)

Owns the "download + unzip a capsule" job and nothing else.

**Functions (all importable):**
- `load_questions(jsonl_path=None, data_dir=DEFAULT_DATA_DIR)` — returns the 205
  question rows. Resolution order: explicit `jsonl_path` → `<data_dir>/
  BixBench.jsonl` → else **re-download from HF anonymously** (`hf_hub_download`,
  `repo_type="dataset"`, `token=False`).
- `list_questions(...)` — compact summaries `{question_id, capsule_uuid,
  eval_mode, ideal, question}`.
- `get_question(question_id, ...)` — full row by `question_id` (e.g. `bix-1-q1`).
- `fetch_capsule(question_id, target_dir, *, keep_notebooks=False,
  clean_target=True, data_dir=…)` — `hf_hub_download` the matching
  `CapsuleFolder-<uuid>.zip` (anonymous, cached in `data_dir`), `extractall`
  into `target_dir`, then **normalize to BixBench's on-disk layout**: hoist the
  contents of the `*Data*` subfolder up to the project **root** and (default)
  delete the `*Notebook*` dirs + `*.ipynb` files. Returns the **manifest**
  `{question_id, question, ideal, eval_mode, capsule_uuid, data_folder,
  target_dir, data_files:[...]}`.

**Why hoist `*Data*` + strip notebooks:** this mirrors
`/private/tmp/bixbench-src/bixbench/generate_trajectories.py::_extract_and_process_files`
exactly. The notebook strip is **anti-cheat** — the capsule zip ships the
reference solution notebook; if the agent could read it, the eval would be
meaningless. `keep_notebooks=True` exists for debugging only.

**HF download call** (verified against the source):
`hf_hub_download(repo_id="futurehouse/BixBench", filename=<data_folder>,
repo_type="dataset", token=False)`. The row's `data_folder` field IS the zip
filename.

**CLI:** bare invocation prints 3 sample summaries (the phase-02 verify);
subcommands `list`, `show <qid>`, `fetch <qid> <dir>`.

---

## `judge.py` — open-answer grader (pluggable LLM)

Faithful reimplementation of `bixbench/graders.py` for the **open-answer**
track, dropping `litellm`/`aviary`.

**`grade(question, target, predicted, eval_mode, llm=None)` →
`{"grade": 0|1, "verdict": str, "raw": str}`.** `grade == 1` iff
`verdict == "correct"`. Per mode (mirrors the source open-answer path, where
`OpenEndedGrader.grade` passes `partial_match=True, llm_match=True`):

- **`str_verifier`** — cleaned **exact** (strip to `[a-zA-Z0-9]`, lowercase,
  `cleaned_predicted == cleaned_target`) → cleaned **partial**
  (`cleaned_predicted in cleaned_target`) → **LLM fallback** via
  `OPEN_ENDED_GRADING_PROMPT`.
- **`range_verifier`** — deterministic numeric: `ast.literal_eval` the
  `"(lower,upper)"` target; correct iff `lower <= float(predicted) <= upper`
  (mirrors `_grade_range_verifier`; the design anchors range on this
  pure-numeric test, no LLM). Non-numeric prediction → `refused`.
- **`llm_verifier`** (and any unknown mode) — fill `OPEN_ENDED_GRADING_PROMPT`,
  parse `<grade>` with the source's exact regex
  `re.search(r"<grade>\s*(.*?)\s*</grade>", response, re.DOTALL)`.

**Embedded prompt is byte-identical** to
`/private/tmp/bixbench-src/bixbench/prompts.py` (`OPEN_ENDED_GRADING_PROMPT`,
423 chars) — verified in the run below.

**One deliberate fidelity note.** The source `_parse_grade_response` collapses
everything that is not exactly `correct` into `incorrect` (it never emits
`refused`). Our `_parse_grade` additionally recognizes an explicit
`<grade>refused</grade>` as `refused` — the prompt allows it and the design's
verdict vocabulary includes it — while keeping the same **scoring** outcome
(only `correct` → grade 1). This is documented in-code.

**LLM pluggability + no-crash contract.** Pass `llm=callable(prompt)->str`, or
configure the env: `CAIRN_JUDGE_BASE_URL` / `CAIRN_JUDGE_API_KEY` /
`CAIRN_JUDGE_MODEL` (or `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`) →
an OpenAI-compatible `/chat/completions` client. If **nothing** is configured,
LLM paths do not crash: they return `verdict="NO_JUDGE_LLM_CONFIGURED"`
(grade 0) with the would-be prompt in `raw`. Transport failures return
`verdict="JUDGE_LLM_ERROR"` instead of raising. In **this workflow** an
LLM-judge subagent fills the same prompt for the actual smoke run; the env
client is for scale-out.

---

## `README.md`

Documents the table of files, the env contract (cwd == project dir with capsule
data at root; allowed tools R + Python; host-based), how arm A (no `cairn/`
store) and arm B (Cairn-driven) are invoked — as **Claude Code subagents** in
this workflow, as **headless `claude -p`** processes for scale — the wrapper
gotcha, and the grading flow diagram. Restates the n=1 smoke-test guardrail.

---

## Verify output (reproduced)

**1. Syntax check (the exact command from the task spec) — passes:**

```
$ ~/.claude/python/bin/python -c "import ast; \
    ast.parse(open('tests/eval/bixbench/fetch.py').read()); \
    ast.parse(open('tests/eval/bixbench/judge.py').read())"
AST OK
```

**2. Judge prompt byte-identical to source** (compared via `ast.literal_eval`
of the source literal, bypassing the `aviary` import the package otherwise
pulls in):

```
Judge prompt byte-identical to source: OK (len=423)
```

**3. Deterministic judge paths (offline, no LLM):**

```
str exact:    correct      # grade("q","0.0002","0.0002","str_verifier")
str partial:  correct      # target "the value is 0.0002", predicted "0.0002"
range in:     correct      # target "(1.50,1.54)", predicted "1.52"
range out:    incorrect    # target "(1.50,1.54)", predicted "2.0"
range refuse: refused      # target "(1.50,1.54)", predicted "not a number"
```

**4. LLM paths degrade safely with no env configured (no crash):**

```
llm no-config: NO_JUDGE_LLM_CONFIGURED grade: 0
str fallback:  NO_JUDGE_LLM_CONFIGURED   # str_verifier no match -> LLM fallback -> sentinel
```

**5. Grade-response parsing fidelity:**

```
parse correct:   correct
parse incorrect: incorrect
parse refused:   refused
parse junk:      incorrect   # no <grade> tag -> incorrect (source semantics)
```

**6. `fetch.py` loads `BixBench.jsonl` and prints 3 question summaries** (the
required verify; bare invocation, default data dir):

```
Loaded 205 BixBench questions.

First 3 question summaries:

[bix-1-q1] capsule=33b801bb-9b47-4a0a-9314-05325c82fde7 eval_mode=str_verifier
  ideal:    '0.0002'
  question: Using the provided RNA-seq count data and metadata files, perform DESeq2 differential expression analysis to identify significant DEGs (padj < 0.05), then ru...

[bix-1-q2] capsule=33b801bb-9b47-4a0a-9314-05325c82fde7 eval_mode=str_verifier
  ideal:    '1.9E-05'
  question: What is the adjusted p-val threshold for neutrophil activation GO Process from an enrichment analysis (using enrichGO as method) using all significant (p<0.0...

[bix-10-q1] capsule=fbe0e950-76f2-4eb7-a216-a2d377970922 eval_mode=range_verifier
  ideal:    '(1.50,1.54)'
  question: What is the odds ratio of higher COVID-19 severity (encoded in the column AESEV) associated with BCG vaccination in a multivariable ordinal logistic regressi...
```

**7. End-to-end `fetch_capsule` (download + unzip + manifest)** — fetched
`bix-1-q1` into a throwaway `/tmp` dir (since deleted). Confirms anonymous HF
download, `*Data*` hoisting to root, and notebook strip:

```json
{
  "question_id": "bix-1-q1",
  "ideal": "0.0002",
  "eval_mode": "str_verifier",
  "capsule_uuid": "33b801bb-9b47-4a0a-9314-05325c82fde7",
  "data_folder": "CapsuleFolder-33b801bb-9b47-4a0a-9314-05325c82fde7.zip",
  "data_files": [
    "HGNC_05-09-19.txt",
    "Issy_ASXL1_blood_coldata_gender.xlsx",
    "Issy_ASXL1_blood_featureCounts_GeneTable_final.txt",
    "gencode.v31.primary_assembly.genes.csv"
  ]
}
```

The four files landed at the project **root** (no `Data/` wrapper) and no
`.ipynb` is present — anti-cheat strip worked.

---

## Verified facts carried forward

- `BixBench.jsonl`: **205 rows / 59 capsules**. `eval_mode` distribution:
  `llm_verifier = 83`, `str_verifier = 61`, `range_verifier = 61`.
- `range_verifier` `ideal` format confirmed: `"(1.50,1.54)"` (a `(lower,upper)`
  tuple string).
- Dataset jsonl currently at `/private/tmp/bixbench-data/BixBench.jsonl` (the
  harness default `data_dir`); not present at the worktree root. `fetch.py`
  re-downloads anonymously if missing.
- Out-of-tree hygiene confirmed: `git status` shows only `tests/eval/` and
  `docs/notes/bixbench-eval/` as new — no `/tmp` data leaks into the tree.

## Handoff to phase 03 (smoke run)

- Pick one open-answer capsule (a `str_verifier` or `range_verifier` row gives a
  free deterministic cross-check on the LLM grade). `bix-1-q1` (DESeq2 +
  enrichGO, `str_verifier`, ideal `0.0002`) is a concrete candidate already
  shown to fetch cleanly.
- For each arm, call `fetch_capsule(qid, <arm_dir>)` into a **separate clean**
  dir (arm A: no `cairn/`; arm B: `cairn init` inside).
- Run each arm (Claude Code subagent) → predicted answer string → `judge.grade(
  question, ideal, predicted, eval_mode)` → record `grade(A)` vs `grade(B)`.
- For the LLM grade in the smoke run, either set `CAIRN_JUDGE_*` env or route
  the filled `OPEN_ENDED_GRADING_PROMPT` to an LLM-judge subagent.
- Keep the n=1 guardrail visible: this proves the pipeline, not a quality delta.
