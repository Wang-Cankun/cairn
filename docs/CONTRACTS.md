# Cairn v1 — CONTRACTS (authoritative for cross-module shapes)

This is the pinned, authoritative spec the three parallel builders (CLI/core, site, skill) code
against. The TypeScript companion is [`src/types.ts`](../src/types.ts) — keep the two in sync; if
they disagree, fix both, never fork.

Where this disagrees with older prose (BUILD-BRIEF / DESIGN), the **resolved decisions A–G**
below win, then the ADRs, then BUILD-BRIEF.

## Resolved decisions (override conflicting older prose)

- **(A) Published = canonical only.** `head.json` and snapshots contain canonical claims ONLY —
  not even a draft count. Drafts appear ONLY in the LOCAL `cairn head` / `cairn drafts` terminal
  output, never in a shared artifact. Two projections: the local orient view (canonical + drafts,
  printed) and the published `head.json` (canonical only).
- **(B) Share-link model.** `publish` keeps immutable `snapshots/<id>/` AND maintains a stable
  `cairn/published/latest/` that always mirrors the newest snapshot (COPY, not symlink). Owner
  shares the `latest/` path once; it always shows the newest publish. `snapshots/<id>/` are the
  immutable history the diff is computed against.
- **(C) Freshness frozen-at-publish, shown honestly.** `head.json` records freshness as computed
  at publish time. The site labels every badge "as of `<published_at>`" and NEVER recomputes.
- **(D) Evidence paths are HOST-ROOT-relative.** `location`/`ref` paths are relative to the host
  project root (the dir containing `cairn/`), never to cwd — re-fingerprinting is
  location-independent.
- **(E) Snapshot id = content hash of the published VIEW** the collaborator sees: the canonical
  claim SET INCLUDING each claim's COMPUTED freshness `{state, tier}`, EXCLUDING all wall-clock
  timestamps (`as_of`, `published_at`, `created_at`, `generated_at`). **Freshness state+tier are
  part of snapshot identity; timestamps are not.** So the same view is byte-reproducible AND a
  freshness-only change (artifact mutated → `refresh` → `publish`) yields a NEW id. See "Snapshot
  id" below.
- **(F) Site built once.** `publish` COPIES a prebuilt static bundle into the snapshot + writes
  `data/`. `publish` never runs a site build.
- **(G) Frontend = vinext** emitting a fully static client-rendered bundle; if vinext can't, fall
  back to plain Vite + React with identical components and report it.

---

## 1. Claim file format (source of truth)

One markdown-with-frontmatter file per claim under `cairn/claims/`, named `<id>.md`. The
frontmatter is YAML; the body is freeform notes, **unparsed in v1**. There is deliberately **NO
freshness field** — freshness is computed at read time (ADR-0002).

```yaml
---
id: claim-20260610-001          # claim-YYYYMMDD-NNN ; NNN is a zero-padded per-day counter
text: "<the conclusion, one sentence>"
status: draft                   # draft | canonical
verification: unverified        # unverified | verified | contradicted | unverifiable (v1: always unverified on author)
grounding:                      # claim -> evidence edges ; >=1 required to reach canonical
  - kind: target                # target | file | data | external
    ref: results_step_07        # logical handle
    fingerprint: 90e13daf5941a99d
    method: pipeline-meta       # pipeline-meta | sha256 | size-mtime | remote-md5
    location: _targets/meta/meta   # host-root-relative; for target = the meta store
  - kind: file
    ref: outputs/step07_scores.csv
    fingerprint: "sha256:ab12…"
    method: sha256
    location: outputs/step07_scores.csv   # host-root-relative
depends_on:                     # claim -> claim edges ; do NOT count as grounding
  - claim-20260609-014
created_at: 2026-06-10T20:00:00-04:00   # ISO-8601 with offset
---

Optional freeform notes / caveats (qualifier, rebuttal). Not parsed in v1.
```

TS: `ClaimFrontmatter`, `GroundingEdge`, `ClaimFile`.

Rules:
- `grounding` and `depends_on` are arrays (may be empty for a draft; both empty = ungrounded draft).
- `fingerprint` is stamped at authoring (see §8). The literal `"unknown"` is allowed ONLY when the
  artifact was unreachable at stamp time.
