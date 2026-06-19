# 0001 — Soft authoring via draft claims; iron rule enforced at the canonical boundary

Status: Accepted (2026-06-10)
Amended: 2026-06-18 (PRD 0002) — (a) the draft invariant is restated as *no authority*, not
*invisibility*: drafts are excluded from the orient surface / snapshot / published head but ARE
queryable via `drafts`/`status`; (b) v2 implements the iron rule as a DIRECT per-claim grounding check
— the schema has no claim→claim dependency edge, so there is no transitive walk and no cycle case.

## Context

Cairn's central guarantee (the Iron rule) is that every claim is well-founded: it stands on real
evidence (a run / file / data / external reference), never only on other claims — circular reasoning
wearing a provenance costume is the exact failure Cairn exists to prevent.

(v2 note: the schema carries NO claim→claim dependency edge. A claim grounds directly through ≥1 of
its own evidence refs or not at all; "rests only on other claims" is therefore unrepresentable, so the
iron rule holds *by construction* — there is no transitive walk upward and no dependency cycle to
detect. The text below describes the original transitive framing; v2 realises the same guarantee more
simply. See PRD 0002.)

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
- Draft claims carry **no authority**: never emitted on the canonical orient surface
  (`head`/`index.md`), never in `head.json`, never in a Snapshot bundle. They are **not invisible**,
  though — an Agent (including a Fresh session) may query them via `cairn drafts` / `cairn status`.
  The split is *visibility* (queryable shared working memory) vs *authority* (never read as canonical),
  not presence vs absence. See PRD 0002.
- The claim lifecycle is `draft → canonical`. Promotion to canonical is the **hard gate**: the
  promotion/publish step runs the reach-ground check over the candidate canonical set and **refuses**
  any claim that would enter canonical without a grounding edge. (v2: a direct per-claim check — each
  candidate must carry ≥1 of its own evidence refs; with no claim→claim edge there is no transitive
  query and no cycle case to handle. A canonical candidate must also declare an `estimand` — the
  companion estimand-required gate, ADR 0005 / PRD 0002.)

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
