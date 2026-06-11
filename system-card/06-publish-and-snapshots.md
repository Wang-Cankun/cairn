# 06 — Publish and Snapshots

Publishing is where the continuous, soft, local authoring half of Cairn meets the deterministic,
hard, frozen projection half (the load-bearing seam, `04-architecture.md`). This document covers
what `publish` does, what immutability and content-addressing mean here, how the diff works, and —
at length, because it is one of the most instructive moments in the project — exactly *what a
snapshot's identity content-addresses* and why getting that wrong would have reintroduced the
dishonesty Cairn exists to prevent. The code is `src/publish.ts` and `src/snapshot.ts`; the
decisions are A, B, C, E, F in `docs/CONTRACTS.md`.

---

## What publish does

`cairn publish` (`src/publish.ts`) runs, in order:

1. **Resolve the prebuilt site bundle up front** (`resolveSiteDist`). If `site/dist/index.html`
   does not exist, publish fails *before mutating anything* — it never half-completes because the
   site was not built (decision F; `08-frontend.md`).
2. **Run the reach-ground gate** (`runGate`) over canonical claims plus grounded drafts. If any
   candidate cannot reach ground, publish throws and exits 3, naming the offenders. This is the
   iron rule blocking the publish (`03-domain-model.md`, `04-architecture.md`).
3. **Promote passing grounded drafts to canonical** by rewriting their claim files (the CLI is the
   sole writer). Zero-edge drafts stay drafts and are reported, not promoted.
4. **Compute the published head** — canonical claims only (decision A), with freshness computed
   once and frozen at `as_of = published_at` (decision C).
5. **Content-address the published view** into a snapshot id (decision E; the story below).
6. **Write the immutable `snapshots/<id>/`** — the copied static bundle plus `data/head.json` and
   `data/diff.json`. Never mutate a complete existing snapshot.
7. **Mirror the newest snapshot into `published/latest/`** (a full copy, decision B) and update the
   convenience `cairn/head.json`.
8. **Run the warn-only reconcile** (never blocks; below).

The output to the operator names the snapshot id, the previous id, how many drafts were promoted,
the diff counts, the share-link path, and the reconcile results — so nothing about "what happened"
or "what didn't make it" is hidden.

---

## Immutability and the two readers' artifacts

A snapshot is **immutable**: once written, a `snapshots/<id>/` directory is never mutated. Each
snapshot is self-contained — it carries its own copy of the static site (`index.html`, `assets/`,
`fonts/`) plus its `data/` — so it opens from a plain `file://` path or any static host, including
a nested sub-path, because every reference inside it is relative (`08-frontend.md`,
`vite.config.ts` `base: "./"`).

The two readers get their artifacts from the same snapshot:

- The **collaborator** gets the static site plus `data/head.json` + `data/diff.json`. They open a
  link and read.
- The **fresh agent session** gets `head.json` — the same `PublishedHead`. It is a compact, typed
  snapshot of the canonical head: each claim's id, text, verification, computed-and-frozen
  freshness, grounding edges, and dependency edges. The acceptance test (`tests/acceptance.sh`)
  asserts this is canonical-only and feeds exactly this shape to the orient case.

A subtlety in the as-built code worth noting: a publish that created the snapshot directory but
crashed before writing `data/head.json` would leave a "wedged" half-snapshot. `src/publish.ts`
guards against this by treating a snapshot as "reused" only when its **completion marker**
(`data/head.json`) exists, not merely when the directory exists — so a half-built snapshot is
rewritten to completion on the next publish instead of wedging forever. A genuinely complete
snapshot is left byte-identical (immutability preserved: it is only ever written when incomplete).

---

## head.json is selected state, not a transcript

`head.json` is deliberately a *projection*, not a dump. It contains the canonical claim set and
nothing else — **no drafts, not even a draft count** (decision A; `PublishedHead` in
`src/types.ts`). It is "selected state, not a transcript dump." This is what makes the fresh-session
orient case work: a model fed `head.json` gets exactly the agreed-current conclusions and what they
rest on, with no working-area noise, no half-formed drafts, no session chatter. The selection *is*
the value — it is the difference between handing a new collaborator the finished cairn versus the
entire muddy trail of footprints that produced it.

