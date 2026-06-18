# 0004 — No interpretation in the tool: a deterministic substrate over durable-captured agent judgment

Status: Accepted (2026-06-18)

## Context

The multiverse's own authors warn against the obvious shape of an analysis-management tool. Rohrer,
Hullman & Gelman (2026, *What's a multiverse good for anyway?*) and Del Giudice & Gangestad (2021)
argue that a tool which **mechanically interprets** a multiverse — counts how many paths agree,
averages effects, declares "robust ⇒ probably true" — manufactures *"a guise of rigor and
completeness"* and fails as a serious inferential tool. The hard part (is this the same estimand?
is this fork genuinely arbitrary, or is one specification better justified? what would *deflate*
this uncertainty?) is irreducibly the work of a reasoner, not a rule.

Two further constraints sharpen this:

- **An AI agent is a reasoner.** The papers' gravity is "don't replace *reasoning* with
  *mechanism*," not "don't let an AI reason." So the judgment belongs in the agent layer.
  Hand-coding it into a CLI (counting, averaging, scoring) is the **bitter-lesson anti-pattern** —
  encoding human heuristics exactly where a reasoning system should reason.
- **Judgment that lives only in a session evaporates.** If each fresh agent re-derives from raw
  context, it can re-make the same error — which is literally how an erroneous "closed / negative"
  conclusion recurs (a contradicted fork gets re-walked, its earlier rebuttal forgotten). Judgment
  must persist and be inherited.

## Decision

**Cairn the tool does no interpretation. It is a deterministic, who-agnostic substrate that durably
captures the Agent's judgment and enforces consistency on it — it never counts, averages, scores, or
infers.**

The dividing line is *interpretation vs mechanism*, not *human vs tool*:

- **Interpretation → the Agent (axioms baked into the Skill, not the CLI):** estimand coherence
  (do these siblings answer one question?), E/N/U arbitrariness, the possibility set, the deflation
  route, what a contradiction means. The Agent reasons with its own understanding and fetched
  context.
- **Mechanism → the CLI (hand-coded, deterministic, who-agnostic):** fingerprint/freshness,
  reach-ground graph validation, consistency gates on *declared labels* (e.g. refuse to collapse
  siblings whose declared estimands differ), durable OKF storage + history, and refusal of
  structurally invalid writes.

**Durable capture** is the substrate's reason to exist:

- Every claim persists as OKF — a frontmatter **handle** plus a body **narrative**. The body holds
  the reasoning; the frontmatter holds the actionable status the next agent/CLI acts on *without
  re-reading prose*. The handle is the anti-re-derivation device.
- Both positive and negative/contradicting claims persist; **neither side of a contradiction is
  dropped**. Corrections create versions (`log.md`), never silent overwrites.
- The orient surface (`head` / `index.md`) must **surface** unresolved contradictions and staleness,
  not bury them under canonical positives.

## Consequences

- The CLI stays small and bitter-lesson-correct: all intelligence is in the Agent; the tool does
  only what is verifiable *without understanding*.
- The red line "never a verdict-producer" is **subsumed**: a verdict is interpretation, which the
  CLI is forbidden from. The convergence/robustness-scoring operator sketched in earlier design is
  removed.
- Re-derivation (and error recurrence) is blocked by persistence + handle: the next agent inherits
  "contested, unresolved" instead of reasoning from scratch.
- **Permanent ceiling:** the CLI enforces consistency *with what was declared*, never *truth of the
  declaration*. An agent can still launder by mis-declaring (e.g. labelling two different-estimand
  paths as the same to collapse them). The writer-distrust axis (default-challengeable provenance,
  independent review by a different asserter) mitigates but never closes this.

## Alternatives considered

- **Hand-code the multiverse interpretation into the CLI** (count agreeing specs, average, emit a
  robustness score) — rejected: exactly the bean-counting the multiverse's authors say manufactures
  false rigor, and the bitter-lesson anti-pattern. The interpretation moves to the Agent (Skill
  axioms) instead.
- **Judgment lives only in the Skill prompt, no store** — rejected: judgment evaporates per session
  and the erroneous closed/negative recurs because nothing persists "this was contested." A store is
  required precisely to make judgment survive scale and time. This is the substrate's justification,
  and it is falsifiable: on a real case (the NK pile), persisting + enforcing declared judgment must
  block the recurrence that re-derivation allows; if it does not, the store has not earned itself.
