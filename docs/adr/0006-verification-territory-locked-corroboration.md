# 0006 — Verification is territory-locked; agent cross-review is a separate, derived corroboration axis

Status: Accepted (2026-06-18)

## Context

The deterministic substrate (ADR 0004) has one permanent hole: it enforces *consistency with what
was declared*, never *truth of the declaration*. The only mitigation is independent review by a
different agent. This raised the question (gate 闸 2): how to record who-asserted / who-reviewed, and
whether a "trust rises on review" axis belongs in the tool at all.

Original Cairn already carries a `verification` axis (`unverified` / `verified` / `contradicted` /
`unverifiable`) meaning *confirmed by something independent of your analysis system* (wet-lab,
independent cohort). Its value is being a **structured, inheritable, almost-always-`unverified`
warning light** so `canonical` can never silently masquerade as `verified`. Its value is in "cannot
be dropped," not "changes often."

Three options for agent cross-review were weighed:

1. Demote to body narrative — **rejected**: throws the warning light away; narrative `unverified` gets
   washed out by summarization, which is exactly what the structured axis exists to prevent.
2. Keep a structured axis; the CLI does one deterministic thing — no different-asserter review edge ⇒
   it cannot rise — **chosen**. Pure edge-existence check, same pattern as the estimand id gate
   (ADR 0005), so as faithful to 0004 as option 1, but it keeps the light.
3. Fold `verified` into the provenance gradient — **rejected**: opens "experimental provenance read as
   verified," i.e. canonical masquerading as verified again.

A trap inside option 2: if the cross-review rung sits *on the verification axis*
(`unverified < cross-reviewed < verified`), then `cross-reviewed` is a non-verified state on the
verification axis that reads as "half-verified" — the very masquerade option 3 was rejected for.

## Decision

- **`verification` is territory-locked.** It means confirmation by something independent of the
  analysis system (wet-lab, independent cohort). Default `unverified` — the warning light. An **agent
  can never set `verified`**: the CLI forbids `verified` when provenance is agent-sourced, and only a
  non-agent provenance (experimental / human-confirmed) reaches it. *(Gate A — deterministic enum.)*
- **Agent cross-review is a separate, derived `corroboration` axis, not a rung on verification.**
  `reviewed_by` is a structured edge set (asserter ids) the CLI stamps as fact. `corroboration` is
  **derived** (like freshness, not hand-set): `self-asserted` (one asserter) / `cross-reviewed`
  (≥2 distinct asserter ids). The CLI refuses `cross-reviewed` without ≥2 distinct asserter-id review
  edges. *(Gate B — deterministic edge count.)*
- This lifts a claim from *one-named-asserter canonical* to *two-named-asserter canonical* — **still
  canonical, never verified.**

## Ceiling

A distinct asserter id is **not** independence: the same model in a new shell has a different id and
the same blind spot, and the CLI cannot catch such a fake review. So the CLI does only "no second
asserter ⇒ cannot rise"; whether the second asserter is genuinely decorrelated (different family, why
independent) is **narrative written on the review edge — the CLI carries it but does not verify it.**
`corroboration: cross-reviewed` means "two named asserters on record," not "verified true."

## Consequences

- `canonical ≠ verified` is protected on both flanks: agents are locked out of `verified` (Gate A),
  and the cross-review trust is kept *off* the verification axis so it cannot masquerade as verified
  (the structural separation).
- Both gates are pure mechanism (enum check, edge count), faithful to ADR 0004; no independence
  judgment lives in the CLI.
- The warning light survives as **structure, not narrative**, so summarization cannot wash it out.

## Alternatives considered

- **Cross-review as a rung on the verification axis** — rejected: re-creates the option-3 masquerade
  (a non-verified rung on the verification axis reads as half-verified).
- **Demote verification to body narrative** — rejected: the axis's whole value is being undroppable
  structure; narrative gets washed by summarization.
