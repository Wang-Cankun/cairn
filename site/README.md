# site/ — Cairn read-only published viewer

The Collaborator view: a fully static, client-rendered bundle that fetches the published
`./data/head.json` (+ optional `./data/diff.json`) at runtime and renders the canonical claim
head. No server, no absolute paths, works opened from any static file host (including `file://`)
and from inside an immutable `snapshots/<id>/` dir.

## Framework: plain Vite + React (fallback per decision G)

vinext (`vinext@0.1.1`) was attempted first. It requires a full `create-next-app` scaffold plus
RSC plugins (`@vitejs/plugin-rsc`, `react-server-dom-webpack`) and is fundamentally SSR/RSC-
oriented; its docs state it does **not** support purely client-rendered, zero-server bundles, and
its `output: 'export'` static path is experimental. The non-negotiable contract here (a static
bundle that fetches RELATIVE `./data/*.json` and renders entirely client-side, openable from any
static host) is exactly what vinext deprioritizes. Per **decision G** we fell back to **plain
Vite + React** with the same components and design. Same outcome, fewer moving parts.

## Build & run

```bash
bun install
bun run dev      # local dev server (http://localhost:5173), serves public/data fixtures
bun run build    # → site/dist : index.html + assets/{js,css} + fonts/ + data/
bun run serve    # static-serve ./dist (default port 4178) to verify the production bundle
```

`vite.config.ts` sets `base: "./"` so **every** asset/font/data reference is relative — this is
what makes the bundle portable into a snapshot dir and openable from any host.

## What the integrator (`cairn publish`) must know

- **Build once (decision F).** `publish` NEVER runs a site build. Build `site/dist` once; treat it
  as the prebuilt bundle. `publish` COPIES `dist/`'s `index.html` + `assets/` + `fonts/` into each
  `snapshots/<id>/` and into `published/latest/`, then writes `data/head.json` + `data/diff.json`
  alongside. (The `data/` fixtures shipped in `dist/data/` are DEV samples — `publish` overwrites
  them with the real published head/diff.)
- **Relative data contract.** At runtime the bundle does `fetch("./data/head.json")` and
  `fetch("./data/diff.json")`. Place both in a `data/` dir SIBLING to `index.html`. `head.json` is
  required; `diff.json` is optional (banner hides if absent).
- **Schemas.** `head.json` = `PublishedHead` (CONTRACTS §3), `diff.json` = `SnapshotDiff`
  (CONTRACTS §5). Canonical claims ONLY — no drafts, not even a count (decision A). The site mirrors
  `/src/types.ts` in `src/types.ts`; keep in sync.
- **Optional `project` field.** If `head.json` includes a top-level `"project"` string the header
  shows it; otherwise it falls back to "Cairn".

## Design / behavior notes

- **Honest badges.** Freshness shows `fresh`/`stale`/`unknown` WITH its tier and an
  "as of `<published_at>`" qualifier (decision C) — `unknown` is never flattened into `fresh`.
  Verification shows `unverified` plainly, styled identically to every other value — never dressed
  up to look settled. The site renders frozen `head.json` values verbatim and NEVER recomputes.
- **Read-only everywhere.** No edit affordances, no draft UI (the data has no drafts).
- **Self-hosted Inter** variable woff2 in `public/fonts/` — no CDN dependency at view time.
- **Motion** (`motion/react`): staggered scroll-reveal claim entrance, spring hover lift, animated
  expand for cards + diff banner; all gated behind `prefers-reduced-motion`. Light/dark via
  `prefers-color-scheme`.
- **Interactions.** Click a claim card to expand full grounding edges (method + fingerprint +
  location) and the dependency chain; clicking a `depends_on` link jumps to and highlights that
  claim.
