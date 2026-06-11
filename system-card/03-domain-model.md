# 03 — Domain Model

This document describes Cairn's conceptual model — the objects, their relationships, and the laws
that govern them — in depth. It is the bridge between the philosophy (`02-philosophy.md`), which
argues for the model, and the architecture (`04-architecture.md`), which implements it. The
terminology here is exactly the terminology of `CONTEXT.md`; where this document expands on a
term, it never redefines it. `CONTEXT.md` remains the authoritative glossary; a compact glossary
is repeated at the end of this document for convenience.

---

## The claim

A **claim** is the irreducible unit (argued in `02-philosophy.md` §2): one analysis conclusion,
stated in one sentence. On disk it is a single small markdown file with YAML frontmatter, one per
claim, under `cairn/claims/<id>.md`. The frontmatter carries:

- `id` — `claim-YYYYMMDD-NNN`, a date stamp plus a zero-padded per-day counter (allocated by
  `src/store.ts`).
- `text` — the conclusion, one sentence.
- `status` — `draft` or `canonical` (the lifecycle; below).
- `verification` — one of four values on the verification axis (below); v1 always authors
  `unverified`.
- `grounding` — an array of claim → evidence edges.
- `depends_on` — an array of claim → claim edges.
- `created_at` — ISO-8601 with offset.

Note what is **absent**: there is no freshness field. That absence is deliberate and load-bearing
(ADR-0002): freshness is computed at read time, never stored (see `05-freshness.md` and the
determinism principle in `02-philosophy.md` §7). The markdown body below the frontmatter is
freeform notes/caveats and is **unparsed in v1** — Cairn reads it, preserves it on rewrite, but
does not interpret it.

The exact shape is pinned in `src/types.ts` (`ClaimFrontmatter`, `GroundingEdge`, `ClaimFile`)
and `docs/CONTRACTS.md` §1. The card does not restate the schema; it explains it.

---

## The claim lifecycle: draft → canonical

A claim has exactly two on-disk states, and the transition between them is the most important
boundary in the system.

- A **draft** is a claim in the owner's working area. It *may be ungrounded* — it may have zero
  edges. It lives only locally: a draft is **never** read by a collaborator, **never** read by a
  fresh session, **never** written into `head.json`, **never** included in a snapshot. Drafts
  appear only in the local terminal projection (`cairn head`, `cairn drafts`).

- A **canonical** claim is part of the agreed current record. It is always well-founded (it
  satisfies the iron rule). Everything a reader ever sees is canonical.

Promotion from draft to canonical is the **hard gate.** A draft may cross only if it satisfies
the iron rule — at promotion time the recursive reach-ground query is run over the candidate set,
and any claim that cannot reach ground is refused (`src/gate.ts`, `src/publish.ts`). This is the
heart of ADR-0001's "soft authoring with a hard boundary": **softness lives entirely before the
gate; everything past the gate is always well-founded.**

