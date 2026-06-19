# Cairn E2E Harness — CONTRACT

This file is the **stable, verbatim contract** between three parties: the scenario authors
(`expected-graph.json` + `*-agent.sh`), the assertion engine (`lib/assert-graph.ts`), and the
runner. Everything conforms to what is written here. The assertion engine's TypeScript `interface`s
mirror §(a) one-for-one; the runner's exported env mirrors §(c) one-for-one. **Do not drift** any of
the three from this document — change the document first, then the code.

The harness proves Cairn's whole reason to exist: a **with-skill** agent (`reference-agent.sh`,
the golden path) produces a store that PASSES its scenario's `expected-graph.json`, while a
**without-skill** lazy agent (`naive-agent.sh`, the control) commits that scenario's laundering and
its store FAILS the trapped check(s). Same task, same CLI, opposite scorecards.

---

## (a) The `expected-graph.json` schema

Hand-authored ground truth, one per scenario. This EXACT shape (the assertion engine and the runner
depend on it):

```json
{
  "scenario": "<key>",
  "description": "<one line>",
  "claims": [
    {
      "key": "<author-chosen logical name, unique in file>",
      "text_contains": "<substring used to find the actual claim by its frontmatter text>",
      "estimand_key": "<logical estimand name; claims sharing this MUST share one actual estimand id; different keys MUST differ>",
      "contradicts": ["<other claim key>", ...],
      "caveats": ["<caveat key>", ...],
      "evidence": [{ "kind": "file|external|dvc", "ref_contains": "<substring of the evidence ref>" }],
      "freshness": "fresh|stale|unknown|null (null = don't assert)",
      "verification": "unverified|verified|contradicted|unverifiable|null",
      "lifecycle": "draft|canonical|null"
    }
  ],
  "confounds": [{ "key": "<caveat key referenced above>", "text_contains": "<substring of the confound body/label>" }],
  "reconcile": { "min_unreferenced": <int|null>, "max_unreferenced": <int|null> }
}
```

### Field semantics (the matching rules the engine applies)

- **`scenario`** — the scenario `<key>`; equals the directory name. Used only as a scorecard label.
- **`description`** — one human line; not asserted.
- **`claims[]`** — each entry is one expected claim node:
  - **`key`** — an author-chosen logical name, **unique within the file**. It is NEVER matched
    against the store; it is the wiring handle used by `contradicts` / `caveats` to refer to other
    nodes in this same file.
  - **`text_contains`** — the engine resolves the `key` to an **actual claim id** by finding the
    claim whose frontmatter `text` *contains* this substring. The match **MUST be unique**: zero
    matches and ≥2 matches both FAIL (the harness demands an unambiguous capture). This is the
    "claim capture" dimension.
  - **`estimand_key`** — a logical estimand name. The engine groups all resolved claims by this key
    and asserts **estimand identity by id string-equality only** (ADR-0005): all claims sharing one
    `estimand_key` MUST resolve to **one** actual `est-…` id (and it must be present, not `(none)`);
    any two **different** `estimand_key`s MUST resolve to **different** ids. `null` / omitted ⇒ not
    asserted for that claim.
  - **`contradicts[]`** — logical claim keys; the engine maps each to its actual id and asserts a
    `contradicts` edge to that id is present on this claim's frontmatter. Omitted ⇒ none asserted.
  - **`caveats[]`** — logical **confound** keys (declared in `confounds[]`); the engine maps each to
    its actual `cfd-…` id and asserts an `inherits_caveat` edge to that id is present. Omitted ⇒
    none asserted.
  - **`evidence[]`** — each `{kind, ref_contains}` must be present among the claim's evidence refs:
    some ref with that exact `kind` whose `ref` *contains* `ref_contains`. This is the "grounding"
    dimension. Omitted ⇒ none asserted.
  - **`freshness` / `verification` / `lifecycle`** — the engine reads the **CLI-LOCKED** value
    straight off the parsed frontmatter (the same locked value `tests/acceptance.sh` reads with
    `fmval`) and asserts equality. **`null` (or omitted) = don't assert** — the universal
    don't-assert sentinel.
