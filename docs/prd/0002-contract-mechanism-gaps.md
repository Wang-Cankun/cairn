# PRD 0002 — Cairn v2.1: closing four contract↔mechanism gaps

Status: ready-for-agent · 2026-06-18
Respects: ADR 0001 (soft authoring), 0004 (no interpretation), 0005 (estimand handle),
0006 (verification territory-lock, corroboration).
Amends: ADR 0006 (territory set), ADR 0005 (estimand required at the canonical boundary),
ADR 0001 (draft visibility wording; reach-ground is direct-per-claim, not transitive).
Supersedes the corresponding lines of PRD 0001 (stories 16, 21; implementation "verification
territory-lock" and the `provenance` enum).

## Problem Statement

Four places in the shipped v2 substrate disagree with their own stated contract. In each, a document
(whitepaper, ADR, or a pinned type comment) promises a guarantee that the enforcing mechanism does not
deliver. A substrate whose whole reason to exist is *anti-laundering* cannot itself launder its own
promises — a reader (human or fresh agent) who trusts the prose gets a weaker invariant than they were
told. The four:

1. **`verified` can be self-stamped through `human_reviewed`.** Whitepaper I.3 uses "the coauthors
   accepted it" as the canonical example of *canonical-but-not-verified*. Yet `provenance:
   human_reviewed` is in the set that may reach `verification: verified` (`types.ts:171` complement,
   `gate.ts:228`), and the type comment classes it as "TERRITORY (independent wet-lab/cohort)
   confirmation" (`types.ts:160`). A human reviewing the same computational analysis is *consensus*,
   not *territory*. So the gate lets the exact act I.3 calls canonical light the verified lamp — the
   laundering the system exists to block. Root cause: `human_reviewed` is not a *provenance* (where the
   claim came from) at all; it is a *review status* (who checked it), and `reviewed_by` already records
   that. A review-status value is living in an origin enum, and it leaks onto the territory axis.

2. **Drafts are documented as invisible but are queryable — the spec contradicts itself.** ADR 0001's
   Decision says drafts "are never read by a Collaborator or a Fresh session"; its own Consequences say
   "the CLI must expose drafts to the Agent (`cairn drafts` / `cairn status`)." The whitepaper repeats
   the strong claim ("draft 永不被…新 session 看到"). The code sides with Consequences: `drafts` and
   `status` verbs list drafts (`cli.ts:494`, `cli.ts:506`). The real invariant is not *invisibility*;
   it is *no authority*: drafts are excluded from the canonical orient surface, the snapshot bundle, and
   the published head — but they are visible working memory an agent may query. The prose overstates and
   should be corrected to the visibility/authority split.

3. **`canonical` can lack an `estimand`, against the type contract and the methodology.** `types.ts:238`
   pins estimand as "required to pass the gate to canonical." No gate enforces it: `runGate`
   (`gate.ts:389`) runs reach-ground, verification-lock, corroboration, resolution, trust-field-lock —
   none checks estimand presence; `candidateSet` promotes any grounded draft (`gate.ts:52`,
   `claimfile.ts:442`); `publish` promotes the gate's candidates with no estimand check (`publish.ts`).
   The collapse-refusal gate that *does* read estimand (`gate.ts:134`) is not in `runGate` — it only
   guards sibling grouping. So a grounded, estimand-less draft is promoted to canonical, violating both
   the comment and Cairn's first methodological step ("declare what you are estimating").

4. **The whitepaper promises recursive claim→claim reach-ground; the code has no such edge.** III.3
   gate 1, IV.2, V.1, and V.3 all describe reach-ground as "following dependency edges (claim → claim)
   upward" until they terminate at ground — a transitive walk with cycle detection. The v2 schema has
   no `depends_on_claim` field, and `gate.ts:78-80` states it outright: "NO claim→claim dependency edge
   … a claim grounds directly through its own evidence or not at all." The code reaches the same *goal*
   (no claim rests only on other claims — circular reasoning is unrepresentable by construction) by a
   simpler mechanism than the prose describes. The doc over-promises a mechanism that was deliberately
   not built.

## Solution

Make each mechanism match its contract — preferring the change that is small, default-safe, and keeps
Cairn's "express, don't resolve / consistency, not truth" temperament. Two findings are code (1, 3),
one is mostly documentation with an optional ergonomic verb (2), one is documentation only (4).

1. **Remove `human_reviewed` from `Provenance` entirely** (grep confirms zero claim files use it —
   deletion needs no data migration) and **re-cast Gate A as a territory allowlist, not an
   agent-sourced denylist.** Only `experimental` is territory; only territory may reach `verified` —
   *and* `contradicted` (the symmetric "territory has spoken against it" value). Human/agent review
   stays where it belongs: `reviewed_by` → derived `corroboration`. A future, *separate* attestation
   axis may structure "a human is on record" if it proves it must survive summarization — but it is
   never folded back into `provenance` or `verification`.

2. **Restate the draft invariant as visibility-without-authority** in ADR 0001 and the whitepaper:
   drafts are queryable (`drafts`/`status`) but carry no authority — excluded from `index.md` orient,
   snapshot bundles, and the published head. Optionally add `head --include-drafts` (a.k.a. agent-head)
   that includes drafts behind a loud, unmissable `DRAFT — no authority` badge, for agent-swarm orient.

3. **Add an estimand-presence gate at the draft→canonical boundary** and run it inside `runGate`. A
   draft may omit estimand (soft authoring is unchanged); a claim cannot become or stay `canonical`
   without one. This matches the pinned comment and ADR 0005's intent.

4. **Correct the reach-ground prose** (whitepaper III.3/IV.2/V.1/V.3, ADR 0001 Context) to describe
   direct per-claim grounding, and state that circular reasoning is prevented *by construction* (no
   claim→claim edge exists to express it) rather than by a transitive walk. No code change. A
   `depends_on_claim` graph with recursive reach-ground and stale cascade is explicitly deferred.

## User Stories

1. As an analysis owner, I want an agent to be structurally unable to reach `verified` through a human
   *review* of the analysis, so that consensus (a coauthor accepting a result) can never masquerade as
   territory confirmation — only an independent wet-lab/cohort (`provenance: experimental`) lights the
   lamp. *(Tightens PRD 0001 story 21.)*
2. As an analysis owner, I want `verified` gated by a territory *allowlist* (`experimental`), so that
   any future provenance value is default-locked-out of `verified` unless explicitly admitted as
   territory, rather than silently admitted by a denylist that forgot to list it.
3. As an analysis owner, I want `contradicted` territory-locked the same way as `verified`, so that
   "the territory contradicted this" cannot be self-stamped either; an agent-found contradiction lives
   on the `contradicts` edge + resolution axis, not on the verification axis.
4. As an agent recording a human's sign-off on an analysis, I want it captured as a `reviewed_by`
   edge that raises `corroboration`, not as a provenance that raises `verification`, so that human
   endorsement strengthens *canonical* standing without ever touching the territory axis.
5. As a fresh agent at session start, I want drafts to be queryable (`drafts`/`status`) while carrying
   no authority (absent from orient, snapshot, and head), so that drafts are shared working memory I
   can build on, never a current conclusion I mistake for canonical.
6. As an analysis owner, I want the spec and whitepaper to state the draft rule as
   visibility-without-authority (not invisibility), so that the documented invariant matches the
   `drafts` verb that already exists.
7. *(Optional)* As an agent orienting a swarm, I want `head --include-drafts` that surfaces drafts
   behind a loud `DRAFT — no authority` badge, so that I can see in-flight threads in one orient pass
   without ever reading a draft as canonical.
8. As an analysis owner, I want a claim to be refused promotion to `canonical` unless it declares an
   `estimand`, so that "which question am I answering" is mandatory on every conclusion a reader sees —
   matching the pinned contract and the methodology. *(Tightens PRD 0001 stories 2, 16.)*
9. As an agent mid-flow, I want a `draft` to still be creatable without an estimand, so that soft
   authoring is unchanged and the estimand requirement bites only at the canonical boundary.
10. As a reader of the whitepaper/ADRs, I want reach-ground described as direct per-claim grounding
    (with circular reasoning impossible by construction), so that the documented mechanism matches the
    code and does not promise a claim→claim dependency graph that was deliberately not built.

## Implementation Decisions

**Finding 1 — verification territory-lock (amends ADR 0006; code)**
- `types.ts`: `Provenance` becomes `"ai_proposed" | "literature" | "experimental"`. Delete
  `human_reviewed` from the type and from `PROVENANCES`.
- Replace the `AGENT_SOURCED_PROVENANCE` denylist with a `TERRITORY_PROVENANCE` allowlist:
  `export const TERRITORY_PROVENANCE: readonly Provenance[] = ["experimental"] as const;`
  Update the doc comment to "the complement of TERRITORY cannot reach `verified`/`contradicted`."
- `gate.ts`: replace `isAgentSourced` with `isTerritory(fm) = TERRITORY_PROVENANCE.includes(...)`.
  `verificationLockViolations` flags a claim whose `verification ∈ {verified, contradicted}` while
  `!isTerritory`. `lockedVerification`: if `verification ∈ {verified, contradicted}` and `!isTerritory`,
  force to `unverified`; `unverified`/`unverifiable` pass through (agent-settable). Update messages.
- `cli.ts:151`: update the `--provenance` error text to drop `human_reviewed`.
- `migrate` verb: **no change needed** — v2 `migrate` is skeleton-only (it stands up the OKF bundle and
  reports v1 claim counts; it does NOT port v1 field values), so it never emits a `provenance`. There is
  no legacy `human_reviewed` to map. (Confirmed during implementation; supersedes the earlier plan to
  add a mapping here.)
- Carry, but do **not** build: a future `attestation` axis (`self` / `human-attested`) if "a human is
  on record" must survive as structure. It must be its own axis (the ADR 0006 reasoning for why
  corroboration is separate from verification applies verbatim) — never a provenance value, never a
  rung on verification.

**Finding 2 — draft visibility (amends ADR 0001 wording; docs + optional verb)**
- ADR 0001: amend the Decision so the invariant is *no authority*, not *invisibility* — drafts are
  excluded from the orient surface, snapshot bundle, and published head, **and** are queryable via
  `drafts`/`status`. Resolves the Decision-vs-Consequences contradiction inside the ADR itself.
- Whitepaper: rewrite the "draft 永不被…新 session 看到" phrasings (III.3 gate 1 area, V) to the
  visibility/authority split.
- *(Optional, behind story 7)* `head --include-drafts`: emit drafts in a clearly separated section with
  a `DRAFT — no authority` badge; never in the snapshot/head. No change to what `publish` freezes.

**Finding 3 — estimand at the canonical boundary (amends ADR 0005; code)**
- `gate.ts`: add `estimandPresenceViolations(candidates)` — one violation per candidate whose
  `frontmatter.estimand === undefined` (gate id `estimand-required`, new `GateId`). Add to the pinned
  gate order in `runGate` (after reach-ground, before verification-lock). Pure presence check — it does
  not read the estimand body (ADR 0005 ceiling preserved).
- `types.ts`: add `"estimand-required"` to `GateId`; update the `estimand?` comment to point at the
  enforcing gate.
- Soft authoring unchanged: `add-claim` still accepts a draft with no `--estimand`; only the promotion
  candidate set is gated.

**Finding 4 — reach-ground prose (amends ADR 0001 Context; docs only)**
- Whitepaper III.3 gate 1, IV.2, V.1 (`reach_ground` row), V.3 gate 1: replace the
  "follow claim→claim dependency edges upward" descriptions with "each claim grounds directly through
  ≥1 of its own evidence refs; a claim resting only on other claims is unrepresentable, so circular
  reasoning is impossible by construction."
- ADR 0001 Context: add a note that v2 implements the iron rule as a direct per-claim grounding check,
  not the transitive walk the original Context described; `depends_on_claim` + recursive reach-ground +
  stale cascade are deferred (see Out of Scope).

## Testing Decisions

- **Same seam as PRD 0001:** the CLI driving a temp store, asserting on emitted OKF frontmatter and
  exit codes; never reach into internals.
- **Finding 1:** `add-claim --provenance human_reviewed` is rejected as an invalid enum (exit ≠ 0). A
  claim with `provenance: experimental` may reach `verified`; `ai_proposed` and `literature` are
  refused `verified`. A claim with non-territory provenance and `verification: contradicted` is locked
  back to `unverified`. A human sign-off recorded via `review --by <human>` raises `corroboration` to
  `cross-reviewed` (with a second distinct reviewer) while `verification` stays `unverified`.
- **Finding 2:** after authoring a draft, `drafts`/`status` list it (visibility), while `head`/the
  published snapshot bundle/`head.json` exclude it (no authority). If `--include-drafts` is built, it
  emits the draft only under the badged, non-authoritative section.
- **Finding 3:** a grounded draft with **no** `estimand` fails `validate`/promotion (exit ≠ 0, gate
  `estimand-required`) and is *not* promoted by `publish`; adding `--estimand` then lets it promote.
  Regression: a grounded draft *with* an estimand still promotes as before.
- **Finding 4:** documentation only — no test; the existing reach-ground tests already assert the
  direct per-claim behavior the prose is being corrected to match.
- **Acceptance (`acceptance.sh`):** extend the author→validate→publish loop to assert (a) `verified`
  refused for `ai_proposed`/`experimental`-accepted, and (b) an estimand-less grounded draft blocked
  from canonical.

## Out of Scope

- **A structured human-attestation axis.** Recording "a human is on record" as undroppable structure
  (vs. narrative on a review edge) is deferred. `corroboration` currently flattens human and agent
  reviewers into a distinct-id count — stated honestly here, not fixed here. If built later it is a
  *separate* axis, never a provenance value or a verification rung.
- **`provenance` = pure evidence-kind refactor.** `ai_proposed` still conflates *authorship* with
  *evidence kind* (the milder form of finding 1's category error; authorship is really `asserter`'s
  job). A full split to `{analysis, literature, experimental}` is a larger change; this PRD removes only
  the dangerous leak (`human_reviewed` → territory).
- **`depends_on_claim` / recursive reach-ground / stale cascade across claims.** Deliberately not
  built; finding 4 aligns the docs to the simpler direct-grounded mechanism rather than building the
  graph. Revisit only if hierarchical (claim-derived-from-claim) conclusions become a real need.
- **Convergence / robustness verdict / counted-path summaries** (PRD 0001, ADR 0004) — unchanged.

## Further Notes

- **Theme:** every fix closes a gap where the *contract* (whitepaper, ADR, or pinned comment) promised
  more than the *mechanism* delivered. Three of four resolve by making the mechanism match the
  contract; finding 4 resolves the other way (correct the contract to the deliberately simpler
  mechanism). Both directions are legitimate; the invariant is that prose and code must stop disagreeing.
- **Permanent ceiling, restated:** none of this buys *truth*. Gate A still gates declared provenance,
  not real territory — an agent can still write `provenance: experimental` falsely. The territory-lock
  narrows *who can self-stamp the badge*; it never confirms the territory actually spoke (ADR 0006
  ceiling). `canonical ≠ verified` is the invariant being protected, not escaped.
- **Open tails to pin during implementation:** whether `--include-drafts` ships in this pass or waits
  for demonstrated swarm need; whether the estimand-required gate message should also hint at
  `add-estimand`. (Resolved during implementation: `migrate` needs no legacy-`human_reviewed` handling —
  it is skeleton-only and never ports field values.)
