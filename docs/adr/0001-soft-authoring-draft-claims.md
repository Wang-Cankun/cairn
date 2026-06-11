# 0001 — Soft authoring via draft claims; iron rule enforced at the canonical boundary

Status: Accepted (2026-06-10)

## Context

Cairn's central guarantee (the Iron rule) is that every claim is well-founded: it has at least
one edge, and following dependency edges upward terminates at the ground (a run / file / data /
external reference). No claim may rest only on other claims — that would be circular reasoning
wearing a provenance costume, the exact failure Cairn exists to prevent.

The open question was *when* that rule is enforced relative to authoring:

- **Atomic authoring** — `cairn add-claim` refuses to create a claim without a grounding or
  dependency edge in the same call. The store is never, even transiently, in a state with an
  ungrounded claim.
- **Soft authoring** — a claim may be created bare (no edge) in a `draft` state and have edges
  attached later.

Atomic is the stronger invariant but adds friction to the Agent's flow: the Agent must record
edges at the instant of concluding, and a claim depending on a not-yet-recorded claim forces
recording that one first.

## Decision

Adopt **soft authoring with a hard boundary.**

- A claim may be created as a **draft** with no edge.
- Draft claims live **only in the Owner's working area**. They are never read by a Collaborator
  or a Fresh session, never emitted in `head.json`, never included in a Snapshot.
- The claim lifecycle is `draft → canonical`. Promotion to canonical is the **hard gate**: the
  promotion/publish step runs the well-founded check (the recursive reach-ground query) over
  the candidate canonical set and **refuses** if any claim that would enter canonical is not
  grounded — including dependency cycles, which never reach ground.

So softness is real but **bounded**: it exists entirely *before* the gate. Everything a reader
ever sees (canonical) is always well-founded. We chose authoring ergonomics for the working
area without weakening the guarantee for any reader.

## Consequences

- Every reader path (Collaborator site, Fresh-session `head.json`, Snapshots) keeps the full
  Iron-rule guarantee. The promise to readers is unchanged.
- The Agent can capture a conclusion mid-flow and ground it a moment later, which fits how an
  AI coding session actually works.
- New surface area: a `draft` state, and a `promote`/publish gate that must run the reach-ground
  check. The CLI must expose drafts to the Agent (e.g. `cairn drafts` / `cairn status`) so
  loose, ungrounded threads are visible and don't silently rot in the working area.
- Risk to watch: drafts accumulating ungrounded forever. Mitigation deferred to a later
  decision (e.g. a staleness/age warning on drafts, or a publish-time report of how many drafts
  were left behind). Not enforced in v1, but the CLI must at least make the count visible —
  silent truncation of "what didn't make it" is itself a failure mode.

## Alternatives considered

- **Atomic authoring** — rejected for v1 as too much per-claim friction during agent flow.
  Reversible: tightening to atomic later is a strictly stronger rule and can be added without
  migrating data (existing grounded claims already satisfy it). This reversibility is part of
  why soft-first is safe to choose now.
