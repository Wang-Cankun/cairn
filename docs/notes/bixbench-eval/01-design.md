# BixBench × Cairn — Eval design (phase 01)

Status: design only. No runs yet. This doc is the contract every downstream phase
(harness build, single-capsule smoke run, judging, scar-graph scoring) is held to.

Worktree: `/Users/wang.13246/Documents/GitHub/cairn-e2e` (branch `experiment/e2e-harness`).
Harness code will live under `tests/eval/bixbench/`. Step-docs live here under
`docs/notes/bixbench-eval/`. BixBench source + data stay in `/tmp` and are **never committed**.

---

## 1. The thesis under test (the owner's hypothesis)

Cairn does **no interpretation** (ADR-0004). The CLI never decides whether a scientific
finding is true; it only locks structure — grounded, estimand-typed claims, their
`contradicts`/`inherits_caveat` edges, and the CLI-computed freshness/verification/lifecycle
axes. That is a fact about the *tool*, not about the *agent*.

The hypothesis is about the **agent**, not the tool. The claim is:

> The **discipline** of being forced to lock grounded, estimand-typed claims may make the
> **agent itself** interpret *better* — even though Cairn adds zero interpretation of its own.

Two proposed mechanisms for how a no-interpretation tool can still lift answer quality:

1. **Process scaffold during analysis.** Forcing the agent to name the estimand (the exact
   quantity being asked for), attach evidence to each claim, surface confounds as caveats, and
   reconcile contradictions changes *how the agent works the problem* while it is still
   analyzing. The scaffold pushes the agent away from a plausible-sounding free-form narrative
   toward an answer pinned to a specific, evidence-backed quantity.

2. **Claim graph as read-back substrate at compose time.** When the agent writes its final
   answer, arm B does not free-recall from a long scratchpad — it reads back the **locked claim
   graph** it just built. The graph is a compressed, de-duplicated, contradiction-surfaced view
   of its own analysis. Composing the final answer *from* that substrate (rather than from raw
   working memory) is hypothesized to reduce drift, dropped caveats, and answering a subtly
   different question than the one asked.

Therefore the expected result is **not merely "no harm."** We expect a *possible positive
delta* on answer quality (arm B ≥ arm A). The eval is designed to be able to *detect* an
improvement, not just to confirm Cairn doesn't degrade things.

This is a different axis from the existing E2E harness (`tests/e2e/`, see
`docs/notes/e2e-experiment.md`). That harness deliberately scores the **scar graph** and
**refuses** to score the scientific answer. This eval does the opposite: it scores the
**scientific answer** against external ground truth. Both are valid; they measure different
things. (The scar-graph axis still appears here — but only as a LATER, secondary metric, §5.)

---

## 2. Decomposition — what we reuse vs. discard from BixBench

BixBench (FutureHouse) is an agentic bioinformatics benchmark. We treat it as a **parts
supplier**, not a runner.

**REUSE (only these two pieces):**

- **(a) Tasks + target answers** — `BixBench.jsonl` (the dataset). One row = one question with
  a known target answer (`ideal`). This is the external ground truth. See §4 for the schema.
- **(b) The open-answer judge** — `OPEN_ENDED_GRADING_PROMPT` (verbatim in §6). An LLM-as-judge
  that compares a predicted answer to the target and emits `correct | incorrect | refused`.
  This lets us score accuracy with **zero scar annotation** — the ground truth already exists.

**DISCARD (do not use):**

- BixBench's own runner (`litellm`/`aviary`, calling GPT-4o etc.). We are not benchmarking
  their agent loop or their model. Our **agent-under-test is Claude Code** (headless `claude`
  at `~/.local/bin/claude`), driving a real bioinformatics analysis on the host.
- The MCQ path and the MCQ prompts. We use the **open-answer** track only.

Why this split: the only things in BixBench that carry *external, owner-independent* signal are
the curated questions, the curated target answers, and the curated judge. Everything else is an
implementation detail of *their* experiment and would contaminate ours.

License / provenance: BixBench source repo is **Apache-2.0** (`/private/tmp/bixbench-src/LICENSE`).
The dataset is HuggingFace `futurehouse/BixBench` (`repo_type="dataset"`), and **anonymous
download works** (`token=False`). Source clone: `/private/tmp/bixbench-src/`. Data:
`/private/tmp/bixbench-data/` (`BixBench.jsonl` + per-capsule `CapsuleFolder-<uuid>.zip`). All of
`/tmp` is out-of-tree and uncommitted; only the harness under `tests/eval/bixbench/` and these
notes are committed.

---

## 3. The two arms (matched-pair design)

Same model, same capsule, same data folder, same question, same judge. The **only** difference
is whether the agent is forced through Cairn.

### Arm A — autonomous (control)
The agent gets the capsule data + the question and does a free-form analysis: explore the data,
run R/Python as needed, then answer the question in its own words. No Cairn. This is the
"how a capable agent does it today" baseline.

