# 04 — Architecture

This document describes the layered system as it was actually built: the pieces, the single
direction in which data flows through them, and the one structural seam that makes the honesty
guarantees hold. The conceptual model it implements is in `03-domain-model.md`; the philosophy
that justifies the shape is in `02-philosophy.md`. Source files are referenced by path throughout
so a reader can jump straight to the code.

The visual plan in `docs/ARCHITECTURE.html` was reviewed before the build and is largely faithful
to what shipped; the two places it differs from the as-built system (the frontend stack, and the
snapshot-id correction) are noted where they arise and told in full in `08-frontend.md` and
`06-publish-and-snapshots.md`.

---

## The eight pieces

Cairn v1 is eight pieces with one direction of flow. Reading top to bottom is reading the path a
conclusion takes from "the agent decided something" to "two readers can see it."

1. **Agent (Claude Code)** — the primary actor. It does the analysis and, prompted by the skill,
   authors claims. It is the only thing that can *cause* a claim to exist. It is also a *reader*:
   at session start it reads the canonical head to orient.

2. **Skill — the protocol** (`skill/cairn/SKILL.md`). A markdown capability injection that teaches
   the agent the four-touchpoint loop (orient → author → refresh → publish). It causes writes; it
   cannot enforce anything (cause vs constrain, `02-philosophy.md` §5). Detailed in
   `07-the-agent-loop.md`.

3. **CLI — the sole writer** (`src/cli.ts`). The *only* write path into the store. Eight verbs:
   `head`, `add-claim`, `ground`, `refresh`, `validate`, `publish`, `drafts`, `status`. It does
   the structural checks the files cannot express, stamps fingerprints, runs the gate, and
   performs publish. Deterministic and auditable.

4. **Claim files in git — the source of truth** (`cairn/claims/*.md`, parsed by
   `src/claimfile.ts`, managed by `src/store.ts`). One tiny markdown+frontmatter file per claim.
   Text-only forever: a claim *references* its evidence by path + fingerprint and never ingests
   the bytes. Changes show up in `git diff` for free (ADR-0003).

5. **Evidence artifacts** — the heavy things (results tables, model objects, figures, remote HPC
   outputs). These live wherever they already live — gitignored, on an external volume, on a
   remote host. Cairn never copies them into the store; it only records a reference and a
   fingerprint. This is what keeps the store text-tiny regardless of project size.

6. **SQLite — the derived index** (`src/index.ts`, `bun:sqlite`, in-memory). Rebuilt on demand
   from the claim files, used for the recursive reach-ground query (`src/gate.ts`), freshness, and
   diffs. **Never a source of truth, never committed, discarded after each command.**

7. **Publish → immutable snapshot** (`src/publish.ts`, `src/snapshot.ts`). A content-addressed
   freeze of the canonical head plus a diff against the previous snapshot, with the prebuilt static
   site copied in. Detailed in `06-publish-and-snapshots.md`.

8. **The two readers** — the collaborator (the static site, `08-frontend.md`) and the fresh agent
   session (`head.json`). Both consume the output of the single publish projection.

The supporting modules round out the core: `src/fingerprint.ts` (compute/recompute an edge's
fingerprint by method), `src/freshness.ts` (combine edge states into per-claim freshness with the
cascade), `src/reconcile.ts` (the warn-only reconcile), and `src/types.ts` (the pinned shared
contract, mirrored in `docs/CONTRACTS.md`).

---

## One direction of flow

The pieces form a pipeline, and the pipeline runs one way:

```
Agent ──> Skill ──> CLI ──> claim files (git, source of truth)
                              │ references (path + fingerprint)
                              ▼
                       evidence artifacts (never ingested)
                              │
        CLI rebuilds on demand ▼
                       SQLite (derived index)
                              │
                          publish
                              ▼
                   immutable snapshot  +  diff
                         ┌────┴────┐
                         ▼         ▼
                  collaborator   fresh agent session
                   (static site)  (head.json)
```

The single direction matters. Nothing downstream writes back upstream within a publish: the site
never writes claim files, the snapshot never mutates the store, the index never becomes truth. The
only writer to the source of truth is the CLI, and it writes *before* projecting. This is what
lets the system reason about its own honesty: there is exactly one path that produces a published
view, and it is deterministic.

---

## The load-bearing seam: continuous authoring vs batch projection

The single most important structural fact about Cairn is the seam between two regimes that
operate on completely different rhythms:

- **Authoring is interactive and continuous.** The agent writes claims throughout a session, one
  cheap call at a time, in flow. This half is conversational, incremental, soft (drafts allowed),
  and never blocks. It happens many times per session.

- **Projection is a deterministic batch.** At `publish`, the CLI runs the gate, promotes grounded
  drafts, computes freshness, content-addresses the view, freezes a snapshot, and writes the
  diff — all at once, deterministically, from the current state of the claim files. This half is
  atomic, computed, hard (the gate blocks), and happens rarely (only when you share).

The web app — and the fresh-session reader — **only ever read frozen batch output.** They never
participate in authoring. They never compute anything live. The collaborator's page fetches
`head.json` and renders it verbatim; the fresh session reads `head.json` and orients. Neither ever
sees a draft, a live freshness recomputation, or a mid-authoring state.