The local terminal projection is the counterpart and the contrast: `cairn head` *does* print
drafts (canonical + drafts, freshness computed live), but that is terminal output for the owner,
never a shared artifact. Two projections, one store: the local orient view (canonical + drafts,
printed, live freshness) and the published `head.json` (canonical only, frozen freshness). Keeping
these two distinct — and keeping drafts out of every shared artifact — is decision A, and it
resolves a conflicting line in the original build brief that had implied open drafts would ride
along in `head.json`. They do not. ADR-0001 ("drafts live only in the working area, never in a
snapshot") won.

---

## The diff

Each snapshot ships a `diff.json` computed against the **previous snapshot** (`computeDiff` in
`src/snapshot.ts`, `SnapshotDiff` in `src/types.ts`). It records claims `added`, `removed`,
`text_changed`, `freshness_changed`, and `verification_changed`, plus counts. The site renders
"Since `<prev>`: N changed" at the top (`site/src/components/DiffBanner.tsx`). On the first publish
`against` is `null` and every canonical claim is `added`.

The diff is the mechanism that keeps "canonical" from rotting silently. Without it, the head
advances and a reader has no idea what moved since they last looked; "canonical" decays into a
page that quietly changes under them. With it, every reader — collaborator, fresh session, future
you — sees exactly what changed since the version they last saw. The diff is computed against the
previous *snapshot's* `head.json` (read durably from `published/latest/`, not the mutable
`cairn/head.json` that `head`/`refresh` clobber), so lineage is correct even after intervening
local `head`/`refresh` calls.

---

## The snapshot-identity story (the most instructive moment)

This is the subtle one. It is worth telling in full, as a worked design lesson, because it is the
clearest case in the project of the anti-laundering thesis catching a bug in Cairn's *own*
implementation — and because the resolution involved splitting one more word in two (the recurring
trap, `02-philosophy.md` §8).

### What a snapshot id is supposed to be

A snapshot is content-addressed: its id is a short hash of its content, so the same content always
produces the same id (idempotent republish) and different content produces a different id. The
question that turned out to matter enormously is: **content-addressed over *what*, exactly?**

### The collision

There were two readings of "what to hash," and they pulled in opposite directions:

- One reading said: hash the **claim files' stored data** — the stamped fingerprints, the text,
  the edges. Exclude everything *time-varying* so the id is reproducible. This is clean and
  obviously reproducible. It also, on its face, says "exclude freshness," because freshness is
  computed and time-varying.

- The other reading said: a snapshot content-addresses the **published view the collaborator
  sees** — and that view *includes each claim's freshness badge.*

These collide on a specific, dangerous flow. Consider:

1. You publish. A claim is `fresh`. Snapshot id `A` is written; `published/latest/` mirrors it.
2. The artifact that claim grounds on **changes** on disk.
3. You run `cairn refresh`. The claim is now genuinely `stale` (correctly — its evidence changed).
4. You run `cairn publish` again — *without* changing the canonical claim set at all.

Now: what id does publish #2 compute? If the id hashed only the *stored* claim data (stamped
fingerprints, text, edges), then **nothing in that data changed** between publish #1 and publish
#2 — the stamp is still the old stamp; the staleness is a *computed* property, not a stored one. So
the id would be `A` again. Publish would hit the "reused, no change" branch, re-copy the **old
snapshot** (with its `fresh` badge) into `published/latest/`, and the collaborator's share link
would keep showing **`fresh` forever** — for a claim that everyone, including Cairn itself, knows
is now `stale`.

That is a false `fresh` reaching a reader. It is, precisely, the laundering the entire project
exists to dismantle (`02-philosophy.md` §3). The "exclude everything time-varying" reading, taken
literally, would have built the dishonesty into the share model.

### The resolution (decision E / "Option X")

The fix is to recognize that "time-varying" was one word doing two jobs, and to split it:

- **Computed freshness `{state, tier}` is semantic state.** It is part of *what the collaborator
  sees* and what the snapshot is a record of. It **belongs in the identity.**
- **Wall-clock timestamps** (`as_of`, `published_at`, `created_at`, `generated_at`) are
  semantic-free time. They carry no meaning about *what is claimed* or *how fresh it is* — only
  *when the bytes were produced*. They **stay out of the identity.**

