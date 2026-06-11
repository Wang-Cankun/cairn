# Cairn — System Card

This folder is the **system card** for Cairn: a long-form, narrative explanation of what
Cairn is, why it is shaped the way it is, and how the system that was actually built embodies
those reasons. It is the durable "why" layer of the repository. Where the other documents are
terse, pointed, or machine-facing, the system card is meant to be *read* — by a human
collaborator picking up the project months later, and (centrally) by a fresh AI coding session
that needs to absorb the whole project quickly and correctly before touching anything.

That second reader is not incidental. Cairn's own thesis is that a fresh session should be able
to orient from a canonical record rather than re-deriving the entire history of a project from
scratch. This system card is the human-and-AI-readable embodiment of that thesis *for Cairn
itself*. If it works, a model handed only this folder should be able to explain Cairn's purpose,
defend its hard constraints, name what it deliberately does not do, and avoid re-litigating
decisions that were already settled — without reading a line of source first.

## What this is, and what it is not

The Cairn repository carries several kinds of documentation, each with a different job. The
system card does not replace any of them; it explains and ties them together.

| Document | Register | Authority |
|---|---|---|
| `CONTEXT.md` | Terse, authoritative glossary + current decisions | **Source of truth** for terminology and resolved decisions |
| `docs/adr/0001–0003` | Point decision records — one fork each, with consequences | **Authoritative** for the specific decision each records |
| `docs/CONTRACTS.md` + `src/types.ts` | The pinned machine contract — exact cross-module shapes | **Authoritative** for data shapes and CLI signatures |
| `docs/BUILD-BRIEF.md` | The buildable spec — "what to build" | Valid, but ADRs/CONTEXT win where they differ |
| `docs/DESIGN.md` | Background reasoning, pre-grilling | Largely valid; superseded by the ADRs where they predate them |
| `docs/ARCHITECTURE.html` | A reviewed visual plan of the layered system | A plan; the as-built source is the truth |
| **`system-card/` (this folder)** | **Long narrative — the WHY** | **Explains; never overrides.** Defers to the above for hard decisions |

The single most important rule for this folder: **the system card explains, it does not
legislate.** When a hard fact (a term, a schema, a resolved fork) is needed, the authority is
`CONTEXT.md`, the ADRs, and `CONTRACTS.md` — in that order. The card narrates the reasoning
around those facts. If the card and one of those documents ever disagree, the card is wrong and
should be corrected. `MAINTENANCE.md` in this folder describes how to keep that discipline.

A second rule worth stating once, because it recurs throughout: this card describes the system
**as actually built**, not merely as originally specced. v1 was specced, built, verified, and
corrected, and several of the most instructive moments are in the gap between the first spec and
the final code. The card tells those stories rather than hiding them. In particular it reflects
four post-build resolutions that a reader of the original brief alone would get wrong:

1. **Published artifacts are canonical-only.** `head.json` and every snapshot contain canonical
   claims and nothing else — not even a draft count. (Decision A; ADR-0001 won over a line in
   the build brief that implied drafts would ride along in `head.json`.)
2. **The share model is immutable snapshots plus a stable mirror.** `publish` writes an
   immutable `snapshots/<id>/` and refreshes a stable `published/latest/` copy. You share the
   `latest/` path once; it always shows the newest publish. (Decision B.)
3. **A snapshot's identity content-addresses the published *view*, which includes computed
   freshness and excludes all timestamps.** This resolved a real and dangerous collision: an
   earlier "exclude everything time-varying" reading would have let a claim that went stale after
   publish keep showing `fresh` on the share link forever — the exact dishonesty Cairn exists to
   prevent. (Decision E / "Option X"; see `06-publish-and-snapshots.md`.)
4. **The site ships as plain Vite + React, not vinext.** The published snapshot is fully static,
   client-rendered, and has no backend; vinext's value is in a server surface that does not exist
   here. (Decision G fallback; see `08-frontend.md`.)

## Reading order

The documents are numbered in the order they are best read straight through, but each stands on
its own and cross-references the others.

1. `01-what-cairn-is.md` — the identity. The shortest path to "what is this thing."
2. `02-philosophy.md` — the deepest document. The intellectual foundations, each as a real
   argument. If you read only one document beyond this README, read this one.
3. `03-domain-model.md` — the conceptual model: claim, lifecycle, the two edge types, the iron
   rule, the two orthogonal axes, the glossary.
4. `04-architecture.md` — the layered system as built, the one-directional flow, the load-bearing
   seam between authoring and projection.
5. `05-freshness.md` — the freshness model in full: fingerprint-the-artifact, the tiers, the
   cascade, frozen-at-publish.
6. `06-publish-and-snapshots.md` — immutability, content-addressing, the diff, and the
   snapshot-identity story told as a worked design lesson.
7. `07-the-agent-loop.md` — the skill and the four-touchpoint protocol; the enforcement model
   stated honestly.
8. `08-frontend.md` — the published projection as a static, no-backend artifact; the vinext→Vite
   story.
9. `09-decisions-and-tradeoffs.md` — the consolidated decision record as narrative: every fork,
   what was chosen, what was given up, and how reversible it is.
10. `10-limitations-and-future.md` — what v1 deliberately is not, the reserved seams, and v2.
11. `MAINTENANCE.md` — how to keep this card alive without letting it become a competing source
    of truth.

## Cairn in two minutes

Cairn is **a read-only canonical projection of a claim graph.** Instead of zipping analysis
results and emailing them, you publish them as *claims*: each claim is one conclusion that
carries an explicit, mandatory link to the evidence it stands on. An AI coding agent (Claude
Code) authors these claims into a local store during normal analysis work — that is the primary
interface, the product is the agent loop, not a GUI. The store's source of truth is plain-text
claim files in git, one tiny file per claim, referencing (never ingesting) the heavy artifacts
that live elsewhere. A CLI is the sole writer; a derived, throwaway SQLite index answers graph
and freshness queries.

Two readers consume the same canonical head. A **collaborator** opens a read-only link — lighter
than opening a zip, no login. A **fresh AI session** reads `head.json` to know instantly "where
we are and what to decide next," which is the cross-session context loss that Cairn exists to
solve. Three hard rules hold the whole thing up: every claim must reach the ground (no claim
rests only on other claims); freshness is *computed* from the evidence fingerprint, never typed
or guessed (`unknown` is a legal, honest state — a false `fresh` is the enemy); and each publish
is an immutable, content-addressed snapshot with a diff against the one before it.

The deepest commitment underneath all of this is **anti-laundering**: publishing makes a record
*canonical* — the agreed current version — never *true*. Canonical is not verified. The machine
that quietly turns an unverified claim into a verified-looking one, just because it went on a
nice page, is exactly what Cairn is built to dismantle. Everything else — the mandatory grounding
edge, the computed freshness, the honest badges, the schema-not-skill discipline — is downstream
of refusing that one laundering move.
