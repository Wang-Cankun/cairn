# Cairn × BixBench eval harness

This dir holds the **parts** the Cairn × BixBench accuracy eval uses. Design
contract: `../../../docs/notes/bixbench-eval/01-design.md`. Build notes:
`../../../docs/notes/bixbench-eval/02-build.md`.

BixBench is treated as a **parts supplier, not a runner**. We reuse exactly two
things from it: the curated **tasks + target answers** (`BixBench.jsonl`) and the
curated **open-answer judge** (`OPEN_ENDED_GRADING_PROMPT`). We discard their
`litellm`/`aviary` agent loop. Our agent-under-test is **Claude Code**.

## Files

| file | what it does | LLM? |
|---|---|---|
| `fetch.py` | load `BixBench.jsonl`; list/look-up questions; download+unzip a `CapsuleFolder-<uuid>.zip` into a project dir; return a manifest | no |
| `judge.py` | faithful reimplementation of the BixBench open-answer grader; `grade(question, target, predicted, eval_mode)` → `{grade, verdict, raw}` | pluggable |
| `README.md` | this file | — |

Everything under `/tmp` (the dataset jsonl + capsule zips) is **out-of-tree and
never committed**. Only this dir + the step-docs are committed.

Interpreter: **`~/.claude/python/bin/python`** (has `pandas`/`scipy`/`numpy` +
`huggingface_hub`). Install extra capsule deps with
`uv pip install --python ~/.claude/python/bin/python <pkg>`.

## `fetch.py`

Functions (all importable):

- `load_questions(jsonl_path=None, data_dir=…)` → list of 205 rows. Resolution:
  explicit `jsonl_path` → `<data_dir>/BixBench.jsonl` → else re-download from HF
  anonymously (`token=False`).
- `list_questions(...)` → compact summaries `{question_id, capsule_uuid,
  eval_mode, ideal, question}`.
- `get_question(question_id, ...)` → the full row.
- `fetch_capsule(question_id, target_dir, *, keep_notebooks=False,
  clean_target=True, …)` → downloads `CapsuleFolder-<uuid>.zip` (cached in
  `data_dir`), extracts into `target_dir`, hoists the `*Data*` folder contents
  to the project **root**, and (default) strips reference notebooks
  (`*Notebook*` dirs + `*.ipynb`) for anti-cheat parity with BixBench. Returns
  the **manifest**:

  ```json
  {
    "question_id": "...", "question": "...", "ideal": "...",
    "eval_mode": "str_verifier|range_verifier|llm_verifier",
    "capsule_uuid": "...", "data_folder": "CapsuleFolder-<uuid>.zip",
    "target_dir": "<abs path>", "data_files": ["...relative paths..."]
  }
  ```

CLI:

```bash
PY=~/.claude/python/bin/python
$PY tests/eval/bixbench/fetch.py                 # verify: print 3 summaries
$PY tests/eval/bixbench/fetch.py list --n 5      # list first 5
$PY tests/eval/bixbench/fetch.py show bix-1-q1   # full row as JSON
$PY tests/eval/bixbench/fetch.py fetch bix-1-q1 /tmp/bixbench-run/arm-A   # unzip a capsule
```

## `judge.py`

`grade(question, target, predicted, eval_mode, llm=None)` →
`{"grade": 0|1, "verdict": str, "raw": str}`. `grade == 1` iff
`verdict == "correct"`. Mirrors `bixbench/graders.py` (open-answer path):

- `str_verifier` — cleaned **exact** match (strip to `[a-zA-Z0-9]`, lowercase),
  then cleaned **partial** (`predicted in target`), then **LLM fallback** via
  `OPEN_ENDED_GRADING_PROMPT`.
- `range_verifier` — **deterministic numeric** check: target is
  `"(lower,upper)"`; correct iff `lower <= float(predicted) <= upper`;
  non-numeric prediction → `refused`. No LLM.
- `llm_verifier` (and any unknown mode) — fill `OPEN_ENDED_GRADING_PROMPT`,
  parse `<grade>correct|incorrect|refused</grade>`.

The embedded `OPEN_ENDED_GRADING_PROMPT` is **byte-identical** to
`/private/tmp/bixbench-src/bixbench/prompts.py` (verified).

**LLM pluggability.** Pass `llm=callable(prompt)->str`, or configure the env:
`CAIRN_JUDGE_BASE_URL` / `CAIRN_JUDGE_API_KEY` / `CAIRN_JUDGE_MODEL`
(or `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`) — an OpenAI-compatible
`/chat/completions` client. If **nothing** is configured, LLM paths do NOT crash:
they return `verdict="NO_JUDGE_LLM_CONFIGURED"` (grade 0) with the would-be
prompt in `raw`. The deterministic paths (str exact/partial, range numeric) work
fully offline. In **this workflow**, LLM grading is done by an LLM-judge
subagent that fills the same prompt; the env client is for scale-out.

CLI:

```bash
$PY tests/eval/bixbench/judge.py --eval-mode range_verifier \
    --question "..." --target "(1.50,1.54)" --predicted "1.52"
```

## How the two arms are invoked

Matched-pair design (`01-design.md` §3): same model, capsule, data, question,
env — **only Cairn differs**. The agent's deliverable in each arm is a single
**predicted answer string**.

**Env contract (both arms).** The agent's **cwd == the project dir** with the
capsule's data files unzipped at the **root** (that is what `fetch_capsule`
produces). Allowed tools: R (`/usr/local/bin/R`) and Python
(`~/.claude/python/bin/python`). Host-based — Docker is down.

**Arm A — autonomous (control).** Project dir has **no `cairn/` store**. The
agent explores the data, runs R/Python, and answers the question in its own
words.

**Arm B — Cairn-disciplined (treatment).** Same analysis, but driven through
Cairn before composing the answer: `cairn init` → `add-estimand` →
`add-claim` (typed to the estimand, with evidence) → `add-confound`
(+`inherits_caveat` / `contradicts` edges) → `reconcile` / `validate` → then
compose the final answer **from the read-back claim graph** (`cairn status` /
`cairn head` / reading the `cairn/` store), not from free recall.

Cairn CLI: `bun run /Users/wang.13246/Documents/GitHub/cairn-e2e/src/cli.ts <verb>`.

> **Wrapper gotcha.** A cairn wrapper script must **NOT** be named `cairn` and
> must live **outside** the project dir — the name clashes with the `cairn/`
> store directory. Store discovery walks **UP** from cwd, so run cairn from
> **inside** the capsule project dir. Keep arm-A and arm-B in **separate** clean
> project dirs so walk-up discovery in arm A never finds an arm-B store.

**In THIS workflow** each arm is a **Claude Code subagent** (one per arm) handed
the project dir + the question, returning a predicted answer string.

**For SCALE later** each arm is one **headless `claude -p`** process reading the
question (one process per arm per question per replica). Agentic evals are
stochastic, so a real result needs **N replicas per arm** and reported
**distributions** — this harness is the unit those runs are built from. The
current phase is an explicit **n=1 single-capsule smoke test**; no quality
conclusion is drawn from it.

## Grading flow

```
fetch_capsule(qid, dir)  ->  manifest{question, ideal, eval_mode}
        |                                   |
   agent runs in dir (arm A / arm B)        |
        |                                   v
   predicted answer string  ----> judge.grade(question, ideal, predicted, eval_mode)
                                            |
                                   {grade:0/1, verdict, raw}
```
