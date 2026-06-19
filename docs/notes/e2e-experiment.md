# E2E experiment — proving Cairn has teeth

This note documents the end-to-end harness under `tests/e2e/`. It is the experiment that
demonstrates Cairn's whole reason to exist, end-to-end, against the real CLI.

## The core idea: ground truth is the SCAR GRAPH, not the scientific answer

Cairn does **no interpretation** (ADR-0004). It never decides whether a finding is *true*. So the
harness must not score the scientific answer either. What it scores is the **SCAR GRAPH** — the
structural record a disciplined analysis leaves behind:

- the right claim nodes captured (by their conclusion text),
- estimands compared by **id string-equality only** (same question ⇒ one id; different question ⇒
  different id),
- the `contradicts` / `inherits_caveat` edges present,
- the **CLI-LOCKED** axes (`freshness`, `verification`, `lifecycle`) reading their honest computed
  values,
- a clean (or flagged) `reconcile` over the shared findings file.

Each scenario ships a hand-authored `expected-graph.json` (the ground truth, schema in
`tests/e2e/CONTRACT.md §a`). The assertion engine `tests/e2e/lib/assert-graph.ts` scores a store
against it using the project's **own** parsers (`readAllClaims` / `readAllConfounds` / `readConfig`
from `src/store.ts`, `reconcile` from `src/reconcile.ts`) — it never re-parses markdown by hand and
never recomputes a locked axis. A `null`/omitted expectation is the universal "don't assert"
sentinel.

## The laundering-trap method + the with/without-skill control

A "trap" is a specific way a lazy analysis **launders** a scar away: drops a caveat, conflates two
questions under one estimand, hides a contradicting result, forges a trust badge, leaks an
ungrounded conclusion into the paper, or lets a stale result masquerade as fresh.

Each scenario runs the **same task** through the **same CLI** under two scripted agents:

- **WITH-SKILL** — `reference-agent.sh`, the golden path. A disciplined agent that authors the full
  scar graph. Its store must **pass every** asserted check.
- **WITHOUT-SKILL** — `naive-agent.sh`, the control. Commits exactly that scenario's laundering —
  always through legal CLI calls (skip the estimand, never `add-confound`, never `refresh`) or, where
  the trap is a forged trust badge, an out-of-band hand-edit the CLI is meant to catch. It still
  **exits 0** (laundering is not an error); the **store it leaves** is what FAILS the trapped
  check(s).

A scenario **"has teeth"** iff WITH passes all checks (`P==T, T>0`) AND WITHOUT fails ≥1 against the
same `expected-graph.json` (`P<T`). Same task, same CLI, opposite scorecards — that is the proof
that the Skill (the *cause* of writing claims) plus the CLI/Store (the *constraint*) actually do
work the lazy path cannot fake.

## The 6 scenarios (trap → what it proves)

- **caveat-inheritance** — one batch/design confound taints two claims; naive inlines it as prose in
  one claim and drops it from the other. Proves a caveat is **one confound node + two
  `inherits_caveat` edges**, not erasable prose.
- **estimand-conflation** — whole-cohort vs early-subgroup effects look alike; naive mints **one**
  estimand for both. Proves estimand identity is **id string-equality** — different questions cannot
  collapse into one robust-looking finding.
- **false-trust** — an `ai_proposed` DE finding; naive hand-edits `verification: verified` onto it.
  Proves verification is **territory-locked** — a forged badge is rejected (the locked axis reads
  `unverified`; `cairn validate` would reject a promotion).
- **forking-path-flip** — two justified normalizations flip the sign for ONE estimand; naive reports
  only the answer it likes and drops the sibling. Proves a faithful store keeps **both claims + the
  `contradicts` edge** between them (no multiverse collapse).
- **findings-leak** — conclusions in `FINDINGS.md` must carry a claim id; naive writes them straight
  into the paper, authoring no claims. Proves **warn-only `reconcile`** flags the laundered
  (unreferenced) conclusion-like lines.
