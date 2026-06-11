# 02 — Philosophy

This is the deepest document in the system card. Cairn is a small program with a large set of
reasons, and the reasons are the part most likely to be lost when a fresh reader — human or model
— picks the project up later and starts "improving" it. Almost every plausible-looking
improvement to Cairn is actually a regression toward something the design already rejected on
purpose. The defenses against those regressions are arguments, not assertions, and this document
develops them as arguments.

Read this before changing anything structural. If a proposed change conflicts with one of the
positions below, the burden is on the change to overturn the argument, not merely to assert a
preference.

---

## 1. The dissolve: the original question was wrong

Cairn began as a different project. The starting question was:

> *Should I build a central collaboration platform to stop zipping results and emailing them?*

The crystallized output of the design diagnosis was that this is the **wrong question**, and that
answering it directly would have produced a bad tool. The move that dissolved it was to stop
asking about the *form* (platform? site? app?) and ask about the **atomic unit you share**,
because the unit decides everything downstream:

- If the unit you share is a **file or a zip**, then whatever you build collapses into a generic,
  crowded notes/document tool. Everyone has one. The "platform" is a detour: a worse Dropbox, a
  worse wiki, a worse shared drive. Nothing about it is differentiated, because a file is an
  opaque blob and all a file-sharing tool can do is move blobs around and decorate them.

- If the unit you share is a **claim** — one conclusion with an explicit, mandatory link to its
  evidence — then you have the one thing no notes tool does. A claim is structured: it asserts
  something and it points at why. That structure is what lets you compute freshness, enforce
  groundedness, diff between versions, and let a fresh session orient. None of that is possible
  over opaque files.

So the dissolve produced the identity: Cairn is **not a platform**; it is *a read-only canonical
projection of a claim graph.* The lesson generalizes and recurs (see §8): when a design feels
stuck on questions of form, find the atomic unit and let the unit decide the form. The form
question is downstream and usually answers itself once the unit is right.

This is also why "platform" was the *first* word that turned out to mean two things and needed
splitting — the recurring trap that §8 names as a methodological lesson.

---

## 2. The claim as the irreducible unit

Everything in Cairn is built to protect one sentence: **the unit is a claim, not a file.** This
is the entire differentiation, and it is worth being precise about what a claim *is* and why it
is irreducible.

A claim is one analysis conclusion, stated in one sentence, carrying:

- its **text** (the conclusion);
- a **verification** status (an honest axis, default `unverified` in v1);
- one or more **edges** — at least one of which must, directly or transitively, reach real
  ground.

The irreducibility is this: you cannot remove any of those and still have the thing that makes
Cairn not-a-notes-tool. Drop the text and you have evidence with no assertion. Drop the
verification axis and you have lost the honesty machinery. Drop the mandatory edge and you have a
free-text note — you have rebuilt the generic tool. The claim is the smallest structure that
simultaneously (a) asserts something a human or model can read and act on, and (b) is
*accountable to reality* through its grounding.

A claim is also deliberately *small*. One sentence, not a paragraph; one conclusion, not a
report. This smallness is what makes authoring cheap enough to do in flow, what makes the graph
diffable claim-by-claim, and what keeps the store text-tiny regardless of project size. The
temptation to let claims grow into documents is the same temptation as letting the edge become
optional: both turn Cairn back into a notes tool. Resist both.

---

## 3. The anti-laundering thesis

This is the moral center of the project. State it plainly:

> **Canonical is not verified. Publishing makes a record agreed-current, never true. The machine
> that launders unverified claims into verified-looking ones is exactly what Cairn exists to
> dismantle.**

Here is the failure mode Cairn is built against. You do some analysis. You are not sure the
result is right — maybe the pipeline had a bug, maybe the effect is an artifact, maybe you simply
have not checked. You write it up. You put it on a nice page with good typography and a clean URL
and a confident badge. A collaborator opens the page. The page *looks* settled, authoritative,
done. Nothing on it said "this is true" — but nothing stopped it from *reading* as true, either.
The act of publishing, of making something look finished, quietly upgraded an uncertain result
into something that carries the social weight of a verified one. That upgrade is the laundering.
It is enormously common and almost always unintentional. It is how wrong results propagate
through a collaboration: not by anyone lying, but by polish standing in for verification.

Cairn dismantles this in a few connected ways:

- **Two axes that never merge (see §3 of `03-domain-model.md`).** Freshness and verification are
  orthogonal and are never collapsed into a single "status" word. A claim can be `fresh` and
  `unverified` at the same time — and most v1 claims are exactly that. "Fresh" means the evidence
  has not changed since you claimed it; it says nothing about whether the claim is correct. Keeping
  the axes separate prevents "fresh" from being misread as "good."

