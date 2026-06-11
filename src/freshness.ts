/**
 * freshness.ts — compute per-claim freshness from evidence fingerprints (ADR-0002, CONTRACTS §9).
 *
 * Per grounding edge: re-fingerprint by method, compare to the stamped fingerprint -> per-edge
 * state. Per-edge state:
 *   - UNKNOWN if the stamped fingerprint was "unknown" OR the artifact is now unreachable
 *     (recompute returns "unknown").
 *   - stale if the recomputed fingerprint differs from the stamp.
 *   - fresh if it matches.
 *
 * Claim state:
 *   - stale if ANY edge changed OR any depends_on claim is stale (cascade);
 *   - else unknown if any edge is unknown;
 *   - else fresh.
 *
 * Tier = best tier among the claim's grounding edges (TIER_ORDER). The dependency cascade is
 * resolved to a FIXPOINT by forward-propagating staleness over the dep graph, so it is both
 * cycle-safe AND order-independent: any claim transitively reachable to a stale node becomes
 * stale even when it sits in a dependency cycle (the failure a memoized DFS short-circuiting on
 * in-progress cycle nodes silently under-reports — CONTRACTS §9).
 */

import { fingerprintByMethod, UNKNOWN } from "./fingerprint.ts";
import { METHOD_TIER, TIER_ORDER } from "./types.ts";
import type {
  ClaimFile,
  ClaimFrontmatter,
  Freshness,
  FreshnessState,
  GroundingEdge,
  Tier,
} from "./types.ts";

type EdgeState = FreshnessState;

/** Re-fingerprint one edge and classify it vs its stamped value. */
export function edgeState(hostRoot: string, edge: GroundingEdge, remoteHost?: string): EdgeState {
  if (edge.fingerprint === UNKNOWN) return "unknown";
  const current = fingerprintByMethod(hostRoot, edge.method, edge.ref, edge.location, remoteHost);
  if (current === UNKNOWN) return "unknown";
  return current === edge.fingerprint ? "fresh" : "stale";
}

/** Best (most rigorous) tier among a claim's grounding edges. Defaults to "weak" if no edges. */
export function bestTier(grounding: GroundingEdge[]): Tier {
  let best: Tier | null = null;
  for (const g of grounding) {
    const t = METHOD_TIER[g.method];
    if (best === null || TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(best)) best = t;
  }
  return best ?? "weak";
}

/** Combine edge states into the claim's own (pre-cascade) state. */
function selfState(edgeStates: EdgeState[]): FreshnessState {
  if (edgeStates.some((s) => s === "stale")) return "stale";
  if (edgeStates.some((s) => s === "unknown")) return "unknown";
  return "fresh";
}

/**
 * Compute freshness for ALL given claims, with cycle-safe dependency cascade.
 *
 * Returns a Map id -> Freshness. `as_of` is stamped on every entry. Only claims present in
 * `claims` participate in the cascade; a depends_on pointing outside the set is ignored for
 * cascade purposes (it cannot make a claim stale on its own).
 */
export function computeFreshness(
  claims: ClaimFile[],
  hostRoot: string,
  as_of: string,
  remoteHost?: string,
): Map<string, Freshness> {
  const byId = new Map<string, ClaimFrontmatter>();
  for (const c of claims) byId.set(c.frontmatter.id, c.frontmatter);

  // Pre-compute each claim's own (pre-cascade) state + tier from its edges.
  const own = new Map<string, FreshnessState>();
  const tiers = new Map<string, Tier>();
  for (const c of claims) {
    const fm = c.frontmatter;
    const states = fm.grounding.map((e) => edgeState(hostRoot, e, remoteHost));
    own.set(fm.id, selfState(states));
    tiers.set(fm.id, bestTier(fm.grounding));
  }

  // Resolve the cascade to a FIXPOINT (CONTRACTS §9: "stale if any depends_on is stale, cascade").
  // We forward-propagate staleness over the dependency graph rather than a memoized DFS that
  // short-circuits on in-progress cycle nodes (that under-reports: a claim in a dep cycle that
  // transitively depends on a stale node could be silently reported fresh, and order-dependently).
  //
  // Start from each claim's own pre-cascade state, then repeatedly: any claim whose own state is
  // not already stale becomes stale if ANY of its in-set depends_on is stale. Iterate until a full
  // pass makes no change. Monotone (states only move TO stale, never away), so it terminates in at
  // most N passes regardless of cycles. Non-stale states (fresh/unknown) keep their own value —
  // cascade only propagates stale (the enemy is a false `fresh`, never a false `stale`).
  const resolved = new Map<string, FreshnessState>();
  for (const c of claims) resolved.set(c.frontmatter.id, own.get(c.frontmatter.id) ?? "unknown");

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of claims) {
      const id = c.frontmatter.id;
      if (resolved.get(id) === "stale") continue; // already stale; cannot move further
      for (const dep of c.frontmatter.depends_on) {
        if (!byId.has(dep)) continue; // out-of-set dep can't make us stale on its own
        if (resolved.get(dep) === "stale") {
          resolved.set(id, "stale");
          changed = true;
          break;
        }
      }
    }
  }

  const out = new Map<string, Freshness>();
  for (const c of claims) {
    const id = c.frontmatter.id;
    out.set(id, { state: resolved.get(id) ?? "unknown", tier: tiers.get(id) ?? "weak", as_of });
  }
  return out;
}