- **staleness** — a claim grounded on `results.csv` after the pipeline regenerates that output; naive
  never runs `cairn refresh`. Proves freshness is **derived from the evidence fingerprint** — the
  stale output cannot masquerade as `fresh`.

## Final results (from `bash tests/e2e/run.sh`, exit 0)

```
  caveat-inheritance     | with: 15/15 | without: 12/15 | teeth: yes
  estimand-conflation    | with: 17/17 | without: 14/17 | teeth: yes
  false-trust            | with:  8/8  | without:  7/8  | teeth: yes
  findings-leak          | with: 12/12 | without:  2/5  | teeth: yes
  forking-path-flip      | with: 14/14 | without:  8/10 | teeth: yes
  staleness              | with:  7/7  | without:  6/7  | teeth: yes
  6 scenario(s): 6 with teeth, 0 without
```

(`findings-leak` without-skill scores `2/5` rather than `_/12`: the naive agent authors **no**
claims, so both claim-capture checks fail and their per-claim dependents are correctly *skipped* —
leaving the trapped `reconcile` dimension to fail. The teeth verdict needs only `WP==WT, WT>0` and
`NP<NT`, so a different naive total is expected and sound.)

## The `cairn init` addition

The harness needs a write verb that makes a fresh temp project Cairn-ready before the agent runs, so
the store-discovery walk-up resolves and `config.findings_globs` is seeded (making the `reconcile`
dimension live). `init` was added to the CLI (`src/cli.ts`, `cmdInit`):

- Auto-creates the OKF skeleton via `resolveStoreForWrite()` (claims/estimands/confounds/snapshots +
  `index.md` + `log.md`).
- `--findings <glob>` (repeatable) → `config.findings_globs`; defaults to `["FINDINGS.md"]` when none
  given. `--remote-host <h>` → `config.remote_host`. `--dvc` runs `dvc init` if the binary is present
  (non-fatal otherwise).
- **Idempotent and never clobbers:** a second `init` reports "kept existing" and leaves the config
  and every authored claim byte-identical (an existing `config.json` is the owner's and is never
  overwritten). Covered by `tests/init.test.ts`.

The runner (`run.sh`) calls `cairn init` in each fresh temp project (CONTRACT §c step 2) before
exporting the env and running the agent.

## The SEAM for plugging in a REAL agent

The scripted `*-agent.sh` files are stand-ins for a real agent acting on `task.md`. To run the same
experiment against a **real headless agent**, swap only the agent layer — the ground truth and the
scorer are reused unchanged:

1. Replace `reference-agent.sh` with a headless agent invocation that **reads `task.md`** and works
   in the runner-provided cwd, authoring through `$CAIRN` (the env contract in CONTRACT §c is exactly
   what a real agent gets: cwd = a fresh `cairn init`'d project with `data/` at the root; `$CAIRN`,
   `$CAIRN_ASSERTER`, `$CAIRN_MODEL`, `$CAIRN_SESSION` exported). The real **with-skill** run is that
   agent *with* the Cairn Skill loaded; the **without-skill** run is the same agent *without* it.
2. `expected-graph.json` and `assert-graph.ts` are reused **verbatim** — they score the resulting
   store by structure, agnostic to whether a script or a model produced it.
3. For traps that need a mid-run artifact mutation, the runner already honors an **optional
   `mutate.sh`** (CONTRACT §c step 5): it runs after the agent and before a final `cairn refresh`.
   (The current `staleness` scenario embeds its rerun+refresh inside the agent script instead; a real
   agent would use the `mutate.sh` seam to regenerate the artifact between the author and refresh
   steps.)

In short: the harness's "agent" is a seam. The oracle (`expected-graph.json` + `assert-graph.ts`)
and the env/cwd contract are stable; only what fills the agent slot changes when you go from scripted
control to a live model.