- **`confounds[]`** — each entry resolves a confound `key` to an actual `cfd-…` node by **unique**
  substring match over the confound's **body OR `label`**. Asserts the referenced confound node
  EXISTS (the "referenced confound nodes exist" dimension) and provides the id for `caveats[]`
  wiring. Zero / ≥2 matches FAIL.
- **`reconcile`** — `{ min_unreferenced, max_unreferenced }`. The engine runs the project's own
  `reconcile()` over the store's `config.json` findings globs and asserts the **unreferenced
  conclusion-like line count** is within `[min, max]`. A `null` bound is open-ended on that side;
  if BOTH bounds are `null`/omitted (or `reconcile` itself is omitted/`null`), the dimension is not
  asserted.

### Matching rule, in one sentence

> Resolve each claim `key` to an actual claim id by the **unique** claim whose `text` contains
> `text_contains`; resolve `estimand_key` consistency by **id string-equality** across the resolved
> claims; resolve `contradicts` / `caveats` by mapping keys → ids — all using the project's **own
> parsers** (`readAllClaims` / `readAllConfounds` from `src/store.ts`, `reconcile` from
> `src/reconcile.ts`), never by re-parsing markdown by hand.

### Don't-assert sentinel

A `null` anywhere an enum is expected (`estimand_key`, `freshness`, `verification`, `lifecycle`), an
omitted array (`contradicts`, `caveats`, `evidence`), a `null`/omitted bound in `reconcile`, or an
omitted `reconcile` block entirely, all mean **"don't assert this dimension"**. The engine only ever
scores what the scenario explicitly pins.

---

## (b) Scenario directory layout

```
tests/e2e/scenarios/<key>/
  data/                # synthetic input/output artifacts copied into the run project
  task.md              # the analysis-task prompt a REAL agent would receive
  expected-graph.json  # hand-authored ground truth, per the schema in §(a)
  reference-agent.sh   # scripted GOOD agent (with-skill golden path): cairn commands that SHOULD satisfy expected-graph
  naive-agent.sh       # scripted LAZY agent (without-skill control): commits THIS scenario's laundering; its store should FAIL the trapped check(s)
  mutate.sh            # OPTIONAL: mutate an artifact mid-run (for the staleness scenario)
```

- **`data/`** — every file the agent's task depends on (input tables, "result" CSVs, figures). The
  runner copies its **contents** into the fresh run project root before the agent runs, so an
  agent grounding on `file:results.csv` finds `results.csv` at the project root. May be empty/absent.
- **`task.md`** — the natural-language analysis task a real agent would receive. Documentation for
  the human author and a stand-in for a real agent's prompt; the scripted `*-agent.sh` files encode
  what a good vs. lazy agent does with it. Not consumed by the assertion engine.
- **`expected-graph.json`** — the §(a) ground truth. The reference store must pass it whole; the
  naive store must fail at least the trapped check(s).
- **`reference-agent.sh`** / **`naive-agent.sh`** — see §(c) for the exact env/cwd they run under.
- **`mutate.sh`** — OPTIONAL. When present, the runner invokes it (same env/cwd as the agents)
  **after** the agent authors but **before** the final `cairn refresh`/assertion, to mutate an
  artifact under the run project so the staleness path (`fresh → stale`) is exercised. Absent ⇒ no
  mid-run mutation.

The `scenario` field inside `expected-graph.json` equals `<key>` (the directory name).

---

## (c) The ENV + CWD contract the runner guarantees to `*-agent.sh` and `mutate.sh`

The runner sets up a **fresh temp project dir** per (scenario × agent) run, then invokes the agent
script under **POSIX `sh`** with this exact contract. Scripts MUST rely on it and MUST NOT hardcode
paths.

