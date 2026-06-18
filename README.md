# Cairn

[![release](https://img.shields.io/github/v/release/Wang-Cankun/cairn?sort=semver)](https://github.com/Wang-Cankun/cairn/releases) ![bun](https://img.shields.io/badge/bun-%E2%89%A51.3-black)

> A **deterministic, anti-laundering substrate** for AI-driven analysis. Cairn records an agent's conclusions as versioned **claims** that carry their evidence, conditions, contradictions, and freshness — and enforces consistency without ever interpreting, scoring, or deciding for you.

A *cairn* is a stack of stones earlier walkers leave on a trail so those who follow know the way. Cairn does that for analysis: your next AI session — or a collaborator — inherits an honest, grounded record instead of re-deriving it, or trusting a polished one.

## Why

A conclusion rarely arrives as a clean fact. It was conditional on the one analysis path you happened to take — maybe contradicted by another you didn't report; its data may have changed since; nobody may have checked it against the real world. As it travels up the stack (artifact → claim → summary → result) and across agents and months, those qualifiers quietly fall away, and a tentative finding ends up looking certain. Call that **laundering**.

Cairn's one job is to stop it. It does **no interpretation** — it never counts paths, averages effects, or hands you a verdict. Judgment stays with you (or your agent); the tool only records what you declared and enforces what it can check deterministically. The full reasoning is in the **[whitebook](docs/WHITEBOOK.md)** ([PDF](https://github.com/Wang-Cankun/cairn/releases/latest)).

## What it solves

Six ways a conclusion gets distorted on its way into a finding — and what Cairn does about each:

| The trap | Cairn's answer |
|---|---|
| **Forking paths** — the same data supports many reasonable analyses, and you quietly pick one | each claim records the fork it's conditional on (`depends_on_fork`) |
| **Apples to oranges** — results compare only if they answer the *same question* | declare the `estimand` first; the CLI refuses to merge claims that don't share one |
| **Lost caveats** — an unfixable confound dies in a footnote and never reaches the reader | confounds are first-class nodes, inherited by every downstream claim |
| **Buried contradictions** — a contradicted result quietly "closes" as settled | contradictions persist; a contested claim can never be marked settled |
| **Re-derivation** — a fresh session re-makes an error that was already refuted | judgment is captured durably and inherited, not re-derived from scratch |
| **Hoarded uncertainty** — doubt gets flagged but is never given an exit | every residual carries a *deflation route*: what would actually shrink it |

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

## How it works

- **No interpretation** — the CLI fingerprints, validates graph structure, and gates; it never counts, averages, scores, or emits a verdict. Judgment lives with the agent. ([ADR 0004](docs/adr/0004-no-interpretation-deterministic-substrate.md))
- **`canonical ≠ verified`** — being the agreed current record is not being true. An agent can never set `verified`; only confirmation from outside the analysis (a wet-lab result, an independent cohort) can. ([ADR 0006](docs/adr/0006-verification-territory-locked-corroboration.md))
- **Freshness from fingerprints**, not from the process — `fresh` / `stale` / `unknown`, where `unknown` is an honest state, not a failure. ([ADR 0002](docs/adr/0002-freshness-by-evidence-fingerprint.md))
- **[OKF](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)-native** — claims, estimands, and confounds are markdown + frontmatter files; bytes stay by reference; published snapshots are portable OKF bundles.
- **The honest ceiling** — Cairn enforces *consistency with what you declared*, never *truth of the declaration*. It can't stop you mis-declaring; it makes the record honest, not correct.

## Docs

- **[Whitebook](docs/WHITEBOOK.md)** — the canonical *why + what* (PDF on the [latest release](https://github.com/Wang-Cankun/cairn/releases/latest)).
- **[CONTEXT.md](CONTEXT.md)** — glossary and current decisions (authoritative).
- **[docs/adr/](docs/adr/)** — the resolved design forks, ADR 0001–0006.

## Develop

```sh
bun test            # unit + CLI integration
bun run acceptance  # end-to-end loop against fixtures
```
