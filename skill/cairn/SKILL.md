---
name: cairn
description: >-
  Record analysis conclusions as grounded claims while you work. Use this skill
  continuously during any data-analysis, pipeline, or research session — not as a
  final step. ORIENT at session start (run `cairn head` to read what is already
  concluded before acting). AUTHOR the instant you conclude anything — a result,
  a finding, a "X is higher than Y", a decision — with one cheap `cairn add-claim`
  call; capture it NOW, never batch claims to end-of-session (forgetting is the
  failure mode). REFRESH with `cairn refresh` after any rerun: `tar_make()`, a
  re-executed pipeline, regenerated outputs, a re-run script, new model fit, then
  surface newly-stale claims. PUBLISH (`cairn validate` then `cairn publish`)
  before sharing findings, sending a link, or handing results to a collaborator.
  Triggers: "what do we know so far", "where are we", recording a finding, after
  rerunning anything, before sharing results, claim graph, grounding evidence.
---

# Cairn — the agent authoring protocol

Cairn is a local store of **claims** (analysis conclusions grounded in evidence). You,
the agent, are the primary writer. The CLI is the sole write path — **never hand-edit
claim files, never set freshness (it is computed), never copy artifacts into the store**
(reference by path+fingerprint only). Run `cairn` from inside the host project (it walks
up to find `cairn/`). Four touchpoints:

## 1. ORIENT — at session start

```
cairn head
```
Prints canonical claims (with live-computed freshness + verification) and pending drafts.
Read it before acting so you don't re-derive or contradict known conclusions. Also run
`cairn drafts` to see loose ungrounded threads to resolve.

## 2. AUTHOR — the moment you conclude anything (LOW FRICTION, capture NOW)

```
cairn add-claim --text "<one-sentence conclusion>" --evidence <kind>:<ref>
```
This writes a **draft** — soft, cheap, in-flow. Evidence is optional at creation; you can
attach it a moment later:
```
cairn ground <claim-id> --evidence <kind>:<ref>
```
Both `--evidence` and `--depends-on` are repeatable. **Do not defer authoring to the end
of the session** — a conclusion you don't capture in the moment is lost. A bare draft now
beats a perfect claim never written. Drafts never leak to collaborators (canonical only),
so there is no cost to capturing early.

`--depends-on <claim-id>` links claim→claim (standing on another claim's shoulders). It
does **not** count as grounding — every chain must still terminate at real evidence.

### Evidence kind cheat-sheet

| kind | when to use | method (auto-stamped) | tier |
|---|---|---|---|
| `target` | output of a pipeline step (targets); best signal, free | `pipeline-meta` (reads `_targets/meta/meta` data hash for `ref`) | pipeline |
| `file` | a loose result file on local disk (CSV, model object, figure) | `sha256` of the file | content |
| `data` | a dataset; local → hashed like a file, remote → md5/unknown | `sha256` or `remote-md5` | content/remote |
| `external` | an artifact on a remote host (HPC: OSC, vp03) | `remote-md5` via ssh; unreachable → `unknown` | remote |

Prefer `target` when the result came through targets — the fingerprint is rigorous and
free. Paths are **host-root-relative** (relative to the dir containing `cairn/`), never
cwd. The fingerprint is stamped at add-time; you never type it.

### Fingerprint expectations
The CLI stamps fingerprints. For **remote artifacts** (`external`/remote `data`), it runs
`ssh <remote_host> md5sum <path>` in-session — so the host must be reachable at author
time, or it honestly records `fingerprint: unknown` (a false `fresh` is the enemy). Make
sure the remote artifact actually exists before grounding against it.

## 3. REFRESH — after any rerun

```
cairn refresh
```
Run this after `tar_make()`, a re-executed pipeline, regenerated outputs, a re-fit model —
anything that may have changed an artifact a claim points at. It re-fingerprints reachable
artifacts and recomputes freshness; unreachable → `unknown`. **Then surface newly-stale
claims to the user** by name ("claim-… is now stale: its grounding artifact changed") so
they can re-verify or re-author.

## 4. PUBLISH — before sharing

```
cairn validate    # reach-ground gate; nonzero exit blocks publish
cairn publish     # promote grounded drafts → canonical, freeze immutable snapshot, render site
```
`validate` enforces the iron rule: every canonical-bound claim must reach real ground
(cycles never do). If it fails, it names the offenders — fix grounding, don't force it.
`publish` then promotes passing drafts, writes an immutable snapshot + a stable
`published/latest/` share link, and runs a **warn-only reconcile**.

**Relay the reconcile output honestly to the user** — do not silently drop it:
- ungrounded (zero-edge) drafts left behind — these did NOT get published;
- conclusions in the findings/paper carrying no claim id (if `findings_globs` configured).

These are warnings, not errors; surfacing "what didn't make it" is the point.

## What NOT to do
- Never hand-edit files under `cairn/claims/` — the CLI is the sole writer.
- Never write or guess a freshness value — it is computed at read time, never stored.
- Never copy an evidence artifact into the store — reference path+fingerprint only.
- Never invent a fingerprint — let the CLI stamp it; `unknown` is honest and fine.

## Worked examples

**A. targets pipeline conclusion**
```
cairn add-claim --text "Step 7 scores separate cohorts A and B (AUC 0.91)." \
  --evidence target:results_step_07
```
(`pipeline-meta`, top tier — fingerprint read from the targets meta store.)

**B. loose CSV on local disk**
```
cairn add-claim --text "Treatment raises marker expression ~2.3x vs control." \
  --evidence file:outputs/step07_scores.csv
```
(`sha256` of the host-root-relative file.)

**C. remote HPC artifact**
```
cairn add-claim --text "Variant calls converge after the realignment pass." \
  --evidence external:/scratch/run42/calls.vcf.gz
```
(CLI runs `ssh <remote_host> md5sum` in-session → `remote-md5`; host down → `unknown`.)
