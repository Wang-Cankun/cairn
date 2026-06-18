/**
 * freshness.ts — compute per-claim freshness from evidence fingerprints (ADR-0002, CONTRACT §1).
 *
 * Freshness is DERIVED at read/refresh time and LOCKED onto the claim by the CLI; it is never
 * hand-set. The enemy is a false `fresh`, so any uncertainty resolves DOWN to `unknown`/`stale`,
 * never up to `fresh`.
 *
 * Per evidence ref (one per stored Fingerprint): re-fingerprint the ref NOW (`fingerprintRef`) and
 * compare to the stored fingerprint:
 *   - unknown — the stored fingerprint had a null value (tier `unknown`, e.g. external:), OR the ref
 *               is now unreachable (recompute yields tier `unknown`). Cannot prove fresh ⇒ unknown.
 *   - stale   — reachable now, but the recomputed {tier,value} differs from the stored one (the
 *               artifact moved/changed).
 *   - fresh   — reachable now and the recomputed {tier,value} matches the stored one exactly.
 *
 * Claim self-state (combine its refs): stale if ANY ref is stale; else unknown if any ref is unknown;
 * else fresh (a claim with zero refs has no evidence ⇒ `unknown`).
 *
 * Cascade (ADR-0002 "stale if any dependency is stale"): the v2 schema carries NO claim→claim
 * dependency edge (a claim grounds only through its own evidence refs), so there is no dependency
 * graph to traverse and the cascade is the identity on self-state. The fixpoint loop below is kept
 * (over an empty dependency relation) so the mechanism stays correct and order-independent if a
 * claim→claim edge is ever added: staleness only propagates TO stale, never away, so it terminates
 * in ≤N passes even under cycles.
 */

import { fingerprintRef } from "./fingerprint.ts";
import type {
  ClaimFile,
  ClaimFrontmatter,
  EvidenceRef,
  Fingerprint,
  FreshnessState,
} from "./types.ts";

/**
 * Classify one stored fingerprint against a freshly recomputed one for the same ref.
 *   - stored value null (tier unknown)  ⇒ unknown (was never pinned down)
 *   - recompute tier unknown / null     ⇒ unknown (now unreachable; never claim fresh)
 *   - tier+value byte-equal             ⇒ fresh
 *   - otherwise                         ⇒ stale
 */
function refState(stored: Fingerprint, current: Fingerprint): FreshnessState {
  if (stored.value === null || stored.tier === "unknown") return "unknown";
  if (current.value === null || current.tier === "unknown") return "unknown";
  return current.tier === stored.tier && current.value === stored.value ? "fresh" : "stale";
}

/** Combine ref states into the claim's own (pre-cascade) state. */
function selfState(refStates: FreshnessState[]): FreshnessState {
  if (refStates.length === 0) return "unknown"; // no evidence ⇒ cannot be fresh
  if (refStates.some((s) => s === "stale")) return "stale";
  if (refStates.some((s) => s === "unknown")) return "unknown";
  return "fresh";
}

/**
 * Re-fingerprint every evidence ref of a claim and classify each against the stored fingerprint of
 * the same ref. Refs are matched to stored fingerprints by `ref` string (the stable handle). A ref
 * with no stored fingerprint is treated as `unknown` (never stamped ⇒ cannot be proven fresh).
 */
function claimRefStates(
  fm: ClaimFrontmatter,
  hostRoot: string,
  as_of: string,
  remoteHost?: string,
): FreshnessState[] {
  const stored = new Map<string, Fingerprint>();
  for (const f of fm.fingerprints) stored.set(f.ref, f);

  const states: FreshnessState[] = [];
  for (const line of fm.evidence_lines) {
    for (const ref of line.refs) {
      const s = stored.get(ref.ref);
      if (s === undefined) {
        states.push("unknown");
        continue;
      }
      const current = fingerprintRef(hostRoot, ref as EvidenceRef, as_of, remoteHost);
      states.push(refState(s, current));
    }
  }
  return states;
}

/**
 * Compute freshness for ALL given claims (ADR-0002). Returns a Map id → FreshnessState (the bare v2
 * enum; the tier/timestamp object of v1 is gone). `as_of` is the recompute timestamp passed to
 * `fingerprintRef` for any newly-taken fingerprints; it is not stored on the result (freshness is a
 * bare enum on the claim now).
 *
 * Self-state is computed per claim from its evidence refs, then the dependency cascade is resolved to
 * a fixpoint (currently a no-op — see module header — since v2 has no claim→claim dependency edge).
 */
export function computeFreshness(
  claims: ClaimFile[],
  hostRoot: string,
  as_of: string,
  remoteHost?: string,
): Map<string, FreshnessState> {
  // Pre-compute each claim's own (pre-cascade) self-state from its evidence refs.
  const own = new Map<string, FreshnessState>();
  for (const c of claims) {
    const fm = c.frontmatter;
    own.set(fm.id, selfState(claimRefStates(fm, hostRoot, as_of, remoteHost)));
  }

  // Resolve the dependency cascade to a fixpoint. The v2 claim handle has no claim→claim dependency
  // field, so `dependsOn` is empty for every claim and this loop converges immediately on self-state.
  // Kept for forward-compatibility and to make the "stale propagates, never reverses" property
  // explicit and cycle-safe.
  const dependsOn = (_fm: ClaimFrontmatter): readonly string[] => [];

  const resolved = new Map<string, FreshnessState>();
  for (const c of claims) resolved.set(c.frontmatter.id, own.get(c.frontmatter.id) ?? "unknown");
  const inSet = new Set(claims.map((c) => c.frontmatter.id));

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of claims) {
      const id = c.frontmatter.id;
      if (resolved.get(id) === "stale") continue; // monotone: cannot move further
      for (const dep of dependsOn(c.frontmatter)) {
        if (!inSet.has(dep)) continue; // out-of-set dep cannot make us stale on its own
        if (resolved.get(dep) === "stale") {
          resolved.set(id, "stale");
          changed = true;
          break;
        }
      }
    }
  }

  return resolved;
}
