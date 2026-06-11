# Maintaining the System Card

This folder is durable, but it is not frozen. Code changes, decisions get revised, v2 lands. This
document explains how to keep the system card alive *without letting it become a competing source
of truth* — which is the one failure mode that would make it worse than useless.

## The cardinal rule: the card explains, it never legislates

The system card is **narrative and explanatory**. It defers authority, for every hard decision, to:

1. `CONTEXT.md` — the terse authoritative glossary and current decisions;
2. the ADRs (`docs/adr/`) — the point decision records;
3. `docs/CONTRACTS.md` + `src/types.ts` — the machine contract (data shapes, CLI signatures).

If the card and any of those ever disagree, **the card is wrong** and must be corrected to match.
The card never wins a conflict. This is what prevents it from becoming a second, drifting source of
truth that a reader might cite against the real ones. The card's job is to carry the *reasoning*
around the decisions; the decisions themselves live in the authoritative documents.

## The update order, when a decision changes

When a real decision changes, update in this order — authoritative first, narrative second:

1. **Update the authoritative source first.** A new or reversed decision gets a new ADR (or a
   revised one with a status change), and `CONTEXT.md` / `CONTRACTS.md` / `src/types.ts` are
   updated to the new truth. Decide the thing in the place that has authority over it.
2. **Then revise the relevant card section** to narrate the new reasoning — what the fork was, what
   was chosen, what was given up, how reversible it is (the shape used in
   `09-decisions-and-tradeoffs.md`).
3. **Never** revise only the card. A card section that describes a decision the ADRs/CONTEXT do not
   yet reflect is exactly the drift this rule exists to prevent.

The convention for a *new major decision*: it gets an ADR (authoritative) **and** a narrative
paragraph here (explanatory), added together. The ADR records the decision; the card explains why
it coheres with the rest.

## What to revisit when code changes

A checklist, keyed to the parts of the card most coupled to specific source files. When you touch
the left column, check the right.

| If you change… | Revisit in the card… |
|---|---|
| `src/types.ts` / `docs/CONTRACTS.md` (shapes, enums, CLI signatures) | `03-domain-model.md`, `04-architecture.md`; any schema description anywhere |
| `src/gate.ts` / the reach-ground query / promotion semantics | `03-domain-model.md` (iron rule), `04-architecture.md` (hard floor), `06` (publish gate) |
| `src/freshness.ts` / `src/fingerprint.ts` (methods, tiers, cascade) | `05-freshness.md`; the tier table; the cascade/fixpoint explanation |
| `src/snapshot.ts` / `src/publish.ts` (snapshot id, diff, share model) | `06-publish-and-snapshots.md` — *especially* the snapshot-identity story if the id inputs change |
| `skill/cairn/SKILL.md` (touchpoints, triggers, enforcement) | `07-the-agent-loop.md` |
| `site/` (stack, data flow, badges, motion) | `08-frontend.md`; the honest-badge and no-backend claims |
| `src/reconcile.ts` / enforcement model | `07-the-agent-loop.md`, `06` (warn-only reconcile), `10` (ceilings) |
| Adding a v2 feature (verification, hooks, meeting, write-back) | `10-limitations-and-future.md` — move it from "reserved seam" to "built", and add an ADR + a `09` paragraph |

Two cross-cutting checks for any change:

- **Terminology.** Keep every term exactly consistent with `CONTEXT.md`. If a term's meaning
  shifts, fix `CONTEXT.md` first, then sweep the card. The card's value depends on using the
  project's words the project's way.
- **As-built honesty.** The card describes the system *as actually built*, including the gaps
  between the original spec and the final code (the canonical-only resolution, the snapshot-identity
  correction, the vinext→Vite fallback). If a future change closes one of those gaps or opens a new
  one, tell that story rather than smoothing it over — the instructive moments are part of the
  card's value.

## When the card is doing its job

The test is the same one Cairn applies to itself: hand this folder (and nothing else) to a fresh AI
session and ask "what is Cairn, why is it shaped this way, and what does it deliberately not do?"
If the session answers correctly — defends the hard constraints, names the accepted ceilings, and
does not try to re-litigate settled decisions — the card is current. If it gets something wrong,
that is the signal that the card has drifted from the code or the authoritative docs, and the fix is
to reconcile it *toward* them, never the other way.

## Keep the voice

The card is written in a thoughtful, essayistic-but-precise register — prose paragraphs carrying
the argument, lists and tables only where they genuinely clarify, honest about tensions and
ceilings. Revisions should match that voice. It is documentation meant to be *read* and *reasoned
with*, not skimmed as bullet notes. If a revision would be clearer as an argument than as a
fragment, write the argument.