- A grounding edge's `location` and `ref` are **host-root-relative** (decision D). For `kind:file`
  `location` typically equals `ref`; for `kind:target` `location` is the pipeline meta store.

---

## 2. Store layout (inside a HOST analysis project)

```
<host>/                         # host project root — all evidence paths are relative to THIS (decision D)
  cairn/                        # the Cairn store (own small text-only subdir/repo, decoupled)
    claims/                     # *.md — one per claim — SOURCE OF TRUTH
      claim-20260610-001.md
    snapshots/                  # immutable, content-addressed publishes (decision E)
      <snapshot-id>/            # never mutated after creation
        index.html              # prebuilt static site (copied in by publish, decision F)
        assets/…                # site assets
        data/
          head.json             # PUBLISHED head — canonical only (decision A)
          diff.json             # diff vs previous snapshot
    published/
      latest/                   # COPY of the newest snapshot — the stable share link (decision B)
        index.html
        assets/…
        data/{head.json,diff.json}
    head.json                   # convenience: the newest published head (== latest/data/head.json)
    config.json                 # OPTIONAL (findings_globs, remote_host)
```

**Discovery (no `init` verb).** The CLI finds the store by walking up from cwd looking for a
`cairn/` dir that contains a `claims/` dir. The dir CONTAINING `cairn/` is the `hostRoot`. The
**first write auto-creates** `cairn/claims/` (and siblings as needed) — deliberately no `init`.
TS: `StorePaths`.

---

## 3. PUBLISHED head.json (canonical only — decision A)

Written to `snapshots/<id>/data/head.json`, mirrored to `published/latest/data/head.json` and
`cairn/head.json`. Consumed by the static site AND a fresh agent session (must orient from this
alone). TS: `PublishedHead`.

```json
{
  "schema": "cairn.head/1",
  "snapshot": { "current": "<snapshot-id>", "previous": "<prev-id|null>" },
  "published_at": "2026-06-10T20:30:00-04:00",
  "claims": [
    {
      "id": "claim-20260610-001",
      "text": "…",
      "verification": "unverified",
      "freshness": { "state": "fresh", "tier": "pipeline", "as_of": "2026-06-10T20:30:00-04:00" },
      "grounding": [ { "kind": "target", "ref": "…", "fingerprint": "…", "method": "pipeline-meta", "location": "…" } ],
      "depends_on": ["claim-20260609-014"]
    }
  ]
}
```

- **NO drafts, not even a count.** `claims` are canonical only, stable-sorted by `id`.
- `freshness.as_of` == `published_at` (frozen-at-publish, decision C). The site renders these
  verbatim and labels "as of `published_at`"; it NEVER recomputes.

### LOCAL `cairn head` terminal projection (NOT a shared artifact)

`cairn head` / `cairn drafts` ALSO print pending drafts to the terminal. This is terminal output
only — never written into `head.json`. TS: `LocalHeadView`, `DraftView`.

```
canonical: [ { id, text, verification, freshness(computed live, as_of=now), grounding, depends_on } ]
drafts:    [ { id, text, grounded: boolean } ]
```

---

## 4. Snapshot layout & id (decisions B, E, F)

`snapshots/<id>/` where `<id>` is the **short content hash of the published VIEW** — the canonical
claim set INCLUDING each claim's computed freshness `{state, tier}`, EXCLUDING all wall-clock
timestamps (decision E + Option X). Contains the prebuilt static site (`index.html` + `assets/` at
the root) plus `data/head.json` and `data/diff.json`. **Never mutated after creation.**
`published/latest/` is a fresh COPY of the newest snapshot each publish (the stable share link).

**Why freshness is in the id (the resolution of the C/E conflict).** The thing a snapshot
content-addresses is the published VIEW the collaborator sees, and that view includes each claim's
freshness badge. If the id hashed only the stamped fingerprints stored in claim files, the flow
`publish (fresh) → artifact changes → refresh → publish` would recompute the SAME id, hit the
`reused` branch, and re-copy the OLD snapshot into `published/latest/` — a genuinely STALE claim
would keep showing a `fresh` badge on the share link forever. Including computed freshness in the
id makes a freshness-only change a NEW immutable snapshot, so the corrected freshness reaches the
collaborator. **Freshness state+tier are part of snapshot identity; timestamps are not.**

### Snapshot id computation (reproducible)

