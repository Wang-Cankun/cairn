# 10 — Limitations and Future

A system card that only described strengths would be exactly the kind of polish-over-substance
artifact Cairn exists to oppose. This document is the candid accounting: what v1 deliberately is
*not*, every accepted ceiling and known soft spot, the seams left open with nothing built behind
them, and the v2 directions those seams reserve. The discipline throughout v1 was "reserve the
seam, build none of it" — leave the ports open, weld nothing shut — and being honest about that is
part of the card's job.

---

## What v1 deliberately is NOT

These are scope decisions, not missing features. Each was a live option that was consciously cut or
deferred (`docs/BUILD-BRIEF.md` scope, `docs/DESIGN.md` §8, the ADRs).

- **No verification machinery.** v1 stores an honest `unverified` default and ships *no*
  verifiers/oracles. It will never tell you a claim is correct (`03-domain-model.md`,
  `01-what-cairn-is.md`).
- **No meeting layer.** No capture, no transcription, no agenda. The seam is reserved
  (timestamped snapshots + claim history form the proto-timeline); nothing is built.
- **No Claude Code hooks.** The skill is v1's only authoring driver. Hooks — the real
  anti-forgetting hardening — are v2 (`07-the-agent-loop.md`).
- **No collaborator write-back.** The published projection is read-only in v1. No verdicts, no
  comments, no edits flow back.
- **No live sync, no auth, no accounts, no real-time anything.** The write store is local and
  single-owner.
- **No external-source drift/retraction monitoring.** This was *cut*, not deferred (very low
  likelihood of mattering). The *type* of the external edge is kept (it is the v2 verification
  attachment point); only the monitoring sensor is dropped (`docs/DESIGN.md` §8).

---

## Accepted ceilings and known soft spots

The ceilings v1 accepts on purpose, each named so a fresh reader does not mistake them for bugs:

- **Claims can genuinely be forgotten.** The skill is a wish the agent can ignore; v1 makes lapses
  *visible* (warn-only reconcile, visible draft/ungrounded counts) but does not *prevent* them
  (`07-the-agent-loop.md`, `CONTEXT.md`). A conclusion the agent never writes down is simply lost.
  This is the single largest accepted ceiling, and hooks (v2) are the intended fix.

- **The reconcile is a fuzzy heuristic.** Detecting a "conclusion" in prose is irreducibly fuzzy,
  so the reconcile that scans findings for unreferenced conclusions is a count, never a gate, and
  only runs when `findings_globs` is configured. It will have false positives and false negatives.
  It is honest about being a heuristic (`06-publish-and-snapshots.md`, `src/reconcile.ts`).

- **Enforcement is CLI/gate-layer, not DB-constraint-layer.** Because the database is derived and
  throwaway (ADR-0003), the hard floor is sole-writer CLI + gate + git visibility, which is
  marginally softer than unbypassable DB constraints. A claim file edited *outside* the CLI could
  hold malformed content on disk — but it cannot pass parse, cannot reach canonical, and cannot
  hide from `git diff` (`04-architecture.md`).

- **Remote freshness depends on reachability.** A remote artifact whose host is down reads
  `unknown` — correct, but it means freshness for remote-grounded claims is only as live as your
  connectivity. The self-reported remote tier is also lower-rigor than a content hash, and is shown
  as such (`05-freshness.md`).

- **Dangling dependencies are warned, not blocked.** A `depends_on` pointing at a non-existent
  claim id surfaces as a warning in `validate`/`drafts`, consistent with soft authoring — it does
  not hard-fail (`src/cli.ts` `danglingDeps`).

- **The freeze is point-in-time.** A published snapshot's freshness is frozen at publish and never
  recomputes; a reader looking at an old share link sees old freshness, honestly labeled "as of …"
  but old. The stable `latest/` link mitigates this for the *current* publish, but old snapshots
  are old by design (`05-freshness.md`, `06-publish-and-snapshots.md`).

- **`size-mtime` is a weak signal.** Where content hashing is impractical, the size+mtime fallback
  can miss a content change that preserves both — a real (if narrow) false-`fresh` risk on the
  lowest tier. It is the lowest tier precisely so a reader is warned, but it exists.