| Guarantee | Value |
|---|---|
| **cwd** | the fresh temp project dir. It contains a **copy of the scenario's `data/`** contents at the root, and **`cairn init` has already been run** there (so `cairn/` exists with a `config.json`). The store-discovery walk-up resolves from cwd. |
| **`$CAIRN`** | the command to invoke the CLI: `bun run <repo>/src/cli.ts`. Scripts call `$CAIRN add-claim …`, `$CAIRN add-estimand …`, etc. **Never hardcode the CLI path** — always go through `$CAIRN`. |
| **`$CAIRN_ASSERTER`** | the asserter `who` identity the CLI stamps (e.g. `reference-agent` / `naive-agent`). Exported into the environment; the CLI reads it (no `--as` needed). |
| **`$CAIRN_MODEL`** | the model label the CLI stamps onto `asserter.model`. Exported. |
| **`$CAIRN_SESSION`** | the session id the CLI stamps onto `asserter.session`. Exported. |

Additional rules the scripts MUST honor:

- **POSIX `sh`**, not bash. No bashisms (`[[ ]]`, arrays, `local` outside a function unless your
  `sh` supports it). Begin with `#!/bin/sh` and `set -eu` is recommended.
- **Operate in cwd.** Author against the already-initialized store via `$CAIRN …`. Reference
  evidence by its **host-root-relative path** (e.g. `--evidence file:results.csv`) — the runner put
  `data/` contents at the cwd root.
- **Exit code discipline:** exit **nonzero only on a hard error** (a CLI invocation that should have
  succeeded failed). **Intentional laundering is NOT an error** — `naive-agent.sh` deliberately
  omits an estimand, copies a caveat instead of referencing it, writes an ungrounded conclusion into
  the findings file, etc., and must still **exit 0**. The store it leaves is what FAILS the
  assertion engine; the script itself succeeds.
- The CLI's locked-field discipline still applies: scripts never hand-edit the store and never set a
  computed field. A `naive-agent.sh` "laundering" is always something a real lazy agent *could* do
  through the CLI (skip the estimand, skip the contradicts edge, never `add-confound`, never
  `cairn publish`/`refresh`), never an illegal hand-write.

### What the runner does around the agent (informative)

For each scenario, for each of `{reference, naive}`:
1. make a fresh temp project dir; copy `scenarios/<key>/data/`'s contents into it;
2. run `cairn init` there (skeleton + `config.json`);
3. export `$CAIRN`, `$CAIRN_ASSERTER`, `$CAIRN_MODEL`, `$CAIRN_SESSION`; cwd = the temp dir;
4. run the agent script (`sh reference-agent.sh` / `sh naive-agent.sh`);
5. if `mutate.sh` exists, run it (same env/cwd), then `$CAIRN refresh`;
6. score with `bun run tests/e2e/lib/assert-graph.ts <tempProjectDir> scenarios/<key>/expected-graph.json`.

Expectation: the **reference** run exits the asserter `0` (all checks pass); the **naive** run exits
the asserter `1` (the trapped laundering check fails).

---

## The assertion engine invocation (exact)

```
bun run tests/e2e/lib/assert-graph.ts <storeProjectDir> <expectedGraphPath>
```

- `<storeProjectDir>` — a project dir containing a `cairn/` store (the engine resolves the store by
  walking down/at this dir via `findStore`).
- `<expectedGraphPath>` — path to the scenario's `expected-graph.json`.
- **Exit code:** `0` iff every asserted check passes; `1` if any asserted check fails; `2` on usage
  error (missing args / missing expected-graph file).
- **Output:** a scorecard — one `PASS`/`FAIL` line per check (`check — detail`), then a totals line
  (`N pass / M fail`), then a final one-line `ASSERT-GRAPH: PASS` / `ASSERT-GRAPH: FAIL` summary.
- **Importable:** `import { runAssertions } from "tests/e2e/lib/assert-graph.ts"`;
  `runAssertions(storeProjectDir, expectedGraphPath)` returns `{ checks, passed, failed }` (no
  `process.exit`), where `checks` is `Array<{ check: string; pass: boolean; detail: string }>`.

The engine reads the store with the project's OWN parsers (`readAllClaims`, `readAllConfounds`,
`readConfig` from `src/store.ts`) and computes the reconcile count via `reconcile` from
`src/reconcile.ts`. It reads the CLI-LOCKED axes (`freshness`, `verification`, `lifecycle`) straight
off the parsed frontmatter — it never recomputes them and never hand-parses markdown.
