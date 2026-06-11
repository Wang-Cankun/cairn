# 07 — The Agent Loop

Cairn is agentic-AI-ready-first: the agent loop is the product, not the GUI (`01-what-cairn-is.md`).
This document describes the loop itself — the skill, the four touchpoints, why low-friction
authoring is the central anti-forgetting mechanism, and, stated honestly, exactly how much
enforcement v1 actually provides versus what it merely makes visible. The skill is
`skill/cairn/SKILL.md`; the enforcement model is pinned in `CONTEXT.md` ("Enforcement model (v1):
make lapses visible, don't pretend they were prevented").

---

## The skill is the cause

The skill is a markdown capability injection for Claude Code. In the cause-vs-constrain framing
(`02-philosophy.md` §5), it is the **cause** half: the only thing in the entire system that can get
a claim *written at all.* A schema cannot author; only an agent, prompted by the skill at the right
moment, produces a claim out of an analysis session. This is why the skill is a *MUST* in the
architecture (`CONTEXT.md`), not a nicety. If the skill never fires, the store stays empty no
matter how good the constraints are.

The skill's description (its frontmatter) is written to trigger *continuously during* a session,
not as a final step — on "what do we know so far," "where are we," recording a finding, after
rerunning anything, before sharing results. The triggering design is itself part of the
anti-forgetting mechanism: a skill that only fired at end-of-session would invite exactly the
batching that loses claims.

---

## The four touchpoints

The skill teaches a four-touchpoint loop. Each maps to CLI verbs (`src/cli.ts`) and each has a
distinct job in the rhythm of a real analysis session.

### 1. Orient — at session start

```
cairn head
```

Read the canonical claims (with live-computed freshness and verification) and the pending drafts
*before acting*, so you do not re-derive or contradict what is already concluded. This is the
touchpoint that makes the fresh-session story real: a new session lands oriented because the first
thing it does is read the agreed-current record. The skill also suggests `cairn drafts` to see
loose ungrounded threads worth resolving. Orientation is a read; it does not change claim files.

### 2. Author — the moment you conclude anything

```
cairn add-claim --text "<one-sentence conclusion>" --evidence <kind>:<ref>
```

The instant you conclude something — a result, a finding, an "X is higher than Y," a decision —
capture it with one cheap call. The skill is emphatic: **do not defer authoring to end-of-session;
a conclusion you don't capture in the moment is lost.** Evidence is optional at creation (the
claim is born a draft), and you can attach grounding a moment later:

```
cairn ground <claim-id> --evidence <kind>:<ref>
```

Both `--evidence` and `--depends-on` are repeatable. The CLI stamps the fingerprint at add-time —
you never type or guess one. (Edge kinds and their tiers are in `03-domain-model.md` and the
skill's cheat-sheet.) Because drafts never leak to collaborators (canonical only, decision A),
there is no cost to capturing early — which is the whole point.

### 3. Refresh — after any rerun

```
cairn refresh
```

After `tar_make()`, a re-executed pipeline, regenerated outputs, a re-fit model — anything that may
have changed an artifact a claim points at — recompute freshness and **surface newly-stale claims
to the owner by name.** This is the touchpoint that keeps the canonical record honest as the work
moves under it. It re-fingerprints reachable artifacts; unreachable → `unknown` (`05-freshness.md`).

### 4. Publish — before sharing

```
cairn validate    # reach-ground gate; nonzero exit blocks publish
cairn publish     # promote grounded drafts, freeze immutable snapshot + diff, render the share link
```

`validate` enforces the iron rule and names offenders if it fails (fix the grounding, don't force
it). `publish` then promotes passing drafts, writes the immutable snapshot and stable share link,
and runs the warn-only reconcile (`06-publish-and-snapshots.md`). The skill instructs the agent to
**relay the reconcile output honestly** — ungrounded drafts left behind, and (if configured)
conclusions in the findings carrying no claim id — because "surfacing what didn't make it is the
point."

---

## Low-friction authoring is the anti-forgetting mechanism

The single most important property of the authoring touchpoint is that it is **cheap.** This is not
a UX nicety; it is the core mechanism by which Cairn fights its real enemy, which is **forgetting.**

The failure mode Cairn most needs to prevent is not malformed claims (the gate catches those) — it
is claims *that never get written at all.* An analysis session produces conclusions constantly, in
flow, between other work. If capturing one is expensive — if it requires grounding it perfectly in
the same instant, recording every dependency first, getting the fingerprint right by hand — then
the rational move under time pressure is to defer it, and deferred claims are forgotten claims. The
friction is a tax, and the tax breeds avoidance, and avoidance is the failure.

So the soft-authoring decision (ADR-0001) exists precisely to buy low friction. A claim can be born
as a bare draft — no edge, no ceremony — and grounded a moment later. The friction of capture is
driven down to one cheap call, so there is no tax to avoid, so claims actually get written. The
hardness (the iron rule) is deferred to the gate, where it costs nothing at authoring time and
still guarantees that nothing ungrounded ever reaches a reader. "Low friction is the main
anti-forgetting mechanism" is a line from `CONTEXT.md`, and the entire draft design is downstream
of it.

---

## The enforcement model, stated honestly

Here is the part that must be said plainly, because it is an accepted ceiling and pretending
otherwise would itself be a kind of laundering.

**The skill is a wish the agent can ignore.** It is a prompt, not a guarantee. The owner — through
the agent — "sometimes forgets." A skill cannot enforce anything; it can only cause and only when
it fires. So v1's enforcement model is explicitly: **make lapses visible; do not pretend they were
prevented.** Concretely:

- `cairn publish` runs a **warn-only reconcile** that reports conclusions in the shared findings
  carrying no claim id, and drafts left ungrounded. It does **not block** on these
  (`06-publish-and-snapshots.md`). Detecting a "conclusion" is too fuzzy to hard-gate honestly.
- `cairn validate` / `cairn drafts` also surface **dangling `depends_on`** (a dependency id that
  resolves to no claim file) as a warning, not a hard error (`src/cli.ts` `danglingDeps`) —
  consistent with soft authoring.
- `cairn status` and `cairn drafts` make the **counts visible** (canonical, drafts, ungrounded),
  so loose threads resurface instead of rotting silently.

The honest consequence, stated in `CONTEXT.md` and worth repeating here: **v1 claims genuinely can
be forgotten.** If the agent never authors a conclusion, nothing in v1 will conjure it back. The
warn-only reconcile is the *accepted ceiling*, not a complete solution. It catches *some* lapses
(ungrounded drafts always; unreferenced conclusions when findings globs are configured) and makes
them visible, but it cannot catch a conclusion that was never written down anywhere the reconcile
scans.

This is the same philosophy as honest `unknown` freshness and git-diff visibility: where the system
cannot honestly *prevent* a lapse, it *shows* it rather than faking a guarantee. The system never
claims an integrity it does not have.

### What closes the gap: hooks, in v2

The real anti-forgetting hardening is deferred to v2: **Claude Code lifecycle hooks** that nudge or
block without relying on the agent's goodwill. A hook fires on a harness lifecycle event regardless
of whether the agent "remembered" — so it can prompt "you concluded something; capture it" or gate
a share on the reconcile, independent of the skill firing. That is genuine enforcement on the
authoring side, and it is exactly the kind of thing that can only live in the harness, not in a
markdown skill. v1 deliberately ships only the skill as its authoring driver and reserves hooks for
v2 (`CONTEXT.md`, `docs/BUILD-BRIEF.md`, `10-limitations-and-future.md`). Naming this ceiling
explicitly — rather than implying v1 prevents forgetting — is itself an instance of the project's
honesty commitment.
