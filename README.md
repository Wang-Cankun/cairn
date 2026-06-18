# Cairn

[![release](https://img.shields.io/github/v/release/Wang-Cankun/cairn?sort=semver)](https://github.com/Wang-Cankun/cairn/releases) ![bun](https://img.shields.io/badge/bun-%E2%89%A51.3-black)

> A **deterministic, anti-laundering substrate** for AI-driven analysis. Cairn records an agent's conclusions as versioned **claims** that carry their evidence, conditions, contradictions, and freshness — and enforces consistency without ever interpreting, scoring, or deciding for you.

A *cairn* is a stack of stones earlier walkers leave on a trail so those who follow know the way. Cairn does that for analysis: your next AI session — or a collaborator — inherits an honest, grounded record instead of re-deriving it, or trusting a laundered one.

## Why

As a conclusion travels up the stack (artifact → claim → summary → result) and across agents and months, it gets **laundered**: the fork it was conditional on, the result that contradicted it, the fact that nobody verified it — all quietly drop, leaving a clean-looking answer. Cairn's single job is to keep conclusions scarred. It does **no interpretation** — no counting paths, no averaging, no verdicts. Judgment stays with the agent; the tool enforces only what it can check deterministically.

The full reasoning — verifier asymmetry, `canonical ≠ verified`, the multiverse — is in the **[whitebook](docs/WHITEBOOK.md)** ([PDF](https://github.com/Wang-Cankun/cairn/releases/latest)).

## Install

```sh
bun install   # bun ≥ 1.3 — never npm/node
```

The CLI walks up from the cwd to find (or auto-create) a `cairn/` store. Invoke it with `bun run cairn <verb>`.

## The agent loop

Cairn is driven by an AI agent through four touchpoints (the [skill](skill/cairn/SKILL.md)):

| Step | Verb | |
|---|---|---|
| **Orient** | `cairn head` | read canonical claims, live freshness, and unresolved contradictions before acting |
| **Author** | `cairn add-claim --text "…" --evidence kind:ref` | record a conclusion with its estimand, evidence, the fork it depends on, and what it contradicts |
| **Refresh** | `cairn refresh` | re-fingerprint artifacts; surface newly-stale claims |
| **Publish** | `cairn validate` → `cairn publish` | gate, then freeze an immutable OKF bundle |

Full verb set: `head · add-claim · add-estimand · add-confound · review · refresh · validate · publish · drafts · status · reconcile · migrate`.

## The model

- **No interpretation** — the CLI fingerprints, validates graph structure, and gates; it never counts, averages, scores, or emits a verdict. ([ADR 0004](docs/adr/0004-no-interpretation-deterministic-substrate.md))
- **[OKF](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)-native** — claims, estimands, and confounds are markdown + frontmatter concept files; bytes stay by reference; published snapshots are portable OKF bundles.
- **estimand is the handle** — two claims are comparable only if they declare the same estimand id; the CLI matches ids, never meaning. ([ADR 0005](docs/adr/0005-estimand-handle-no-enu-field.md))
- **Five deterministic gates** — reach-ground · collapse-refusal · resolution (a contested claim can't settle) · verification territory-lock (an agent can never set `verified`) · corroboration (no self-review). ([ADR 0006](docs/adr/0006-verification-territory-locked-corroboration.md))
- **Freshness from fingerprints**, not from the process — `fresh` / `stale` / `unknown`, where `unknown` is an honest state. ([ADR 0002](docs/adr/0002-freshness-by-evidence-fingerprint.md))
- **An honest ceiling** — Cairn enforces *consistency with what was declared*, never *truth of the declaration*. `canonical ≠ verified`, always.

## Docs

- **[Whitebook](docs/WHITEBOOK.md)** — the canonical *why + what* (PDF on the [latest release](https://github.com/Wang-Cankun/cairn/releases/latest)).
- **[CONTEXT.md](CONTEXT.md)** — glossary and current decisions (authoritative).
- **[docs/adr/](docs/adr/)** — the resolved design forks, ADR 0001–0006.

## Develop

```sh
bun test            # unit + CLI integration
bun run acceptance  # end-to-end loop against fixtures
```
