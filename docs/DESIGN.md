# Cairn — v1 Design Skeleton

Domain-neutral (generic data analysis). This is the crystallized output of a design
diagnosis that turned "should I build a results-sharing collaboration platform?" into a
schema you can build.

> **Status:** background reasoning, written before the grilling pass. Still largely valid, but
> where it predates the ADRs it is **superseded** — see `../CONTEXT.md` and `adr/`. Specifically:
> freshness is now derived from the **evidence fingerprint**, not the compute DAG (ADR-0002);
> the source of truth is **files-in-git**, with SQLite as a derived index, not SQLite itself
> (ADR-0003); authoring is **soft (draft)** with the iron rule enforced at the canonical
> boundary (ADR-0001). The primary interface is the **agent loop**, with the published site
> secondary.

---

## 0. The dissolve

The original question — *should I build a central collaboration platform to stop zipping and
emailing results?* — is the wrong question. What decides everything is **the atomic unit you
share**:

- Unit = file / zip → collapses into a generic, crowded notes/document tool. A detour.
- Unit = a **claim** (one conclusion, with an explicit link to its evidence) → the
  differentiated thing no notes tool does.

So Cairn is not a platform. It is a **read-only canonical projection of a claim graph.**

---

## 1. Form

- **Source of truth stays local.** The "site" is just a read-only push of the canonical
  branch — not a second database.
- **Local = working area** (sandbox branches). **Publishing = a commit** that advances the
  **canonical head (`main`)**.
- Two readers consume the *same* canonical head:
  1. **A collaborator** — fully read-only in v1 (lowest possible recipient friction; a link,
     no login, lighter than opening a zip).
  2. **A fresh AI session** — reads the head to immediately know "where we are and what to
     decide next," solving cross-session context loss.
- Key insight: the collaborator-facing frontend and the AI-context backend are **two views of
  one structured store**. The collaborator is just another reader.

---

## 2. Status = two orthogonal axes (never merge them into one word)

| Axis | Values | Source | v1 |
|---|---|---|---|
| **Freshness** | `fresh` / `stale` / `unknown` | **Derived from the evidence fingerprint** (artifact changed ⇒ stale; unreachable ⇒ unknown; cascades downstream). *Superseded mechanism — see ADR-0002; this row originally said "from the compute DAG."* | ✅ build it — never hand-set or AI-guessed |
| **Verification** | `verified` / `unverified` / `contradicted` | claim↔evidence checked against an external oracle (a forward model over a curated reference) | ❌ defer to v2 |

Principle: **anything that can be made deterministic should be.** Staleness is deterministic —
compute it, don't store an opinion about it.

**`canonical` ≠ `verified`.** Publishing makes a version *the agreed current record*; it does
**not** make it true. Every claim displays its honest status. Never let "I put it on the site"
launder an unverified claim into a verified-looking one — that laundering machine is exactly
what this project exists to dismantle. `unverifiable` is a legal, honest state.

---

## 3. The two hard edges + the iron rule (all of v1's hard constraints)

A claim may carry two kinds of edge, kept as **distinct types**:

- **Grounding edge**: claim → data / run / file / **external public reference (typed
  separately)**. The claim's feet are on the ground.
- **Dependency edge**: claim → another claim. The claim stands on another's shoulders.

Why they must stay distinct:
- **Cascade differs.** Dependency: an upstream claim going stale/contradicted collapses this
  one (justification propagation). Grounding: the underlying data changing flags this one for
  review — a different trigger.
- **Verification differs.** A claim grounded in data can be checked independently; a claim that
  only depends on other claims merely *inherits* their verification.
- **Circular reasoning.** If claim→claim counted as grounding, claims could support each other
  in a loop while nothing touches reality — circular reasoning wearing a provenance costume.

**The iron rule (well-founded):**

> Every claim has ≥1 edge, **and** every claim must ultimately reach ≥1 non-claim grounding.
> Following dependency edges upward must terminate at the ground (data / run / file). A claim
> that cannot reach ground **may not enter `main` and may not be shared.**

One line: *the chain can be long, but its end must be solid ground, not another sentence.*

The external-reference grounding edge is worth a **separate type** even in v1 (even if it's
just a string), because it is the attachment point for the v2 verification layer.

---

## 4. simple vs soft (the discipline line for v1)

- **simple = few fields** (don't build five-state status, don't build verifiers yet) → healthy.
- **soft = the claim→evidence edge is optional** → fatal; the moment the edge can be skipped,
  you've rebuilt a generic notes tool.
- Rule: **edge hard, content soft.** Evidence content can be as terse as "see run X / file Y,"
  but the edge itself is mandatory and enforced by the database.

---

## 5. Versioning and time

- Each publish = an **immutable version snapshot** (citable, reproducible). The head advances.
- A rerun moves the head ⇒ **staleness auto-cascades** ⇒ every reader (collaborator, fresh
  session, future you) sees a diff: "since the version you last saw, these N claims changed."
- Without that diff, "canonical" rots silently. The stale-cascade is not optional — it is the
  mechanism that keeps the canonical record honest over time.

---

## 6. Schema, not skill (the through-line discipline)

Structure must be **enforced by schema** (the store rejects anything unstructured), never left
to "the AI will structure it" (that's a wish — the AI forgets, sessions break, the invariant
vanishes). The goal is not "the AI remembers everything" — it's "the system won't let me store
things in a shape the AI can't read."

---

## 7. Strategic framing (don't judge it as a business)

This is **work infrastructure + a dogfood interface + a showbook reference**, not a product
(the target setting has low willingness to pay). The showbook must demonstrate the
differentiated moment — *a fresh session reading the canonical head and instantly orienting* —
not a pretty results browser. A pretty browser as the showbook proves nothing.

---

## 8. Cut / deferred

- **Cut from v1:** external-source drift/retraction monitoring (very low likelihood). The
  *type* of the external edge is kept; only the monitoring sensor is dropped.
- **Deferred to v2:** the verification axis (verifiers / oracles); collaborator write-back of
  verdicts (leave the port open, don't weld it shut); live sync.

---

## 9. Recurring trap (self-reminder)

Every step forward tends to pack two different things into one word — in order: "platform,"
"structured," "status," "evidence." Each time, splitting it into two sharpened the design one
notch. When a single word turns out to mean two things, split it first.