- **The markdown body is unparsed.** Notes/caveats below a claim's frontmatter are preserved but
  never interpreted in v1. Rich qualifiers/rebuttals are not modeled.

None of these is hidden, and none is dressed up. Naming them is the same honesty commitment the
badges enforce.

---

## The reserved seams (ports open, nothing built)

v1 was careful to leave attachment points for v2 without building any of v2. The seams already in
the code/schema:

- **The verification axis.** The `verification` enum has all four values
  (`unverified`/`verified`/`contradicted`/`unverifiable`) in `src/types.ts`; v1 only ever writes
  `unverified`, and the site renders any value neutrally. The machinery that would set the other
  values is the open port.
- **The `external` evidence kind.** Typed separately even in v1 specifically because it is where a
  v2 verifier/oracle attaches (a claim grounded in an external public reference is the checkable
  kind). Folding it into `data` would have closed this port (`03-domain-model.md`).
- **The time spine.** Immutable, timestamped snapshots + claim history are the proto-timeline the
  meeting layer needs. v1 ships the spine; it builds no meeting layer on it (`CONTEXT.md`).
- **The diff/verification-changed channel.** The diff already has a `verification_changed` field
  (`src/types.ts` `SnapshotDiff`) — unused in v1 since verification never changes, ready for v2.
- **The Worker delivery target.** Files-end-to-end snapshots are already portable to a Cloudflare
  Worker; v1 serves them as files and builds no Worker (`08-frontend.md`, ADR-0003).

---

## v2 directions

These are the intended next steps, in roughly the order they build on each other. None is committed
beyond being the reserved-seam target.

### The verification axis (verifiers / oracles)

The big one. v2 would add the machinery to move a claim off `unverified`: a verifier or oracle that
checks a claim against an external reference (a forward model over a curated reference, for
external-grounded claims) and records `verified` / `contradicted` / `unverifiable`. This is the
axis that finally lets Cairn say something about *truth* — carefully, as a separate axis that still
never merges with freshness or canonical-ness. The attachment points (the enum, the `external`
kind, the `verification_changed` diff channel) are already in place.

### Claude Code hooks as the real anti-forgetting hardening

The honest fix for the largest v1 ceiling. A lifecycle hook fires on a harness event regardless of
whether the agent "remembered," so it can nudge ("you concluded something — capture it") or gate a
share on the reconcile, *without relying on the agent's goodwill*. This is genuine enforcement on
the authoring side, which can only live in the harness, not in a markdown skill
(`07-the-agent-loop.md`). v1 deliberately shipped the skill alone and reserved hooks for here.

### The meeting layer, composing on the time spine

A meeting is **not a separate product — it is an episodic event in the same graph** (`CONTEXT.md`).
It anchors to the snapshot current when you met ("what we looked at"), produces graph mutations
(decisions → new claims/hypotheses/verdicts written back), and updates roles context (collaborators
as recorded actors). Because it writes back to the graph, it **cannot precede the graph; it composes
on top** — which is why v1 ships the spine and v2 adds the layer. Capture stays with the existing
**`meeting-ai`** skill (audio/video → diarized transcript + summary + action items); Cairn's future
`ingest-meeting` would read meeting-ai's *summary/action-items* output and turn it into episodic
events + proposed graph writes anchored to a snapshot. **Don't rebuild transcription/diarization** —
integrate the existing skill. The value-of-information "meeting agenda" (which claims are most worth
deciding) is also v2.

### Collaborator write-back

The read-only ceiling lifted: a collaborator proposing a verdict, a disagreement, a counter-claim
that flows back into the graph. The port is left open (DESIGN §8: "leave the port open, don't weld
it shut") and nothing in v1 forecloses it — but it is genuinely unbuilt, and it interacts with the
verification axis and the local-single-writer model in ways v2 would need to design carefully.

---

## A closing note on honesty about the future

Everything above is reserved, not promised. The value of stating it is not to commit Cairn to a
roadmap but to make the v1 boundaries *legible*: a fresh reader should be able to see exactly where
the built system stops, why it stops there, and what the stopping points were designed to enable
later. That legibility is itself the dogfood — a fresh session reading this card should orient on
Cairn's scope as cleanly as a fresh session reading `head.json` orients on a project's claims. If it
does, the card has done its job.
