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
 * Tier = best tier among the claim's grounding edges (TIER_ORDER). Dependency cascade is
 * cycle-safe (visited set).
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
export function edgeState(hostRoot: string, edge: GroundingEdge): EdgeState {
  if (edge.fingerprint === UNKNOWN) return "unknown";
  const current = fingerprintByMethod(hostRoot, edge.method, edge.ref, edge.location);
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
): Map<string, Freshness> {
  const byId = new Map<string, ClaimFrontmatter>();
  for (const c of claims) byId.set(c.frontmatter.id, c.frontmatter);

  // Pre-compute each claim's own (pre-cascade) state + tier from its edges.
  const own = new Map<string, FreshnessState>();
  const tiers = new Map<string, Tier>();
  for (const c of claims) {
    const fm = c.frontmatter;
    const states = fm.grounding.map((e) => edgeState(hostRoot, e));
    own.set(fm.id, selfState(states));
    tiers.set(fm.id, bestTier(fm.grounding));
  }

  // Resolve final state with cascade. stale dominates; cycle-safe via visited + in-progress.
  const resolved = new Map<string, FreshnessState>();
  const inProgress = new Set<string>();

  const resolve = (id: string): FreshnessState => {
    const cached = resolved.get(id);
    if (cached) return cached;
    const fm = byId.get(id);
    if (!fm) return "unknown"; // unknown claim referenced; treat conservatively
    if (inProgress.has(id)) {
      // Cycle: fall back to this claim's own state without further cascade.
      return own.get(id) ?? "unknown";
    }
    inProgress.add(id);
    let state = own.get(id) ?? "unknown";
    if (state !== "stale") {
      for (const dep of fm.depends_on) {
        if (!byId.has(dep)) continue;
        const ds = resolve(dep);
        if (ds === "stale") {
          state = "stale";
          break;
        }
      }
    }
    inProgress.delete(id);
    resolved.set(id, state);
    return state;
  };

  const out = new Map<string, Freshness>();
  for (const c of claims) {
    const id = c.frontmatter.id;
    out.set(id, { state: resolve(id), tier: tiers.get(id) ?? "weak", as_of });
  }
  return out;
}