- **Honest defaults, shown plainly.** v1 stores `unverified` and the viewer renders it in exactly
  the same neutral style as every other verification value — never dressed up, never hidden,
  never defaulted to *look* verified. (`site/src/components/Badges.tsx` and `site/src/lib.ts`
  encode this: the verification badge uses one neutral style for all values.) The honest
  `unverified` and the honest `unknown` freshness state are the same commitment in two places.

- **A false `fresh` is the enemy.** This phrase appears throughout the codebase
  (`src/fingerprint.ts`, `CONTEXT.md`, the ADRs) and it is the operational form of the thesis on
  the freshness axis. The system would rather say `unknown` — "I cannot check this right now" —
  than risk saying `fresh` when it does not actually know. An honest `unknown` is a *feature*, not
  a degradation. The entire freshness design (compute it, never store it; degrade to `unknown`
  instead of failing or guessing) is downstream of refusing to ever emit a confident-but-wrong
  freshness badge.

The snapshot-identity correction (told in full in `06-publish-and-snapshots.md`) is the
anti-laundering thesis catching a real bug in Cairn's own implementation: an early design would
have let a claim that went stale *after* publish keep showing `fresh` on the share link forever.
That is precisely a false `fresh` reaching a reader. The fix — folding computed freshness into
snapshot identity — exists because the thesis was taken seriously enough to override a cleaner-
looking but dishonest design.

---

## 4. Schema, not skill: structure enforced, not wished

A through-line discipline: **structure must be enforced by the system, never left to the AI to
remember.**

The naive version of an AI-authored knowledge store is "the AI will keep things structured." That
is a wish, and wishes are not invariants. The AI forgets. Sessions break. A different model with
different habits picks up the work. The moment the structure depends on anyone *remembering* to
maintain it, the structure is gone — not immediately, but inevitably, and silently, which is
worse.

So the goal is deliberately *not* "the AI remembers everything." The goal is:

> **The system won't let me store things in a shape the AI (or a human) can't read.**

Concretely: the claim file format is validated on parse (`src/claimfile.ts` rejects a missing
field, a bad status, an unknown evidence kind or method). The reach-ground rule is a recursive
query run at a gate (`src/gate.ts`), not a habit. The CLI is the sole writer, so there is exactly
one code path that can put bytes into a claim file, and it stamps the structure correctly every
time. None of this relies on goodwill. The structure is a property of the machine, recoverable
even after a total amnesia event — which is, after all, what a fresh session is.

This is the difference between a convention and a constraint, and Cairn always tries to convert
the former into the latter wherever the conversion is honest. (Where it *cannot* be made honest —
detecting a "conclusion" in prose, for instance — Cairn refuses to fake a constraint and instead
makes the lapse visible; see §6 and `07-the-agent-loop.md`.)

---

## 5. Cause vs constrain: you need both halves

There is an apparent tension in §4: if structure must be enforced by schema and not by the
skill/agent, why is the skill a *MUST* in the architecture? The resolution is that the skill and
the CLI/store act on **different verbs**, and neither can do the other's job.

- **The Skill causes.** It is the only thing that can get a claim *written at all*. A schema
  cannot author. No amount of validation logic will ever produce a claim out of an analysis
  session; only an agent, prompted by the skill at the right moment, does that. If the skill
  fails to fire, the claim simply never exists, and no constraint can conjure it back.

- **The CLI + files constrain.** They reject malformed writes and refuse to let an ungrounded or
  circular claim reach canonical. But the CLI cannot make the agent care. It cannot reach into a
  session and force a conclusion to be captured. It can only police what is handed to it.

You need both because each covers exactly the other's blind spot. The schema can't author; the
skill can't enforce. A design that tries to do everything with the schema gets a perfectly
structured store that is *empty*, because nothing caused claims to be written. A design that tries
to do everything with the skill gets a store full of malformed, ungrounded, circular junk,
because nothing constrained what the eager agent wrote. Cairn deliberately runs both layers and
keeps their responsibilities clean. `CONTEXT.md` states this as "Cause vs constrain"; it is one
of the most important framings in the project.

---

## 6. Simple vs soft: edge hard, content soft

Another word that turned out to mean two things was "minimal." There are two very different ways
to make a v1 small, and they have opposite consequences:

- **Simple = few fields.** Don't build a five-state status machine. Don't build verifiers yet.
  Don't model every nuance. This is *healthy* minimalism: it keeps the surface small and the build
  finishable.

- **Soft = the claim → evidence edge is optional.** This is *fatal* minimalism. The moment the
  grounding edge can be skipped, every other guarantee unravels — you cannot compute freshness
  against nothing, you cannot enforce groundedness, you have rebuilt the generic notes tool.

