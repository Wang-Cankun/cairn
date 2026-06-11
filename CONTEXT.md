# Cairn — Context & Glossary

Canonical language for Cairn. Domain-neutral (generic data analysis). Keep this free of
implementation detail; it holds terms meaningful to anyone reasoning about the system.

## What Cairn is

A local store of **claims** (analysis conclusions, each grounded in evidence), authored
primarily by an AI coding agent during normal work, and projected read-only to human
collaborators. Cairn is **agentic-AI-ready-first**: its primary interface is the agent loop,
not a GUI.

## Actors

- **Owner** — the person who runs the analysis and owns the store (local-first; single owner).
- **Agent** — the AI coding harness (Claude Code) the Owner works through. The primary
  **writer** of claims, and a **reader** of the canonical head at session start.
- **Collaborator** — receives a read-only published projection. Read-only in v1.
- **Fresh session** — a new Agent session that reads the canonical head to orient instantly.

## Interfaces (priority order)

1. **Store** — SQLite. The hard floor; rejects malformed writes (FK / CHECK / NOT NULL).
2. **CLI** — the *only* write path into the Store. Deterministic, auditable. Does the
   structural checks the schema cannot express. Verbs: `head`, `add-claim`, `refresh`,
   `validate`, `publish` (more may be added as decisions resolve).
3. **Skill** — the Agent's Cairn *protocol* (markdown capability injection for Claude Code).
   The only thing that can *cause* a claim to be written. A MUST.
4. **Published site** — a read-only projection emitted by `publish`, for the Collaborator.
   Part of v1, but secondary in priority.

### Cause vs constrain (resolves the "skill vs schema" tension)

The Skill and the Store/CLI are not competitors — they act on different verbs:

- **Skill = cause.** Gets claims written at all. (The schema cannot author.)
- **CLI + Store = constrain.** Reject malformed writes. (The skill cannot enforce.)

You need both: the schema can't author, the skill can't enforce.

### Skill protocol (the agent loop)

The Skill instructs the Agent in four touchpoints:

1. **Orient** (session start) — `cairn head`: read canonical state + pending drafts before
   acting. This is also what lets a Fresh session land oriented.
2. **Author** (on concluding) — `cairn add-claim --text "…" --evidence <path|target>`: one
   cheap, in-flow call. Draft-soft, so there is no friction tax that breeds avoidance. Low
   friction is the main anti-forgetting mechanism.
3. **Refresh** (after a rerun / `tar_make()`) — `cairn refresh`: recompute Freshness, surface
   newly-stale claims.
4. **Publish** (before sharing) — `cairn validate` (reach-ground gate) → `cairn publish`
   (Snapshot + diff).

