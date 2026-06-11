# Cairn — v1 Build Brief

You are building v1 of Cairn from scratch. Read `DESIGN.md` first for the *why*; this file is
the *what to build*. Domain-neutral (generic data analysis). Build the smallest thing that
honors the three hard rules. Resist adding anything not listed here.

## What v1 must do (scope)

1. Let the owner record **claims**, each with at least one **evidence edge**, in a local store
   whose schema *rejects* a claim that has no edge or cannot reach ground.
2. Derive each claim's **freshness** (`fresh`/`stale`) from a compute DAG — never hand-set.
3. **Publish** the canonical head as an immutable, read-only snapshot (a static site or single
   file) that a collaborator opens via a link and a fresh AI session can read.
4. Show, on publish, a **diff vs the previous published snapshot** ("these N claims changed").

Out of scope for v1 (do NOT build): verifiers/oracles, the `verified` axis beyond storing an
honest default, collaborator write-back, live sync, auth, real-time anything, external-source
monitoring.

## The non-negotiable core: the schema

The store is the product's spine. Use **SQLite** (the hard invariants live in the DB). The
three rules map to enforcement layers:

### Tables (minimum)

```sql
-- A compute step with content-addressed inputs/outputs. Freshness is derived from these.
CREATE TABLE compute_node (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  input_hash  TEXT NOT NULL,   -- hash of inputs at the time it ran
  output_hash TEXT NOT NULL,
  ran_at      TEXT NOT NULL
);

-- A piece of grounding: data / run / file / external reference.
CREATE TABLE evidence (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN ('run','file','data','external')),
  ref       TEXT NOT NULL,            -- "see run X" / path / dataset id / URL — terse is fine
  node_id   TEXT REFERENCES compute_node(id)  -- set when kind in ('run','data') and locally produced
);

-- A claim: one conclusion.
CREATE TABLE claim (
  id           TEXT PRIMARY KEY,
  text         TEXT NOT NULL,
  produced_by  TEXT REFERENCES compute_node(id), -- the node whose change makes this stale
  verification TEXT NOT NULL DEFAULT 'unverified'
               CHECK (verification IN ('unverified','verified','contradicted','unverifiable')),
  created_at   TEXT NOT NULL
);
-- NOTE: there is deliberately NO freshness column. Freshness is COMPUTED (see below).

-- Grounding edge: claim -> evidence. (Distinct from dependency edges.)
CREATE TABLE claim_evidence (
  claim_id    TEXT NOT NULL REFERENCES claim(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  PRIMARY KEY (claim_id, evidence_id)
);

-- Dependency edge: claim -> claim. (Distinct type; does NOT count as grounding.)
CREATE TABLE claim_dep (
  claim_id  TEXT NOT NULL REFERENCES claim(id),
  depends_on TEXT NOT NULL REFERENCES claim(id),
  PRIMARY KEY (claim_id, depends_on),
  CHECK (claim_id <> depends_on)
);
```

### Rule 1 (the iron rule) — enforce in two parts

- **"≥1 edge"** is partly structural: a claim with no row in either `claim_evidence` or
  `claim_dep` is invalid.
- **"must reach ground"** is a *graph reachability* property — a single column CHECK cannot
  express it. Enforce it as a **publish gate** (a validation step that runs before a snapshot
  is allowed). Use a recursive CTE: a claim is *grounded* iff it has a direct grounding edge,
  OR every dependency chain from it terminates at a grounded claim. Any claim that is not
  grounded (including dependency cycles, which never reach ground) **blocks the publish** with
  a clear error naming the offending claims.

```sql
-- grounded(claim) = has direct evidence OR depends on something grounded; cycles never ground.
WITH RECURSIVE grounded(id) AS (
  SELECT DISTINCT claim_id FROM claim_evidence
  UNION
  SELECT d.claim_id FROM claim_dep d JOIN grounded g ON d.depends_on = g.id
)
SELECT id FROM claim WHERE id NOT IN (SELECT id FROM grounded);  -- must be EMPTY to publish
```

If that query returns any rows, the publish fails. This is the schema saying *no* — not the AI
choosing to be careful.

### Rule 2 (freshness derived) — compute, never store

A claim is `stale` iff its `produced_by` node's current `input_hash` differs from the hash at
the time the claim was made (recompute the upstream hash and compare), **or** any claim it
depends on is `stale` (cascade). Expose this as a derived view / function, not a column. The
published snapshot renders the *computed* freshness at publish time.

### Rule 3 (immutable snapshots + diff)

- On publish, freeze the current canonical state into a **content-addressed snapshot**
  (e.g. write `snapshots/<timestamp>-<hash>/` containing the rendered read-only view + a
  machine-readable `head.json`). Never mutate a past snapshot.
- Compute a **diff against the previous snapshot**: claims added / removed / text-changed /
  freshness-changed / verification-changed. Render it at the top of the new snapshot
  ("Since <prev version>: N changed").

## The published projection (what the two readers see)

- **For the collaborator:** a static, read-only page. Each claim shows its text, its evidence
  (the grounding edges, terse refs are fine), its **freshness badge** and its **honest
  verification badge** (`unverified` is shown plainly — never hidden, never defaulted to look
  verified). No login. A link.
- **For a fresh AI session:** emit `head.json` — a compact, typed snapshot of the canonical
  head: each claim's id/text/verification/derived-freshness, its edges, and the open items.
  This is *selected state*, not a transcript dump. The acceptance test feeds ONLY this to a new
  session.

## Suggested stack (swappable except the SQLite core)

- **Core / schema:** SQLite + a thin Python or TypeScript layer. The SQLite schema is the one
  non-negotiable; everything else is the builder's choice.
- **Publish target:** a static site (so "read-only" = a plain link = zero recipient friction).
  Generate HTML from the snapshot; no server required.
- Keep it local-first. No accounts, no cloud DB.

## Acceptance test (this is "done" for v1)

Take ONE real project. Record its results as a few claims (even 3), each with a mandatory
grounding edge. Publish. Then:

1. **Collaborator reads.** Send the read-only link to one collaborator. Do they actually read
   it? (Friction must be below "open a zip.")
2. **Fresh session orients.** Open a brand-new session, feed it ONLY `head.json` (no
   transcript), and ask "where are we and what should we decide next?" It should answer
   correctly from the canonical head alone.
3. **The honest-badge gut check.** Look at an `unverified` badge on your own published claim.
   If you feel the urge to make it look verified, that urge marks exactly where the schema must
   be tightened later (the laundering-machine gravity).

If a claim can't reach ground, the publish must refuse it. If freshness is a stored column
instead of a computed value, it's wrong. If the grounding edge is optional, you've built a
notes tool — start over.
