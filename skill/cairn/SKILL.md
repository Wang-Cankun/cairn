---
name: cairn
description: >-
  Record analysis conclusions as grounded, gated claims while you work. Use this
  skill continuously during any data-analysis, pipeline, or research session —
  not as a final step. ORIENT at session start (`cairn head`) to read what is
  already concluded, contested, or stale before acting. AUTHOR the instant you
  conclude anything — a result, a finding, an "X is higher than Y", a decision —
  with one cheap `cairn add-claim`; capture it NOW, never batch to end-of-session
  (forgetting is the failure mode). REFRESH (`cairn refresh`) after any rerun:
  `tar_make()`, a re-executed pipeline, regenerated outputs, a new model fit —
  then surface newly-stale claims. PUBLISH (`cairn validate` then `cairn
  publish`) before sharing findings, sending a link, or handing results off.
  Triggers: "what do we know so far", "where are we", recording a finding, after
  rerunning anything, before sharing results, claim graph, grounding evidence,
  contradiction, estimand.
---

# Cairn — the agent authoring protocol

Cairn is a local store of **claims** (analysis conclusions grounded in evidence),
plus **estimands** (the quantity each claim targets) and **confounds** (unerasable
caveats). The CLI is a **deterministic substrate**: it hashes, counts edges, checks
graph reachability, and locks enums. It does **no interpretation**. *You* do all the
judgment. The CLI enforces consistency with what you declared — never the truth of the
declaration. It cannot catch you mis-declaring; the axioms below are how you don't.

The CLI is the sole write path — **never hand-edit store files, never set a computed
field** (freshness, verification, corroboration, reach_ground, resolution are all
CLI-locked; an agent-supplied value is discarded and recomputed). Run `cairn` from
inside the host project (it walks up to find the store).

## The axioms you carry (the tool will not enforce these)

1. **Express, don't resolve.** Capture the multiverse as durable claims. Never
   collapse it into one trustworthy verdict. The tool does not count agreeing paths,
   average effects, or score robustness — and neither do you. A "convergence" answer
   is the use that fails.
2. **Declare the estimand.** Before concluding, state which quantity/question the
   claim targets and cite an `estimand` id — mint a new one or reuse an existing one.
   **That reuse decision is your judgment**: two claims are siblings (alternative
   specs of one question) only if they cite the **same** estimand id. The CLI compares
   ids by string-equality only; it never reads the definition. Same question → reuse;
   different question → mint.
3. **Read possibilistically, not probabilistically.** Reason over the *set* of outcomes
   that survive under justified specifications. Do not tally how many paths agree.
4. **Default a contested fork to unresolved.** When a `contradicts` edge exists, leave
   `resolution: open`. A contested claim may stay **canonical** but is **never settled**
   until the contradiction is genuinely resolved. Settling is a gated, deliberate act —
   not a default, not a tidy-up. This is the block on "closed-negative" recurrence.
5. **Point to a deflation route.** On residual uncertainty, record `--deflation-route`:
   what would shrink it (clarify the estimand / more validation / redo the experiment).
   Point at the exit; you don't have to walk it.
6. **Distrust your own assertion.** Your claims are `provenance: ai_proposed`. You can
   **never** set `verified` — it is territory-locked to `experimental`/`human_reviewed`
   (a literature citation does not count). Seek independent review by a **different**
   asserter instead.
7. **E/N/U is a lens, not a field.** Equivalence-typing (and any successor framework) is
   reasoning you write into the **body narrative** — never an enforced enum. Don't
   expect or fabricate one.
8. **Persist both sides.** Neither a positive nor its contradicting sibling may be
   dropped. Corrections create versions, never silent overwrites. Don't re-derive from
   scratch — inherit the stored "contested, unresolved".
9. **Body discipline.** The body must say, in prose: the conclusion with its conditions;
   each contradiction and inherited caveat and why it matters; what would change it.
   Don't duplicate frontmatter verbatim — the prose must not launder what the handle records.

## The four touchpoints

### 1. ORIENT — at session start

```
cairn head
```
Emits the orient surface: canonical claims with live-recomputed freshness, and
**surfaced** unresolved contradictions and staleness (they are not buried under the
positives — read them first). Then:
```
cairn drafts     # ungrounded / loose threads to resolve, not silently rotting
cairn status     # counts: draft/canonical, stale/unknown, open contradictions, backlog
```
Read these before acting so you don't re-derive, contradict, or re-close a known
contested conclusion.

### 2. AUTHOR — the moment you conclude anything (LOW FRICTION, capture NOW)

First, name the estimand. Reuse an id from `cairn head`, or mint one:
```
cairn add-estimand --label "<short scan label>" --def "<which effect, which population, conditional on what>"
# prints est-<hash> — cite it below
```
Then write the claim (a **draft** — soft, cheap, in-flow):
```
cairn add-claim --text "<one-sentence conclusion with its conditions>" \
  --estimand est-<hash> \
  --evidence <kind>:<ref> \
  --provenance ai_proposed \
  --depends-on-fork <axis=choice> \
  --contradicts <clm-id> \
  --inherits-caveat <cfd-id> \
  --deflation-route "<what would shrink the residual uncertainty>"
```
- `--evidence`, `--depends-on-fork`, `--contradicts`, `--inherits-caveat` are repeatable.
- Evidence kind ∈ `file:<path>` | `external:<uri>` | `dvc:<path.dvc>`. The CLI stamps the
  fingerprint and its tier; you never type a hash. `external:` is unreachable-by-default →
  `unknown` freshness (a false `fresh` is the enemy). A claim may be created bare and grounded
  a moment later — but every chain must terminate at real evidence, and a `depends-on-fork` /
  `--contradicts` edge does **not** count as grounding.
