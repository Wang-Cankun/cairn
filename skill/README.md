# skill/

The Cairn **Skill** — the Agent's Cairn protocol (markdown capability injection for Claude Code).

The Skill is v1's ONLY authoring driver (Claude Code hooks are v2). It instructs the Agent at
four touchpoints, each a single CLI call:

1. **Orient** (session start) — `cairn head`: read canonical state + pending drafts before acting.
2. **Author** (on concluding) — `cairn add-claim --text "…" --evidence <kind:ref>`: one cheap,
   in-flow call. Draft-soft (edges optional at creation).
3. **Refresh** (after a rerun / `tar_make()`) — `cairn refresh`: recompute freshness.
4. **Publish** (before sharing) — `cairn validate` then `cairn publish`.

This is a placeholder. The skill author fills in `SKILL.md`. CLI verb signatures are pinned in
`docs/CONTRACTS.md`.