The reason for the split is ergonomic on one side and inviolable on the other. On the draft side,
the agent can capture a conclusion mid-flow — one cheap call — and ground it a moment later,
because that is how an analysis session actually unfolds (you conclude something, *then* you point
at the file). Forcing grounding into the same instant as conclusion (the rejected "atomic
authoring" alternative) adds a friction tax that breeds avoidance, and avoidance is the real
failure mode (claims that never get written at all). On the canonical side, the guarantee to
readers is absolute and unchanged: no ungrounded claim is ever shared.

There is one internal-only third status worth naming because it appears in the code:
`canonical-candidate`. It is **never written to disk.** It is an in-memory marking used by the
gate to flag the set of claims that *would* enter canonical (existing canonical claims, plus
grounded drafts), so the reach-ground query checks them together. It exists only inside one
command's execution and is discarded with the throwaway index.

---

## The two edge types

A claim may carry two kinds of edge, and keeping them **distinct types** is one of the four word-
splits from `02-philosophy.md` §8 (the "evidence" split).

- A **grounding edge** points from a claim to a piece of evidence: a run, a file, a dataset, or
  an external reference. It is the claim's feet on the ground. Each grounding edge carries a
  `kind`, a `ref` (logical handle), a `fingerprint` (stamped at authoring), a `method` (how to
  re-fingerprint), and a `location` (where to re-fingerprint from). Grounding edges are what make
  freshness computable.

- A **dependency edge** points from a claim to *another claim*: this conclusion stands on that
  one's shoulders. It is just the target claim's id. A dependency edge does **not** count as
  grounding.

### Why they must stay distinct

It would be tempting to model both as "the things a claim points at" and treat them uniformly.
That would be a serious mistake, for three independent reasons:

1. **Cascade differs.** When an *upstream claim* goes stale, this claim's justification is
   undermined — staleness propagates down the dependency graph (justification propagation). When
   the *underlying data* of a grounding edge changes, this specific claim is flagged for review —
   a different trigger with a different meaning. The dependency cascade and the grounding change
   are not the same event and must not be handled by one rule. (The freshness cascade in
   `05-freshness.md` implements exactly this asymmetry: a claim is stale if any of its *own*
   grounding edges changed **or** any claim it depends on is stale.)

2. **Verification differs.** A claim grounded in data can be checked independently against that
   data (the v2 verification axis attaches here). A claim that only *depends on* other claims
   cannot be independently checked — it merely *inherits* the verification status of what it
   stands on. Conflating the edge types would erase the distinction between "checkable against
   reality" and "only as good as its premises."

3. **Circular reasoning.** This is the decisive one. If a claim → claim edge counted as
   grounding, then two claims could support *each other* in a loop while nothing in the loop ever
   touched reality. That is circular reasoning wearing a provenance costume — the exact failure
   the iron rule exists to prevent. By refusing to let dependency edges count as grounding, Cairn
   makes circularity structurally unable to masquerade as well-foundedness. A cycle, having no
   path to real ground, simply never reaches ground, and the gate catches it.

---

## The iron rule (well-founded)

The central guarantee. Stated formally:

> **Every claim has ≥1 edge, and following dependency edges upward must terminate at ≥1 non-claim
> grounding (a run / file / data / external reference). A claim that cannot reach ground may not
> enter the canonical head and may not be shared.**

Stated intuitively:

> *The chain can be long, but its end must be solid ground, not another sentence.*

The rule blocks circular reasoning (a cycle never reaches ground) and rootless chains (a tower of
claims depending on claims, none of which ever touches data). It is **enforced at the
draft→canonical boundary**, not at write time (ADR-0001) — a draft may transiently violate it,
but nothing violating it is ever promoted or shared.

Mechanically, "reaches ground" is a graph-reachability question, not a column constraint, so it
is answered by a recursive query over the derived index (`src/gate.ts`, `docs/CONTRACTS.md` §6):

```sql
WITH RECURSIVE grounded(id) AS (
  SELECT DISTINCT claim_id FROM claim_evidence
  UNION
  SELECT d.claim_id FROM claim_dep d JOIN grounded g ON d.depends_on = g.id
)
SELECT id FROM claim
WHERE status = 'canonical-candidate' AND id NOT IN (SELECT id FROM grounded);  -- must be EMPTY
```

A claim is in the `grounded` set if it has a direct grounding edge, or it transitively depends on
something that is grounded. Any canonical-candidate *not* in that set is an offender: it cannot
reach ground. Cycles never enter `grounded` (the recursion only adds a claim when one of its
dependencies is *already* grounded, which a pure cycle never achieves), so they surface here as
offenders — circular reasoning caught by the same query that catches rootless chains, with no
special-casing. The acceptance test (`tests/acceptance.sh` step 9) exercises exactly this: a
canonical claim depending only on an ungrounded draft fails `validate` with the offender named.

---

## The two orthogonal axes

A claim carries two independent status axes, and **the law is that they never merge into one
word** (the "status" split from `02-philosophy.md` §8; the anti-laundering thesis in §3).

| Axis | Values | Source | v1 |
|---|---|---|---|
| **Freshness** | `fresh` / `stale` / `unknown` | Computed from the evidence fingerprint (ADR-0002) | Built — computed, never typed |
| **Verification** | `unverified` / `verified` / `contradicted` / `unverifiable` | A claim checked against an external oracle | Honest default only; machinery is v2 |

The two answer entirely different questions:

- **Freshness** answers: *has the thing this claim rests on changed since I claimed it?* It is
  about the *currency* of the evidence. It is deterministic and computed (`05-freshness.md`).
  `unknown` is a legal, honest state — when the artifact is unreachable or only self-reported,
  Cairn says `unknown`, never a false `fresh`.

- **Verification** answers: *is this claim actually correct?* It is about *truth*, checked against
  some external oracle or reference. It is **not** deterministic from the artifact alone, which is
  why v1 ships none of the machinery and stores only the honest `unverified` default.
  `unverifiable` is a legal, honest state on this axis, parallel to `unknown` on the freshness
  axis.

A claim can be `fresh` and `unverified` simultaneously — and almost every v1 claim is exactly
that. "Fresh" means the CSV has not changed; it says nothing about whether your conclusion from
that CSV is right. Collapsing the two axes into a single "status" word would let `fresh` be
misread as `good`, which is the laundering move the whole project refuses. The viewer enforces the
separation visually: freshness and verification are two distinct badges, and verification is shown
in one neutral style for all its values so `unverified` is never dressed to look settled
(`site/src/components/Badges.tsx`).

(One note on a stale-looking source: an early table in `docs/DESIGN.md` §2 lists the verification
values without `unverifiable` and describes freshness as deriving "from the compute DAG." Both
are superseded — by `CONTEXT.md`/`src/types.ts` for the four-value enum, and by ADR-0002 for the
fingerprint-based freshness. The as-built truth is the four-value verification enum and
fingerprint-derived freshness.)

---

## Evidence kinds

A grounding edge's `kind` is one of four, and each maps to a default fingerprint method
(`src/fingerprint.ts`, `docs/CONTRACTS.md` §8):

- **`target`** — the output of a pipeline step (targets). Method `pipeline-meta`: read the content
  hash from the pipeline's meta store (`_targets/meta/meta`). Top tier — rigorous and free,
  because the pipeline already maintains the hash for its own memoization.
- **`file`** — a loose result file on local disk (a CSV, a saved model object, a figure). Method
  `sha256`: hash the file directly. Mid tier.
- **`data`** — a dataset; treated as a local file (`sha256`) when reachable, else as a remote
  artifact (`remote-md5`/`unknown`).
- **`external`** — an artifact on a remote host (HPC: OSC, vp03). Method `remote-md5`: the agent
  runs `ssh <host> md5sum` in-session; unreachable → `unknown`. A lower, self-reported tier.

### Why `external` is its own type even in v1

The verification machinery is deferred to v2, so it is reasonable to ask why `external` needs to
be a distinct evidence kind now rather than being folded into `data`. The answer is that **the
external-reference edge is the attachment point for the v2 verification layer.** A claim grounded
in an external public reference (a dataset, a published result, a DOI) is the kind of claim a v2
verifier/oracle would check against a curated reference. By giving `external` its own type now —
even when, in v1, it is "just a string" plus a remote fingerprint — Cairn reserves the seam where
verification will attach, without building any of it. This is the same "reserve the seam, build
none of it" discipline that governs the meeting layer and hooks (`10-limitations-and-future.md`).
Folding `external` into `data` would have saved nothing in v1 and would have closed the door v2
needs open.

---

## Glossary

This restates the authoritative `CONTEXT.md` terms for convenience. If this and `CONTEXT.md`
disagree, `CONTEXT.md` is correct.

- **Owner** — the person who runs the analysis and owns the local store. Single owner, local-first.
- **Agent** — the AI coding harness (Claude Code) the owner works through. The primary *writer* of
  claims and a *reader* of the canonical head at session start.
- **Collaborator** — receives a read-only published projection. Read-only in v1.
- **Fresh session** — a new agent session that reads the canonical head to orient instantly.
- **Claim** — one analysis conclusion: text, a verification status, and edges.
- **Claim lifecycle** — `draft → canonical`. Drafts may be ungrounded and live only locally;
  promotion to canonical is the hard, iron-rule gate.
- **Evidence** — a piece of grounding: a run, a file, a dataset, or an external reference.
- **Grounding edge** — `claim → evidence`. The claim's feet on the ground.
- **Dependency edge** — `claim → claim`. Standing on another's shoulders. Does *not* ground.
- **Iron rule (well-founded)** — every claim has ≥1 edge and must reach real ground; enforced at
  the draft→canonical boundary. Blocks circular reasoning.
- **Freshness** — `fresh` / `stale` / `unknown`. Computed from the evidence fingerprint, never
  stored. A false `fresh` is the enemy.
- **Fingerprint** — a recorded signature of an evidence artifact, stamped at authoring; quality is
  tiered and shown on the badge.
- **Verification** — `unverified` / `verified` / `contradicted` / `unverifiable`. A separate axis
  from freshness; v1 stores the honest default only.
- **Canonical head** — the current agreed record. Publishing advances it.
- **Snapshot** — an immutable, content-addressed freeze of the canonical head at one publish.
- **`canonical ≠ verified`** — publishing makes a version agreed-current, never true.
- **Compute node** — optional metadata about how an artifact was produced; demoted, *not* the
  freshness backbone.
