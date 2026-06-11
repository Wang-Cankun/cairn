# site/

The Cairn read-only published projection (Collaborator view).

**Build target (decision G):** vinext, but it MUST emit a fully static, client-rendered
bundle. If vinext cannot produce static output after a timeboxed attempt, fall back to plain
Vite + React with identical components and report it.

**Hard rule (decision F):** the site is **built once** into a static bundle. `cairn publish`
COPIES that prebuilt bundle into each snapshot and writes `data/` next to it; `publish` never
runs a site build itself. The bundle reads `data/head.json` + `data/diff.json` at runtime.

**Freshness (decision C):** the site NEVER recomputes freshness. It renders the frozen
`head.json` values verbatim and labels every badge "as of `<published_at>`".

This is a placeholder. The site builder fills it in. See `docs/CONTRACTS.md` for the
`data/head.json` and `data/diff.json` shapes the bundle must consume.
