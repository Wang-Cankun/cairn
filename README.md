# Cairn

A read-only **canonical projection of a claim graph** for sharing analysis results.

> A cairn is a stack of stones earlier walkers ground into the trail so those who come
> after know where the path is. This is the same idea for analysis results: a canonical,
> grounded record that two later readers — a collaborator, and your next AI session —
> can rely on without re-deriving the whole history.

## Quickstart

Cairn v1 is implemented: a `bun` + TypeScript CLI (the sole writer), a derived in-memory SQLite
index, a portable React snapshot site, and the agent skill. Requires **bun ≥ 1.3** (never
npm/npx/node).

```sh
bun install                 # root deps (yaml + bun-types)
bun run build:site          # build the static viewer ONCE -> site/dist (publish copies this in)
```

The CLI walks up from cwd to find a `cairn/` store (auto-created on first write — there is no
`init`). All evidence paths are **host-root-relative** (the dir containing `cairn/`). Run it with
`bun run src/cli.ts <verb>` (or `bun run cairn <verb>`).

### The 8 verbs

| Verb | What it does |
|---|---|
| `cairn head` | Print the local orient view — canonical claims (with **live** freshness + verification) + pending drafts — and (re)write `cairn/head.json`. The session-start orient step. |
| `cairn add-claim --text "…" [--evidence kind:ref …] [--depends-on id …]` | Write a new **draft** claim. Each `--evidence` is fingerprinted now (`file`→sha256, `target`→pipeline-meta, `external`→remote-md5). Flags repeatable. |
| `cairn ground <id> --evidence kind:ref` | Attach + stamp a grounding edge onto an existing draft. |
| `cairn refresh` | Recompute freshness for canonical claims by re-fingerprinting reachable artifacts (unreachable → `unknown`); surface newly-stale claims. Run after a rerun / `tar_make()`. |
| `cairn validate` | Rebuild the index, run the reach-ground (iron-rule) gate; nonzero exit naming any claim that can't reach ground (incl. cycles). |
| `cairn publish` | Gate → promote grounded drafts → freeze an immutable `snapshots/<id>/` (prebuilt site + `data/`) → refresh the stable `published/latest/` share link → warn-only reconcile. |
| `cairn drafts` | List pending drafts; ungrounded ones flagged. |
| `cairn status` | Store path, #canonical / #drafts / #ungrounded, last snapshot id. |

### Publish & share (decisions A, B, F)

`publish` writes an immutable, content-addressed `cairn/snapshots/<id>/` (the prebuilt static
viewer + `data/head.json` + `data/diff.json`, **canonical claims only — no drafts**) and refreshes
`cairn/published/latest/`, a full COPY of the newest snapshot. Share the `latest/` path **once**;
it always shows the newest publish. Every snapshot opens from a plain `file://` path or any static
host, including a nested sub-path (all asset/data references are relative).

### The agent skill

The skill (`skill/cairn/SKILL.md`) is the agent's 4-touchpoint protocol (orient → author →
refresh → publish). Install it for Claude Code by symlinking:

```sh
ln -s "$(pwd)/skill/cairn" ~/.claude/skills/cairn
```

### Run the demo / tests

```sh
bun test                    # unit + CLI integration tests
bun run build:site          # required before acceptance (publish copies site/dist)
bun run acceptance          # full v1 loop against a temp copy of fixtures/demo-project
```

`bun run acceptance` exercises the whole loop end to end: author 4 drafts (target-grounded,
file-grounded, dependency+file-grounded, plus one zero-edge leftover), validate, publish (promotes
3, reports the leftover), assert canonical-only `head.json`, mutate evidence → refresh → stale
cascade, re-publish with a real diff + immutable prior snapshot + `latest/` mirroring the new one,
and a negative reach-ground gate test.

## What it is (one paragraph)

Instead of zipping results and mailing them, you publish them as **claims**. A claim is a
single conclusion that carries an explicit link to the evidence it stands on. The published
version is the canonical record (`main`); a collaborator opens a read-only link, and a fresh
AI session reads the same canonical head to instantly know "where we are and what to decide
next." The unit shared is a claim, not a file — that one change is what makes this not a
generic document/notes tool.

## What it is NOT

- Not a SaaS, not a collaboration platform, not real-time synced.
- Not a place where "I published it" means "it is verified/true." Publishing makes a version
  *canonical* (the agreed current record), never *verified*. Those are separate axes.

## The whole v1, in three rules

1. **Every claim must reach the ground.** A claim has ≥1 edge, and following dependency edges
   upward must terminate at a real artifact (a dataset / run / file) — no claim may rest only on
   other claims. Drafts may be ungrounded while you work; the rule bites at the **promotion gate**
   to canonical, so nothing ungrounded is ever shared.
2. **Freshness is derived from the evidence fingerprint, not typed.** `fresh` / `stale` /
   `unknown` is computed by comparing the artifact's fingerprint to what was stamped at
   authoring — never hand-set, never AI-guessed. `unknown` (artifact unreachable) is a legal,
   honest state.
3. **Each publish is an immutable snapshot.** The head moves forward; reruns cascade staleness;
   a reader sees what changed since the version they last saw.

## How to use this repo

Below is the design brief behind the implementation. Read order (later docs win where they differ):

1. `CONTEXT.md` — glossary + the canonical, current decisions. **Authoritative.**
2. `docs/adr/` — the resolved design forks (0001 draft authoring, 0002 evidence-fingerprint
   freshness, 0003 files-in-git truth). **Authoritative.**
3. `docs/BUILD-BRIEF.md` — the concrete, buildable spec + acceptance test (reflects the ADRs).
4. `docs/DESIGN.md` — background reasoning. Largely valid, but where it predates the ADRs
   (freshness mechanism; storage), the ADRs and `CONTEXT.md` win.

Then start a fresh session and point the model at `docs/BUILD-BRIEF.md` to scaffold v1.

The acceptance test is in the build brief: publish one real project's results as a few
claims, share a read-only link, and check that (a) a collaborator reads it and (b) a fresh
session fed only the canonical head answers "where are we / what next" correctly.

## System card

For the long-form "why" — the narrative that explains and ties together the decisions above for
human collaborators and fresh AI sessions — see [`system-card/README.md`](system-card/README.md).