**Enforcement model (v1): make lapses visible, don't pretend they were prevented.** Because the
Skill is a wish the Agent can ignore (the Owner "sometimes forgets"), `cairn publish` runs a
**warn-only reconcile**: it reports conclusions in the shared findings/paper that carry no claim
id, and drafts left ungrounded. It does **not** block on these in v1 (detecting a "conclusion"
is too fuzzy to hard-gate honestly). Same philosophy as `unknown` freshness and git-diff
visibility. **Hooks** (a Claude Code lifecycle hook that nudges/blocks without relying on the
Agent's goodwill) are the **v2** hardening; the Skill is v1's only authoring driver. This means
v1 claims genuinely can be forgotten — the warn-only reconcile is the accepted ceiling.

## Core terms

- **Claim** — one analysis conclusion. Carries text, a verification status, and edges.
- **Claim lifecycle** — `draft → canonical`. A **draft** claim may be ungrounded (no edge
  yet); it lives only in the Owner's working area and is never read by a Collaborator or a
  Fresh session, never in `head.json`, never in a Snapshot. Promotion to **canonical** is the
  hard gate: a claim may cross only if it satisfies the Iron rule. Softness lives entirely
  before the gate; everything past the gate is always well-founded.
- **Evidence** — a piece of grounding: a run, a file, a dataset, or an external reference.
- **Grounding edge** — `claim → evidence`. The claim's feet on the ground.
- **Dependency edge** — `claim → claim`. The claim standing on another's shoulders.
  Distinct type from a grounding edge; does **not** count as grounding.
- **Iron rule (well-founded)** — every claim has ≥1 edge, and following dependency edges
  upward must terminate at the ground. A claim that cannot reach ground may not enter the
  canonical head and may not be shared. Blocks circular reasoning. **Enforced at the
  draft→canonical boundary** (the promotion/publish gate), not at write time — see
  `docs/adr/0001-soft-authoring-draft-claims.md`.
- **Freshness** — `fresh` / `stale` / `unknown`. **Derived from the evidence fingerprint, not
  from the compute process**: a claim is `fresh` if the artifact it points at still fingerprints
  the same as at authoring, `stale` if the artifact changed, `unknown` if the artifact is
  unreachable or was only self-reported and can't be re-checked now. A claim is also stale if
  anything it depends on is stale (cascade). `unknown` is a legal, honest state — a false
  `fresh` is the enemy. See `docs/adr/0002-freshness-by-evidence-fingerprint.md`.
- **Fingerprint** — a recorded signature of an evidence artifact (content hash; or size+mtime
  as a weak fallback), stamped at authoring time. Quality is tiered and shown on the badge:
  a pipeline tool's content hash (e.g. targets) is the top tier; a self-reported remote
  `md5sum` is a lower tier; both are honest about which they are.
- **Verification** — `unverified` / `verified` / `contradicted` / `unverifiable`. A separate
  axis from freshness. v1 stores an honest default (`unverified`); the verify machinery is v2.
- **Canonical head (`main`)** — the current agreed record. Publishing advances it.
- **Snapshot** — an immutable, content-addressed freeze of the canonical head at one publish.
  Reruns move the head; readers see a diff against the snapshot they last saw.
- **`canonical` ≠ `verified`** — publishing makes a version the agreed current record, never
  true. The two axes never merge.
- **Compute node** — optional metadata about how an artifact was produced (a targets target, a
  script run). Demoted: it is *not* the freshness backbone (the evidence fingerprint is). When
  a pipeline tool is present it supplies a high-quality fingerprint for free; when absent,
  Cairn still works.

## Execution & storage environment

The real environment is heterogeneous and partly remote, and the design must survive it:

- Compute runs **mostly through the Agent (Claude Code)** directly — sometimes via targets,
  sometimes not, sometimes Python — and often on **remote HPC** (OSC, vp03). The system must
  **degrade gracefully** when discipline lapses; it must never depend on the Owner remembering
  to do something special. (This is why freshness fingerprints the *output artifact*, not the
  *process* — process-wrapping fails hard when forgotten; fingerprinting falls back to
  `unknown`.)
- **The write store is local and single-writer** (the Owner's laptop). Authoring happens
  locally against the local store, even when heavy compute ran on a remote host (the Agent
  fingerprints the remote artifact in-session and records the signature).
- **Publishing emits a portable, self-contained Snapshot** — decoupled from the local store.
  Today a read surface serves it as files; in the future a **Cloudflare Worker** may serve the
  same snapshot. The Worker is a delivery target for an immutable artifact, **not** a second
  write store. Write stays local; read can travel.

## Meeting layer (v2 — composes on the time spine; integrates meeting-ai)

A **meeting is not a separate product — it is an episodic event in the same graph.** It is
anchored to the Snapshot current when you met ("what we looked at"), it produces graph mutations
(decisions → new claims / hypotheses / verdicts written back), and it updates **roles context**
(collaborators as recorded actors — the "observer is invisible" tension made concrete).
Because it writes back to the graph, it **cannot precede the graph; it composes on top.**

- **v1 reserves the seam, builds none of it.** v1 ships the time spine the meeting layer needs:
  immutable timestamped Snapshots + claim history. That is the proto-timeline.
- **v2 integration, not reinvention.** Capture stays with the existing **`meeting-ai`** skill
  (audio/video → diarized transcript + summary + action items under the `Meeting/` convention;
  it also has a `meeting-ai-web` shared-browse mode). Cairn's future `ingest-meeting` reads
  meeting-ai's *summary/action-items* output and turns it into episodic events + proposed graph
  writes anchored to a snapshot. Don't rebuild transcription/diarization. The AI-assisted
  "meeting agenda" (which claims are most worth deciding, by value-of-information) is also v2.

## Storage model

- **Source of truth = plain-text claim files in git** (markdown + frontmatter, one per claim,
  tiny). **SQLite is a derived index**, rebuilt on demand for the reach-ground query, freshness,
  and diffs. The hard floor is the CLI (sole writer) + `validate` gate + git-diff visibility,
  not DB constraints. See `docs/adr/0003-files-in-git-truth-artifacts-by-reference.md`.
- **Artifacts are referenced, never ingested.** A claim stores a path + Fingerprint to its
  evidence artifact (`.rds`, results `.csv`, a figure); the bytes stay where they live —
  gitignored, on an external volume, or on a remote host. Cairn's git footprint stays text-only
  regardless of project size (a 29G project yields a few hundred KB of claim text).
- **The Cairn store is decoupled from the host project's git history** (its own small repo or a
  self-contained text-only subdir), so it never inherits multi-gigabyte history bloat and stays
  portable / Worker-deployable.
- **Fingerprint sources, by tier:** a pipeline tool's content hash is top tier — for targets,
  read the `data` column of `_targets/meta/meta` (already maintained, free); a direct file hash
  of a loose result is mid tier; an unreachable remote artifact reads `unknown`.
