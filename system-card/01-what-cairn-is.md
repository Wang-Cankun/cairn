# 01 — What Cairn Is

## The one-paragraph version

Cairn is a read-only canonical projection of a claim graph. You do analysis; instead of zipping
the results and mailing them, you record your conclusions as *claims* — each claim a single
sentence that carries a mandatory, explicit link to the evidence it rests on — into a local
store, primarily through an AI coding agent working alongside you. Publishing that store does not
make the claims true; it makes them *canonical*: the agreed-current record. A collaborator reads
it through a static link; a fresh AI session reads the same record to orient instantly. The unit
you share is a claim, not a file, and that single change is the whole of the differentiation.

## The expansive version

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

### The cairn metaphor

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

## What Cairn is NOT

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

## Two readers, one store

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

## Agentic-AI-ready-first: the agent loop is the product

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