TS: `SnapshotIdInput`, `SNAPSHOT_ID_FIELDS`, `SNAPSHOT_ID_LEN`.

1. Take canonical claims ONLY.
2. For each claim keep, IN THIS FIELD ORDER: `id`, `text`, `status` (always `"canonical"`),
   `verification`, `freshness` (`{state, tier}` ONLY — the computed freshness at publish time, with
   its `as_of` timestamp EXCLUDED), `grounding`, `depends_on`. EXCLUDE `created_at` and ALL
   timestamps (`as_of`, `published_at`, `created_at`, `generated_at`).
3. Each grounding entry contributes `{kind, ref, fingerprint, method, location}`.
4. SORT: grounding edges by `[ref, location]`; `depends_on` lexicographically; claims by `id`.
5. Serialize to canonical (stable-key) JSON; `sha256`; take the first **16 hex chars** = the id.

Same view (same claims + same computed freshness) ⇒ same id, byte-for-byte (idempotent no-op
republish). A freshness-only change ⇒ NEW id. Timestamps ALWAYS live OUTSIDE the id (in
`published_at` / `freshness.as_of`).

---

## 5. diff.json (vs previous snapshot)

Written to `snapshots/<id>/data/diff.json`. TS: `SnapshotDiff`, `DiffCounts`.

```json
{
  "schema": "cairn.diff/1",
  "against": "<prev-snapshot-id|null>",
  "added":   [ <PublishedClaim>… ],
  "removed": [ "claim-id"… ],
  "text_changed":         [ { "id": "...", "before": "...", "after": "..." } ],
  "freshness_changed":    [ { "id": "...", "before": "fresh", "after": "stale" } ],
  "verification_changed": [ { "id": "...", "before": "unverified", "after": "verified" } ],
  "counts": { "added": 0, "removed": 0, "text_changed": 0, "freshness_changed": 0, "verification_changed": 0 }
}
```

- Computed against the **previous snapshot** (the prior `snapshots/<id>/data/head.json`), not
  `latest/`. First publish: `against=null`, every canonical claim is `added`.
- The site renders "Since `<against>`: N changed" at the top from `counts`.

---

## 6. Promotion semantics (the publish gate — pin this interpretation)

At `publish`, over the rebuilt derived index:

1. **Candidates** = drafts with **≥1 grounding edge** (plus existing canonical claims). These are
   marked, in-memory only, as `canonical-candidate` for the reach-ground query.
2. **Reach-ground gate (iron rule).** Run the recursive query: a claim reaches ground if it has a
   direct grounding edge, OR transitively depends_on a claim that reaches ground. Any
   candidate that does NOT reach ground (e.g. depends only on ungrounded claims, or sits in a
   dependency cycle — cycles never reach ground) **FAILS `validate` and BLOCKS publish**, naming
   the offenders. Nonzero exit.
3. **Zero-edge drafts are NOT candidates.** Drafts with no grounding edge stay `draft`, are not
   promoted, do not block, and are listed in the warn-only reconcile output.
4. Passing candidates are promoted to `status: canonical` (the claim file is rewritten by the
   CLI) and enter the snapshot.

Reach-ground query (over the derived SQLite index):

```sql
WITH RECURSIVE grounded(id) AS (
  SELECT DISTINCT claim_id FROM claim_evidence
  UNION
  SELECT d.claim_id FROM claim_dep d JOIN grounded g ON d.depends_on = g.id
)
SELECT id FROM claim
WHERE status = 'canonical-candidate' AND id NOT IN (SELECT id FROM grounded);  -- must be EMPTY
```

---

## 7. Warn-only reconcile (never blocks)

At `publish` (and runnable standalone):

- If `cairn/config.json` has `findings_globs`: scan those host files (host-root-relative globs)
  for conclusion-like lines lacking a `claim-…` id reference; report the COUNT (and, terse, the
  files/lines). This is a fuzzy heuristic — counts only, never a hard gate.
- If NOT configured: report `reconcile: not configured`.
- ALWAYS also list the ungrounded drafts (zero-edge drafts from §6.3).
- **Never blocks publish.** Silent truncation of "what didn't make it" is itself a failure.

TS: `CairnConfig`.

---

## 8. CLI verb signatures (v1)

The CLI is the SOLE writer. Verbs:

