# PRD 0001 — Cairn v2: the deterministic anti-laundering substrate over OKF

Status: ready-for-agent · 2026-06-18
Respects: ADR 0001 (soft authoring, + resolution axis), 0002 (freshness by fingerprint, + DVC tier),
0003 (text-in-git truth, reframed onto OKF), 0004 (no interpretation), 0005 (estimand handle),
0006 (verification territory-lock, corroboration).

## Problem Statement

I run analyses — increasingly through fleets of AI agents that explore many forking paths (different
normalizations, annotations, models) over heterogeneous, partly-remote compute (local + OSC/HPC).
When the dust settles I cannot tell, three months later, which artifact produced which conclusion,
which fork a conclusion is conditional on, whether it was ever contradicted, whether it still holds,
or whether anyone independent ever checked it. Worse, every layer — a summary, a fresh agent's
re-derivation, a published figure — silently *launders*: it drops the conditions, contradictions, and
unverified-ness that made a conclusion honest and presents a clean result. A real failure already
happened: an erroneous "NK only in CN-Female, CLOSED NEGATIVE" hardened in the findings because a
contradicting annotation fork was forgotten. At agent scale, this becomes "comprehensive tests of
whether results align with questionable heuristics at scale."

Cairn v1 was built as a claim-graph projection, but it invented its own storage format and viewer,
leaned on a soft skill the agent can ignore, and (in later design) drifted toward a convergence engine
that would *resolve* multiverse uncertainty into a trustworthy verdict — which the multiverse's own
authors say is the use that fails.

## Solution

Rebuild Cairn as a thin, **deterministic, who-agnostic substrate** that **durably captures** an
agent's judgment as portable **OKF** documents and **enforces consistency** on it — and that does **no
interpretation** itself. All judgment (is this the same estimand? is this fork arbitrary? what would
deflate this?) lives in the Agent, with the operating axioms baked into the Skill. The tool's entire
job is to make honest, scarred conclusions survive scale and time: it fingerprints evidence, validates
graph structure, gates against laundering, and stores — it never counts paths, averages, scores, or
emits a verdict.

Concretely: a claim is an OKF concept file (frontmatter *handle* + body *narrative*). The estimand it
targets is a first-class OKF node referenced by id. Trust is split across non-collapsing axes the CLI
either computes or gates deterministically — freshness (from fingerprints), reach-ground, resolution,
verification (territory-locked — an agent can never set `verified`), and a derived corroboration axis
(self-asserted vs cross-reviewed by a different asserter). Bytes/versioning ride on DVC; format and
viewer ride on OKF; Cairn adds only the resistance layer.

## User Stories

1. As an analysis owner, I want each conclusion stored as a claim carrying its evidence, so that a
   conclusion is never a bare fact divorced from what it stands on.
2. As an analysis owner, I want a claim to declare the estimand it targets, so that "which question
   am I even answering" is explicit and not a hidden fork.
3. As an analysis owner, I want estimands to be first-class nodes I reference by id, so that two
   claims are siblings only when they cite the same estimand.
4. As an agent, I want to declare which fork a claim is conditional on (e.g. `normalization=log1pPF`),
   so that a downstream reader knows the path it depends on.
5. As an agent, I want to declare that a claim contradicts another, so that an unresolved
   disagreement is recorded structurally, not buried in prose.
6. As an analysis owner, I want a claim with an unresolved contradiction to be blocked from
   `settled`, so that a contested conclusion can never harden into a closed/negative the way the NK
   "CLOSED NEGATIVE" did.
7. As an analysis owner, I want a claim to be able to inherit an unerasable confound by reference, so
   that a design confound (e.g. depth ≡ group ≡ library) propagates to every downstream claim that
   cites it instead of being copied and lost.
8. As an analysis owner, I want confounds to be first-class nodes with a single definition, so that
   the caveat has one source of truth and propagation is a graph edge, not a string copy.
9. As an agent, I want to record a deflation route on a residual uncertainty (what would shrink it —
   clarify the estimand, more validation, or redo the experiment), so that the claim points toward
   an exit instead of hoarding uncertainty.
10. As a fresh agent at session start, I want to read an orient surface (head / index) listing
    canonical claims with live freshness and unresolved contradictions, so that I land oriented
    without re-deriving and without re-making a forgotten error.
