# 08 — Frontend

The published projection — the collaborator-facing page — is real and was built with care, but it
is secondary in priority to the agent loop (`01-what-cairn-is.md`), and understanding *why* it is
shaped the way it is matters more than its visual polish. The deepest fact about the frontend is
the one easiest to miss: **there is no backend.** This document explains the no-backend data flow,
tells the vinext-versus-Vite story honestly, describes the design intent, and explains why the
whole thing ports to a future Cloudflare Worker as a delivery change rather than a rewrite. The code
is under `site/`; the relevant decisions are C, F, and G in `docs/CONTRACTS.md`.

---

## There is no backend

It is tempting to describe Cairn's site as having a "frontend that talks to a backend." It does
not, and the difference is the whole point.

What actually happens at view time (`site/src/App.tsx`): the static bundle does
`fetch("./data/head.json")` and, best-effort, `fetch("./data/diff.json")` — **relative** paths,
siblings of `index.html` — and renders the result entirely client-side. That is the entirety of
"frontend/backend communication." There is no server computing a response, no API, no database
query at view time, no live anything. The "backend" is two JSON files sitting next to the HTML,
and those files were written by the CLI at publish time (`src/publish.ts`).

This is not a limitation that happens to be acceptable; it is a deliberate property that is
*load-bearing for honesty*. Recall the load-bearing seam (`04-architecture.md`): authoring is
continuous and on the agent's side; projection is a deterministic batch on the CLI's side; the web
app only ever reads frozen batch output. The site reads `head.json`; it never assembles it. And the
agent never assembles it either. **The agent never assembles the published JSON — if it did, it
could fabricate a badge.** An agent that wrote `head.json` directly could narrate a `fresh` that no
fingerprint supports, a `verified` that no oracle produced — the exact laundering the project
dismantles (`02-philosophy.md` §3). By making `head.json` the deterministic output of the CLI's
publish step, computed from the actual artifacts and the gated claim set, Cairn structurally
removes the agent's (and the site's) ability to invent what a reader sees. The site is a dumb,
honest renderer of a value neither it nor the agent could forge.

So "no backend" is not "we were too lazy to build a server." It is "a server, or an agent-assembled
response, would be a place where a badge could be fabricated, so we deliberately have neither." The
data flow is: CLI computes the view deterministically → writes frozen JSON into the snapshot →
static site fetches and renders it verbatim, never recomputing (decision C; `site/src/App.tsx`,
`site/src/components/Badges.tsx`).

---

## The vinext-versus-Vite story

The architecture plan (`docs/ARCHITECTURE.html`) and the pinned contract (decision G) both named
the intended frontend stack as **vinext** — Cloudflare's Vite-based Next.js reimplementation — with
an explicit fallback clause: *"if vinext can't emit a fully static client-rendered bundle, fall
back to plain Vite + React with identical components and report it."* The fallback clause fired.
The site ships as **plain Vite + React** (`site/vite.config.ts`, `site/README.md`), and the reason
is instructive rather than incidental.

What was discovered (recorded in `site/README.md`): vinext requires a full `create-next-app`
scaffold plus RSC plugins (`@vitejs/plugin-rsc`, `react-server-dom-webpack`) and is fundamentally
SSR/RSC-oriented; its own docs state it does **not** support purely client-rendered, zero-server
bundles, and its static-export path is experimental. The non-negotiable contract here is a static
bundle that fetches relative `./data/*.json` and renders entirely client-side, openable from any
static host including `file://`. That is exactly the thing vinext deprioritizes.

The deeper point — the one that makes this a *good* decision rather than a grudging compromise — is
this: **vinext reimplements the Next.js server surface, and there is no server here for that value
to attach to.** vinext's reason to exist is to make a great server-rendered / React-Server-
Components experience on Vite. Cairn's published snapshot is, by design and for the honesty reasons
above, a fully-static, no-backend, client-rendered read of frozen JSON. The thing vinext is good at
is precisely the thing Cairn deliberately does not have. Choosing vinext would have meant carrying a
server framework's machinery to serve a static artifact that needs no server — paying for a feature
the architecture forbids itself from using. Plain Vite + React produces the identical components and
design with fewer moving parts, and `base: "./"` in `vite.config.ts` makes every asset, font, and
data reference relative, which is exactly what makes the bundle portable into a snapshot directory
and openable from any host (`site/README.md`).

So the as-built truth is: **plain Vite + React, not vinext** — and the reason is not that vinext
failed, but that Cairn has no server surface for vinext's value to attach to. This is the honest
framing the contract's fallback clause asked for. (This is one of the two places the as-built system
diverges from the reviewed architecture plan; the other is the snapshot-id correction in
`06-publish-and-snapshots.md`.)

---

## Design intent

The viewer is restrained on purpose — it must never make an unsettled claim *look* settled, and its
visual choices are downstream of that constraint as much as of taste.

- **Type and typography.** Self-hosted **Inter** variable woff2 (in `site/public/fonts/`, no CDN
  dependency at view time), strong type hierarchy, generous whitespace. The aesthetic is a
  restrained, modern editorial register rather than a dashboard.
- **Light/dark.** Via `prefers-color-scheme`; both themes are first-class.
- **Motion.** Restrained 2026-era motion (`motion/react`): staggered scroll-reveal claim entrance,
  spring hover lift, animated expand for cards and the diff banner — **all gated behind
  `prefers-reduced-motion`**, so a reader who asks for no motion gets none.
- **Honest badges — the load-bearing design rule.** Freshness shows its state *with its tier* and
  an "as of `<published_at>`" qualifier (decision C), and `unknown` is shown as `unknown`, never
  flattened into `fresh` (`site/src/components/Badges.tsx`, `site/src/lib.ts`). Verification shows
  `unverified` (the v1 default) in **exactly the same neutral style as every other verification
  value** — never dressed up, never hidden, never defaulted to look verified. This is the
  anti-laundering thesis rendered in CSS: the site is forbidden from styling `unverified` or
  `unknown` to look settled. A frozen `fresh` always carries its timestamp so it is never misread
  as a live `fresh`. The footer says it outright: "Freshness frozen as of … — this view never
  recomputes. Verification shown as stored."
- **Read-only everywhere.** No edit affordances, no draft UI (the data has no drafts — decision A).
  Clicking a claim card expands its full grounding edges (method + fingerprint + location) and its
  dependency chain; clicking a `depends_on` link jumps to and highlights that claim.

The discipline throughout is that the site is a *faithful renderer of a frozen, honest record*. It
adds presentation; it never adds assertion. It cannot upgrade a claim's status, because it has no
write path and recomputes nothing.

---

## Portability to a Worker is a delivery change, not a rewrite

Because the snapshot is files end to end — a self-contained bundle of static HTML, assets, fonts,
and frozen JSON, with every reference relative — serving it from a future **Cloudflare Worker** (or
Pages, or any static host) is a *delivery* change, not a rewrite (`CONTEXT.md`, ADR-0003). The
Worker would be a delivery target for an immutable artifact, **not a second write store.** Nothing
about the bundle assumes a particular host: it opens from `file://`, from a nested sub-path, from
any static server, unchanged. Write stays local and single-owner; read can travel. The honesty
guarantees travel with it, because they are baked into the frozen JSON the CLI produced, not into
any serving logic — there is nothing for a host to recompute, and therefore nothing a host could
get wrong or be tricked into laundering. The no-backend design is what makes the artifact portable;
the portability is a free consequence of having refused a backend in the first place.
