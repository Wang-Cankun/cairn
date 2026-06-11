# 09 — Decisions and Tradeoffs

This document is the consolidated decision record as narrative. The authoritative point records are
the three ADRs (`docs/adr/`) and the resolved decisions A–G in `docs/CONTRACTS.md`; this document
does not replace them, it connects them — telling, for each significant fork, what the alternatives
were, what was chosen, why, what was given up, and how reversible the choice is. Reversibility is
called out deliberately, because a v1 built to be honest about its ceilings should also be honest
about which of its decisions are load-bearing-forever and which are merely current.

Read the ADRs for the canonical reasoning; read this for how the decisions hang together and what
each one costs.

---

## The three ADRs

### ADR-0001 — Soft authoring via draft claims

**The fork.** *When* is the iron rule enforced relative to authoring? Either **atomic authoring**
(`add-claim` refuses to create a claim without an edge in the same call — the store is never even
transiently ungrounded) or **soft authoring** (a claim may be born bare as a draft and grounded
later).

**Chosen.** Soft authoring with a hard boundary. Drafts may be ungrounded; they live only in the
working area and never reach a reader; promotion to canonical is the hard, iron-rule gate.

**Why.** Atomic is the stronger invariant but adds friction to the agent's flow — it forces
recording edges at the instant of concluding, and forces recording a depended-on claim before the
claim that depends on it. That friction breeds avoidance, and avoidance (claims never written) is
the real failure mode (`07-the-agent-loop.md`). Soft authoring buys the low-friction capture that
keeps claims getting written, without weakening any reader's guarantee — softness is bounded
entirely before the gate.

**Given up.** A small loss of invariant strength: the store *can* transiently hold an ungrounded
claim (a draft), and drafts can accumulate ungrounded forever. Mitigated by making the count
visible (`cairn drafts`, `cairn status`, the publish-time reconcile) rather than enforced.

**Reversibility.** High. Tightening to atomic later is a strictly *stronger* rule and needs no data
migration — every already-grounded claim already satisfies it. This reversibility is part of why
soft-first was safe to choose now.

### ADR-0002 — Freshness from the evidence fingerprint, not the compute process

**The fork.** Compute freshness by hashing the **process** (consume a pipeline DAG, or wrap
execution and hash inputs/outputs) versus fingerprinting the **output artifact** the claim points
at.

**Chosen.** Fingerprint the artifact. Stamp a signature at authoring; recompute and compare at read
time; degrade to `unknown` when unreachable.

**Why.** The real environment — compute mostly through the agent, sometimes targets, often remote
HPC — breaks process-hashing: the DAG covers only a minority of work, wrapping cannot capture
remote/async jobs, and both fail *hard* when the special step is forgotten. Fingerprinting the
artifact depends only on the artifact's footprint, works across heterogeneous and remote compute,
and degrades gracefully to an honest `unknown` (`05-freshness.md`).

**Given up.** Remote re-checking needs the host reachable; when it is not, the answer is `unknown`
rather than a definite verdict. Self-reported remote fingerprints are a lower tier than a pipeline
content hash — accepted and made honest by always showing the tier.

**Reversibility.** Moderate. The fingerprint model is foundational, but the *tiers* are extensible
(a new method/tier could be added), and process-hashing could return as a *minor* local convenience
(a top-tier source where available) without becoming load-bearing. The artifact-fingerprint
backbone itself is not something you would want to reverse — it is what makes freshness survive the
environment.

### ADR-0003 — Files-in-git are the source of truth; artifacts referenced, never ingested

**The fork.** Source of truth = **SQLite itself**, or **plain-text claim files in git** with SQLite
as a derived index?

**Chosen.** Files-in-git are truth; SQLite is a derived, throwaway index; artifacts are referenced
by path + fingerprint, never ingested.

**Why.** The main argument for SQLite-as-truth was fear of large files in git — and that fear
dissolved on inspecting a real multi-GB project: the weight is entirely in artifacts, which are
already gitignored; tracked big files were zero (`04-architecture.md`). Files-in-git additionally
gives `git diff` review of claim changes for free and makes the snapshot future portable (files end
to end → Cloudflare Worker is a delivery change, not a rewrite).

**Given up.** Enforcement moves from unbypassable DB constraints to the CLI/gate layer —
marginally softer. Mitigated by sole-writer CLI + `validate` gate + git visibility (the relocated
hard floor, `04-architecture.md`).

**Reversibility.** Low for the *truth location* (reversing it would undo the git-diff and
portability wins and the whole snapshot model), high for the *index* (SQLite is already disposable
and could be swapped for any query engine without touching the truth).

---

## The build-time decisions (A–G)

These were pinned in `docs/CONTRACTS.md` as the parallel builders coded against them; several
resolve conflicts in older prose.

### A — Published = canonical only

**Fork.** Should `head.json`/snapshots include drafts (or at least a draft count), as a line in the
original build brief implied, or be canonical-only?