11. As a fresh agent, I want the orient surface to surface contradictions and staleness prominently,
    not bury them under canonical positives, so that the negatives are not silently dropped.
12. As an analysis owner, I want freshness derived from a fingerprint of the evidence artifact, not
    declared by the agent, so that a false `fresh` is impossible.
13. As an analysis owner, I want a claim that points at a DVC-tracked artifact to read the `.dvc`
    md5 as a top-tier fingerprint, so that the claim is pinned to restorable bytes and never reads
    `unknown` for tracked data.
14. As an analysis owner, I want freshness to read `unknown` honestly when a remote artifact is
    unreachable, so that I am never given false confidence.
15. As an analysis owner, I want staleness to cascade through dependency edges, so that when an
    upstream artifact changes, every conclusion resting on it is flagged.
16. As an analysis owner, I want every claim to satisfy the iron rule (reach the ground) before it
    becomes canonical, so that no conclusion rests only on other conclusions.
17. As an agent, I want the CLI to stamp who asserted (and last modified) each claim, so that
    authorship is recorded without me having to do it.
18. As an analysis owner, I want a modification by a different asserter to create a version rather
    than a silent overwrite, so that the original assertion and the correction both persist.
19. As an analysis owner, I want a review by a different asserter recorded as a structured fact, so
    that a claim's review history is durable and not washed out by summarization.
20. As an analysis owner, I want a derived corroboration axis (self-asserted vs cross-reviewed by
    ≥2 distinct asserters), so that "one agent said it" is visibly distinct from "a second named
    agent checked it" — while staying short of `verified`.
21. As an analysis owner, I want an agent to be structurally unable to set `verified`, so that only
    territory (wet-lab, independent cohort) can light the warning lamp and `canonical` can never
    masquerade as `verified`.
22. As an analysis owner, I want corroboration kept off the verification axis, so that a
    cross-reviewed claim is never read as "half-verified."
23. As an analysis owner, I want the CLI to refuse to collapse sibling claims whose declared
    estimands differ, so that results from different questions are never averaged into a fake
    robustness statement.
24. As an analysis owner, I want the tool to never count agreeing paths, average effects, or emit a
    robustness score, so that it cannot manufacture a guise of rigor.
25. As an analysis owner, I want any agent-supplied value for a computed trust field (freshness,
    lifecycle, verification, corroboration, reach-ground) to be overridden by the CLI, so that an
    agent cannot self-stamp its own trust badge.
26. As an agent, I want the operating axioms (express don't resolve; declare the estimand; read the
    multiverse possibilistically not probabilistically; default a contested fork to unresolved;
    point to a deflation route; distrust my own assertion) carried in the Skill, so that the
    judgment lives in me, not frozen into the tool.
27. As a collaborator, I want to open a published snapshot as a portable OKF bundle in a standard
    OKF viewer, so that I need install nothing and the bytes never leave the page.
28. As an analysis owner, I want each publish to freeze an immutable, content-addressed snapshot
    (canonical claims only), so that a reader can diff against the version they last saw.
29. As an analysis owner, I want the snapshot history written as an OKF `log.md`, so that the time
    spine is native to the format and not a Cairn invention.
30. As an analysis owner, I want the claim body governed by a discipline (conclusion stated with its
    conditions; the contradiction and caveat explained in prose; what would change it), so that the
    narrative a reader actually reads does not launder what the frontmatter records.
31. As an analysis owner, I want the frontmatter to hold only machine-actionable handles and the body
    to hold the reasoning, with no verbatim duplication, so that an agent can scan all frontmatter
    cheaply and drill into few bodies — keeping reasoning bounded at scale.
32. As an analysis owner, I want a warn-only reconcile that flags conclusions in shared findings that
    carry no claim id, so that lapses are made visible without pretending they were prevented.
33. As an analysis owner migrating from v1, I want my existing claim store carried into the OKF
    layout, so that prior work is not lost in the rebuild.
34. As an analysis owner, I want the self-invented format and the bundled React site retired in favor
    of OKF + its viewer, so that Cairn stops maintaining a format and a frontend it does not own.

## Implementation Decisions

