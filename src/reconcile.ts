/**
 * reconcile.ts — the warn-only reconcile (spec §(e) `reconcile`, CONTEXT enforcement model).
 *
 * NEVER blocks publish — it makes lapses VISIBLE without pretending prevention. Two parts:
 *   1. If config.findings_globs is set: scan those host-root-relative files for conclusion-like lines
 *      that carry NO `clm-…` claim-id reference; report them (terse "<relpath>:<lineno>" list).
 *      Absent config ⇒ "not configured".
 *   2. ALWAYS list ungrounded drafts (drafts with no evidence ref) — ungrounded threads stay visible,
 *      not silently rotting (ADR-0001).
 *
 * Detecting a "conclusion" is fuzzy by design; this is a heuristic count, not a gate. The CLI never
 * acts on it beyond reporting.
 */

import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { isGrounded } from "./claimfile.ts";
import { ID_PREFIX } from "./types.ts";
import type { CairnConfig, ClaimFile } from "./types.ts";

/** A v2 claim-id reference: `clm-<hex>` (collision-extension tolerant). */
const CLAIM_ID_RE = new RegExp(`${ID_PREFIX.claim}[0-9a-f]+`);
// Conclusion-like heuristic: lines asserting a finding. Intentionally loose.
const CONCLUSION_RE =
  /\b(we (found|conclude|show|observe)|therefore|conclusion|results? (show|indicate))\b/i;

export interface ReconcileReport {
  configured: boolean;
  /** Conclusion-like lines lacking a claim id: "<relpath>:<lineno>". */
  unreferenced: string[];
  /** Ids of ungrounded drafts (drafts with no evidence ref). */
  ungroundedDrafts: string[];
}

export function reconcile(
  hostRoot: string,
  config: CairnConfig,
  claims: ClaimFile[],
): ReconcileReport {
  const ungroundedDrafts = claims
    .filter((c) => c.frontmatter.lifecycle === "draft" && !isGrounded(c.frontmatter))
    .map((c) => c.frontmatter.id)
    .sort();

  const globs = config.findings_globs ?? [];
  if (globs.length === 0) {
    return { configured: false, unreferenced: [], ungroundedDrafts };
  }

  const unreferenced: string[] = [];
  for (const pattern of globs) {
    const g = new Glob(pattern);
    for (const rel of g.scanSync({ cwd: hostRoot, onlyFiles: true })) {
      const abs = `${hostRoot}/${rel}`;
      if (!existsSync(abs)) continue;
      let text: string;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        if (CONCLUSION_RE.test(line) && !CLAIM_ID_RE.test(line)) {
          unreferenced.push(`${rel}:${i + 1}`);
        }
      }
    }
  }
  return { configured: true, unreferenced, ungroundedDrafts };
}
