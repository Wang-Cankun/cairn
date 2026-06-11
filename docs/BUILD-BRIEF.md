# Cairn — v1 Build Brief

You are building v1 of Cairn from scratch. Read `../CONTEXT.md` first (glossary + decisions),
then `DESIGN.md` (the why), then the ADRs in `adr/` (the resolved forks). This file is the
*what to build*, and it reflects those decisions — where it disagrees with older prose, the
ADRs win. Domain-neutral (generic data analysis). Build the smallest thing that honors the
hard rules; resist anything not listed here.

## What Cairn is (orientation)

Agentic-AI-ready-first. The primary actor is an AI coding agent (Claude Code) that, during
normal analysis work, **authors claims** (conclusions grounded in evidence) into a local store,
and **reads** the canonical head to orient at session start. Human collaborators get a
read-only published projection. The GUI is not the product; the agent loop is.

## Scope

**v1 builds:**

1. A **claim store** whose source of truth is plain-text claim files in git; a claim references
   its evidence artifact by path + fingerprint (never ingests bytes).
2. A **CLI** that is the *only* writer, plus a derived SQLite index it rebuilds on demand for
   graph/freshness queries.
3. A **skill** (the agent's 4-touchpoint protocol).
4. **Publish**: an immutable, portable snapshot of the canonical head + a diff vs the previous
   snapshot + a `head.json` for a fresh agent session, served read-only.

**v1 does NOT build** (reserved seams — leave the ports open, build nothing):
- the verification machinery (verifiers/oracles) — store an honest `unverified` default only;
- the meeting layer — integrates the existing `meeting-ai` skill in v2, not now;
- Claude Code **hooks** — v2 hardening; the skill is v1's only authoring driver;
- live sync, auth, accounts, real-time anything.

## Architecture (the layers)

```
Agent (Claude Code) ──drives──> Skill (protocol)
        │ writes via
        ▼
       CLI  ── sole writer ──>  claim files in git  (SOURCE OF TRUTH, text, tiny)
        │                              │
        │ rebuilds on demand           │ references (path + fingerprint)
        ▼                              ▼
   SQLite (DERIVED index)        evidence artifacts  (NOT in the store; gitignored, remote, etc.)
        │
        ▼
   publish ──> immutable Snapshot (portable: files now, Cloudflare Worker later)
                 ├─ read-only site  → Collaborator
                 └─ head.json       → Fresh agent session
```

The hard floor is **CLI (sole writer) + `validate` gate + git-diff visibility**, not DB
constraints (ADR-0003). The Cairn store is its own small text-only repo/subdir, decoupled from
the host project's (possibly multi-GB) git history.

## The claim file (source of truth)

One markdown-with-frontmatter file per claim under `claims/`. There is deliberately **no
freshness field** — freshness is computed (ADR-0002).

```yaml
---
id: claim-20260610-001
text: "<the conclusion, one sentence>"
status: draft               # draft | canonical   (draft may be ungrounded — ADR-0001)
verification: unverified    # unverified | verified | contradicted | unverifiable  (v1: default only)
grounding:                  # claim -> evidence edges (>=1 required to leave draft)
  - kind: target            # target | file | data | external
    ref: results_step_07
    fingerprint: 90e13daf5941a99d
    method: pipeline-meta   # pipeline-meta | sha256 | size-mtime | remote-md5
    location: <pipeline-meta-store>
  - kind: file
    ref: outputs/step07_scores.csv
    fingerprint: "sha256:…"
    method: sha256
    location: outputs/step07_scores.csv
depends_on:                 # claim -> claim edges; do NOT count as grounding
  - claim-20260609-014
created_at: 2026-06-10T20:00:00-04:00
---

Optional freeform notes / caveats (qualifier, rebuttal). Not parsed in v1.
```

## CLI verbs (v1)

- `cairn head` — print canonical claims (with **derived** freshness + verification) and pending
  drafts; also write `head.json`. This is the orient step.
- `cairn add-claim --text "…" [--evidence kind:ref] [--depends-on id]` — write a **draft** claim
  file. Edges optional at creation (soft, ADR-0001). When an edge is given, **stamp its
  fingerprint now** (file → hash the file; target → read the pipeline tool's meta store).
- `cairn ground <id> --evidence kind:ref` — attach/stamp an edge to an existing draft.
- `cairn refresh` — recompute freshness for canonical claims (re-fingerprint reachable
  artifacts; unreachable → `unknown`). Run after a rerun / `tar_make()`.
- `cairn validate` — rebuild the derived index, run the reach-ground gate (below), report any
  claim that cannot reach ground (incl. dependency cycles). Nonzero exit if any
  canonical-candidate fails.
- `cairn publish` — run `validate` as a gate; promote passing drafts to canonical; freeze the
  canonical head into an immutable snapshot; compute the diff vs the previous snapshot; render
  the read-only site + `head.json`; run the **warn-only reconcile**.
- `cairn drafts` / `cairn status` — list pending / ungrounded drafts so loose threads resurface.

## The three hard rules → enforcement

### Rule 1 — the iron rule (well-founded), enforced at the canonical boundary

Every claim has ≥1 edge, and following dependency edges upward must reach the ground. Drafts may
be ungrounded; **promotion to canonical is the gate.** "Reaches ground" is graph reachability —
not a column constraint — so run it over the derived index:

```sql
WITH RECURSIVE grounded(id) AS (
  SELECT DISTINCT claim_id FROM claim_evidence
  UNION
  SELECT d.claim_id FROM claim_dep d JOIN grounded g ON d.depends_on = g.id
)
SELECT id FROM claim
WHERE status = 'canonical-candidate' AND id NOT IN (SELECT id FROM grounded);  -- must be EMPTY
```

Any row returned blocks the publish, naming the offending claims (cycles never reach ground, so
they surface here). This is the schema saying *no* — not the agent choosing care.

### Rule 2 — freshness from the evidence fingerprint (computed, tiered, honest `unknown`)

Per grounding edge, re-fingerprint by `method`:
- `pipeline-meta` → look up `ref` in the pipeline tool's meta store (e.g. targets'
  `_targets/meta/meta`), read its content-hash column, compare to the stamped fingerprint.
  **Top tier** (rigorous, free).
- `sha256` / `size-mtime` → re-hash the file at `location` if reachable. **Mid tier.**
- `remote-md5` → re-hash on the remote if the host is reachable; else `unknown`.

Claim freshness = `stale` if any grounding changed **or** any `depends_on` is stale; else
`unknown` if any grounding is unknown; else `fresh`. Show the **tier** on the badge — never
flatten an `unknown` into `fresh`.

### Rule 3 — immutable snapshots + diff

`publish` freezes the canonical head into a content-addressed snapshot dir (rendered read-only
view + machine-readable `head.json`); never mutate a past snapshot. Compute the diff vs the
previous snapshot (claims added / removed / text-changed / freshness-changed / verification-
changed) and render it at the top ("Since <prev>: N changed").

## The published projection (the two readers)

- **Collaborator:** a static, read-only page. Each claim shows its text, its grounding refs
  (terse is fine), a **freshness badge** (`fresh`/`stale`/`unknown` + tier) and an **honest
  verification badge** (`unverified` shown plainly, never hidden, never defaulted to look
  verified). Diff-since-prev at top. No login. A link. Portable enough to later serve from a
  Cloudflare Worker unchanged.
- **Fresh agent session:** `head.json` — a compact, typed snapshot of the canonical head (each
  claim's id/text/verification/derived-freshness/edges, plus open drafts). **Selected state,
  not a transcript dump.** The acceptance test feeds ONLY this to a new session.

## The warn-only reconcile (forgetting made visible, not prevented)

At publish, scan the shared findings/paper for conclusions carrying no claim id, and list drafts
left ungrounded. **Warn, do not block** (detecting a "conclusion" is too fuzzy to hard-gate in
v1). Report counts plainly — silent truncation of "what didn't make it" is itself a failure.

## Suggested stack (the shape is fixed; the tools are swappable)

- **Fixed (non-negotiable):** files-as-truth + CLI-as-sole-writer + reach-ground gate +
  evidence-fingerprint freshness + portable snapshot. (Note: this replaces the old brief's
  "SQLite is the core" — SQLite is now a *derived* index only.)
- **Swappable:** Python or TypeScript core; SQLite (temp/in-memory) for the index; a static-site
  generator for publish. Keep it local-first; no accounts, no cloud write store.

## Acceptance test (this is "done" for v1)

Use ONE real project. Author a few claims (even 3), each with a grounding edge, via the CLI. Publish. Then:

1. **Collaborator reads.** Send the read-only link to one collaborator. Do they actually read
   it? (Friction must be below "open a zip.")
2. **Fresh session orients.** Open a brand-new session, feed it ONLY `head.json`, and ask "where
   are we and what should we decide next?" It must answer correctly from the canonical head
   alone.
3. **Honest-badge gut check.** Look at an `unverified` or `unknown` badge on your own claim. If
   you feel the urge to make it look settled, that urge marks where the schema must tighten later.
4. **Large-project sanity.** Point it at a heavy project (a multi-gigabyte analysis dir full of
   large artifacts). Confirm Cairn's store stays text-only — claims reference artifacts, never
   ingest them.

Failure conditions: a claim that can't reach ground gets published → wrong. Freshness stored as
a column instead of computed → wrong. An ungrounded claim reaching canonical → wrong. Artifacts
copied into the store → wrong.
