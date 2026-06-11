# 0002 — Freshness from the evidence fingerprint, not the compute process

Status: Accepted (2026-06-10)

## Context

Cairn must tell a reader whether a claim is still current ("did the thing it rests on change
since I claimed it?"). The first instinct was to hash the *computation*: either consume a
pipeline tool's DAG hashes (targets/snakemake) or wrap execution (`cairn run -- <cmd>`) and hash
inputs/outputs.

Both broke against the real environment. Compute runs mostly through the Agent directly,
sometimes via targets and sometimes not ("sometimes forgot"), sometimes Python, and often on
remote HPC (OSC, vp03):

- Consuming the targets DAG covers only the minority of work that went through targets.
- Wrapping execution can't meaningfully capture remote/async jobs — when the local command is
  `ssh host 'sbatch job.sh'`, wrapping it hashes nothing real.

Process-hashing also fails *hard* when the Owner forgets the special step (no node ⇒ no
freshness at all), and the environment guarantees lapses.

## Decision

**Derive freshness from a fingerprint of the evidence artifact the claim points at, not from
the compute process.**

- At authoring, stamp a fingerprint (content hash; or size+mtime as a weak fallback) of the
  output artifact onto the grounding edge.
- Freshness = compare stored fingerprint to current:
  - `fresh` — reachable, matches.
  - `stale` — reachable, changed (also cascades: stale if any dependency is stale).
  - `unknown` — unreachable, or only self-reported and not re-checkable now. A legal, honest
    state; a false `fresh` is the enemy.
- Fingerprint **quality is tiered and shown on the badge.** A pipeline tool's content hash
  (targets) is the top tier and is reused for free where present. A self-reported remote
  `md5sum` (the Agent fingerprints the artifact in-session on the remote) is a lower, honest
  tier.
- `compute_node` is **demoted** to optional metadata, not the freshness backbone.

## Consequences

- Freshness works across heterogeneous + remote compute, because it depends on the artifact's
  footprint, not on how or where it was produced. The targets-vs-`run`-vs-manual fork dissolves.
- Degrades gracefully: forgetting discipline yields `unknown`, never a silent wrong `fresh`.
- targets is not wasted — when present it is simply the best fingerprint source (rigorous, and
  already computed for its own memoization, which is the free double-duty the Owner valued).
- New honest surface: an `unknown` freshness tier, parallel to `unverifiable` on the
  verification axis. Readers must be shown the tier, not a flattened `fresh/stale`.
- Remote re-checking needs the host reachable; when it isn't, `unknown` is correct, not a
  failure.

## Alternatives considered

- **Consume pipeline DAG only** — rejected as primary: covers a minority of real work; would
  leave most claims with no freshness signal. Retained as the top fingerprint *tier*.
- **Wrap execution (`cairn run --`)** — rejected as primary: cannot capture remote/async jobs;
  reinvents a weaker hasher and forfeits memoization. May return as a minor local convenience,
  not load-bearing.
