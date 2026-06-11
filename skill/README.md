# skill/

The Cairn **Skill** — the Agent's Cairn protocol (markdown capability injection for Claude
Code). It is v1's ONLY authoring driver (Claude Code hooks are v2). The skill itself lives in
`cairn/SKILL.md`; it teaches the Agent four touchpoints, each a single CLI call:

1. **Orient** (session start) — `cairn head`: read canonical state + pending drafts before acting.
2. **Author** (on concluding) — `cairn add-claim --text "…" --evidence <kind>:<ref>`: one cheap,
   in-flow call. Draft-soft; ground a moment later with `cairn ground`. Capture NOW, never defer.
3. **Refresh** (after a rerun / `tar_make()`) — `cairn refresh`: recompute freshness, surface
   newly-stale claims.
4. **Publish** (before sharing) — `cairn validate` then `cairn publish`; relay the warn-only
   reconcile honestly.

CLI verb signatures are pinned in `docs/CONTRACTS.md`.

## Install (symlink into your Claude Code skills)

Claude Code discovers skills under `~/.claude/skills/<name>/SKILL.md`. Symlink the `cairn`
directory so edits here stay live:

```sh
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skill/cairn" ~/.claude/skills/cairn
```

Run from the repo root. Verify with `ls -l ~/.claude/skills/cairn` — it should point at
`skill/cairn` in this repo. To update the skill, just edit `skill/cairn/SKILL.md`; the symlink
keeps Claude Code in sync. Remove with `rm ~/.claude/skills/cairn` (unlinks only, never deletes
the source).