| Verb | Signature | Effect |
|---|---|---|
| `head` | `cairn head` | Print LOCAL orient view (canonical w/ computed freshness + pending drafts) to terminal; also (re)write `cairn/head.json` from the current canonical set. Read-only re: claim files. |
| `add-claim` | `cairn add-claim --text "…" [--evidence kind:ref …] [--depends-on id …]` | Write a NEW `draft` claim file. `--evidence` and `--depends-on` repeatable. Each `--evidence` edge is fingerprinted NOW (§ stamping). `--depends-on` not stamped (claim→claim). |
| `ground` | `cairn ground <id> --evidence kind:ref` | Attach + stamp one grounding edge to an existing draft. `--evidence` repeatable. |
| `refresh` | `cairn refresh` | Recompute freshness for canonical claims by re-fingerprinting reachable artifacts; unreachable → `unknown`. Read-only re: claim files (prints; rewrites `head.json`). |
| `validate` | `cairn validate` | Rebuild derived index; run reach-ground gate over canonical-candidates; report any claim that can't reach ground (incl. cycles). NONZERO exit if any fails. No writes. |
| `publish` | `cairn publish` | Run `validate` as a gate; promote passing grounded drafts to canonical; freeze snapshot (`snapshots/<id>/`); compute diff vs previous; COPY prebuilt site + write `data/`; refresh `published/latest/` + `cairn/head.json`; run warn-only reconcile. |
| `drafts` | `cairn drafts` | List pending drafts (id, text, grounded:boolean), ungrounded ones flagged. |
| `status` | `cairn status` | Summary: store path, #canonical, #drafts, #ungrounded-drafts, last snapshot id. |

### Stamping rule (when an edge is added)

Fingerprint the edge **immediately** at add-time, choosing `method` from `kind`:

- `kind:file` → `method: sha256`, hash the file at the host-root-relative path; `location` = path.
  (Weak fallback `size-mtime` only if hashing is impractical.)
- `kind:target` → `method: pipeline-meta`; read the targets meta store
  (`_targets/meta/meta`, the `data` content-hash column for `ref`); `location` = the meta store path.
- `kind:external` → remote artifact: `method: remote-md5` via `ssh <remote_host> md5sum <ref>`,
  where `<remote_host>` is `config.remote_host` and the bare `ref` is the remote path. If
  `remote_host` is not configured, a `host:path` ref is also accepted (host split on the first
  `:`). With neither a configured host nor a `host:path` ref, or if the host is unreachable, store
  `fingerprint: "unknown"` honestly (a false `fresh` is the enemy).
- `kind:data` → treat as a file (`sha256`) if locally reachable, else `remote-md5`/`unknown`
  (remote-md5 uses the same `remote_host` resolution as `kind:external`).

Method→tier mapping (TS `METHOD_TIER`): pipeline-meta→`pipeline`, sha256→`content`,
size-mtime→`weak`, remote-md5→`remote`. A claim's badge tier = best tier among its grounding
edges by `TIER_ORDER` = [pipeline, content, remote, weak].

---

## 9. Freshness computation (read time only — ADR-0002)

Per grounding edge, re-fingerprint by `method` and compare to the stamped `fingerprint`:
- `pipeline-meta` → look up `ref` in the pipeline meta store, read its content-hash; compare.
- `sha256` / `size-mtime` → re-hash the file at `location` if reachable.
- `remote-md5` → re-hash on the remote if reachable; else this edge is `unknown`.

Claim freshness:
- `stale` if ANY grounding edge changed, OR any `depends_on` claim is `stale` (cascade);
- else `unknown` if any grounding edge is `unknown`;
- else `fresh`.

Tier on the badge = best tier among edges (`TIER_ORDER`). NEVER flatten `unknown` into `fresh`.
TS: `Freshness`, `FreshnessState`, `Tier`.

---

## 10. Derived SQLite index (throwaway)

Rebuilt on demand with `bun:sqlite` (temp/in-memory), never the source of truth, never committed.
Minimal tables for the reach-ground CTE and freshness/diff queries:

- `claim(id, text, status, verification, created_at)`
- `claim_evidence(claim_id, kind, ref, fingerprint, method, location)`
- `claim_dep(claim_id, depends_on)`

Built by reading all `claims/*.md`. Discard after the command.
