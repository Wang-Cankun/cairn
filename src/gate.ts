/**
 * gate.ts — the iron-rule reach-ground gate (ADR-0001, CONTRACTS §6).
 *
 * A claim reaches ground if it has a direct grounding edge, OR transitively depends_on a claim
 * that reaches ground. The recursive CTE computes the grounded set; any canonical-candidate NOT in
 * it fails the gate. Cycles never reach ground (a cycle with no grounding edge is unreachable), so
 * they surface here as offenders.
 */

import type { Database } from "bun:sqlite";
import { buildIndex, type ClaimRowStatus } from "./index.ts";
import type { ClaimFile } from "./types.ts";

const REACH_GROUND_SQL = `
WITH RECURSIVE grounded(id) AS (
  SELECT DISTINCT claim_id FROM claim_evidence
  UNION
  SELECT d.claim_id FROM claim_dep d JOIN grounded g ON d.depends_on = g.id
)
SELECT id FROM claim
WHERE status = 'canonical-candidate' AND id NOT IN (SELECT id FROM grounded)
ORDER BY id;
`;

/** Run the reach-ground query over a prepared index; returns offending claim ids (empty = pass). */
export function offendingClaims(db: Database): string[] {
  const rows = db.query(REACH_GROUND_SQL).all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/**
 * Compute the candidate set the gate must clear (CONTRACTS §6.1): every claim ALREADY `canonical`,
 * PLUS every `draft` with >=1 grounding edge. Both are marked `canonical-candidate` (in-memory) so
 * the reach-ground query checks them. Zero-edge drafts stay `draft` and are NOT candidates.
 *
 * `promotableIds` (returned alongside) are the grounded DRAFTS that would be promoted on a passing
 * publish — distinct from existing canonical claims, which are candidates but not "promoted".
 */
export function candidateOverrides(claims: ClaimFile[]): {
  overrides: Map<string, ClaimRowStatus>;
  promotableIds: string[];
} {
  const overrides = new Map<string, ClaimRowStatus>();
  const promotableIds: string[] = [];
  for (const c of claims) {
    const fm = c.frontmatter;
    if (fm.status === "canonical") {
      overrides.set(fm.id, "canonical-candidate");
    } else if (fm.status === "draft" && fm.grounding.length > 0) {
      overrides.set(fm.id, "canonical-candidate");
      promotableIds.push(fm.id);
    }
  }
  return { overrides, promotableIds };
}

export interface GateResult {
  /** True if every canonical-candidate reaches ground. */
  ok: boolean;
  /** Claim ids that failed to reach ground (cycles + dependency-only-on-ungrounded). */
  offenders: string[];
  /** Ids of grounded drafts that would be promoted to canonical on a passing publish. */
  candidateIds: string[];
}

/**
 * Run the full gate over the claim set: build the index with candidate overrides, run the
 * reach-ground query. Pure (no disk writes). publish.ts reuses this before promoting.
 */
export function runGate(claims: ClaimFile[]): GateResult {
  const { overrides, promotableIds } = candidateOverrides(claims);
  const db = buildIndex(claims, overrides);
  try {
    const offenders = offendingClaims(db);
    return {
      ok: offenders.length === 0,
      offenders,
      candidateIds: promotableIds.sort(),
    };
  } finally {
    db.close();
  }
}