This seam is why the deeper point in `08-frontend.md` holds — *there is no backend.* "Frontend/
backend communication" in Cairn is just a static fetch of `./data/head.json` and `./data/diff.json`
that the CLI assembled deterministically at publish time. The agent never assembles that JSON. If
it could, it could fabricate a badge — narrate a `fresh` that the fingerprint does not support —
and that is the laundering the whole project dismantles (`02-philosophy.md` §3). By putting
projection entirely in the deterministic batch and keeping the agent on the *authoring* side of
the seam, Cairn structurally prevents the agent from being the one who decides what a reader sees
about freshness. The CLI computes it from the artifacts; the agent only supplies the claim and the
reference.

---

## Files as truth, SQLite as derived index

ADR-0003 relocated the source of truth from a database to plain-text files in git, with SQLite
demoted to a derived index. The reasoning is worth restating because it is counterintuitive: the
fear that drove "SQLite as truth" was large files in git, and that fear dissolved on inspection.

A real multi-gigabyte analysis project was examined. Its weight was entirely in *artifacts* —
data directories, results directories, a pipeline cache, figures — every one of which was already
gitignored. Tracked big files: zero. The `.git` directory was large only from legacy history
bloat, not current tracking. And the project already kept a hundreds-of-KB findings document by
hand — a proto-claim store. The conclusion: claims are text and tiny; artifacts are heavy and
referenced, never ingested; so files-in-git is not only viable but *better*, because it gives
`git diff` review of claim changes for free and makes the snapshot future (files end to end)
portable to a Cloudflare Worker as a delivery change rather than a rewrite.

So in the as-built system:

- The **claim files** are authoritative. `src/store.ts` reads and writes them; `src/claimfile.ts`
  parses and validates them. They are the only thing that survives between commands.
- The **SQLite index** (`src/index.ts`) is built fresh in memory from the claim files whenever a
  command needs graph queries, used, and thrown away. It is never the truth and never committed.
  Its tables (`claim`, `claim_evidence`, `claim_dep`) exist only to make the reach-ground CTE and
  freshness/diff queries convenient.

A claim file can be malformed and sit on disk — but `src/claimfile.ts` will reject it on parse,
and even a well-formed-but-ungrounded claim cannot reach canonical, so it cannot hide and cannot
be shared. The malformation is visible (in `git diff`, in the parse error) and bounded (it never
crosses the gate). This is the "soft before the gate, hard at the gate" discipline applied to
storage.

---

## Where the hard floor actually lives

A natural assumption is that the integrity guarantees come from database constraints — foreign
keys, CHECK clauses, NOT NULL. In an earlier design (SQLite-as-truth) they would have. In the
as-built system, because the database is *derived and throwaway*, that is **not** where the hard
floor lives. The floor relocated (ADR-0003), and it is important to know where it actually is, or
you will look for enforcement in the wrong place.

The hard floor is three things together:

1. **The CLI as sole writer** (`src/cli.ts`). There is exactly one program that can put bytes into
   a claim file. The skill tells the agent to *never hand-edit* `cairn/claims/` (and the skill
   says so explicitly), so every write goes through code that stamps the structure correctly. One
   write path means one place where invariants are established.

2. **The `validate`/publish gate** (`src/gate.ts`, run by `src/cli.ts` `cmdValidate` and
   `src/publish.ts`). The reach-ground query is the iron rule made executable. It runs over the
   derived index at the draft→canonical boundary and refuses to promote (and blocks publish, exit
   code 3) if any candidate cannot reach ground. This is the schema saying *no* — not the agent
   choosing care. The negative path is tested (`tests/acceptance.sh` step 9).

3. **Git-diff visibility.** Because claims are text files in git, every change to a claim is a
   reviewable diff. Nothing changes silently. This is the collaboration/disagreement surface for
   free, and it is also the backstop for everything the gate cannot hard-enforce: a lapse that the
   warn-only layers only *report* still shows up in version control.

The `bun:sqlite` index does set `PRAGMA foreign_keys = ON` and uses NOT NULL columns
(`src/index.ts`), but those are hygiene on a throwaway structure, not the system's guarantee. The
guarantee is sole-writer CLI + gate + git visibility. The cost of this relocation — that
enforcement is at the CLI/gate layer rather than in unbypassable DB constraints — is accepted
explicitly in ADR-0003 and mitigated by exactly those three mechanisms.

---

## Discovery and the host root

One operational detail with design weight: there is **no `init` verb.** The CLI discovers the
store by walking up from the current directory looking for a `cairn/` directory that contains a
`claims/` directory (`findStore` in `src/store.ts`). The directory *containing* `cairn/` is the
**host root**, and all evidence paths are relative to it (decision D). The first write
auto-creates `cairn/claims/`. This means an agent can start authoring immediately, from anywhere
inside a host project, with zero setup — which is exactly the low-friction property the authoring
design depends on. Host-root-relative paths (rather than cwd-relative) make re-fingerprinting
location-independent: a claim grounded from a subdirectory re-checks correctly from anywhere in
the project, because the path is anchored to the project root, not to wherever the agent happened
to be standing.
