# 05 — Freshness

Freshness is the axis that keeps the canonical record honest *over time*. A claim was true-enough
to write when you wrote it; the question freshness answers is whether the thing it rests on has
changed since. This document explains the freshness model in full: why it fingerprints the
artifact rather than hashing the process, the tier system, the exact cascade semantics, and the
frozen-at-publish behavior. It implements the determinism principle from `02-philosophy.md` §7 and
the freshness axis from `03-domain-model.md`. The code is in `src/freshness.ts` and
`src/fingerprint.ts`; the decision is ADR-0002 (`docs/adr/0002-freshness-by-evidence-fingerprint.md`).

---

## Why fingerprint the artifact, not hash the process

The first instinct for "did this claim's basis change?" is to hash the *computation* — either
consume a pipeline tool's DAG hashes (targets, snakemake) or wrap execution (`cairn run -- <cmd>`)
and hash the inputs and outputs. Both are cleaner-sounding than what Cairn does. Both were tried
and both broke against the real environment.

The real environment is the deciding constraint, and it is worth stating plainly because it is
unusual: compute runs **mostly through the agent directly** — sometimes via targets, sometimes
not, sometimes Python, sometimes a one-off script — and **often on remote HPC** (OSC, vp03). In
that world:

- **Consuming the pipeline DAG covers only a minority of the work.** Most conclusions did not go
  through targets. A freshness mechanism that only works for targets-managed steps would leave the
  majority of claims with no freshness signal at all.

- **Wrapping execution cannot capture remote/async jobs.** When the local command is literally
  `ssh host 'sbatch job.sh'`, wrapping that command hashes nothing real — the actual computation
  happens elsewhere, later, asynchronously. The wrapper would record a hash of a submission, not
  of a result.

- **Both fail *hard* when forgotten.** Process-hashing requires the owner to remember to invoke
  the special wrapper or to have used the pipeline. The environment *guarantees* lapses — the
  whole point of the system is to survive discipline failures, not depend on them. A
  process-hashing scheme that the owner forgot to use yields *no freshness at all*, silently.

So the decision (ADR-0002): **derive freshness from a fingerprint of the evidence artifact the
claim points at, not from the compute process.** Stamp a signature of the *output artifact* at
authoring; recompute and compare at read time. This depends only on the artifact's footprint, not
on how or where it was produced, so the targets-vs-`run`-vs-manual fork simply dissolves. And it
**degrades gracefully**: when the owner forgets discipline, or the artifact is unreachable, Cairn
records `unknown` — never a silent wrong `fresh`. Degrading to an honest "I can't check this" is
the correct behavior, not a failure mode (`02-philosophy.md` §3, "a false `fresh` is the enemy").

The compute node — metadata about *how* an artifact was produced — is correspondingly **demoted**:
it is optional metadata, not the freshness backbone. When a pipeline tool is present, it is not
wasted; it simply becomes the *best fingerprint source* (top tier, and free, since the pipeline
already maintains the hash for its own memoization). When absent, Cairn still works.

---

## The tiers

A fingerprint's quality is not uniform, and Cairn refuses to pretend it is. Every fingerprint
carries a **method**, which maps to a display **tier**, and the tier always travels with the badge
(`METHOD_TIER` and `TIER_ORDER` in `src/types.ts`; `src/fingerprint.ts` computes each method):

| Method | Source | Tier | Rigor |
|---|---|---|---|
| `pipeline-meta` | The pipeline tool's content hash, read from `_targets/meta/meta` | `pipeline` | Top — rigorous, and free |
| `sha256` | Direct content hash of a loose local file | `content` | Mid — a real content hash |
| `remote-md5` | The agent runs `md5sum` on a remote host in-session via ssh | `remote` | Lower — self-reported, remote |
| `size-mtime` | Size + mtime signature, a weak fallback | `weak` | Lowest — heuristic, not content |

The ordering best→worst is `[pipeline, content, remote, weak]`. A claim with multiple grounding
edges shows the **best** tier among them (`bestTier` in `src/freshness.ts`), but the tier is
**always shown, never flattened** — an `unknown` is rendered as `unknown`, and a weak tier is
labeled weak. The point is that a reader should always be able to see *how much to trust* the
freshness verdict, not just the verdict. A `fresh` backed by a pipeline content hash and a `fresh`
backed by size+mtime are both "fresh," but they are not equally trustworthy, and the tier says so.

The fingerprint is **stamped at authoring** and the operator never types it. `src/fingerprint.ts`
`stampEdge` chooses the method from the evidence kind and computes the signature immediately. If
the artifact is unreachable at stamp time, the stamp is honestly recorded as the literal
`"unknown"` — the only case where `"unknown"` is allowed as a stored fingerprint
(`docs/CONTRACTS.md` §1).

### The remote path, concretely

For remote artifacts, `remoteMd5` (`src/fingerprint.ts`) runs `ssh <remote_host> md5sum <path>`
with a short timeout and `BatchMode=yes` (no interactive prompts). The host comes from
`config.remote_host` in `cairn/config.json` (with a legacy `host:path` ref form accepted when no
host is configured). Any failure — host unreachable, ssh error, no `md5sum`, a non-hash response —
returns `unknown`. This is the most failure-prone fingerprint path by nature, and it is the one
where degrading to `unknown` matters most: HPC hosts go down, VPNs drop, jobs move. `unknown` on a
remote artifact is correct, not a bug. (Wiring `config.remote_host` through the remote-md5 path was
one of the post-build fixes; see commit `dfeafa0` and `09-decisions-and-tradeoffs.md`.)

