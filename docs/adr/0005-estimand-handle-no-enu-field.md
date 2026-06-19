# 0005 — Estimand is the structured handle; specification-equivalence stays in the Agent (no E/N/U field)

Status: Accepted (2026-06-18)
Amended: 2026-06-18 (PRD 0002) — added the estimand-required gate (c.1b): every canonical candidate
must declare an estimand id (a pure presence check; the body is never read). Draft authoring stays soft.

## Context

Earlier design weighed Del Giudice & Gangestad's (2021) **E/N/U** typing — equivalence /
nonequivalence / uncertainty per analytic decision node — as a candidate first-class field: the
structured handle that would tell convergence/orient logic when sibling specifications may be
collapsed.

ADR 0004 reassigned all interpretation to the Agent. Assigning a node an equivalence *type* is a
contested judgment about the relationship between alternative specifications — i.e. interpretation —
so by 0004 it cannot be a tool mechanism. Three independent reasons confirm demoting it from a field:

1. **Bitter lesson.** Welding a specific 2021 taxonomy into the schema freezes a human framework.
   A capable agent will use E/N/U *and exceed it* (a better split may exist tomorrow). A tool coupled
   to a taxonomy ages fast.
2. **The framework's own authors cool on it.** Rohrer, Hullman & Gelman (2026) note the E/N/U
   distinctions hold in theory but in practice "strongly hinge on researchers' domain knowledge and
   understanding of statistics," and that Type U (uncertain) will be common. A three-bucket enum
   whose modal value is "uncertain" is not something to enforce.
3. **Friction discipline** (a field must be cheap for an agent to fill from what it already knows).
   `estimand` is the Agent's declaration of its *own intent* — which quantity it is measuring, which
   question it is asking — known while analysing: cheap, stable. E/N/U is a *verdict on the
   relationship between others' choices*, requiring sibling comparison and contested fine judgment:
   exactly the think-field a fleet of agents will skip.

A forced E/N/U field is also a **laundering surface**: an agent can declare "Type E, equivalent" to
legitimately collapse or settle. Not making it a field removes that vector.

## Decision

- **`estimand` is a first-class structured handle** — the Agent's explicit declaration of the
  quantity/question a claim targets (which effect, in which population, conditional on what).
- **Specification-equivalence (E/N/U, and any successor taxonomy) is NOT a field.** It is the
  Agent's reasoning lens, captured as body narrative where it matters, never an enforced enum.
- Estimand subsumes the **load-bearing half** of equivalence-typing — *effect-nonequivalence*
  (different estimand ⇒ different question ⇒ not comparable). The other nonequivalence kinds
  (measurement, power/precision — "same estimand, but is spec A more valid/powerful than B?") are
  case-by-case domain judgments left to the Agent.
- The only deterministic gate this needs is on the handle: **refuse to collapse siblings whose
  declared estimands differ.** No E/N/U is required for it.
- **Estimand is required at the draft→canonical boundary** (added by PRD 0002): a draft may omit it
  (soft authoring), but a claim cannot be promoted to / kept canonical without an `estimand` id — the
  estimand-required gate (c.1b), a pure presence check that never reads the body. "Declare what you are
  estimating" is mandatory on every claim a reader sees as canonical.
- **Mechanics (how the handle is compared without interpretation).** An estimand is a **first-class
  OKF node** (`type: estimand`): its **body is the definition** (natural language, the Agent's), its
  **id is its identity**. Claims reference it by id (`estimand: <id>`). The CLI compares **ids**
  (string equality), never the meaning of the definitions — that is what keeps the collapse gate
  deterministic (mechanism, not interpretation). Whether to reuse an existing estimand-id or mint a
  new one is the Agent's judgment. Same linked-node pattern as confounds; same handle-vs-content
  split as the rest of the schema. Ceiling: the CLI cannot catch *fragmentation* (two ids for one
  estimand) or *conflation* (one id over two genuinely different estimands — a laundering move);
  independent review of the estimand node is the only mitigation.

## Consequences

- The tool is not coupled to a 2021 taxonomy; a better future framework is adopted by changing
  **Skill axioms**, not the schema.
- **Nothing mechanical is lost:** the collapse gate needs only the estimand label; the equivalence
  reasoning persists as body narrative (durable capture, ADR 0004), usable by the next agent under
  whatever framework it prefers.
- One fewer laundering surface (no "declare Type E to settle").
- Ceiling unchanged (ADR 0004): the estimand handle is only as honest as the Agent's declaration.
  Independent review of the estimand is the mitigation — see the asserter / independent-review axis.

## Alternatives considered

- **E/N/U as the first-class fork-typing** (the earlier position, carried for several design rounds)
  — rejected: it is interpretation (0004), ages badly (bitter lesson), its own authors doubt its
  practical application, and as a field it is a skip-prone, gameable think-field.