**Substrate & boundaries**
- Cairn is a deterministic, who-agnostic CLI + an OKF store + a Skill. The CLI does no interpretation
  (ADR 0004); all judgment lives in the Agent via Skill axioms. A verdict is interpretation, so the
  CLI never produces one — the earlier convergence/robustness-scoring operator is removed.
- Storage format is **OKF** (markdown + YAML frontmatter, a directory of concept files). The v1
  self-invented format and the bundled React viewer are retired; published snapshots are OKF bundles
  rendered by a standard OKF visualizer (ADR 0003 reframed).
- Bytes, versioning, and restore ride on **DVC**; Cairn references DVC pointers and never versions
  bytes itself. SQLite remains a derived, rebuilt-on-demand index (ADR 0003).

**OKF concept node types**
- `claim` — frontmatter handle + body narrative.
- `estimand` — body is the definition (the Agent's natural language); id is its identity. Claims
  reference it by id; the CLI compares ids, never meanings (ADR 0005).
- `confound` — body is the unerasable caveat; carries an `unerasable` flag. Claims reference it by id
  (`inherits_caveat`), so propagation is a graph edge with one source of truth.

**Claim frontmatter — agent-asserted handles** (cheap; the Agent's own intent/knowledge): `text`,
`estimand` (id ref), `evidence_lines` (each a named line with artifact refs, refs may be
`file:` / `external:` / `dvc:`), `depends_on_fork` (axis=choice), `contradicts` (claim-id refs),
`inherits_caveat` (confound-id refs), `provenance` (`ai_proposed` / `human_reviewed` / `literature` /
`experimental`), `deflation_route` (narrative pointer), plus the markdown body.

**Claim frontmatter — CLI-computed/stamped (locked; agent values overridden, ADR 0004):** `id`,
`asserter` (who/model/session/time), `reviewed_by` (asserter-id set), `corroboration`
(`self-asserted` / `cross-reviewed`, derived from distinct asserter-id count), `fingerprints`,
`freshness` (`fresh`/`stale`/`unknown`, cascading), `reach_ground`, `lifecycle` (`draft`/`canonical`),
`resolution` (`open`/`settled`), `verification` (`unverified`/`verified`/`contradicted`/
`unverifiable`).

**Deterministic gates (mechanism only — no semantic judgment):**
- Reach-ground / iron rule at the draft→canonical boundary (ADR 0001).
- Collapse refusal: refuse to treat siblings as one multiverse when their declared estimand ids
  differ (ADR 0005).
- Resolution gate: refuse `settled` while any `contradicts` edge is unresolved (ADR 0001 extension —
  resolution is a new axis orthogonal to lifecycle; a contested claim may stay `canonical` but not
  `settled`).
- Verification territory-lock: refuse `verified` when `provenance` is agent-sourced; only
  `experimental` / `human_reviewed` can reach it (ADR 0006, Gate A).
- Corroboration: refuse `cross-reviewed` without ≥2 distinct asserter-id review edges (ADR 0006,
  Gate B). Corroboration is a separate axis, never a rung on verification.
- Trust-field lock: the CLI overrides any agent-supplied value for a computed field.

**CLI verbs (modify v1's set):** `head` emits the OKF `index.md` orient surface (canonical claims +
live freshness + surfaced unresolved contradictions/staleness). `add-claim` takes `--estimand`,
`--evidence kind:ref` (incl. `dvc:`), `--depends-on-fork`, `--contradicts`, `--inherits-caveat`,
`--provenance`, `--deflation-route`; the CLI stamps `asserter` and computes the locked fields.
New `add-estimand` and `add-confound` mint those node types. New `review <claim> --by <asserter>`
records a review edge (the asserter must differ from the claim's asserter for corroboration to rise).
`refresh`, `validate`, `publish`, `drafts`, `status`, `reconcile` carry over, updated to the new
schema and gates. `publish` freezes an immutable OKF snapshot bundle (canonical only) and appends to
`log.md`.

**Modules to modify** (existing seams preferred): `types` (new schema, node types, axes);
`claimfile` (read/write OKF concept files for claim/estimand/confound; frontmatter handle vs body
discipline); `fingerprint` (add `dvc:` source reading the `.dvc` md5 as top tier; ADR 0002);
`freshness` (cascade over `evidence_lines`, unchanged in spirit); `gate` (add the new gates above,
keep reach-ground); `cli` (verb signatures, asserter stamping, locked-field computation); `store`
(OKF-bundle layout: `claims/`, `estimands/`, `confounds/`, `index.md`, `log.md`, `snapshots/`);
`snapshot`/`publish` (emit OKF bundle + `log.md`; drop React site copy); `reconcile` (warn-only,
unchanged in spirit); `index` (derived SQLite over new schema). New: the **Skill** carrying the agent
axioms.

## Testing Decisions

- **One seam, the highest existing one: the CLI driving a temp store, asserting on emitted OKF files
  and exit codes.** A good test exercises external behavior only — run a verb, read the resulting
  frontmatter/body and the gate's exit code; never reach into internal functions. This matches v1's
  existing pattern.
- **Behaviors to cover at the seam:** authoring writes a well-formed OKF claim with the asserted
  handles and CLI-stamped locked fields; an agent-supplied `freshness`/`verification` is overridden;
  `validate` fails (nonzero) on a claim that cannot reach ground; `validate`/promotion refuses
  `settled` while a `contradicts` edge is unresolved; collapse is refused across differing estimand
  ids; `verified` is refused for an agent provenance and accepted for `experimental`; `corroboration`
  stays `self-asserted` until a review edge from a *different* asserter, then becomes `cross-reviewed`;
  freshness reads `fresh`/`stale`/`unknown` and cascades, and a `dvc:` evidence ref pins the `.dvc`
  md5; `head`/`index.md` surfaces unresolved contradictions and staleness rather than burying them;
  `publish` emits an immutable canonical-only OKF bundle + `log.md` diff.
- **The keystone acceptance test (the existence justification, ADR 0004/0005):** reproduce the NK
  CLOSED-NEGATIVE shape — a positive claim and a contradicting sibling on the same estimand — and
  assert that the persisted, gated store blocks the contested claim from `settled` and surfaces the
  contradiction on orient, i.e. it blocks the recurrence that pure re-derivation allows. If it does
  not, the substrate has not earned itself.
- **Prior art:** `cli.test.ts`, `gate.test.ts`, `snapshot.test.ts`, `fingerprint-remote.test.ts`,
  `freshness.test.ts`, and the end-to-end `acceptance.sh` (extend it to the new author→validate→
  refresh→publish loop with estimand/contradiction/review).

## Out of Scope

- **E/N/U as a field.** Specification-equivalence typing is an Agent reasoning lens captured as body
  narrative, never an enforced enum (ADR 0005).
- **Any convergence / robustness verdict / averaged or counted summary** computed by the tool
  (ADR 0004). Possibilistic interpretation is an Agent/Skill axiom; the CLI emits no summary.
- **Judging independence.** The CLI gates on distinct asserter id only; whether two asserters are
  genuinely decorrelated (different family, why independent) is narrative on the review edge that the
  CLI carries but does not verify (ADR 0006 ceiling).
- **LinkML / a formal schema language.** Non-formal frontmatter conventions suffice at single-owner
  scope; formalization is deferred.
- **Orchestration, scheduling, compute placement, cost/observability** of agent fleets — Cairn is the
  trust substrate the orchestrator writes into, not the orchestrator.
- **Hooks (Claude Code lifecycle enforcement).** v1's warn-only reconcile remains the ceiling; hard
  enforcement of authoring discipline is a later hardening.
- **The Skill's exact axiom wording** beyond the list above — drafted alongside, refined in use.

## Further Notes

- This is a **v1 → v2 migration, not greenfield.** The redesign supersedes v1's self-format, React
  site, and convergence drift; the modules above are modified in place. Expect an early issue to be
  "strip v1 to the new OKF skeleton."
- **Permanent ceiling (state it, don't hide it):** the CLI enforces *consistency with what was
  declared*, never *truth of the declaration*. An agent can still launder by mis-declaring (e.g.
  conflating two estimands under one id). Mitigations — default-conservative resolution, independent
  review, territory-locked verification — narrow but never close this. The Skill axioms and human
  review are where the rest lives.
- **Open tails to pin during implementation:** exact `resolution` state transitions; the
  `deflation_route` field shape (free narrative vs a small controlled vocabulary of exit kinds); the
  precise body-discipline checklist; whether `review` is a verb or an evidence kind.
