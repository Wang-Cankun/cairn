# Cairn

A read-only **canonical projection of a claim graph** for sharing analysis results.

> A cairn is a stack of stones earlier walkers ground into the trail so those who come
> after know where the path is. This is the same idea for analysis results: a canonical,
> grounded record that two later readers — a collaborator, and your next AI session —
> can rely on without re-deriving the whole history.

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

1. **Every claim must have at least one edge**, and following edges upward must reach the
   ground (a dataset / run / file) — no claim may rest only on other claims. Enforced by the
   schema; a claim that can't reach ground cannot enter `main` or be shared.
2. **Freshness is derived, not typed.** `fresh` / `stale` is computed from the compute DAG
   (did anything upstream change?). It is never hand-set and never AI-guessed.
3. **Each publish is an immutable snapshot.** The head moves forward; reruns cascade staleness;
   a reader sees what changed since the version they last saw.

## How to use this repo

This repo is the design brief, not the code yet. To build v1:

1. Read `docs/DESIGN.md` — the full v1 skeleton and the reasoning behind each constraint.
2. Read `docs/BUILD-BRIEF.md` — the concrete, buildable spec and acceptance test.
3. Start a fresh session and point the model at `docs/BUILD-BRIEF.md` to scaffold v1.

The acceptance test is in the build brief: publish one real project's results as a few
claims, share a read-only link, and check that (a) a collaborator reads it and (b) a fresh
session fed only the canonical head answers "where are we / what next" correctly.
