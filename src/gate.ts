/**
 * gate.ts — the deterministic gates (CONTRACT §10, spec §(c)). PURE MECHANISM ONLY.
 *
 * Every gate here is hashing-free string/enum/edge mechanism: enum membership, id string-equality,
 * edge existence, and distinct-id counting. NO gate reads a body for meaning; NO gate counts
 * agreeing paths, averages, or scores (ADR-0004). Each gate, on failure, yields a GateViolation
 * naming the gate id and the offending claim; `validate` exits non-zero on any violation.
 *
 * The gates (spec §c):
 *   c.1 reach-ground      (ADR-0001) — iron rule at the draft→canonical boundary.
 *   c.1b estimand-required (ADR-0005) — a canonical candidate must declare an estimand id.
 *   c.2 estimand-collapse (ADR-0005) — refuse to treat siblings as one set across differing ids.
 *   c.3 resolution        (ADR-0001 ext) — refuse `settled` while a contradicts edge is unresolved.
 *   c.4 verification-lock (ADR-0006 A) — refuse `verified` for agent-sourced provenance.
 *   c.5 corroboration     (ADR-0006 B) — refuse `cross-reviewed` without ≥2 distinct reviewers ≠ author.
 *   c.6 trust-field-lock  (ADR-0004) — the writer overrides every CLI-computed field (enforced at
 *                          write time in the CLI/store, surfaced here as a derive-check helper).
 *
 * Gate ordering at promotion/publish (spec §c, PINNED): (1) trust-field lock recompute →
 * (2) reach-ground → (3) verification territory-lock → (4) corroboration derive → (5) resolution.
 * Collapse-refusal applies wherever sibling grouping is attempted (orient/diff), independent of
 * promotion. `runGate` runs the promotion-time subset over the candidate-canonical set.
 *
 * PERMANENT CEILING (ADR-0004): these gates enforce CONSISTENCY WITH WHAT WAS DECLARED, never TRUTH
 * of the declaration. They compare ids and count distinct strings; they never judge whether two ids
 * mean the same thing or whether two asserters are genuinely independent.
 */

import { isGrounded } from "./claimfile.ts";
import { TERRITORY_PROVENANCE } from "./types.ts";
import type {
  ClaimFile,
  ClaimFrontmatter,
  Corroboration,
  GateResult,
  GateViolation,
  Resolution,
  Verification,
} from "./types.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Candidate set (spec c.1): every claim ALREADY canonical, PLUS every grounded draft.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The candidate-canonical set the promotion gates must clear: every claim already `canonical`, plus
 * every `draft` carrying ≥1 grounding edge (a grounded draft is a promotion candidate). Zero-edge
 * drafts are NOT candidates (softness lives before the gate; they remain `draft`).
 *
 * `promotableIds` are the grounded DRAFTS that would be promoted on a passing publish — distinct
 * from claims already canonical, which are candidates but not "promoted".
 */
export function candidateSet(claims: ClaimFile[]): {
  candidates: ClaimFile[];
  promotableIds: string[];
} {
  const candidates: ClaimFile[] = [];
  const promotableIds: string[] = [];
  for (const c of claims) {
    const fm = c.frontmatter;
    if (fm.lifecycle === "canonical") {
      candidates.push(c);
    } else if (fm.lifecycle === "draft" && isGrounded(fm)) {
      candidates.push(c);
      promotableIds.push(fm.id);
    }
  }
  return { candidates, promotableIds };
}

// ──────────────────────────────────────────────────────────────────────────────
// c.1 — Reach-ground gate (iron rule) — ADR-0001
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A candidate reaches ground iff it has ≥1 grounding edge: at least one artifact ref across its
 * evidence lines (`file:`/`external:`/`dvc:` — any kind counts as ground). The v2 schema carries NO
 * claim→claim dependency edge, so there is no transitive walk and no dependency cycle to detect; a
 * claim grounds directly through its own evidence or not at all (a claim resting only on other claims
 * — circular reasoning — is structurally impossible to express, which is the iron rule by
 * construction). This stays a per-claim grounding-edge check.
 *
 * Returns one violation per ungrounded candidate. Drafts that are not candidates (zero-edge) are
 * exempt — softness lives before the gate.
 */
