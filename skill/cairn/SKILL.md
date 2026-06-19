---
name: cairn
description: >-
  Keep analysis conclusions from being laundered — record each as a grounded,
  gated claim — in any project with a cairn/ store. Fire at session start (orient
  on what's concluded / contested / stale), the moment you conclude anything, after
  any rerun, and before sharing or handing off results. Triggers: "where are we /
  what do we know", recording a finding, after rerunning a pipeline, before sharing
  results, contradiction, estimand, claim graph.
---

# Cairn — don't launder the analysis

Your one job in a Cairn project: **don't launder.** A conclusion is *laundered* when
it loses its **scars** as it travels up the stack — the fork it was conditional on, the
result that contradicted it, that its data went stale, that nobody verified it — leaving
a clean-looking answer. Every axiom and touchpoint below serves one verb: keep
conclusions **scarred**.

The CLI is a **deterministic substrate**: it hashes, counts edges, checks reachability,
locks enums. It does **no interpretation** — *you* hold all the judgment. It enforces
consistency with **what you declared**, never the **truth** of the declaration, and it
cannot catch you mis-declaring. The axioms are how you don't.

The CLI is the sole writer: **never hand-edit the store, never set a computed field**
(`freshness`, `verification`, `corroboration`, `reach_ground`, `resolution` are CLI-locked;
a supplied value is discarded). Run `cairn` from inside the host project; it walks up to the
store. Full verb/flag detail and worked examples: [`REFERENCE.md`](REFERENCE.md).

## The axioms you carry (the tool enforces none of these)

1. **Express, don't resolve.** Capture the multiverse as claims; never collapse it into one
   trustworthy verdict. You don't count agreeing paths, average effects, or score robustness —
   a "convergence" answer is laundering.
2. **Declare the estimand.** State which quantity/question the claim targets and cite an
   `estimand` id. Two claims are siblings only if they cite the **same** id; the CLI compares
   ids by string, never the definition. Same question → reuse; different question → mint.
   Conflating two questions under one id is laundering.
3. **Possibilistic, not probabilistic.** Reason over the *set* of outcomes that survive under
   justified specifications. Never tally how many paths agree.
4. **A contested fork defaults to unresolved.** While a `contradicts` edge stands, `resolution`
   stays `open`. A contested claim may be **canonical** but is **never settled**. Settling is a
   deliberate, gated act — never a tidy-up. This is the block on closed-negative recurrence.
5. **Point to a deflation route.** On residual uncertainty, record what would shrink it (clarify
   the estimand / more validation / redo the experiment). Point at the exit; you needn't walk it.
6. **Distrust your own assertion.** Your claims are `provenance: ai_proposed`. You can **never**
   set `verified` or `contradicted` — both are territory-locked to `experimental` (a citation does
   not count, and a human *reviewing* your analysis is consensus, not territory). For human/peer
   sign-off, seek review by a **different** asserter — that feeds corroboration, never verification.
7. **E/N/U is a lens, not a field.** Equivalence-typing (and any successor framework) is reasoning
   you write into the body — never an enforced enum. Don't fabricate one.
8. **Persist both sides.** Neither a claim nor its contradicting sibling may be dropped;
   corrections make versions, never silent overwrites. Inherit the stored "contested, unresolved" —
   don't re-derive from scratch.
9. **The body must not launder the handle.** In prose: the conclusion with its conditions, each
   contradiction and inherited caveat and why it matters, and what would change it. Don't restate
   frontmatter; don't let the prose drop what the handle keeps.

## The four touchpoints

### 0. SCAFFOLD — first use, if there is no `cairn/` store yet
`cairn init` makes a project Cairn-ready: it stands up the store skeleton and writes a `config.json`
naming the shared findings to reconcile against (`--findings <glob>`, repeatable; `--remote-host <host>`
for remote fingerprinting). It is idempotent and **never** clobbers an existing config or any claim, so
running it on an already-initialized project is safe. Skip straight to ORIENT when a store already exists.
**Done when:** `cairn/` exists with a config listing the findings globs your conclusions will land in.

### 1. ORIENT — at session start
`cairn head`, then `cairn drafts` and `cairn status`. Read the **surfaced** contradictions and
staleness *first* — they are not buried under the positives.
**Done when:** you know what is settled, stale, and contested, and won't re-derive or re-close any
of it.

### 2. AUTHOR — the instant you conclude anything
Name the estimand (`cairn add-estimand …` → `est-…`, or reuse one from `cairn head`), then capture
a **draft** claim (`cairn add-claim --text … --estimand est-… --evidence <kind>:<ref> …`). A caveat
that can't be erased gets its own node (`cairn add-confound`) and is *referenced* (`--inherits-caveat`),
never copied. Seek a different-asserter `cairn review`. Capture **now** — a bare draft beats a perfect
claim never written, and drafts never leak (canonical only). Flags + examples: [`REFERENCE.md`](REFERENCE.md).
**Done when:** every conclusion you would put in a finding has a claim id citing its estimand, its
evidence, the fork it depends on, and any claim it contradicts.

### 3. REFRESH — after any rerun
`cairn refresh` after `tar_make()`, a re-run pipeline, regenerated outputs, or a re-fit model. It
re-fingerprints reachable artifacts and re-reads `dvc:` md5s, then re-locks each claim's freshness from
its own evidence refs — a claim grounds only through its own evidence, the v2 schema has **no
claim→claim dependency edge**, so there is no cascade to walk; an unreachable remote reads `unknown`.
**Done when:** you have named the newly-stale claims to the user so they can re-verify or re-author.

### 4. PUBLISH — before sharing
`cairn validate` (runs every gate; nonzero exit blocks publish) then `cairn publish` (freezes an
immutable, canonical-only snapshot and runs a warn-only `reconcile`). On a gate failure, **fix it,
don't force it**. Relay the reconcile honestly: ungrounded drafts left behind, and conclusions in the
shared findings carrying no claim id.
**Done when:** `validate` exits clean, the snapshot is frozen, and you have relayed what didn't make it.