---

## The cascade, precisely

Per-claim freshness combines two things: the states of the claim's own grounding edges, and the
freshness of the claims it depends on. The exact rule (`src/freshness.ts`, `docs/CONTRACTS.md` §9):

**Per edge** (`edgeState`): re-fingerprint by method and compare to the stamp.
- `unknown` if the stamped fingerprint was `"unknown"`, or the recompute returns `unknown`
  (unreachable now);
- `stale` if the recomputed fingerprint differs from the stamp;
- `fresh` if it matches.

**Per claim** — combine the edge states into the claim's own (pre-cascade) state (`selfState`):
- `stale` if **any** grounding edge is stale;
- else `unknown` if **any** grounding edge is unknown;
- else `fresh`.

**Then the dependency cascade**: a claim is also `stale` if **any** claim it depends on is stale.

Composing these gives the precedence the architecture plan states succinctly: **a claim is stale
if any of its own grounding edges changed OR any dependency is stale; else unknown if any edge is
unknown; else fresh. Stale wins over unknown.** "Stale wins over unknown" is the right asymmetry:
if we *know* something changed, that is a stronger and more important signal than "we couldn't
check something else," and the reader needs to see the definite problem.

### Why the cascade is a fixpoint, not a recursive DFS

The implementation detail here is subtle and was a real bug fix (commit `489b904`), so it is worth
explaining rather than glossing. A naive cascade would be a memoized depth-first search: to decide
if claim A is stale, recurse into its dependencies, memoizing results. That breaks on **dependency
cycles**: when the DFS re-enters a node already "in progress," it has to return *something*, and
whatever it returns can cause a claim that genuinely (transitively) depends on a stale node to be
reported `fresh` — and worse, the answer can depend on traversal order. Under-reporting staleness
is exactly the false-`fresh` failure the project exists to prevent, so a cycle-induced false
`fresh` is unacceptable.

`src/freshness.ts` instead resolves the cascade to a **fixpoint** by forward-propagating
staleness. It starts each claim at its own pre-cascade state, then repeatedly: any claim not
already stale becomes stale if *any* of its in-set dependencies is stale. It iterates until a full
pass changes nothing. This is **monotone** — states only ever move *toward* stale, never away — so
it terminates in at most N passes regardless of cycles, and any claim transitively reachable to a
stale node becomes stale even inside a dependency cycle. The result is both cycle-safe and
order-independent. The design choice that makes this safe is also a value statement encoded in a
comment: cascade only propagates *stale*, never *fresh* — "the enemy is a false `fresh`, never a
false `stale`." Over-reporting staleness is conservative and honest; under-reporting it is the
dishonesty the system forbids.

A dependency edge pointing *outside* the current claim set is ignored for cascade purposes — it
cannot make a claim stale on its own (you cannot judge the freshness of a claim you do not have).
This is consistent with the iron rule's reach-ground semantics, which also only follow in-set
edges.

---

## Frozen at publish, labeled honestly

There are two distinct moments freshness is computed, and they behave differently on purpose:

- **Live, at the local terminal.** `cairn head` and `cairn refresh` compute freshness *now*
  (`as_of = now`) against the current state of the artifacts and print it. This is the owner's
  working view — it should be live, because the owner is actively changing things and wants the
  current truth. `refresh` is the touchpoint the agent runs after any rerun to surface
  newly-stale claims (`07-the-agent-loop.md`).

- **Frozen, at publish.** `cairn publish` computes freshness once, stamps `as_of = published_at`
  on every claim, writes it into `head.json`, and the published view **never recomputes**
  (decision C). The collaborator's site renders the frozen values verbatim and labels every badge
  "as of `<published_at>`" (`site/src/components/Badges.tsx`, `site/src/App.tsx`). A frozen `fresh`
  is therefore never read as a live `fresh`: it always carries its timestamp, so the reader knows
  it means "fresh as of when this was published," not "fresh right now."

Freezing is the honest choice for a *shared, immutable* artifact. A snapshot is a frozen record of
what was true at one publish; recomputing freshness on the collaborator's machine later would make
the snapshot mutable and would depend on the collaborator being able to reach the artifacts (they
usually cannot — the artifacts are on the owner's disk or a remote host). So the published
freshness is frozen, stamped, and labeled. The honesty is preserved not by keeping it live but by
making its as-of explicit.

This frozen-at-publish behavior is also what makes the snapshot-identity story in
`06-publish-and-snapshots.md` necessary and subtle: because the *published* freshness is frozen,
the *only* way a corrected freshness reaches the share link after an artifact changes is for the
new freshness to force a new snapshot. That is exactly why computed freshness is folded into
snapshot identity — so that a freshness-only change produces a new immutable snapshot rather than
silently re-serving the old, now-dishonest, `fresh` badge. Freshness being frozen and freshness
being part of snapshot identity are two halves of the same honesty requirement.