### Arm B — Cairn-disciplined (treatment)
The agent does the **same** analysis but is required to build it *through* the Cairn framework
before composing the final answer. Mapped onto the **actual** CLI verbs (verified in
`src/cli.ts`; the abstract step names below are the operations, the backticked verbs are the
real CLI surface):

1. **Initialize the store** — `cairn init` (creates the `cairn/` store in the capsule project
   dir). NOTE the wrapper gotcha (§7): never name the wrapper `cairn`, keep it outside the
   project dir, and run it from inside the project dir (store discovery walks *up* from cwd).
2. **Declare the estimand** — `cairn add-estimand` — name the exact quantity the question asks
   for (the thing `ideal` is a value of), before computing anything.
3. **Lock grounded claims** — `cairn add-claim` — each intermediate + final conclusion captured
   as a claim, typed to its estimand id, with evidence refs attached.
4. **Surface confounds as caveats** — `cairn add-confound` (+ the claim's `inherits_caveat`
   edge) — and surface contradictions via the claim `contradicts` edge.
5. **Reconcile / validate** — `cairn reconcile`, `cairn validate` — check the graph is coherent
   (no unreferenced findings, locked axes honest).
6. **Compose the final answer from the claim graph** — the agent reads back the locked claims
   (e.g. via `cairn status` / `cairn head` / reading the `cairn/` store) and writes its final
   answer *from that substrate*, not from free recall. This is mechanism (2) of the thesis.

Matching invariants (must hold for the comparison to be valid):
- **Same model** (same headless `claude`, same model id, same settings) in both arms.
- **Same capsule + same unzipped data** handed to both arms.
- **Same question text** (`question` field) and **same target** (`ideal`) used by the judge.
- **Same compute environment** (host-based; §7) and the same allowed tools (R, Python).
- Only Cairn differs. Arm A must NOT have a `cairn/` store; arm B must.

The agent's deliverable in both arms is a single **predicted answer string**, which is the only
thing the FIRST metric (judge) sees. The agent's reasoning, notebooks, and (arm B) the store are
kept as artifacts for the LATER metric and for debugging.

---

## 4. Data + judge facts (verified)

### `BixBench.jsonl` — one row per question
Verified: **205 question rows**, **59 distinct capsules**, downloaded at
`/private/tmp/bixbench-data/BixBench.jsonl`. Each row's fields (verified keys):

| field | meaning |
|---|---|
| `id` | row id |
| `question_id` | e.g. `bix-1-q1` |
| `short_id` | short row id |
| `question` | the task text handed to the agent |
| `ideal` | **THE TARGET ANSWER** (e.g. `"0.0002"`) — the judge's `target` |
| `distractors` | list, MCQ only (unused — we run open-answer) |
| `capsule_uuid` | which capsule this question belongs to |
| `data_folder` | `CapsuleFolder-<uuid>.zip` — the per-capsule data + notebooks |
| `eval_mode` | `str_verifier` \| `range_verifier` \| `llm_verifier` |
| `hypothesis`, `result`, `answer` | paper-derived context fields |
| `categories` | task category tags |
| `paper` | source paper DOI |
| (also present) | `canary`, `tag`, `version` |

Verified `eval_mode` distribution across the 205 rows:
**`llm_verifier` = 83, `str_verifier` = 61, `range_verifier` = 61.**

### Judge logic (`/private/tmp/bixbench-src/bixbench/graders.py`, verified)
- **`llm_verifier`** (open answer): fill `OPEN_ENDED_GRADING_PROMPT(question, target=ideal,
  predicted)`, call an LLM, parse `<grade>correct|incorrect|refused</grade>` via
  `re.search(r"<grade>\s*(.*?)\s*</grade>", ...)`. `grade = 1` iff `correct`.
- **`str_verifier`**: first tries a cleaned exact match — strip to `[a-zA-Z0-9]`, lowercase,
  compare `cleaned_predicted == cleaned_target`; optional `partial_match` (substring); then falls
  back to the same `OPEN_ENDED_GRADING_PROMPT` LLM grade.
- **`range_verifier`**: target is `(lower, upper)`; `correct` iff `lower <= float(predicted) <=
  upper` (numeric, no LLM needed for the in-range check).

For phase-01 / the smoke test we use the **open-answer judge** (`OPEN_ENDED_GRADING_PROMPT`).
A capsule whose question is `eval_mode = range_verifier` can additionally be checked with the
pure-numeric range test (cheap, deterministic) as a cross-check on the LLM grade.

### Environment decision: HOST-BASED (verified)
Docker daemon is **down**, so we do not use BixBench's containerized capsule execution. We run
on the host:
- Python: `~/.claude/python/bin/python` (has pandas/scipy/numpy). Install extra deps with
  `uv pip install --python ~/.claude/python/bin/python <pkg>` — `pydeseq2`, `scanpy`, `gseapy`,
  `scikit-learn`, `statsmodels` are all pip-installable.
- R: `4.4.1` at `/usr/local/bin/R`.
- Agent: headless `claude` at `~/.local/bin/claude`.
- Cairn CLI: `bun run /Users/wang.13246/Documents/GitHub/cairn-e2e/src/cli.ts <verb>`.

---