So the snapshot id (`computeSnapshotId` in `src/snapshot.ts`, `SnapshotIdInput` /
`SNAPSHOT_ID_FIELDS` in `src/types.ts`) hashes the canonical claim set **including each claim's
computed freshness `{state, tier}`** and **excluding all timestamps.** Concretely, per claim, in a
fixed field order: `id`, `text`, `status` (always `canonical`), `verification`, `freshness`
(`{state, tier}` only — `as_of` excluded), `grounding`, `depends_on`; arrays sorted; serialized to
canonical JSON; sha256; first 16 hex chars.

This makes both properties true at once:

- **The same view is byte-reproducible.** Republishing identical claims with identical computed
  freshness yields the same id — a true no-op (`reused`), idempotent, because timestamps (the only
  thing that *did* change between two such publishes) are excluded.
- **A freshness-only change yields a NEW id.** The flow above now produces id `B ≠ A` at publish
  #2, because the claim's freshness went `fresh → stale` and freshness is in the hash. A new
  immutable snapshot is written; `published/latest/` mirrors the corrected `stale` badge; the
  collaborator sees the truth. The old snapshot `A` is left byte-identical (immutability holds),
  so the history is intact and the diff against it correctly reports the freshness change.

The acceptance test (`tests/acceptance.sh` step 8) exercises exactly this: mutate an artifact →
`refresh` → second `publish` with no change to the canonical set → assert a **new** snapshot id,
assert publish did **not** hit the `reused` branch, assert `published/latest/` now shows the claim
`stale`, assert the diff reports `freshness_changed ≥ 1` against the prior snapshot, and assert the
old snapshot's `head.json` is byte-identical. This is the corrected behavior, locked in as a
regression test (commit `151ebea`).

The lesson generalizes: when you content-address something, you have to be ruthlessly clear about
*what the address is identifying*. Here the answer is "the view a reader sees," and a reader sees
freshness. The honest identity is the identity of the view, not the identity of the stored bytes
that happen to underlie it. Splitting "time-varying" into "semantic state, in" and "wall-clock
time, out" is what made that precise.

---

## The share model: stable latest + immutable history

The share model (decision B) is two-part on purpose:

- **`snapshots/<id>/`** are the immutable history. Each is permanent, content-addressed, and never
  changes. They are what diffs are computed against and what a citation could point at.
- **`published/latest/`** is a *full copy* of the newest snapshot (a copy, not a symlink, so it is
  portable to any host and survives being moved). It is the **stable share link**: the owner
  shares the `latest/` path **once**, and it always shows the newest publish.

This resolves a real tension. Immutable snapshots are honest (a snapshot never changes under a
reader) but their ids change every publish, so sharing a snapshot id means re-sharing a new URL
every time — friction that breaks the "lighter than a zip" promise. A stable mutable link is
low-friction but, if it were the *only* artifact, would lose the immutable history the diff needs.
Cairn keeps both: immutable history for honesty and lineage, a stable mirror for friction-free
sharing. You get a permanent record *and* a link you only send once.

---

## The warn-only reconcile: forgetting made visible, not prevented

At publish, `src/reconcile.ts` runs a **warn-only reconcile** that never blocks. It does two
things: if `cairn/config.json` configures `findings_globs`, it scans those shared findings/paper
files for conclusion-like lines that carry no `claim-…` id and reports the count (and terse
file:line list); and it *always* lists the ungrounded (zero-edge) drafts that did not get
published. The publish output relays both, and the skill instructs the agent to relay them
honestly to the owner.

The philosophy here is deliberate and consistent with the rest of the system: **this is forgetting
made visible, not forgetting prevented.** Detecting a "conclusion" in prose is irreducibly fuzzy —
there is no honest way to hard-gate on it (the determinism principle in reverse: where you cannot
be deterministic, do not fake a constraint). So the reconcile is a heuristic count, never a gate.
But it is *shown* — because "silent truncation of what didn't make it is itself a failure." The
owner gets told "these conclusions in your paper have no claim; these drafts were left ungrounded."
What they do about it is their call. The system's job is to make the lapse impossible to *not see*,
not to pretend it prevented the lapse. This is the same enforcement model as honest `unknown`
freshness and git-diff visibility: make lapses visible; do not pretend they were prevented. The
real anti-forgetting hardening — Claude Code hooks that nudge without relying on the agent's
goodwill — is reserved for v2 (`07-the-agent-loop.md`, `10-limitations-and-future.md`).