So the discipline line is: **edge hard, content soft.** The *content* of evidence can be as terse
as you like — "see run X," "file Y," a one-line ref. Cairn does not demand rich provenance. But
the *edge itself* — the fact that a canonical claim points at real ground — is mandatory and
enforced. You may be lazy about describing the evidence; you may not be lazy about *having* it.

There is a subtlety the as-built system adds here, which is the soft-authoring decision
(ADR-0001). Drafts *may* be ungrounded — softness is real — but it is **bounded**: it exists
entirely *before* the canonical gate. A draft can float ungrounded in your working area; nothing
ungrounded ever reaches a reader. So "edge hard" is enforced precisely at the boundary where it
matters (promotion to canonical), and "content soft" plus "draft soft" buys the low-friction
authoring that keeps claims getting written at all. The hardness and the softness are not in
tension; they live on opposite sides of one gate, by design.

---

## 7. Determinism where possible

A principle that decides several arguments at once: **anything that can be made deterministic
should be computed, never stored as an opinion.**

Freshness is the canonical case. Whether the artifact a claim points at has changed since you
claimed it is a *deterministic question*: re-fingerprint the artifact, compare to the stamp,
done. There is a right answer and the machine can compute it. So Cairn computes it — at read time,
every time — and deliberately stores **no freshness field** on the claim file (the absence is
load-bearing; `src/types.ts` and `claimfile.ts` both call it out). A stored freshness value would
be an *opinion about* the artifact, which can be wrong, can go stale, can be hand-edited, can be
guessed by an over-eager agent. A computed freshness value cannot lie about the present, only
honestly report `unknown` when it cannot see.

This is why freshness lives in the read-time/published shapes (`Freshness`, `PublishedClaim`) and
never in the stored `ClaimFrontmatter`. It is also why the freshness computation degrades to
`unknown` rather than failing or guessing: determinism includes being deterministic about *not
knowing*. The principle connects directly to the anti-laundering thesis — a computed value cannot
be laundered, because there is nothing to launder; it is recomputed from reality on every read.

Where determinism is *not* available, Cairn does not fake it. Detecting a "conclusion" in a prose
findings document is irreducibly fuzzy, so the reconcile that scans for unreferenced conclusions
is warn-only, a heuristic count, never a gate. Cairn computes what it can and is honest about what
it cannot — which is itself the determinism principle applied one level up.

---

## 8. The recurring trap: one word, two things

This is the methodological lesson the project kept relearning, and it is worth stating as a
maintainer's heuristic because it will keep happening.

> **Every step forward tended to pack two different things into one word. Splitting the word into
> two sharpened the design, every single time.**

The sequence, in order, was: **platform**, **structured**, **status**, **evidence.**

- **"Platform"** split into *form* vs *unit*. The platform question dissolved once "what do I
  build?" was separated from "what is the atomic unit I share?" (§1).
- **"Structured"** split into *schema* vs *skill* — enforced structure vs wished structure (§4),
  and relatedly into *cause* vs *constrain* (§5).
- **"Status"** split into two orthogonal axes, *freshness* vs *verification*, which must never
  merge into one word (§3, and `03-domain-model.md` §3). Collapsing them is the laundering move.
- **"Evidence"** split into two edge types, *grounding* (claim → data/file/run/external) vs
  *dependency* (claim → claim), which must stay distinct because their cascade and verification
  semantics differ and because conflating them readmits circular reasoning
  (`03-domain-model.md` §2).

The heuristic for the maintainer: **when a single word in the design turns out to mean two
things, split it first, before deciding anything else.** The split almost always reveals that the
two meanings have different rules, and that you were about to apply one meaning's rule to the
other's case. Cairn's whole design is, in a sense, the residue of four such splits. Expect a
fifth. When you find a word doing double duty — and "snapshot identity" nearly was one, before it
was split into *semantic state* (in the id) vs *wall-clock time* (out of the id), see
`06-publish-and-snapshots.md` — treat it as a signal that the design has more to teach you, not
as a nuisance to paper over.

---

## Closing

These eight positions are not independent preferences; they are facets of one stance. The dissolve
gives you the claim as the unit. The claim-as-unit only means anything if its grounding edge is
*hard*, which is the simple-vs-soft line. The grounding only stays honest if freshness is
*computed*, which is determinism-where-possible. The honesty only holds if canonical never
launders into verified, which is the anti-laundering thesis and the two-axes rule. The structure
only survives across amnesiac sessions if it is *enforced*, which is schema-not-skill — but
enforcement alone is empty without something to *cause* claims, which is cause-vs-constrain and
why the skill is a MUST. And the whole design was reached by repeatedly noticing one word doing
two jobs and splitting it. Take any one away and the others lose their point.