**Chosen.** Canonical only — not even a draft count. Drafts appear only in the local terminal
projection. **Given up:** a reader cannot see "work in progress" counts — but that is the point;
drafts are working-area noise and exposing them would leak unfounded conclusions toward readers and
contradict ADR-0001. This decision resolved the conflict in the brief in ADR-0001's favor.
**Reversible:** moderately — a future version could add an *opt-in* drafts view, but the default
canonical-only guarantee is foundational to the honesty model and should not be casually loosened.

### B — Stable `latest/` + immutable `snapshots/<id>/`

**Fork.** A single mutable share link (low friction, loses history) vs immutable-only snapshots
(honest, but a new URL every publish). **Chosen:** both — immutable history for honesty/lineage, a
stable `published/latest/` copy as the share-once link (`06-publish-and-snapshots.md`). **Given
up:** disk cost of copying the full bundle into `latest/` each publish (accepted; bundles are
small). **Reversible:** high — the mirror is pure convenience over the immutable snapshots.

### C — Freshness frozen at publish, shown honestly

**Fork.** Recompute freshness live on the collaborator's machine vs freeze it at publish.
**Chosen:** freeze at publish (`as_of = published_at`), label every badge "as of …", never
recompute. **Why:** the collaborator usually cannot reach the artifacts, and a live-recomputing
snapshot would be mutable. **Given up:** the published view is a point-in-time record, not a live
dashboard — correct for a shared immutable artifact. **Reversible:** the freezing is intrinsic to
immutability; the *labeling* is what keeps it honest and is non-negotiable.

### D — Host-root-relative evidence paths

**Fork.** Evidence paths relative to cwd vs to the host project root. **Chosen:** host-root-relative
(the directory containing `cairn/`), so re-fingerprinting is location-independent
(`04-architecture.md`). **Given up:** a tiny bit of convenience (you must think in project-root
terms) for a large correctness win (a claim grounded from a subdirectory re-checks from anywhere).
**Reversible:** low — paths are stored this way in claim files; changing it would be a migration.

### E — Reproducible, timestamp-excluding snapshot id (the correction)

This is the decision that *emerged from verification* rather than being specced cleanly up front,
and it is the most instructive (`06-publish-and-snapshots.md`). **Fork:** hash only the stored claim
data (excluding everything time-varying, which naively excludes freshness) vs hash the published
*view* (including computed freshness, excluding only wall-clock timestamps). **The collision:** the
first reading would let a claim that went stale after publish keep showing `fresh` on the share link
forever — a false `fresh` reaching a reader, the exact dishonesty the project exists to prevent.
**Chosen:** the id content-addresses the published view — canonical claims *including* computed
freshness `{state, tier}`, *excluding* all timestamps. So the same view is byte-reproducible AND a
freshness-only change yields a new immutable snapshot that carries the corrected badge to the
collaborator. **Given up:** the id is no longer a pure function of the *files* — it depends on the
*world state* at publish (whether artifacts changed). That is correct: it is the identity of the
*view*, and the view includes freshness. **Reversible:** low — reversing it reintroduces the bug;
it is locked in by an acceptance test (`tests/acceptance.sh` step 8, commit `151ebea`).

### F — Site built once, copied at publish

**Fork.** Build the site during publish vs build it once and copy a prebuilt bundle. **Chosen:**
build once; `publish` never runs a site build, it copies the prebuilt `site/dist` (`index.html` +
`assets/` + `fonts/`, not the dev `data/`) into each snapshot and writes the real `data/` alongside
(`src/publish.ts` `copySiteBundle`/`resolveSiteDist`). **Why:** publish should be fast,
deterministic, and not depend on a build toolchain being available at share time; it fails up front
with a clear message if `site/dist` is missing. **Given up:** an extra manual `bun run build:site`
step before publishing. **Reversible:** high — purely an integration detail.

### G — vinext → plain Vite + React

**Fork.** vinext (Cloudflare's Vite-based Next.js reimplementation) vs plain Vite + React, with the
contract explicitly allowing the fallback. **Chosen:** plain Vite + React, *and reported* per the
fallback clause. **Why (the honest framing):** vinext reimplements the Next.js *server* surface, and
the published snapshot is fully static with no server for that value to attach to; vinext's strength
is precisely the thing Cairn deliberately lacks (`08-frontend.md`). **Given up:** nothing real —
identical components, fewer moving parts. **Reversible:** high — the components are framework-light;
the no-backend static contract is the durable part, not the bundler.

---

## How the decisions cohere

These are not independent knobs; they reinforce each other. Files-in-git (ADR-0003) is what makes
the snapshot files-end-to-end, which makes the Worker future a delivery change (decision G's "no
server" framing) and gives the diff a `git`-visible backstop. Soft authoring (ADR-0001) is what
buys low-friction capture, which is the anti-forgetting mechanism the warn-only enforcement model
leans on. Artifact-fingerprint freshness (ADR-0002) is what makes freshness *computed and honest*,
which forces freezing-at-publish (C), which forces the snapshot-identity correction (E) so a frozen
badge cannot go quietly dishonest. Canonical-only publishing (A) is what keeps drafts from leaking
toward readers, which is the same guarantee soft authoring depends on at the gate. Pull one and the
others lose tension — which is the same observation made about the philosophy in `02-philosophy.md`,
seen now at the level of concrete decisions.
