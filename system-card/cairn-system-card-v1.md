# Cairn — System Card (v1, consolidated)

> **This is a single-file consolidation of the modular system card.** It concatenates every
> document under `system-card/` (in reading order) into one continuous reference, for readers and
> tools that prefer a single artifact. The modular files remain the maintained originals; if this
> file and a modular file ever disagree, the modular file is correct. To regenerate this file,
> re-run the consolidation over `system-card/*.md` in the order listed below.
>
> Like the rest of the system card, this document **explains, it does not legislate.** For hard
> facts — terminology, schemas, resolved forks — authority lives in `CONTEXT.md`, then the ADRs in
> `docs/adr/`, then `docs/CONTRACTS.md`.

---

## Table of contents

1. [Cairn — System Card](#cairn--system-card)
2. [01 — What Cairn Is](#01--what-cairn-is)
3. [02 — Philosophy](#02--philosophy)
4. [03 — Domain Model](#03--domain-model)
5. [04 — Architecture](#04--architecture)
6. [05 — Freshness](#05--freshness)
7. [06 — Publish and Snapshots](#06--publish-and-snapshots)
8. [07 — The Agent Loop](#07--the-agent-loop)
9. [08 — Frontend](#08--frontend)
10. [09 — Decisions and Tradeoffs](#09--decisions-and-tradeoffs)
11. [10 — Limitations and Future](#10--limitations-and-future)
12. [Maintaining the System Card](#maintaining-the-system-card)

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/README.md -->

## Cairn — System Card

This folder is the **system card** for Cairn: a long-form, narrative explanation of what
Cairn is, why it is shaped the way it is, and how the system that was actually built embodies
those reasons. It is the durable "why" layer of the repository. Where the other documents are
terse, pointed, or machine-facing, the system card is meant to be *read* — by a human
collaborator picking up the project months later, and (centrally) by a fresh AI coding session
that needs to absorb the whole project quickly and correctly before touching anything.

That second reader is not incidental. Cairn's own thesis is that a fresh session should be able
to orient from a canonical record rather than re-deriving the entire history of a project from
scratch. This system card is the human-and-AI-readable embodiment of that thesis *for Cairn
itself*. If it works, a model handed only this folder should be able to explain Cairn's purpose,
defend its hard constraints, name what it deliberately does not do, and avoid re-litigating
decisions that were already settled — without reading a line of source first.

### What this is, and what it is not

The Cairn repository carries several kinds of documentation, each with a different job. The
system card does not replace any of them; it explains and ties them together.

| Document | Register | Authority |
|---|---|---|
| `CONTEXT.md` | Terse, authoritative glossary + current decisions | **Source of truth** for terminology and resolved decisions |
| `docs/adr/0001–0003` | Point decision records — one fork each, with consequences | **Authoritative** for the specific decision each records |
| `docs/CONTRACTS.md` + `src/types.ts` | The pinned machine contract — exact cross-module shapes | **Authoritative** for data shapes and CLI signatures |
| `docs/BUILD-BRIEF.md` | The buildable spec — "what to build" | Valid, but ADRs/CONTEXT win where they differ |
| `docs/DESIGN.md` | Background reasoning, pre-grilling | Largely valid; superseded by the ADRs where they predate them |
| `docs/ARCHITECTURE.html` | A reviewed visual plan of the layered system | A plan; the as-built source is the truth |
| **`system-card/` (this folder)** | **Long narrative — the WHY** | **Explains; never overrides.** Defers to the above for hard decisions |

The single most important rule for this folder: **the system card explains, it does not
legislate.** When a hard fact (a term, a schema, a resolved fork) is needed, the authority is
`CONTEXT.md`, the ADRs, and `CONTRACTS.md` — in that order. The card narrates the reasoning
around those facts. If the card and one of those documents ever disagree, the card is wrong and
should be corrected. `MAINTENANCE.md` in this folder describes how to keep that discipline.

A second rule worth stating once, because it recurs throughout: this card describes the system
**as actually built**, not merely as originally specced. v1 was specced, built, verified, and
corrected, and several of the most instructive moments are in the gap between the first spec and
the final code. The card tells those stories rather than hiding them. In particular it reflects
four post-build resolutions that a reader of the original brief alone would get wrong:

1. **Published artifacts are canonical-only.** `head.json` and every snapshot contain canonical
   claims and nothing else — not even a draft count. (Decision A; ADR-0001 won over a line in
   the build brief that implied drafts would ride along in `head.json`.)
2. **The share model is immutable snapshots plus a stable mirror.** `publish` writes an
   immutable `snapshots/<id>/` and refreshes a stable `published/latest/` copy. You share the
   `latest/` path once; it always shows the newest publish. (Decision B.)
3. **A snapshot's identity content-addresses the published *view*, which includes computed
   freshness and excludes all timestamps.** This resolved a real and dangerous collision: an
   earlier "exclude everything time-varying" reading would have let a claim that went stale after
   publish keep showing `fresh` on the share link forever — the exact dishonesty Cairn exists to
   prevent. (Decision E / "Option X"; see `06-publish-and-snapshots.md`.)
4. **The site ships as plain Vite + React, not vinext.** The published snapshot is fully static,
   client-rendered, and has no backend; vinext's value is in a server surface that does not exist
   here. (Decision G fallback; see `08-frontend.md`.)

### Reading order

The documents are numbered in the order they are best read straight through, but each stands on
its own and cross-references the others.

1. `01-what-cairn-is.md` — the identity. The shortest path to "what is this thing."
2. `02-philosophy.md` — the deepest document. The intellectual foundations, each as a real
   argument. If you read only one document beyond this README, read this one.
3. `03-domain-model.md` — the conceptual model: claim, lifecycle, the two edge types, the iron
   rule, the two orthogonal axes, the glossary.
4. `04-architecture.md` — the layered system as built, the one-directional flow, the load-bearing
   seam between authoring and projection.
5. `05-freshness.md` — the freshness model in full: fingerprint-the-artifact, the tiers, the
   cascade, frozen-at-publish.
6. `06-publish-and-snapshots.md` — immutability, content-addressing, the diff, and the
   snapshot-identity story told as a worked design lesson.
7. `07-the-agent-loop.md` — the skill and the four-touchpoint protocol; the enforcement model
   stated honestly.
8. `08-frontend.md` — the published projection as a static, no-backend artifact; the vinext→Vite
   story.
9. `09-decisions-and-tradeoffs.md` — the consolidated decision record as narrative: every fork,
   what was chosen, what was given up, and how reversible it is.
10. `10-limitations-and-future.md` — what v1 deliberately is not, the reserved seams, and v2.
11. `MAINTENANCE.md` — how to keep this card alive without letting it become a competing source
    of truth.

### Cairn in two minutes

Cairn is **a read-only canonical projection of a claim graph.** Instead of zipping analysis
results and emailing them, you publish them as *claims*: each claim is one conclusion that
carries an explicit, mandatory link to the evidence it stands on. An AI coding agent (Claude
Code) authors these claims into a local store during normal analysis work — that is the primary
interface, the product is the agent loop, not a GUI. The store's source of truth is plain-text
claim files in git, one tiny file per claim, referencing (never ingesting) the heavy artifacts
that live elsewhere. A CLI is the sole writer; a derived, throwaway SQLite index answers graph
and freshness queries.

Two readers consume the same canonical head. A **collaborator** opens a read-only link — lighter
than opening a zip, no login. A **fresh AI session** reads `head.json` to know instantly "where
we are and what to decide next," which is the cross-session context loss that Cairn exists to
solve. Three hard rules hold the whole thing up: every claim must reach the ground (no claim
rests only on other claims); freshness is *computed* from the evidence fingerprint, never typed
or guessed (`unknown` is a legal, honest state — a false `fresh` is the enemy); and each publish
is an immutable, content-addressed snapshot with a diff against the one before it.

The deepest commitment underneath all of this is **anti-laundering**: publishing makes a record
*canonical* — the agreed current version — never *true*. Canonical is not verified. The machine
that quietly turns an unverified claim into a verified-looking one, just because it went on a
nice page, is exactly what Cairn is built to dismantle. Everything else — the mandatory grounding
edge, the computed freshness, the honest badges, the schema-not-skill discipline — is downstream
of refusing that one laundering move.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/01-what-cairn-is.md -->

## 01 — What Cairn Is

### The one-paragraph version

Cairn is a read-only canonical projection of a claim graph. You do analysis; instead of zipping
the results and mailing them, you record your conclusions as *claims* — each claim a single
sentence that carries a mandatory, explicit link to the evidence it rests on — into a local
store, primarily through an AI coding agent working alongside you. Publishing that store does not
make the claims true; it makes them *canonical*: the agreed-current record. A collaborator reads
it through a static link; a fresh AI session reads the same record to orient instantly. The unit
you share is a claim, not a file, and that single change is the whole of the differentiation.

### The expansive version

To understand Cairn you have to hold two things at once: a very small, almost stubborn technical
core, and a fairly large set of reasons why that core is exactly the right size. The core is
small on purpose. v1 is a CLI, some plain-text files, a throwaway index, a publish step, a static
viewer, and a skill that teaches an agent how to use them. There is no server, no database of
record, no accounts, no sync, no verification engine. What makes Cairn worth describing at length
is not the machinery; it is the set of decisions about *what not to build* and *what to refuse*,
each of which was reached by dissolving a tempting but wrong version of the problem.

The headline phrase — **"a read-only canonical projection of a claim graph"** — is worth taking
apart word by word, because each word was fought for.

- **Claim graph.** The thing Cairn stores is a graph whose nodes are claims (single conclusions)
  and whose edges are of two kinds: a claim can be grounded in evidence (a run, a file, a
  dataset, an external reference), and a claim can depend on another claim. The graph is the
  object; everything else is a view onto it.

- **Projection.** What a reader sees is not the live working store; it is a *projection* of it —
  a selected, frozen, read-only view assembled at publish time. The collaborator's page and the
  fresh session's `head.json` are two projections of one store. Crucially, the projection is
  computed deterministically by the CLI at publish, not assembled live and not assembled by the
  agent. (This last point is load-bearing and is developed in `08-frontend.md`: the agent never
  assembles the published JSON, because if it could, it could fabricate a badge.)

- **Canonical.** Publishing advances a canonical head — the agreed current record, analogous to
  `main` in version control. "Canonical" is a status about *agreement and currency*, never about
  *truth*. This distinction is so central that it gets its own argument in `02-philosophy.md`
  under the anti-laundering thesis. `canonical ≠ verified`, and the two never collapse into one
  word.

- **Read-only.** In v1 the published projection is read-only for the collaborator. There is no
  write-back, no comment thread, no live edit. This is a deliberate ceiling, not an oversight:
  read-only is the lowest-friction recipient experience there is (a link, no login, lighter than
  a zip), and the write-back port is left open for v2 rather than welded shut.

#### The cairn metaphor

The project is named for the literal thing. A cairn is a stack of stones that earlier walkers
ground into a trail so that those who come after know where the path runs, even in fog, even when
the original walker is long gone. The metaphor fits at several joints, and the fit is not
decorative:

- A cairn is **built incrementally, in passing**, by the person actually walking the trail — not
  by a separate documentation team afterward. Cairn-the-tool is authored by the agent *during*
  the analysis, in flow, one cheap call at a time, not as a final write-up step. The whole
  authoring design (soft drafts, low friction) exists to keep this true.

- A cairn is **grounded.** A stack of stones rests on the actual ground; it is not floating. A
  Cairn claim must reach the ground too — following its dependency edges upward has to terminate
  at real evidence, never at another sentence. The iron rule is the metaphor made formal.

- A cairn is **for those who come after.** Its entire value is to a later traveler. Cairn's two
  readers — a collaborator and your own next session — are both "those who come after." The
  fresh-session reader is the one who, in fog, would otherwise have to re-derive the whole route.

- A cairn is **a marker, not a proof.** It says "the path went through here," not "this is the
  best path" or "this path is safe." That is precisely the `canonical ≠ verified` distinction. A
  cairn records that a route was taken and agreed-on; it does not certify it.

The metaphor also tells you what a cairn is *not*: it is not the terrain, not the map, not the
trail authority. It is a lightweight, grounded, incrementally-built marker left for later
readers. Hold that and most of Cairn's design choices feel inevitable.

### What Cairn is NOT

It is easier to keep a small thing small if you are explicit about the larger things it keeps
refusing to become. Each of these was a live temptation at some point in the design.

- **Not a SaaS.** There is no hosted service, no tenancy, no backend write store. The write store
  is local and single-owner. A future Cloudflare Worker may *serve* an immutable snapshot, but
  that is a delivery target for read traffic, not a second place where writes land. Write stays
  local; read can travel.

- **Not a collaboration platform.** No real-time sync, no multiplayer editing, no presence, no
  comment threads. The original framing — "should I build a central collaboration platform to
  stop emailing results?" — was diagnosed as the wrong question and dissolved (see the dissolve
  in `02-philosophy.md`). The collaborator is, deliberately, *just another reader*.

- **Not a notes tool.** This is the sharpest boundary, and the entire differentiation lives on
  it. A notes/document tool lets you store any text in any shape. Cairn does not: the claim →
  evidence grounding edge is mandatory and enforced at the canonical boundary. The instant that
  edge becomes optional, Cairn has rebuilt a generic, crowded notes tool and lost its reason to
  exist. "The unit is a claim, not a file" is the whole game.

- **Not a verification oracle.** Cairn does not check whether your claims are true. v1 stores an
  honest `unverified` default and ships *no* verification machinery. It will tell you, honestly,
  that a claim is unverified and that its evidence is fresh or stale or unreachable. It will never
  tell you the claim is correct. Verification is a reserved v2 axis with its attachment points
  already in the schema (the `external` evidence kind, the verification enum), but unbuilt.

### Two readers, one store

A recurring source of confusion in tools like this is to imagine a "frontend" for humans and a
"backend" for machines as two different systems. Cairn explicitly does not. The collaborator-
facing page and the AI-context `head.json` are **two views of one structured store**. The
collaborator is not privileged over the fresh session, nor vice versa; both read the same
canonical head, projected at the same publish, frozen the same way.

This unification is not just tidy; it is what makes the honesty guarantees hold. Because the same
deterministic projection feeds both readers, a badge a collaborator sees and a freshness state a
fresh session reads are *the same computed value*, not two independently-narrated stories that
could drift. There is exactly one place where freshness is computed (the CLI at publish), one
place where canonical state is selected (the gate at publish), and both readers consume the
output of that single place. The honesty of the system reduces to the determinism of that one
projection.

### Agentic-AI-ready-first: the agent loop is the product

Cairn is **agentic-AI-ready-first.** Its primary interface is the agent loop, not the GUI. This
ordering is a real design commitment with consequences, not a slogan.

The primary actor is an AI coding agent (Claude Code) that, during normal analysis work, authors
claims and reads the canonical head to orient at session start. The skill (`skill/cairn/SKILL.md`)
is the protocol that makes this happen, and it is a *MUST* in the architecture, not an
afterthought: it is the only thing that can *cause* a claim to be written. The CLI can reject a
malformed claim, but it cannot make a claim exist; only the agent, prompted by the skill, does
that. (This cause-versus-constrain split is one of the load-bearing ideas; see `02-philosophy.md`
and `04-architecture.md`.)

Putting the agent first reframes what "good" looks like. The success criterion for v1 is not "a
pretty results browser." A pretty browser proves nothing — it is the easy, impressive-looking,
beside-the-point artifact. The criterion that actually matters is the differentiated moment: *a
fresh session, fed only the canonical head, correctly answers "where are we and what should we
decide next."* That is the dogfood test, the showbook moment, and the reason the project exists.
The GUI is real and was built with care (see `08-frontend.md`), but it is secondary in priority
precisely because it is the part that any tool could have, while the oriented fresh session is
the part that the claim-graph structure uniquely enables.

This is also why the strategic framing in the original design was explicit that Cairn is **work
infrastructure plus a dogfood interface plus a showbook reference, not a product to be judged as a
business.** The target setting has low willingness to pay; judging Cairn by SaaS metrics would
push it back toward the platform it deliberately refused to be. Its value is that it makes a real
workflow honest and that a fresh session can pick up the thread — not that it could be sold.

If you remember one framing from this document, make it this: Cairn is a grounded marker left in
passing for those who come after, authored by the agent in flow, that records what was concluded
and what it rests on — and that is scrupulously honest about the difference between "we agreed
this is current" and "this is true."

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/02-philosophy.md -->

## 02 — Philosophy

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

### 1. The dissolve: the original question was wrong

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

### 2. The claim as the irreducible unit

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

### 3. The anti-laundering thesis

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

### 4. Schema, not skill: structure enforced, not wished

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

### 5. Cause vs constrain: you need both halves

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

### 6. Simple vs soft: edge hard, content soft

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

### 7. Determinism where possible

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

### 8. The recurring trap: one word, two things

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

### Closing

These eight positions are not independent preferences; they are facets of one stance. The dissolve
gives you the claim as the unit. The claim-as-unit only means anything if its grounding edge is
*hard*, which is the simple-vs-soft line. The grounding only stays honest if freshness is
*computed*, which is determinism-where-possible. The honesty only holds if canonical never
launders into verified, which is the anti-laundering thesis and the two-axes rule. The structure
only survives across amnesiac sessions if it is *enforced*, which is schema-not-skill — but
enforcement alone is empty without something to *cause* claims, which is cause-vs-constrain and
why the skill is a MUST. And the whole design was reached by repeatedly noticing one word doing
two jobs and splitting it. Take any one away and the others lose their point.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/03-domain-model.md -->

## 03 — Domain Model

This document describes Cairn's conceptual model — the objects, their relationships, and the laws
that govern them — in depth. It is the bridge between the philosophy (`02-philosophy.md`), which
argues for the model, and the architecture (`04-architecture.md`), which implements it. The
terminology here is exactly the terminology of `CONTEXT.md`; where this document expands on a
term, it never redefines it. `CONTEXT.md` remains the authoritative glossary; a compact glossary
is repeated at the end of this document for convenience.

---

### The claim

A **claim** is the irreducible unit (argued in `02-philosophy.md` §2): one analysis conclusion,
stated in one sentence. On disk it is a single small markdown file with YAML frontmatter, one per
claim, under `cairn/claims/<id>.md`. The frontmatter carries:

- `id` — `claim-YYYYMMDD-NNN`, a date stamp plus a zero-padded per-day counter (allocated by
  `src/store.ts`).
- `text` — the conclusion, one sentence.
- `status` — `draft` or `canonical` (the lifecycle; below).
- `verification` — one of four values on the verification axis (below); v1 always authors
  `unverified`.
- `grounding` — an array of claim → evidence edges.
- `depends_on` — an array of claim → claim edges.
- `created_at` — ISO-8601 with offset.

Note what is **absent**: there is no freshness field. That absence is deliberate and load-bearing
(ADR-0002): freshness is computed at read time, never stored (see `05-freshness.md` and the
determinism principle in `02-philosophy.md` §7). The markdown body below the frontmatter is
freeform notes/caveats and is **unparsed in v1** — Cairn reads it, preserves it on rewrite, but
does not interpret it.

The exact shape is pinned in `src/types.ts` (`ClaimFrontmatter`, `GroundingEdge`, `ClaimFile`)
and `docs/CONTRACTS.md` §1. The card does not restate the schema; it explains it.

---

### The claim lifecycle: draft → canonical

A claim has exactly two on-disk states, and the transition between them is the most important
boundary in the system.

- A **draft** is a claim in the owner's working area. It *may be ungrounded* — it may have zero
  edges. It lives only locally: a draft is **never** read by a collaborator, **never** read by a
  fresh session, **never** written into `head.json`, **never** included in a snapshot. Drafts
  appear only in the local terminal projection (`cairn head`, `cairn drafts`).

- A **canonical** claim is part of the agreed current record. It is always well-founded (it
  satisfies the iron rule). Everything a reader ever sees is canonical.

Promotion from draft to canonical is the **hard gate.** A draft may cross only if it satisfies
the iron rule — at promotion time the recursive reach-ground query is run over the candidate set,
and any claim that cannot reach ground is refused (`src/gate.ts`, `src/publish.ts`). This is the
heart of ADR-0001's "soft authoring with a hard boundary": **softness lives entirely before the
gate; everything past the gate is always well-founded.**

The reason for the split is ergonomic on one side and inviolable on the other. On the draft side,
the agent can capture a conclusion mid-flow — one cheap call — and ground it a moment later,
because that is how an analysis session actually unfolds (you conclude something, *then* you point
at the file). Forcing grounding into the same instant as conclusion (the rejected "atomic
authoring" alternative) adds a friction tax that breeds avoidance, and avoidance is the real
failure mode (claims that never get written at all). On the canonical side, the guarantee to
readers is absolute and unchanged: no ungrounded claim is ever shared.

There is one internal-only third status worth naming because it appears in the code:
`canonical-candidate`. It is **never written to disk.** It is an in-memory marking used by the
gate to flag the set of claims that *would* enter canonical (existing canonical claims, plus
grounded drafts), so the reach-ground query checks them together. It exists only inside one
command's execution and is discarded with the throwaway index.

---

### The two edge types

A claim may carry two kinds of edge, and keeping them **distinct types** is one of the four word-
splits from `02-philosophy.md` §8 (the "evidence" split).

- A **grounding edge** points from a claim to a piece of evidence: a run, a file, a dataset, or
  an external reference. It is the claim's feet on the ground. Each grounding edge carries a
  `kind`, a `ref` (logical handle), a `fingerprint` (stamped at authoring), a `method` (how to
  re-fingerprint), and a `location` (where to re-fingerprint from). Grounding edges are what make
  freshness computable.

- A **dependency edge** points from a claim to *another claim*: this conclusion stands on that
  one's shoulders. It is just the target claim's id. A dependency edge does **not** count as
  grounding.

#### Why they must stay distinct

It would be tempting to model both as "the things a claim points at" and treat them uniformly.
That would be a serious mistake, for three independent reasons:

1. **Cascade differs.** When an *upstream claim* goes stale, this claim's justification is
   undermined — staleness propagates down the dependency graph (justification propagation). When
   the *underlying data* of a grounding edge changes, this specific claim is flagged for review —
   a different trigger with a different meaning. The dependency cascade and the grounding change
   are not the same event and must not be handled by one rule. (The freshness cascade in
   `05-freshness.md` implements exactly this asymmetry: a claim is stale if any of its *own*
   grounding edges changed **or** any claim it depends on is stale.)

2. **Verification differs.** A claim grounded in data can be checked independently against that
   data (the v2 verification axis attaches here). A claim that only *depends on* other claims
   cannot be independently checked — it merely *inherits* the verification status of what it
   stands on. Conflating the edge types would erase the distinction between "checkable against
   reality" and "only as good as its premises."

3. **Circular reasoning.** This is the decisive one. If a claim → claim edge counted as
   grounding, then two claims could support *each other* in a loop while nothing in the loop ever
   touched reality. That is circular reasoning wearing a provenance costume — the exact failure
   the iron rule exists to prevent. By refusing to let dependency edges count as grounding, Cairn
   makes circularity structurally unable to masquerade as well-foundedness. A cycle, having no
   path to real ground, simply never reaches ground, and the gate catches it.

---

### The iron rule (well-founded)

The central guarantee. Stated formally:

> **Every claim has ≥1 edge, and following dependency edges upward must terminate at ≥1 non-claim
> grounding (a run / file / data / external reference). A claim that cannot reach ground may not
> enter the canonical head and may not be shared.**

Stated intuitively:

> *The chain can be long, but its end must be solid ground, not another sentence.*

The rule blocks circular reasoning (a cycle never reaches ground) and rootless chains (a tower of
claims depending on claims, none of which ever touches data). It is **enforced at the
draft→canonical boundary**, not at write time (ADR-0001) — a draft may transiently violate it,
but nothing violating it is ever promoted or shared.

Mechanically, "reaches ground" is a graph-reachability question, not a column constraint, so it
is answered by a recursive query over the derived index (`src/gate.ts`, `docs/CONTRACTS.md` §6):

```sql
WITH RECURSIVE grounded(id) AS (
  SELECT DISTINCT claim_id FROM claim_evidence
  UNION
  SELECT d.claim_id FROM claim_dep d JOIN grounded g ON d.depends_on = g.id
)
SELECT id FROM claim
WHERE status = 'canonical-candidate' AND id NOT IN (SELECT id FROM grounded);  -- must be EMPTY
```

A claim is in the `grounded` set if it has a direct grounding edge, or it transitively depends on
something that is grounded. Any canonical-candidate *not* in that set is an offender: it cannot
reach ground. Cycles never enter `grounded` (the recursion only adds a claim when one of its
dependencies is *already* grounded, which a pure cycle never achieves), so they surface here as
offenders — circular reasoning caught by the same query that catches rootless chains, with no
special-casing. The acceptance test (`tests/acceptance.sh` step 9) exercises exactly this: a
canonical claim depending only on an ungrounded draft fails `validate` with the offender named.

---

### The two orthogonal axes

A claim carries two independent status axes, and **the law is that they never merge into one
word** (the "status" split from `02-philosophy.md` §8; the anti-laundering thesis in §3).

| Axis | Values | Source | v1 |
|---|---|---|---|
| **Freshness** | `fresh` / `stale` / `unknown` | Computed from the evidence fingerprint (ADR-0002) | Built — computed, never typed |
| **Verification** | `unverified` / `verified` / `contradicted` / `unverifiable` | A claim checked against an external oracle | Honest default only; machinery is v2 |

The two answer entirely different questions:

- **Freshness** answers: *has the thing this claim rests on changed since I claimed it?* It is
  about the *currency* of the evidence. It is deterministic and computed (`05-freshness.md`).
  `unknown` is a legal, honest state — when the artifact is unreachable or only self-reported,
  Cairn says `unknown`, never a false `fresh`.

- **Verification** answers: *is this claim actually correct?* It is about *truth*, checked against
  some external oracle or reference. It is **not** deterministic from the artifact alone, which is
  why v1 ships none of the machinery and stores only the honest `unverified` default.
  `unverifiable` is a legal, honest state on this axis, parallel to `unknown` on the freshness
  axis.

A claim can be `fresh` and `unverified` simultaneously — and almost every v1 claim is exactly
that. "Fresh" means the CSV has not changed; it says nothing about whether your conclusion from
that CSV is right. Collapsing the two axes into a single "status" word would let `fresh` be
misread as `good`, which is the laundering move the whole project refuses. The viewer enforces the
separation visually: freshness and verification are two distinct badges, and verification is shown
in one neutral style for all its values so `unverified` is never dressed to look settled
(`site/src/components/Badges.tsx`).

(One note on a stale-looking source: an early table in `docs/DESIGN.md` §2 lists the verification
values without `unverifiable` and describes freshness as deriving "from the compute DAG." Both
are superseded — by `CONTEXT.md`/`src/types.ts` for the four-value enum, and by ADR-0002 for the
fingerprint-based freshness. The as-built truth is the four-value verification enum and
fingerprint-derived freshness.)

---

### Evidence kinds

A grounding edge's `kind` is one of four, and each maps to a default fingerprint method
(`src/fingerprint.ts`, `docs/CONTRACTS.md` §8):

- **`target`** — the output of a pipeline step (targets). Method `pipeline-meta`: read the content
  hash from the pipeline's meta store (`_targets/meta/meta`). Top tier — rigorous and free,
  because the pipeline already maintains the hash for its own memoization.
- **`file`** — a loose result file on local disk (a CSV, a saved model object, a figure). Method
  `sha256`: hash the file directly. Mid tier.
- **`data`** — a dataset; treated as a local file (`sha256`) when reachable, else as a remote
  artifact (`remote-md5`/`unknown`).
- **`external`** — an artifact on a remote host (HPC: OSC, vp03). Method `remote-md5`: the agent
  runs `ssh <host> md5sum` in-session; unreachable → `unknown`. A lower, self-reported tier.

#### Why `external` is its own type even in v1

The verification machinery is deferred to v2, so it is reasonable to ask why `external` needs to
be a distinct evidence kind now rather than being folded into `data`. The answer is that **the
external-reference edge is the attachment point for the v2 verification layer.** A claim grounded
in an external public reference (a dataset, a published result, a DOI) is the kind of claim a v2
verifier/oracle would check against a curated reference. By giving `external` its own type now —
even when, in v1, it is "just a string" plus a remote fingerprint — Cairn reserves the seam where
verification will attach, without building any of it. This is the same "reserve the seam, build
none of it" discipline that governs the meeting layer and hooks (`10-limitations-and-future.md`).
Folding `external` into `data` would have saved nothing in v1 and would have closed the door v2
needs open.

---

### Glossary

This restates the authoritative `CONTEXT.md` terms for convenience. If this and `CONTEXT.md`
disagree, `CONTEXT.md` is correct.

- **Owner** — the person who runs the analysis and owns the local store. Single owner, local-first.
- **Agent** — the AI coding harness (Claude Code) the owner works through. The primary *writer* of
  claims and a *reader* of the canonical head at session start.
- **Collaborator** — receives a read-only published projection. Read-only in v1.
- **Fresh session** — a new agent session that reads the canonical head to orient instantly.
- **Claim** — one analysis conclusion: text, a verification status, and edges.
- **Claim lifecycle** — `draft → canonical`. Drafts may be ungrounded and live only locally;
  promotion to canonical is the hard, iron-rule gate.
- **Evidence** — a piece of grounding: a run, a file, a dataset, or an external reference.
- **Grounding edge** — `claim → evidence`. The claim's feet on the ground.
- **Dependency edge** — `claim → claim`. Standing on another's shoulders. Does *not* ground.
- **Iron rule (well-founded)** — every claim has ≥1 edge and must reach real ground; enforced at
  the draft→canonical boundary. Blocks circular reasoning.
- **Freshness** — `fresh` / `stale` / `unknown`. Computed from the evidence fingerprint, never
  stored. A false `fresh` is the enemy.
- **Fingerprint** — a recorded signature of an evidence artifact, stamped at authoring; quality is
  tiered and shown on the badge.
- **Verification** — `unverified` / `verified` / `contradicted` / `unverifiable`. A separate axis
  from freshness; v1 stores the honest default only.
- **Canonical head** — the current agreed record. Publishing advances it.
- **Snapshot** — an immutable, content-addressed freeze of the canonical head at one publish.
- **`canonical ≠ verified`** — publishing makes a version agreed-current, never true.
- **Compute node** — optional metadata about how an artifact was produced; demoted, *not* the
  freshness backbone.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/04-architecture.md -->

## 04 — Architecture

This document describes the layered system as it was actually built: the pieces, the single
direction in which data flows through them, and the one structural seam that makes the honesty
guarantees hold. The conceptual model it implements is in `03-domain-model.md`; the philosophy
that justifies the shape is in `02-philosophy.md`. Source files are referenced by path throughout
so a reader can jump straight to the code.

The visual plan in `docs/ARCHITECTURE.html` was reviewed before the build and is largely faithful
to what shipped; the two places it differs from the as-built system (the frontend stack, and the
snapshot-id correction) are noted where they arise and told in full in `08-frontend.md` and
`06-publish-and-snapshots.md`.

---

### The eight pieces

Cairn v1 is eight pieces with one direction of flow. Reading top to bottom is reading the path a
conclusion takes from "the agent decided something" to "two readers can see it."

1. **Agent (Claude Code)** — the primary actor. It does the analysis and, prompted by the skill,
   authors claims. It is the only thing that can *cause* a claim to exist. It is also a *reader*:
   at session start it reads the canonical head to orient.

2. **Skill — the protocol** (`skill/cairn/SKILL.md`). A markdown capability injection that teaches
   the agent the four-touchpoint loop (orient → author → refresh → publish). It causes writes; it
   cannot enforce anything (cause vs constrain, `02-philosophy.md` §5). Detailed in
   `07-the-agent-loop.md`.

3. **CLI — the sole writer** (`src/cli.ts`). The *only* write path into the store. Eight verbs:
   `head`, `add-claim`, `ground`, `refresh`, `validate`, `publish`, `drafts`, `status`. It does
   the structural checks the files cannot express, stamps fingerprints, runs the gate, and
   performs publish. Deterministic and auditable.

4. **Claim files in git — the source of truth** (`cairn/claims/*.md`, parsed by
   `src/claimfile.ts`, managed by `src/store.ts`). One tiny markdown+frontmatter file per claim.
   Text-only forever: a claim *references* its evidence by path + fingerprint and never ingests
   the bytes. Changes show up in `git diff` for free (ADR-0003).

5. **Evidence artifacts** — the heavy things (results tables, model objects, figures, remote HPC
   outputs). These live wherever they already live — gitignored, on an external volume, on a
   remote host. Cairn never copies them into the store; it only records a reference and a
   fingerprint. This is what keeps the store text-tiny regardless of project size.

6. **SQLite — the derived index** (`src/index.ts`, `bun:sqlite`, in-memory). Rebuilt on demand
   from the claim files, used for the recursive reach-ground query (`src/gate.ts`), freshness, and
   diffs. **Never a source of truth, never committed, discarded after each command.**

7. **Publish → immutable snapshot** (`src/publish.ts`, `src/snapshot.ts`). A content-addressed
   freeze of the canonical head plus a diff against the previous snapshot, with the prebuilt static
   site copied in. Detailed in `06-publish-and-snapshots.md`.

8. **The two readers** — the collaborator (the static site, `08-frontend.md`) and the fresh agent
   session (`head.json`). Both consume the output of the single publish projection.

The supporting modules round out the core: `src/fingerprint.ts` (compute/recompute an edge's
fingerprint by method), `src/freshness.ts` (combine edge states into per-claim freshness with the
cascade), `src/reconcile.ts` (the warn-only reconcile), and `src/types.ts` (the pinned shared
contract, mirrored in `docs/CONTRACTS.md`).

---

### One direction of flow

The pieces form a pipeline, and the pipeline runs one way:

```
Agent ──> Skill ──> CLI ──> claim files (git, source of truth)
                              │ references (path + fingerprint)
                              ▼
                       evidence artifacts (never ingested)
                              │
        CLI rebuilds on demand ▼
                       SQLite (derived index)
                              │
                          publish
                              ▼
                   immutable snapshot  +  diff
                         ┌────┴────┐
                         ▼         ▼
                  collaborator   fresh agent session
                   (static site)  (head.json)
```

The single direction matters. Nothing downstream writes back upstream within a publish: the site
never writes claim files, the snapshot never mutates the store, the index never becomes truth. The
only writer to the source of truth is the CLI, and it writes *before* projecting. This is what
lets the system reason about its own honesty: there is exactly one path that produces a published
view, and it is deterministic.

---

### The load-bearing seam: continuous authoring vs batch projection

The single most important structural fact about Cairn is the seam between two regimes that
operate on completely different rhythms:

- **Authoring is interactive and continuous.** The agent writes claims throughout a session, one
  cheap call at a time, in flow. This half is conversational, incremental, soft (drafts allowed),
  and never blocks. It happens many times per session.

- **Projection is a deterministic batch.** At `publish`, the CLI runs the gate, promotes grounded
  drafts, computes freshness, content-addresses the view, freezes a snapshot, and writes the
  diff — all at once, deterministically, from the current state of the claim files. This half is
  atomic, computed, hard (the gate blocks), and happens rarely (only when you share).

The web app — and the fresh-session reader — **only ever read frozen batch output.** They never
participate in authoring. They never compute anything live. The collaborator's page fetches
`head.json` and renders it verbatim; the fresh session reads `head.json` and orients. Neither ever
sees a draft, a live freshness recomputation, or a mid-authoring state.

This seam is why the deeper point in `08-frontend.md` holds — *there is no backend.* "Frontend/
backend communication" in Cairn is just a static fetch of `./data/head.json` and `./data/diff.json`
that the CLI assembled deterministically at publish time. The agent never assembles that JSON. If
it could, it could fabricate a badge — narrate a `fresh` that the fingerprint does not support —
and that is the laundering the whole project dismantles (`02-philosophy.md` §3). By putting
projection entirely in the deterministic batch and keeping the agent on the *authoring* side of
the seam, Cairn structurally prevents the agent from being the one who decides what a reader sees
about freshness. The CLI computes it from the artifacts; the agent only supplies the claim and the
reference.

---

### Files as truth, SQLite as derived index

ADR-0003 relocated the source of truth from a database to plain-text files in git, with SQLite
demoted to a derived index. The reasoning is worth restating because it is counterintuitive: the
fear that drove "SQLite as truth" was large files in git, and that fear dissolved on inspection.

A real multi-gigabyte analysis project was examined. Its weight was entirely in *artifacts* —
data directories, results directories, a pipeline cache, figures — every one of which was already
gitignored. Tracked big files: zero. The `.git` directory was large only from legacy history
bloat, not current tracking. And the project already kept a hundreds-of-KB findings document by
hand — a proto-claim store. The conclusion: claims are text and tiny; artifacts are heavy and
referenced, never ingested; so files-in-git is not only viable but *better*, because it gives
`git diff` review of claim changes for free and makes the snapshot future (files end to end)
portable to a Cloudflare Worker as a delivery change rather than a rewrite.

So in the as-built system:

- The **claim files** are authoritative. `src/store.ts` reads and writes them; `src/claimfile.ts`
  parses and validates them. They are the only thing that survives between commands.
- The **SQLite index** (`src/index.ts`) is built fresh in memory from the claim files whenever a
  command needs graph queries, used, and thrown away. It is never the truth and never committed.
  Its tables (`claim`, `claim_evidence`, `claim_dep`) exist only to make the reach-ground CTE and
  freshness/diff queries convenient.

A claim file can be malformed and sit on disk — but `src/claimfile.ts` will reject it on parse,
and even a well-formed-but-ungrounded claim cannot reach canonical, so it cannot hide and cannot
be shared. The malformation is visible (in `git diff`, in the parse error) and bounded (it never
crosses the gate). This is the "soft before the gate, hard at the gate" discipline applied to
storage.

---

### Where the hard floor actually lives

A natural assumption is that the integrity guarantees come from database constraints — foreign
keys, CHECK clauses, NOT NULL. In an earlier design (SQLite-as-truth) they would have. In the
as-built system, because the database is *derived and throwaway*, that is **not** where the hard
floor lives. The floor relocated (ADR-0003), and it is important to know where it actually is, or
you will look for enforcement in the wrong place.

The hard floor is three things together:

1. **The CLI as sole writer** (`src/cli.ts`). There is exactly one program that can put bytes into
   a claim file. The skill tells the agent to *never hand-edit* `cairn/claims/` (and the skill
   says so explicitly), so every write goes through code that stamps the structure correctly. One
   write path means one place where invariants are established.

2. **The `validate`/publish gate** (`src/gate.ts`, run by `src/cli.ts` `cmdValidate` and
   `src/publish.ts`). The reach-ground query is the iron rule made executable. It runs over the
   derived index at the draft→canonical boundary and refuses to promote (and blocks publish, exit
   code 3) if any candidate cannot reach ground. This is the schema saying *no* — not the agent
   choosing care. The negative path is tested (`tests/acceptance.sh` step 9).

3. **Git-diff visibility.** Because claims are text files in git, every change to a claim is a
   reviewable diff. Nothing changes silently. This is the collaboration/disagreement surface for
   free, and it is also the backstop for everything the gate cannot hard-enforce: a lapse that the
   warn-only layers only *report* still shows up in version control.

The `bun:sqlite` index does set `PRAGMA foreign_keys = ON` and uses NOT NULL columns
(`src/index.ts`), but those are hygiene on a throwaway structure, not the system's guarantee. The
guarantee is sole-writer CLI + gate + git visibility. The cost of this relocation — that
enforcement is at the CLI/gate layer rather than in unbypassable DB constraints — is accepted
explicitly in ADR-0003 and mitigated by exactly those three mechanisms.

---

### Discovery and the host root

One operational detail with design weight: there is **no `init` verb.** The CLI discovers the
store by walking up from the current directory looking for a `cairn/` directory that contains a
`claims/` directory (`findStore` in `src/store.ts`). The directory *containing* `cairn/` is the
**host root**, and all evidence paths are relative to it (decision D). The first write
auto-creates `cairn/claims/`. This means an agent can start authoring immediately, from anywhere
inside a host project, with zero setup — which is exactly the low-friction property the authoring
design depends on. Host-root-relative paths (rather than cwd-relative) make re-fingerprinting
location-independent: a claim grounded from a subdirectory re-checks correctly from anywhere in
the project, because the path is anchored to the project root, not to wherever the agent happened
to be standing.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/05-freshness.md -->

## 05 — Freshness

Freshness is the axis that keeps the canonical record honest *over time*. A claim was true-enough
to write when you wrote it; the question freshness answers is whether the thing it rests on has
changed since. This document explains the freshness model in full: why it fingerprints the
artifact rather than hashing the process, the tier system, the exact cascade semantics, and the
frozen-at-publish behavior. It implements the determinism principle from `02-philosophy.md` §7 and
the freshness axis from `03-domain-model.md`. The code is in `src/freshness.ts` and
`src/fingerprint.ts`; the decision is ADR-0002 (`docs/adr/0002-freshness-by-evidence-fingerprint.md`).

---

### Why fingerprint the artifact, not hash the process

The first instinct for "did this claim's basis change?" is to hash the *computation* — either
consume a pipeline tool's DAG hashes (targets, snakemake) or wrap execution (`cairn run -- <cmd>`)
and hash the inputs and outputs. Both are cleaner-sounding than what Cairn does. Both were tried
and both broke against the real environment.

The real environment is the deciding constraint, and it is worth stating plainly because it is
unusual: compute runs **mostly through the agent directly** — sometimes via targets, sometimes
not, sometimes Python, sometimes a one-off script — and **often on remote HPC** (OSC, vp03). In
that world:

- **Consuming the pipeline DAG covers only a minority of the work.** Most conclusions did not go
  through targets. A freshness mechanism that only works for targets-managed steps would leave the
  majority of claims with no freshness signal at all.

- **Wrapping execution cannot capture remote/async jobs.** When the local command is literally
  `ssh host 'sbatch job.sh'`, wrapping that command hashes nothing real — the actual computation
  happens elsewhere, later, asynchronously. The wrapper would record a hash of a submission, not
  of a result.

- **Both fail *hard* when forgotten.** Process-hashing requires the owner to remember to invoke
  the special wrapper or to have used the pipeline. The environment *guarantees* lapses — the
  whole point of the system is to survive discipline failures, not depend on them. A
  process-hashing scheme that the owner forgot to use yields *no freshness at all*, silently.

So the decision (ADR-0002): **derive freshness from a fingerprint of the evidence artifact the
claim points at, not from the compute process.** Stamp a signature of the *output artifact* at
authoring; recompute and compare at read time. This depends only on the artifact's footprint, not
on how or where it was produced, so the targets-vs-`run`-vs-manual fork simply dissolves. And it
**degrades gracefully**: when the owner forgets discipline, or the artifact is unreachable, Cairn
records `unknown` — never a silent wrong `fresh`. Degrading to an honest "I can't check this" is
the correct behavior, not a failure mode (`02-philosophy.md` §3, "a false `fresh` is the enemy").

The compute node — metadata about *how* an artifact was produced — is correspondingly **demoted**:
it is optional metadata, not the freshness backbone. When a pipeline tool is present, it is not
wasted; it simply becomes the *best fingerprint source* (top tier, and free, since the pipeline
already maintains the hash for its own memoization). When absent, Cairn still works.

---

### The tiers

A fingerprint's quality is not uniform, and Cairn refuses to pretend it is. Every fingerprint
carries a **method**, which maps to a display **tier**, and the tier always travels with the badge
(`METHOD_TIER` and `TIER_ORDER` in `src/types.ts`; `src/fingerprint.ts` computes each method):

| Method | Source | Tier | Rigor |
|---|---|---|---|
| `pipeline-meta` | The pipeline tool's content hash, read from `_targets/meta/meta` | `pipeline` | Top — rigorous, and free |
| `sha256` | Direct content hash of a loose local file | `content` | Mid — a real content hash |
| `remote-md5` | The agent runs `md5sum` on a remote host in-session via ssh | `remote` | Lower — self-reported, remote |
| `size-mtime` | Size + mtime signature, a weak fallback | `weak` | Lowest — heuristic, not content |

The ordering best→worst is `[pipeline, content, remote, weak]`. A claim with multiple grounding
edges shows the **best** tier among them (`bestTier` in `src/freshness.ts`), but the tier is
**always shown, never flattened** — an `unknown` is rendered as `unknown`, and a weak tier is
labeled weak. The point is that a reader should always be able to see *how much to trust* the
freshness verdict, not just the verdict. A `fresh` backed by a pipeline content hash and a `fresh`
backed by size+mtime are both "fresh," but they are not equally trustworthy, and the tier says so.

The fingerprint is **stamped at authoring** and the operator never types it. `src/fingerprint.ts`
`stampEdge` chooses the method from the evidence kind and computes the signature immediately. If
the artifact is unreachable at stamp time, the stamp is honestly recorded as the literal
`"unknown"` — the only case where `"unknown"` is allowed as a stored fingerprint
(`docs/CONTRACTS.md` §1).

#### The remote path, concretely

For remote artifacts, `remoteMd5` (`src/fingerprint.ts`) runs `ssh <remote_host> md5sum <path>`
with a short timeout and `BatchMode=yes` (no interactive prompts). The host comes from
`config.remote_host` in `cairn/config.json` (with a legacy `host:path` ref form accepted when no
host is configured). Any failure — host unreachable, ssh error, no `md5sum`, a non-hash response —
returns `unknown`. This is the most failure-prone fingerprint path by nature, and it is the one
where degrading to `unknown` matters most: HPC hosts go down, VPNs drop, jobs move. `unknown` on a
remote artifact is correct, not a bug. (Wiring `config.remote_host` through the remote-md5 path was
one of the post-build fixes; see commit `dfeafa0` and `09-decisions-and-tradeoffs.md`.)

---

### The cascade, precisely

Per-claim freshness combines two things: the states of the claim's own grounding edges, and the
freshness of the claims it depends on. The exact rule (`src/freshness.ts`, `docs/CONTRACTS.md` §9):

**Per edge** (`edgeState`): re-fingerprint by method and compare to the stamp.
- `unknown` if the stamped fingerprint was `"unknown"`, or the recompute returns `unknown`
  (unreachable now);
- `stale` if the recomputed fingerprint differs from the stamp;
- `fresh` if it matches.

**Per claim** — combine the edge states into the claim's own (pre-cascade) state (`selfState`):
- `stale` if **any** grounding edge is stale;
- else `unknown` if **any** grounding edge is unknown;
- else `fresh`.

**Then the dependency cascade**: a claim is also `stale` if **any** claim it depends on is stale.

Composing these gives the precedence the architecture plan states succinctly: **a claim is stale
if any of its own grounding edges changed OR any dependency is stale; else unknown if any edge is
unknown; else fresh. Stale wins over unknown.** "Stale wins over unknown" is the right asymmetry:
if we *know* something changed, that is a stronger and more important signal than "we couldn't
check something else," and the reader needs to see the definite problem.

#### Why the cascade is a fixpoint, not a recursive DFS

The implementation detail here is subtle and was a real bug fix (commit `489b904`), so it is worth
explaining rather than glossing. A naive cascade would be a memoized depth-first search: to decide
if claim A is stale, recurse into its dependencies, memoizing results. That breaks on **dependency
cycles**: when the DFS re-enters a node already "in progress," it has to return *something*, and
whatever it returns can cause a claim that genuinely (transitively) depends on a stale node to be
reported `fresh` — and worse, the answer can depend on traversal order. Under-reporting staleness
is exactly the false-`fresh` failure the project exists to prevent, so a cycle-induced false
`fresh` is unacceptable.

`src/freshness.ts` instead resolves the cascade to a **fixpoint** by forward-propagating
staleness. It starts each claim at its own pre-cascade state, then repeatedly: any claim not
already stale becomes stale if *any* of its in-set dependencies is stale. It iterates until a full
pass changes nothing. This is **monotone** — states only ever move *toward* stale, never away — so
it terminates in at most N passes regardless of cycles, and any claim transitively reachable to a
stale node becomes stale even inside a dependency cycle. The result is both cycle-safe and
order-independent. The design choice that makes this safe is also a value statement encoded in a
comment: cascade only propagates *stale*, never *fresh* — "the enemy is a false `fresh`, never a
false `stale`." Over-reporting staleness is conservative and honest; under-reporting it is the
dishonesty the system forbids.

A dependency edge pointing *outside* the current claim set is ignored for cascade purposes — it
cannot make a claim stale on its own (you cannot judge the freshness of a claim you do not have).
This is consistent with the iron rule's reach-ground semantics, which also only follow in-set
edges.

---

### Frozen at publish, labeled honestly

There are two distinct moments freshness is computed, and they behave differently on purpose:

- **Live, at the local terminal.** `cairn head` and `cairn refresh` compute freshness *now*
  (`as_of = now`) against the current state of the artifacts and print it. This is the owner's
  working view — it should be live, because the owner is actively changing things and wants the
  current truth. `refresh` is the touchpoint the agent runs after any rerun to surface
  newly-stale claims (`07-the-agent-loop.md`).

- **Frozen, at publish.** `cairn publish` computes freshness once, stamps `as_of = published_at`
  on every claim, writes it into `head.json`, and the published view **never recomputes**
  (decision C). The collaborator's site renders the frozen values verbatim and labels every badge
  "as of `<published_at>`" (`site/src/components/Badges.tsx`, `site/src/App.tsx`). A frozen `fresh`
  is therefore never read as a live `fresh`: it always carries its timestamp, so the reader knows
  it means "fresh as of when this was published," not "fresh right now."

Freezing is the honest choice for a *shared, immutable* artifact. A snapshot is a frozen record of
what was true at one publish; recomputing freshness on the collaborator's machine later would make
the snapshot mutable and would depend on the collaborator being able to reach the artifacts (they
usually cannot — the artifacts are on the owner's disk or a remote host). So the published
freshness is frozen, stamped, and labeled. The honesty is preserved not by keeping it live but by
making its as-of explicit.

This frozen-at-publish behavior is also what makes the snapshot-identity story in
`06-publish-and-snapshots.md` necessary and subtle: because the *published* freshness is frozen,
the *only* way a corrected freshness reaches the share link after an artifact changes is for the
new freshness to force a new snapshot. That is exactly why computed freshness is folded into
snapshot identity — so that a freshness-only change produces a new immutable snapshot rather than
silently re-serving the old, now-dishonest, `fresh` badge. Freshness being frozen and freshness
being part of snapshot identity are two halves of the same honesty requirement.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/06-publish-and-snapshots.md -->

## 06 — Publish and Snapshots

Publishing is where the continuous, soft, local authoring half of Cairn meets the deterministic,
hard, frozen projection half (the load-bearing seam, `04-architecture.md`). This document covers
what `publish` does, what immutability and content-addressing mean here, how the diff works, and —
at length, because it is one of the most instructive moments in the project — exactly *what a
snapshot's identity content-addresses* and why getting that wrong would have reintroduced the
dishonesty Cairn exists to prevent. The code is `src/publish.ts` and `src/snapshot.ts`; the
decisions are A, B, C, E, F in `docs/CONTRACTS.md`.

---

### What publish does

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

### Immutability and the two readers' artifacts

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

### head.json is selected state, not a transcript

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

### The diff

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

### The snapshot-identity story (the most instructive moment)

This is the subtle one. It is worth telling in full, as a worked design lesson, because it is the
clearest case in the project of the anti-laundering thesis catching a bug in Cairn's *own*
implementation — and because the resolution involved splitting one more word in two (the recurring
trap, `02-philosophy.md` §8).

#### What a snapshot id is supposed to be

A snapshot is content-addressed: its id is a short hash of its content, so the same content always
produces the same id (idempotent republish) and different content produces a different id. The
question that turned out to matter enormously is: **content-addressed over *what*, exactly?**

#### The collision

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

#### The resolution (decision E / "Option X")

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

### The share model: stable latest + immutable history

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

### The warn-only reconcile: forgetting made visible, not prevented

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

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/07-the-agent-loop.md -->

## 07 — The Agent Loop

Cairn is agentic-AI-ready-first: the agent loop is the product, not the GUI (`01-what-cairn-is.md`).
This document describes the loop itself — the skill, the four touchpoints, why low-friction
authoring is the central anti-forgetting mechanism, and, stated honestly, exactly how much
enforcement v1 actually provides versus what it merely makes visible. The skill is
`skill/cairn/SKILL.md`; the enforcement model is pinned in `CONTEXT.md` ("Enforcement model (v1):
make lapses visible, don't pretend they were prevented").

---

### The skill is the cause

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

### The four touchpoints

The skill teaches a four-touchpoint loop. Each maps to CLI verbs (`src/cli.ts`) and each has a
distinct job in the rhythm of a real analysis session.

#### 1. Orient — at session start

```
cairn head
```

Read the canonical claims (with live-computed freshness and verification) and the pending drafts
*before acting*, so you do not re-derive or contradict what is already concluded. This is the
touchpoint that makes the fresh-session story real: a new session lands oriented because the first
thing it does is read the agreed-current record. The skill also suggests `cairn drafts` to see
loose ungrounded threads worth resolving. Orientation is a read; it does not change claim files.

#### 2. Author — the moment you conclude anything

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

#### 3. Refresh — after any rerun

```
cairn refresh
```

After `tar_make()`, a re-executed pipeline, regenerated outputs, a re-fit model — anything that may
have changed an artifact a claim points at — recompute freshness and **surface newly-stale claims
to the owner by name.** This is the touchpoint that keeps the canonical record honest as the work
moves under it. It re-fingerprints reachable artifacts; unreachable → `unknown` (`05-freshness.md`).

#### 4. Publish — before sharing

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

### Low-friction authoring is the anti-forgetting mechanism

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

### The enforcement model, stated honestly

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

#### What closes the gap: hooks, in v2

The real anti-forgetting hardening is deferred to v2: **Claude Code lifecycle hooks** that nudge or
block without relying on the agent's goodwill. A hook fires on a harness lifecycle event regardless
of whether the agent "remembered" — so it can prompt "you concluded something; capture it" or gate
a share on the reconcile, independent of the skill firing. That is genuine enforcement on the
authoring side, and it is exactly the kind of thing that can only live in the harness, not in a
markdown skill. v1 deliberately ships only the skill as its authoring driver and reserves hooks for
v2 (`CONTEXT.md`, `docs/BUILD-BRIEF.md`, `10-limitations-and-future.md`). Naming this ceiling
explicitly — rather than implying v1 prevents forgetting — is itself an instance of the project's
honesty commitment.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/08-frontend.md -->

## 08 — Frontend

The published projection — the collaborator-facing page — is real and was built with care, but it
is secondary in priority to the agent loop (`01-what-cairn-is.md`), and understanding *why* it is
shaped the way it is matters more than its visual polish. The deepest fact about the frontend is
the one easiest to miss: **there is no backend.** This document explains the no-backend data flow,
tells the vinext-versus-Vite story honestly, describes the design intent, and explains why the
whole thing ports to a future Cloudflare Worker as a delivery change rather than a rewrite. The code
is under `site/`; the relevant decisions are C, F, and G in `docs/CONTRACTS.md`.

---

### There is no backend

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

### The vinext-versus-Vite story

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

### Design intent

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

### Portability to a Worker is a delivery change, not a rewrite

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

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/09-decisions-and-tradeoffs.md -->

## 09 — Decisions and Tradeoffs

This document is the consolidated decision record as narrative. The authoritative point records are
the three ADRs (`docs/adr/`) and the resolved decisions A–G in `docs/CONTRACTS.md`; this document
does not replace them, it connects them — telling, for each significant fork, what the alternatives
were, what was chosen, why, what was given up, and how reversible the choice is. Reversibility is
called out deliberately, because a v1 built to be honest about its ceilings should also be honest
about which of its decisions are load-bearing-forever and which are merely current.

Read the ADRs for the canonical reasoning; read this for how the decisions hang together and what
each one costs.

---

### The three ADRs

#### ADR-0001 — Soft authoring via draft claims

**The fork.** *When* is the iron rule enforced relative to authoring? Either **atomic authoring**
(`add-claim` refuses to create a claim without an edge in the same call — the store is never even
transiently ungrounded) or **soft authoring** (a claim may be born bare as a draft and grounded
later).

**Chosen.** Soft authoring with a hard boundary. Drafts may be ungrounded; they live only in the
working area and never reach a reader; promotion to canonical is the hard, iron-rule gate.

**Why.** Atomic is the stronger invariant but adds friction to the agent's flow — it forces
recording edges at the instant of concluding, and forces recording a depended-on claim before the
claim that depends on it. That friction breeds avoidance, and avoidance (claims never written) is
the real failure mode (`07-the-agent-loop.md`). Soft authoring buys the low-friction capture that
keeps claims getting written, without weakening any reader's guarantee — softness is bounded
entirely before the gate.

**Given up.** A small loss of invariant strength: the store *can* transiently hold an ungrounded
claim (a draft), and drafts can accumulate ungrounded forever. Mitigated by making the count
visible (`cairn drafts`, `cairn status`, the publish-time reconcile) rather than enforced.

**Reversibility.** High. Tightening to atomic later is a strictly *stronger* rule and needs no data
migration — every already-grounded claim already satisfies it. This reversibility is part of why
soft-first was safe to choose now.

#### ADR-0002 — Freshness from the evidence fingerprint, not the compute process

**The fork.** Compute freshness by hashing the **process** (consume a pipeline DAG, or wrap
execution and hash inputs/outputs) versus fingerprinting the **output artifact** the claim points
at.

**Chosen.** Fingerprint the artifact. Stamp a signature at authoring; recompute and compare at read
time; degrade to `unknown` when unreachable.

**Why.** The real environment — compute mostly through the agent, sometimes targets, often remote
HPC — breaks process-hashing: the DAG covers only a minority of work, wrapping cannot capture
remote/async jobs, and both fail *hard* when the special step is forgotten. Fingerprinting the
artifact depends only on the artifact's footprint, works across heterogeneous and remote compute,
and degrades gracefully to an honest `unknown` (`05-freshness.md`).

**Given up.** Remote re-checking needs the host reachable; when it is not, the answer is `unknown`
rather than a definite verdict. Self-reported remote fingerprints are a lower tier than a pipeline
content hash — accepted and made honest by always showing the tier.

**Reversibility.** Moderate. The fingerprint model is foundational, but the *tiers* are extensible
(a new method/tier could be added), and process-hashing could return as a *minor* local convenience
(a top-tier source where available) without becoming load-bearing. The artifact-fingerprint
backbone itself is not something you would want to reverse — it is what makes freshness survive the
environment.

#### ADR-0003 — Files-in-git are the source of truth; artifacts referenced, never ingested

**The fork.** Source of truth = **SQLite itself**, or **plain-text claim files in git** with SQLite
as a derived index?

**Chosen.** Files-in-git are truth; SQLite is a derived, throwaway index; artifacts are referenced
by path + fingerprint, never ingested.

**Why.** The main argument for SQLite-as-truth was fear of large files in git — and that fear
dissolved on inspecting a real multi-GB project: the weight is entirely in artifacts, which are
already gitignored; tracked big files were zero (`04-architecture.md`). Files-in-git additionally
gives `git diff` review of claim changes for free and makes the snapshot future portable (files end
to end → Cloudflare Worker is a delivery change, not a rewrite).

**Given up.** Enforcement moves from unbypassable DB constraints to the CLI/gate layer —
marginally softer. Mitigated by sole-writer CLI + `validate` gate + git visibility (the relocated
hard floor, `04-architecture.md`).

**Reversibility.** Low for the *truth location* (reversing it would undo the git-diff and
portability wins and the whole snapshot model), high for the *index* (SQLite is already disposable
and could be swapped for any query engine without touching the truth).

---

### The build-time decisions (A–G)

These were pinned in `docs/CONTRACTS.md` as the parallel builders coded against them; several
resolve conflicts in older prose.

#### A — Published = canonical only

**Fork.** Should `head.json`/snapshots include drafts (or at least a draft count), as a line in the
original build brief implied, or be canonical-only?

**Chosen.** Canonical only — not even a draft count. Drafts appear only in the local terminal
projection. **Given up:** a reader cannot see "work in progress" counts — but that is the point;
drafts are working-area noise and exposing them would leak unfounded conclusions toward readers and
contradict ADR-0001. This decision resolved the conflict in the brief in ADR-0001's favor.
**Reversible:** moderately — a future version could add an *opt-in* drafts view, but the default
canonical-only guarantee is foundational to the honesty model and should not be casually loosened.

#### B — Stable `latest/` + immutable `snapshots/<id>/`

**Fork.** A single mutable share link (low friction, loses history) vs immutable-only snapshots
(honest, but a new URL every publish). **Chosen:** both — immutable history for honesty/lineage, a
stable `published/latest/` copy as the share-once link (`06-publish-and-snapshots.md`). **Given
up:** disk cost of copying the full bundle into `latest/` each publish (accepted; bundles are
small). **Reversible:** high — the mirror is pure convenience over the immutable snapshots.

#### C — Freshness frozen at publish, shown honestly

**Fork.** Recompute freshness live on the collaborator's machine vs freeze it at publish.
**Chosen:** freeze at publish (`as_of = published_at`), label every badge "as of …", never
recompute. **Why:** the collaborator usually cannot reach the artifacts, and a live-recomputing
snapshot would be mutable. **Given up:** the published view is a point-in-time record, not a live
dashboard — correct for a shared immutable artifact. **Reversible:** the freezing is intrinsic to
immutability; the *labeling* is what keeps it honest and is non-negotiable.

#### D — Host-root-relative evidence paths

**Fork.** Evidence paths relative to cwd vs to the host project root. **Chosen:** host-root-relative
(the directory containing `cairn/`), so re-fingerprinting is location-independent
(`04-architecture.md`). **Given up:** a tiny bit of convenience (you must think in project-root
terms) for a large correctness win (a claim grounded from a subdirectory re-checks from anywhere).
**Reversible:** low — paths are stored this way in claim files; changing it would be a migration.

#### E — Reproducible, timestamp-excluding snapshot id (the correction)

This is the decision that *emerged from verification* rather than being specced cleanly up front,
and it is the most instructive (`06-publish-and-snapshots.md`). **Fork:** hash only the stored claim
data (excluding everything time-varying, which naively excludes freshness) vs hash the published
*view* (including computed freshness, excluding only wall-clock timestamps). **The collision:** the
first reading would let a claim that went stale after publish keep showing `fresh` on the share link
forever — a false `fresh` reaching a reader, the exact dishonesty the project exists to prevent.
**Chosen:** the id content-addresses the published view — canonical claims *including* computed
freshness `{state, tier}`, *excluding* all timestamps. So the same view is byte-reproducible AND a
freshness-only change yields a new immutable snapshot that carries the corrected badge to the
collaborator. **Given up:** the id is no longer a pure function of the *files* — it depends on the
*world state* at publish (whether artifacts changed). That is correct: it is the identity of the
*view*, and the view includes freshness. **Reversible:** low — reversing it reintroduces the bug;
it is locked in by an acceptance test (`tests/acceptance.sh` step 8, commit `151ebea`).

#### F — Site built once, copied at publish

**Fork.** Build the site during publish vs build it once and copy a prebuilt bundle. **Chosen:**
build once; `publish` never runs a site build, it copies the prebuilt `site/dist` (`index.html` +
`assets/` + `fonts/`, not the dev `data/`) into each snapshot and writes the real `data/` alongside
(`src/publish.ts` `copySiteBundle`/`resolveSiteDist`). **Why:** publish should be fast,
deterministic, and not depend on a build toolchain being available at share time; it fails up front
with a clear message if `site/dist` is missing. **Given up:** an extra manual `bun run build:site`
step before publishing. **Reversible:** high — purely an integration detail.

#### G — vinext → plain Vite + React

**Fork.** vinext (Cloudflare's Vite-based Next.js reimplementation) vs plain Vite + React, with the
contract explicitly allowing the fallback. **Chosen:** plain Vite + React, *and reported* per the
fallback clause. **Why (the honest framing):** vinext reimplements the Next.js *server* surface, and
the published snapshot is fully static with no server for that value to attach to; vinext's strength
is precisely the thing Cairn deliberately lacks (`08-frontend.md`). **Given up:** nothing real —
identical components, fewer moving parts. **Reversible:** high — the components are framework-light;
the no-backend static contract is the durable part, not the bundler.

---

### How the decisions cohere

These are not independent knobs; they reinforce each other. Files-in-git (ADR-0003) is what makes
the snapshot files-end-to-end, which makes the Worker future a delivery change (decision G's "no
server" framing) and gives the diff a `git`-visible backstop. Soft authoring (ADR-0001) is what
buys low-friction capture, which is the anti-forgetting mechanism the warn-only enforcement model
leans on. Artifact-fingerprint freshness (ADR-0002) is what makes freshness *computed and honest*,
which forces freezing-at-publish (C), which forces the snapshot-identity correction (E) so a frozen
badge cannot go quietly dishonest. Canonical-only publishing (A) is what keeps drafts from leaking
toward readers, which is the same guarantee soft authoring depends on at the gate. Pull one and the
others lose tension — which is the same observation made about the philosophy in `02-philosophy.md`,
seen now at the level of concrete decisions.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/10-limitations-and-future.md -->

## 10 — Limitations and Future

A system card that only described strengths would be exactly the kind of polish-over-substance
artifact Cairn exists to oppose. This document is the candid accounting: what v1 deliberately is
*not*, every accepted ceiling and known soft spot, the seams left open with nothing built behind
them, and the v2 directions those seams reserve. The discipline throughout v1 was "reserve the
seam, build none of it" — leave the ports open, weld nothing shut — and being honest about that is
part of the card's job.

---

### What v1 deliberately is NOT

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

### Accepted ceilings and known soft spots

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

### The reserved seams (ports open, nothing built)

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

### v2 directions

These are the intended next steps, in roughly the order they build on each other. None is committed
beyond being the reserved-seam target.

#### The verification axis (verifiers / oracles)

The big one. v2 would add the machinery to move a claim off `unverified`: a verifier or oracle that
checks a claim against an external reference (a forward model over a curated reference, for
external-grounded claims) and records `verified` / `contradicted` / `unverifiable`. This is the
axis that finally lets Cairn say something about *truth* — carefully, as a separate axis that still
never merges with freshness or canonical-ness. The attachment points (the enum, the `external`
kind, the `verification_changed` diff channel) are already in place.

#### Claude Code hooks as the real anti-forgetting hardening

The honest fix for the largest v1 ceiling. A lifecycle hook fires on a harness event regardless of
whether the agent "remembered," so it can nudge ("you concluded something — capture it") or gate a
share on the reconcile, *without relying on the agent's goodwill*. This is genuine enforcement on
the authoring side, which can only live in the harness, not in a markdown skill
(`07-the-agent-loop.md`). v1 deliberately shipped the skill alone and reserved hooks for here.

#### The meeting layer, composing on the time spine

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

#### Collaborator write-back

The read-only ceiling lifted: a collaborator proposing a verdict, a disagreement, a counter-claim
that flows back into the graph. The port is left open (DESIGN §8: "leave the port open, don't weld
it shut") and nothing in v1 forecloses it — but it is genuinely unbuilt, and it interacts with the
verification axis and the local-single-writer model in ways v2 would need to design carefully.

---

### A closing note on honesty about the future

Everything above is reserved, not promised. The value of stating it is not to commit Cairn to a
roadmap but to make the v1 boundaries *legible*: a fresh reader should be able to see exactly where
the built system stops, why it stops there, and what the stopping points were designed to enable
later. That legibility is itself the dogfood — a fresh session reading this card should orient on
Cairn's scope as cleanly as a fresh session reading `head.json` orients on a project's claims. If it
does, the card has done its job.

---


<!-- ───────────────────────────────────────────────────────────────────────── -->
<!-- source: system-card/MAINTENANCE.md -->

## Maintaining the System Card

This folder is durable, but it is not frozen. Code changes, decisions get revised, v2 lands. This
document explains how to keep the system card alive *without letting it become a competing source
of truth* — which is the one failure mode that would make it worse than useless.

### The cardinal rule: the card explains, it never legislates

The system card is **narrative and explanatory**. It defers authority, for every hard decision, to:

1. `CONTEXT.md` — the terse authoritative glossary and current decisions;
2. the ADRs (`docs/adr/`) — the point decision records;
3. `docs/CONTRACTS.md` + `src/types.ts` — the machine contract (data shapes, CLI signatures).

If the card and any of those ever disagree, **the card is wrong** and must be corrected to match.
The card never wins a conflict. This is what prevents it from becoming a second, drifting source of
truth that a reader might cite against the real ones. The card's job is to carry the *reasoning*
around the decisions; the decisions themselves live in the authoritative documents.

### The update order, when a decision changes

When a real decision changes, update in this order — authoritative first, narrative second:

1. **Update the authoritative source first.** A new or reversed decision gets a new ADR (or a
   revised one with a status change), and `CONTEXT.md` / `CONTRACTS.md` / `src/types.ts` are
   updated to the new truth. Decide the thing in the place that has authority over it.
2. **Then revise the relevant card section** to narrate the new reasoning — what the fork was, what
   was chosen, what was given up, how reversible it is (the shape used in
   `09-decisions-and-tradeoffs.md`).
3. **Never** revise only the card. A card section that describes a decision the ADRs/CONTEXT do not
   yet reflect is exactly the drift this rule exists to prevent.

The convention for a *new major decision*: it gets an ADR (authoritative) **and** a narrative
paragraph here (explanatory), added together. The ADR records the decision; the card explains why
it coheres with the rest.

### What to revisit when code changes

A checklist, keyed to the parts of the card most coupled to specific source files. When you touch
the left column, check the right.

| If you change… | Revisit in the card… |
|---|---|
| `src/types.ts` / `docs/CONTRACTS.md` (shapes, enums, CLI signatures) | `03-domain-model.md`, `04-architecture.md`; any schema description anywhere |
| `src/gate.ts` / the reach-ground query / promotion semantics | `03-domain-model.md` (iron rule), `04-architecture.md` (hard floor), `06` (publish gate) |
| `src/freshness.ts` / `src/fingerprint.ts` (methods, tiers, cascade) | `05-freshness.md`; the tier table; the cascade/fixpoint explanation |
| `src/snapshot.ts` / `src/publish.ts` (snapshot id, diff, share model) | `06-publish-and-snapshots.md` — *especially* the snapshot-identity story if the id inputs change |
| `skill/cairn/SKILL.md` (touchpoints, triggers, enforcement) | `07-the-agent-loop.md` |
| `site/` (stack, data flow, badges, motion) | `08-frontend.md`; the honest-badge and no-backend claims |
| `src/reconcile.ts` / enforcement model | `07-the-agent-loop.md`, `06` (warn-only reconcile), `10` (ceilings) |
| Adding a v2 feature (verification, hooks, meeting, write-back) | `10-limitations-and-future.md` — move it from "reserved seam" to "built", and add an ADR + a `09` paragraph |

Two cross-cutting checks for any change:

- **Terminology.** Keep every term exactly consistent with `CONTEXT.md`. If a term's meaning
  shifts, fix `CONTEXT.md` first, then sweep the card. The card's value depends on using the
  project's words the project's way.
- **As-built honesty.** The card describes the system *as actually built*, including the gaps
  between the original spec and the final code (the canonical-only resolution, the snapshot-identity
  correction, the vinext→Vite fallback). If a future change closes one of those gaps or opens a new
  one, tell that story rather than smoothing it over — the instructive moments are part of the
  card's value.

### The consolidated single-file version

`cairn-system-card-v1.md` is a generated concatenation of the modular documents (in the reading
order from `README.md`), provided for readers and tools that prefer one artifact. It is **derived,
not authored** — the modular files are the maintained originals. Whenever you change a modular
document, regenerate the consolidated file from the same ordered list so the two never drift; if
they ever disagree, the modular file wins. The consolidation only retitles each document's top
heading down one level and prepends a table of contents — it adds no content of its own.

### When the card is doing its job

The test is the same one Cairn applies to itself: hand this folder (and nothing else) to a fresh AI
session and ask "what is Cairn, why is it shaped this way, and what does it deliberately not do?"
If the session answers correctly — defends the hard constraints, names the accepted ceilings, and
does not try to re-litigate settled decisions — the card is current. If it gets something wrong,
that is the signal that the card has drifted from the code or the authoritative docs, and the fix is
to reconcile it *toward* them, never the other way.

### Keep the voice

The card is written in a thoughtful, essayistic-but-precise register — prose paragraphs carrying
the argument, lists and tables only where they genuinely clarify, honest about tensions and
ceilings. Revisions should match that voice. It is documentation meant to be *read* and *reasoned
with*, not skimmed as bullet notes. If a revision would be clearer as an argument than as a
fragment, write the argument.