## 5. Metrics

### FIRST (this workflow's primary signal): answer accuracy via the BixBench judge
- Run the chosen capsule's question through arm A and arm B → two predicted answer strings.
- Grade each with `OPEN_ENDED_GRADING_PROMPT` (§6) against `ideal` → `correct/incorrect/refused`
  → `grade ∈ {1,0}` (correct = 1).
- The comparison of interest is **grade(B) vs grade(A)**. A positive delta (B correct where A is
  not) is the hypothesized effect; equal-and-correct or equal-and-incorrect is "no observed
  effect at n=1"; B worse than A would be evidence against the thesis.
- This uses **existing ground truth only** — no scar annotation, no hand-authored expected graph.

### LATER (secondary, arm B only): scar-graph metrics
- Arm B leaves a `cairn/` store. We can score *its structure* with the existing assertion engine
  `tests/e2e/lib/assert-graph.ts` (`export function runAssertions(storeProjectDir,
  expectedGraphPath)` → `{ checks, passed, failed }`). It reads the store with the project's own
  parsers (`readAllClaims`/`readAllConfounds`/`readConfig` from `src/store.ts`, `reconcile` from
  `src/reconcile.ts`) and scores against a hand-authored `expected-graph.json`
  (schema in `tests/e2e/CONTRACT.md §a`).
- This is **deferred**: it requires authoring an `expected-graph.json` for the capsule (the scar
  ground truth), which the accuracy metric does not. It answers a *different* question ("did the
  agent build a sound scar graph?") and is not needed to test the accuracy thesis.

### Methodology guardrail (must stay visible in every downstream doc)
Agentic evals are **stochastic** — the same prompt yields different analyses run to run. A real
result requires **N replicas per arm** and reporting **distributions** (e.g. accuracy rate ±
spread over many capsules and repeats), not a single number. A single (capsule, arm) pair tells
you almost nothing on its own.

**This workflow is explicitly a single-capsule SMOKE TEST, n = 1.** Its goal is to prove the
**pipeline** end-to-end — download a capsule, run both arms on the host, capture predicted
answers, invoke the judge, (optionally) score the arm-B store — not to produce a publishable
accuracy delta. No causal/quality conclusion about Cairn may be drawn from n = 1. Any claim of an
effect must wait for the multi-capsule, multi-replica run.

---

## 6. The judge prompt (verbatim)

`OPEN_ENDED_GRADING_PROMPT` — verbatim from
`/private/tmp/bixbench-src/bixbench/prompts.py` (the BixBench open-answer judge):

```text
You are given a question, target answer and a predicted answer. Your task is to compare the target answer with the predicted and assess if the predicted answer is correct, incorrect or it refused to answer.
Question: {question}
Target Answer: {target}
Predicted Answer: {predicted}

Important: You must only output one from `correct`, `incorrect` or `refused` between <grade> tags.
Example Output: <grade> correct </grade>
```

(The range variant `OPEN_ENDED_RANGE_GRADING_PROMPT` exists for `range_verifier` rows; the
range check is also doable purely numerically as above. We anchor on the open-answer prompt.)

---

## 7. Operational gotchas to carry into the build phase

- **Cairn wrapper gotcha.** A cairn wrapper script must **NOT** be named `cairn` and must live
  **outside** the project dir — the name clashes with the `cairn/` store directory. Store
  discovery walks **UP** from cwd, so the agent must run cairn from **inside** the capsule
  project dir.
- **Out-of-tree data.** `/tmp/bixbench-src` and `/tmp/bixbench-data` are never committed. The
  harness reads them by absolute path.
- **Arm hygiene.** Arm A must run in a directory with **no** `cairn/` store; arm B initializes
  one. Don't let an arm-A run inherit a store from an earlier arm-B run (walk-up discovery will
  find it). Use clean, separate per-arm working copies of the unzipped capsule.
- **Actual CLI verbs** (verified in `src/cli.ts`): `init`, `add-claim`, `add-estimand`,
  `add-confound`, `migrate`, `review`, `head`, `refresh`, `validate`, `publish`, `drafts`,
  `status`, `reconcile`. The thesis's abstract steps (declare estimand / ground claims / surface
  caveats / compose) map onto these — there is no literal `declare`/`ground`/`surface`/`compose`
  verb.

---

## 8. Downstream phase handoff

- **Phase 02 (build):** implement `tests/eval/bixbench/` — capsule picker (pick one open-answer
  capsule, prefer a clear `str_verifier`/`range_verifier` row for a deterministic cross-check),
  unzip into two clean per-arm working dirs, arm-A driver, arm-B driver (Cairn-wrapped), a judge
  caller that fills `OPEN_ENDED_GRADING_PROMPT`, and an artifact layout under
  `docs/notes/bixbench-eval/` capturing both predicted answers + both grades.
- **Phase 03 (smoke run):** run n = 1, record grade(A) vs grade(B), keep the arm-B `cairn/`
  store as an artifact.
- **Phase 04 (optional scar score):** author an `expected-graph.json` for the capsule and run
  `runAssertions` against the arm-B store.
