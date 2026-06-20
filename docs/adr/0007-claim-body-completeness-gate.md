# 0007 — The claim body is gated at the canonical boundary: its narrative movements must be present to publish

Status: Accepted (2026-06-20)

## Context

The handle/body split (ADR 0004; Whitebook III.1) divides a claim file in two: the
frontmatter **handle** carries machine-actionable state the next agent reads *without*
re-reading prose, and the markdown **body** carries the **narrative** — the reasoning itself:
the conclusion with its conditions, each contradiction and inherited caveat and *why it
matters*, and what would change it (axiom 9). The body is the deep-read surface for a human,
or for an agent who drills into a specific claim.

The body is load-bearing, not decoration: it is the **only per-claim narrative that survives
into a published snapshot.** `freezeBundle` copies the canonical claim files (bodies included)
into `snapshots/<id>/`; `FINDINGS.md` is never copied into a snapshot bundle. So an empty body
means the immutable published record keeps only the one-line `text` handle, and any reasoning
that lived only in the (un-frozen) `FINDINGS.md` is **permanently lost to every future
reader** — precisely on the contested forks Cairn exists to preserve.

The gap: `add-claim` writes a **skeleton** body with placeholder cues ("skeleton claim body
cueing the three required movements — Skill fills the prose") and never checks it again. By
contrast `add-estimand` / `add-confound` **require** their body via `--def` / `--caveat`, so
those bodies are always filled; the claim body is optional and gets skipped. Observed in a real
eval run: the agent filled the handle perfectly and wrote rich prose in `FINDINGS.md`, but left
every claim body as unfilled `<...>` placeholders — `validate` / `publish` passed because they
check edges / grounding / freshness, never prose. axiom 9 was silently unmet, then frozen into
the snapshot.

The open question has the same shape as ADR 0001's: **when**, and **how hard**, is the body
required — given the no-interpretation ceiling (ADR 0004: the CLI judges declared structure,
never meaning)?

Four options were weighed:

1. **Skill-only** (reword axiom 9 / the skeleton; no CLI change) — **rejected**: the Skill
   *already* states axiom 9, and the agent ignored it for the body. An unenforced wish is
   exactly the v1 ceiling CONTEXT.md concedes; here it demonstrably failed.
2. **Require the body at `add-claim`** (atomic, like the estimand `--def`) — **rejected** on two
   counts: it imposes author-time friction (against ADR 0001 soft authoring, "capture NOW — a
   bare draft beats a perfect claim never written"); and it is *impossible* for one movement —
   "explain each contradiction" cannot be written at first `add-claim`, because the
   `contradicts` edge is frequently wired later, after the sibling claim exists.
3. **Gate the body at the canonical boundary** (validate / publish), presence-only — **chosen**.
   Same draft→canonical boundary as the reach-ground (ADR 0001) and estimand-required (ADR 0005)
   gates: a draft may carry the unfilled skeleton; a claim may not become canonical with it.
4. **CLI auto-generates the body** from the structured fields — **rejected** by ADR 0004:
   writing "why the contradiction matters" would be the CLI fabricating judgment. (Only the
   deflation movement is auto-filled — and only because it is a *verbatim copy* of the
   agent-supplied `deflation_route` field, not interpretation.)

## Decision

Add a promotion gate `body-movements` (闸). A **candidate-canonical** claim must carry a body
whose required narrative movements are **present** — i.e. none of the CLI's own placeholder cue
strings remain. The check is pure literal-string comparison against the cue constants the
skeleton itself emits. The body is already carried in-memory by `readAllClaims`
(`{frontmatter, body, path}`), so this gate lives in the **filesystem-free `gate.ts`** — no
store access (cleaner than the referential-integrity gate, which must touch the store).

The three movements and the exact condition on each:

- **Conclusion, with its conditions** — **always required.** Every claim has a conclusion; the
  `<state the claim and the fork(s)…>` cue must be gone.
- **The contradiction and the caveat** — required **only if** the claim declares ≥1 `contradicts`
  or `inherits_caveat` edge. With such an edge, the `<for each contradicts…>` cue must be gone;
  with none, the skeleton's `<none declared>` is a *legitimately complete* "nothing to explain"
  state and passes. The conditionality is itself pure structure — count the frontmatter edges,
  never read meaning.
- **What would change it** — the deflation route; the `<the deflation route…>` cue must be gone,
  i.e. `deflation_route` is set (axiom 5). This movement is auto-filled verbatim from that field.

Drafts are unaffected (ADR 0001 soft authoring): a draft may carry the unfilled skeleton. The
requirement binds *only* at the draft→canonical boundary, alongside reach-ground (0001) and
estimand-required (0005). The placeholder cue strings are **shared constants** referenced by
both the skeleton writer and the gate, so the two can never drift.

## Ceiling

**Presence ≠ quality.** The gate proves the agent replaced the blanks; it cannot prove the prose
actually states the conclusion, or actually explains the contradiction. An agent can satisfy it
by typing anything — including pasting the `text` handle back into the body (the "don't restate
the handle" half of axiom 9). That is a quality judgment the CLI must refuse to make; it belongs
to the writer-distrust / independent-review axis (ADR 0006) — the same permanent hole ADR
0004/0005 already concede (the CLI enforces consistency *with* what was declared, never *truth*
of it). A cheap mechanical partial-mitigation — refuse a body that *verbatim contains* the `text`
field (Whitebook III.1: "handle and body must not duplicate verbatim") — is deferred to future
work to keep v1 minimal.

## Consequences

- The body — the only per-claim narrative that survives into a published snapshot — can no
  longer be empty in canonical / published state. axiom 9's "don't let the prose drop what the
  handle keeps" gains a **structural floor** instead of being a wish washed out by summarization.
- The gate is **pure mechanism** (literal-string presence + edge count), faithful to ADR 0004;
  no prose-quality judgment enters the CLI.
- **Backward-incompatible** for existing *live* stores whose canonical claims have empty bodies:
  re-running `validate` / `publish` now fails them. This is **intentional** — they genuinely
  never filled the body. Already-frozen snapshots are immutable and never re-validated, so they
  are unaffected. Migration: fill the bodies before the next publish (or re-publish).
- New surface: a `body-movements` GateId + violation; the shared placeholder-cue constants; and a
  Skill / Whitebook note that the body is a **publish-gated deliverable, not optional** (mirroring
  how estimand/confound bodies are already required at authoring).

## Alternatives considered

- **Skill-only** — rejected: unenforced wish; already failed in practice (the motivating run).
- **Atomic (require at `add-claim`)** — rejected: author-time friction (ADR 0001) and *impossible*
  for the contradiction movement (the edge is wired later). Reversible: tightening toward atomic
  later is a strictly stronger rule and needs no data migration.
- **CLI auto-generates the body** — rejected: ADR 0004 forbids the CLI fabricating judgment; only
  the agent-supplied `deflation_route` is echoed.
- **Verbatim-restate ban as a v1 check** — deferred to future work to keep v1 minimal; recorded
  here as the next mechanical tightening of the presence floor.