- `--provenance` is yours: it is `ai_proposed`. Do not reach for `verified` — you cannot set it.
- **Do not defer authoring to end-of-session.** A bare draft now beats a perfect claim never
  written. Drafts never leak to collaborators (canonical only), so capture early at no cost.

Caveats that must not be erased get their own node, referenced (never copied) into claims:
```
cairn add-confound --label "<short label>" --caveat "<the design confound in prose, e.g. depth ≡ group ≡ library>"
# prints cfd-<hash> — cite via --inherits-caveat on every affected claim
```

Seek independent review (a **different** asserter — a self-review never counts):
```
cairn review <clm-id> --by <asserter-id> --note "<independence narrative>"
```
Two distinct reviewers (each different from the author) lift the claim to
`corroboration: cross-reviewed` — **still canonical, never verified**. The CLI counts ids; it
does not judge whether the reviewers truly share no blind spot. The `--note` is carried, not
verified.

### 3. REFRESH — after any rerun

```
cairn refresh
```
Run after `tar_make()`, a re-executed pipeline, regenerated outputs, a re-fit model —
anything that may have changed an artifact a claim points at. It re-fingerprints reachable
artifacts and cascades staleness through dependency edges; `dvc:` refs re-read the `.dvc`
md5; unreachable remote → `unknown`. **Then surface newly-stale claims to the user by name**
("clm-… is now stale: its grounding artifact changed") so they can re-verify or re-author.

### 4. PUBLISH — before sharing

```
cairn validate    # runs every gate; nonzero exit blocks publish
cairn publish     # freezes an immutable, content-addressed canonical-only snapshot + appends to log.md
```
`validate` runs the gates over the candidate-canonical set: reach-ground (every canonical
claim must reach real evidence; cycles never do), verification territory-lock, corroboration
derive, resolution-vs-contradiction, trust-field lock, and collapse-refusal where sibling
grouping happens. On failure it names the gate and the offending claim — **fix it, don't
force it**. `publish` then freezes the snapshot, advances the head, and runs a warn-only
`reconcile`.

**Relay the reconcile output honestly — do not silently drop it:**
- ungrounded drafts left behind (these did NOT get published);
- conclusions in the shared findings/paper carrying no claim id.

These are warnings, not errors; surfacing "what didn't make it" is the point. To settle a
contested claim, the contradiction must be genuinely resolved first (a `settled` write is
refused while any `contradicts` edge stands) — settling is deliberate, never a cleanup pass.

## What NOT to do
- Never hand-edit files in the store — the CLI is the sole writer.
- Never write or guess freshness, verification, corroboration, reach_ground, or resolution —
  all are CLI-computed and a supplied value is discarded.
- Never reach for `verification: verified` — it is territory-locked; your provenance can't reach it.
- Never copy an evidence artifact into the store — reference path+ref only; let the CLI fingerprint.
- Never collapse, average, or score siblings; never merge claims across differing estimand ids.
- Never drop a contradicting claim or re-derive a contested result as freshly "closed".

## Worked examples

**A. a claim on a fresh estimand**
```
cairn add-estimand --label "drug effect on marker, cohort A" \
  --def "Average effect of treatment on marker expression in cohort A, conditional on the log1pPF normalization."
# → est-9f2a
cairn add-claim --text "Treatment raises marker expression ~2.3x vs control (cohort A, log1pPF)." \
  --estimand est-9f2a --evidence file:outputs/step07_scores.csv \
  --provenance ai_proposed --depends-on-fork normalization=log1pPF \
  --deflation-route "more-validation: replicate in cohort B before generalizing."
```

**B. a contested sibling on the SAME estimand (the contradiction stays open)**
```
cairn add-claim --text "Under quantile normalization the treatment effect is null (cohort A)." \
  --estimand est-9f2a --evidence file:outputs/step07_quantile.csv \
  --provenance ai_proposed --depends-on-fork normalization=quantile \
  --contradicts clm-<the-2.3x-claim>
```
Both stay canonical; neither becomes `settled`; `cairn head` surfaces the contradiction.

**C. an unerasable caveat inherited by reference**
```
cairn add-confound --label "depth≡group≡library" \
  --caveat "Sequencing depth is perfectly confounded with treatment group and library prep; effect and batch are inseparable by design."
# → cfd-1c4d
cairn add-claim --text "Cluster 3 is depleted post-treatment." \
  --estimand est-<...> --evidence dvc:data/counts.csv.dvc \
  --provenance ai_proposed --inherits-caveat cfd-1c4d \
  --deflation-route "redo-experiment: depth-matched design to break the confound."
```