export function reachGroundViolations(candidates: ClaimFile[]): GateViolation[] {
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    if (!isGrounded(fm)) {
      out.push({
        gate: "reach-ground",
        claim: fm.id,
        message: `claim ${fm.id} does not reach ground: no grounding edge (≥1 evidence ref required to promote to canonical)`,
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// c.1b — Estimand-required gate (canonical must declare an estimand) — ADR-0005
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Refuse to promote / keep canonical any candidate that declares no `estimand` id. A draft MAY omit
 * the estimand (soft authoring lives before the gate), but "which question am I answering" is
 * mandatory on every claim a reader sees as canonical — the first methodological step (ADR-0005).
 *
 * PURE PRESENCE CHECK: it tests only that the id field exists, never reads the estimand body — the
 * ADR-0005 ceiling holds (the CLI compares ids, it never judges meaning). Returns one violation per
 * candidate missing an estimand. Non-candidate (zero-edge) drafts are exempt — they are not in the
 * candidate set this runs over.
 */
export function estimandPresenceViolations(candidates: ClaimFile[]): GateViolation[] {
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    if (fm.estimand === undefined) {
      out.push({
        gate: "estimand-required",
        claim: fm.id,
        message: `claim ${fm.id} cannot be canonical: it declares no estimand id (every canonical claim must declare which question it answers, ADR-0005)`,
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// c.2 — Estimand-collapse-refusal gate — ADR-0005
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Refuse to treat a proposed sibling GROUP as alternative specifications of one multiverse when the
 * members' declared `estimand` ids are not all byte-equal. Siblings are only siblings within ONE
 * estimand id (spec c.2). Comparison is STRING-EQUALITY of the estimand id, never meaning.
 *
 * `group` is the set of claims some orient/diff surface is about to treat as one set. This returns a
 * violation (on the first member) iff the group spans ≥2 distinct declared estimand ids, or any
 * member has no declared estimand (a missing id cannot be proven the same as any other id — the CLI
 * compares ids, and there is no id to compare).
 *
 * Independent of promotion: this guards the boundary of any sibling grouping. Per ADR-0004 the CLI
 * never PERFORMS averaging/convergence; this only refuses the collapse.
 */
/**
 * The pure collapse-refusal PREDICATE over declared estimand ids (the mechanism both the gate and the
 * orient/diff surface consult, so there is ONE source of truth). A group of declared estimand ids is a
 * comparable sibling set iff every id is present (none `undefined`) AND all ids are byte-equal. A
 * missing id, or ≥2 distinct ids, means the group spans different questions ⇒ collapse refused. Pure
 * string-equality, never meaning (ADR-0005 ceiling).
 */
export function isComparableEstimandGroup(estimands: ReadonlyArray<string | undefined>): boolean {
  if (estimands.length < 2) return true; // a single claim is never a collapse
  const ids = new Set<string>();
  for (const est of estimands) {
    if (est === undefined) return false; // no id cannot be proven the same as any other id
    ids.add(est);
  }
  return ids.size <= 1;
}

export function collapseRefusalViolation(group: ClaimFile[]): GateViolation | null {
  if (group.length < 2) return null; // a single claim is never a collapse
  const ids = new Set<string>();
  for (const c of group) {
    const est = c.frontmatter.estimand;
    if (est === undefined) {
      return {
        gate: "estimand-collapse",
        claim: c.frontmatter.id,
        detail: "(no estimand)",
        message: `cannot group claim ${c.frontmatter.id} as a sibling: it declares no estimand id (collapse refused — siblings must cite the same estimand id, ADR-0005)`,
      };
    }
    ids.add(est);
  }
  if (ids.size > 1) {
    const first = group[0]!;
    return {
      gate: "estimand-collapse",
      claim: first.frontmatter.id,
      detail: [...ids].sort().join(", "),
      message: `cannot collapse ${group.length} claims into one sibling set: they span ${ids.size} distinct estimand ids (${[...ids].sort().join(", ")}); collapse refused (ADR-0005)`,
    };
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// c.3 — Resolution-vs-contradiction gate — ADR-0001 extension
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A `contradicts` edge is RESOLVED only when the cited claim no longer exists in the candidate set
 * (retracted/superseded) OR the edge was explicitly cleared (removed from the array). So an edge is
 * UNRESOLVED iff the cited claim still exists among the live candidate ids (spec c.3, PINNED).
 *
 * Returns the cited ids that are still live (unresolved). String-equality membership only.
 */
export function unresolvedContradicts(fm: ClaimFrontmatter, liveIds: ReadonlySet<string>): string[] {
  return fm.contradicts.filter((cited) => liveIds.has(cited));
}

/**
 * Refuse `resolution=settled` on any claim that still carries an unresolved `contradicts` edge. A
 * contested claim may remain `canonical` (lifecycle) while staying `open` (resolution) — the two axes
 * are orthogonal. This is the structural block on the NK CLOSED-NEGATIVE recurrence.
 *
 * `liveIds` is the set of claim ids that still exist in the candidate set (used to decide whether a
 * cited contradiction is still live).
 */
export function resolutionViolations(
  candidates: ClaimFile[],
  liveIds: ReadonlySet<string>,
): GateViolation[] {
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    if (fm.resolution !== "settled") continue;
    const unresolved = unresolvedContradicts(fm, liveIds);
    if (unresolved.length > 0) {
      out.push({
        gate: "resolution",
        claim: fm.id,
        detail: unresolved.sort().join(", "),
        message: `claim ${fm.id} cannot be settled: ${unresolved.length} unresolved contradicts edge(s) still live (${unresolved.sort().join(", ")}); a contested claim stays open while it may remain canonical`,
      });
    }
  }
  return out;
}

/**
 * The DERIVED resolution value for a claim under the current candidate set: `open` while any
 * `contradicts` edge is still live, else its declared value is permitted (`settled` allowed only when
 * no edge is live). The CLI uses this to LOCK resolution down to `open` (never the reverse — it never
 * auto-sets `settled`; that is an explicit agent write the gate above guards).
 */
export function lockedResolution(fm: ClaimFrontmatter, liveIds: ReadonlySet<string>): Resolution {
  return unresolvedContradicts(fm, liveIds).length > 0 ? "open" : fm.resolution;
}

// ──────────────────────────────────────────────────────────────────────────────
// c.4 — Verification territory-lock gate (Gate A) — ADR-0006
// ──────────────────────────────────────────────────────────────────────────────

const TERRITORY: ReadonlySet<string> = new Set(TERRITORY_PROVENANCE);

/**
 * The verification values that mean "the territory has spoken" — confirmation OR refutation by
 * something independent of the analysis system. Both are territory-locked; an agent can self-stamp
 * neither. `unverified`/`unverifiable` are agent-settable (they assert the territory has NOT, or
 * cannot, speak), so they are not locked.
 */
const TERRITORY_LOCKED_VERIFICATION: ReadonlySet<string> = new Set(["verified", "contradicted"]);

/** True iff the claim's provenance is territory (may reach `verified`/`contradicted`): {experimental}. */
export function isTerritory(fm: ClaimFrontmatter): boolean {
  return TERRITORY.has(fm.provenance);
}

/**
 * Refuse a territory-locked verification (`verified`/`contradicted`) when provenance is NOT territory.
 * Only TERRITORY provenance ({experimental}) — confirmation/refutation independent of the analysis
 * system — may reach them; an agent-sourced provenance can self-stamp neither (a human *reviewing* the
 * analysis is consensus, not territory). Pure enum check (allowlist).
 */
export function verificationLockViolations(candidates: ClaimFile[]): GateViolation[] {
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    if (TERRITORY_LOCKED_VERIFICATION.has(fm.verification) && !isTerritory(fm)) {
      out.push({
        gate: "verification-lock",
        claim: fm.id,
        detail: fm.provenance,
        message: `claim ${fm.id} cannot be ${fm.verification}: provenance "${fm.provenance}" is not territory; only experimental reaches verified/contradicted (ADR-0006 Gate A)`,
      });
    }
  }
  return out;
}

/**
 * The DERIVED/LOCKED verification value: a territory-locked value (`verified`/`contradicted`) on a
 * non-territory provenance is forced down to `unverified`; any other value passes through (the CLI may
 * still set `unverifiable`). The writer uses this to override an illegal self-stamped trust badge.
 */
export function lockedVerification(fm: ClaimFrontmatter): Verification {
  if (TERRITORY_LOCKED_VERIFICATION.has(fm.verification) && !isTerritory(fm)) return "unverified";
  return fm.verification;
}

// ──────────────────────────────────────────────────────────────────────────────
// c.5 — Corroboration gate (Gate B) — ADR-0006
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The DERIVED corroboration value (never hand-set): `cross-reviewed` iff `reviewed_by` contains ≥2
 * DISTINCT asserter-ids, EACH byte-distinct from the claim's own `asserter.who` (a self-review never
 * raises corroboration); else `self-asserted`. Distinct = byte-distinct `who` string. The CLI judges
 * id-COUNT only, never true decorrelation (ADR-0006 ceiling).
 */
export function deriveCorroboration(fm: ClaimFrontmatter): Corroboration {
  const author = fm.asserter.who;
  const distinct = new Set<string>();
  for (const r of fm.reviewed_by) {
    if (r.asserter !== author) distinct.add(r.asserter);
  }
  return distinct.size >= 2 ? "cross-reviewed" : "self-asserted";
}

/**
 * Refuse any STORED `corroboration=cross-reviewed` that the reviewer set does not actually support
 * (the agent tried to self-stamp the badge). Surfaced as a gate so `validate` flags a tampered store;
 * at write time the CLI overrides the field via `deriveCorroboration` (trust-field lock c.6).
 */
export function corroborationViolations(candidates: ClaimFile[]): GateViolation[] {
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    const derived = deriveCorroboration(fm);
    if (fm.corroboration !== derived) {
      out.push({
        gate: "corroboration",
        claim: fm.id,
        detail: `stored=${fm.corroboration} derived=${derived}`,
        message: `claim ${fm.id} corroboration "${fm.corroboration}" is not derivable: needs ≥2 distinct reviewer ids ≠ author for cross-reviewed (derived: ${derived}); corroboration is never hand-set (ADR-0006 Gate B)`,
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// c.6 — Trust-field lock (meta-gate) — ADR-0004
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Surface any CLI-computed/locked field whose stored value diverges from what the gates would derive
 * from the same store. This is the read-time mirror of the write-time trust-field lock: at write the
 * CLI OVERRIDES the agent's value; at validate we flag a store that was hand-edited around the CLI.
 *
 * Only the fields derivable here PURELY (no filesystem fingerprinting) are checked: `verification`
 * (territory-lock), `corroboration` (derive), `resolution` (locked to open while contested). The
 * fingerprint/freshness/reach_ground fields are derived in their own modules (fingerprint/freshness;
 * reach_ground is the c.1 gate) and are locked there, so they are NOT re-checked here to keep this
 * gate filesystem-free.
 */
export function trustFieldLockViolations(
  candidates: ClaimFile[],
  liveIds: ReadonlySet<string>,
): GateViolation[] {
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    if (lockedVerification(fm) !== fm.verification) {
      out.push({
        gate: "trust-field-lock",
        claim: fm.id,
        detail: `verification stored=${fm.verification} locked=${lockedVerification(fm)}`,
        message: `claim ${fm.id} verification "${fm.verification}" violates the territory lock (locked value: ${lockedVerification(fm)}); an agent cannot self-stamp a trust badge (ADR-0004)`,
      });
    }
    if (deriveCorroboration(fm) !== fm.corroboration) {
      out.push({
        gate: "trust-field-lock",
        claim: fm.id,
        detail: `corroboration stored=${fm.corroboration} derived=${deriveCorroboration(fm)}`,
        message: `claim ${fm.id} corroboration "${fm.corroboration}" was hand-set (derived: ${deriveCorroboration(fm)}); CLI-computed fields are locked (ADR-0004)`,
      });
    }
    if (lockedResolution(fm, liveIds) !== fm.resolution) {
      out.push({
        gate: "trust-field-lock",
        claim: fm.id,
        detail: `resolution stored=${fm.resolution} locked=${lockedResolution(fm, liveIds)}`,
        message: `claim ${fm.id} resolution "${fm.resolution}" is not permitted while a contradicts edge is live (locked value: ${lockedResolution(fm, liveIds)}); CLI-computed fields are locked (ADR-0004)`,
      });
    }
  }
  return out;
}

/**
 * Re-lock the three PURE (filesystem-free) CLI-computed trust fields to their derived values, the
 * write-time enforcement of trust-field-lock c.6 / ADR-0004 for EVERY write verb. An agent-supplied
 * `verification:verified` (on agent-sourced provenance), `corroboration:cross-reviewed` (unsupported
 * by the reviewer set), or `resolution:settled` (while a contradicts edge is live) is DISCARDED and
 * replaced by the computed value. `freshness`/`reach_ground` are filesystem-derived and re-locked by
 * the calling verb alongside this (refresh/add-claim) so this helper stays fingerprint-free.
 *
 * `liveIds` is the set of claim ids that currently exist (for the resolution lock). When a caller
 * cannot cheaply assemble the full live set, it may pass the ids it has; resolution only ever locks
 * DOWN to `open`, never up to `settled`, so a missing cited id is treated as resolved (the gate at
 * validate/publish re-checks against the authoritative candidate set before promotion).
 */
export function relockTrustFields<T extends ClaimFrontmatter>(
  fm: T,
  liveIds: ReadonlySet<string>,
): T {
  return {
    ...fm,
    corroboration: deriveCorroboration(fm),
    resolution: lockedResolution(fm, liveIds),
    verification: lockedVerification(fm),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestration — run the promotion-time gate suite over the candidate set
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run the full promotion/publish gate suite over the claim set and return a single GateResult.
 *
 * Pure (no disk writes, no fingerprinting). Builds the candidate-canonical set, then runs, in the
 * PINNED order: reach-ground (c.1) → estimand-required (c.1b) → verification-lock (c.4) →
 * corroboration (c.5) → resolution (c.3), plus the trust-field-lock meta-check (c.6). The
 * collapse-refusal gate (c.2) is NOT run here
 * — it guards sibling grouping at the orient/diff surface, independent of promotion, and is exposed
 * separately as `collapseRefusalViolation`.
 *
 * `ok` iff there are zero violations. `candidateIds` are the grounded drafts that WOULD be promoted
 * on a passing publish (sorted).
 */
export function runGate(claims: ClaimFile[]): GateResult {
  const { candidates, promotableIds } = candidateSet(claims);
  const liveIds: ReadonlySet<string> = new Set(candidates.map((c) => c.frontmatter.id));

  const violations: GateViolation[] = [
    ...reachGroundViolations(candidates),
    ...estimandPresenceViolations(candidates),
    ...verificationLockViolations(candidates),
    ...corroborationViolations(candidates),
    ...resolutionViolations(candidates, liveIds),
    ...trustFieldLockViolations(candidates, liveIds),
  ];

  return {
    ok: violations.length === 0,
    violations,
    candidateIds: promotableIds.slice().sort(),
  };
}
