/**
 * reconcile.ts — the warn-only reconcile (CONTRACTS §7, CONTEXT enforcement model).
 *
 * Never blocks publish. Two parts:
 *   1. If config.findings_globs is set: scan those host-root-relative files for conclusion-like
 *      lines that carry NO `claim-…` id reference; report the count (terse file:line list).
 *      Absent config -> "not configured".
 *   2. ALWAYS list the ungrounded drafts (zero-edge drafts).
 *
 * Detecting a "conclusion" is fuzzy by design; this is a heuristic count, not a gate.
 */

import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import type { CairnConfig, ClaimFile } from "./types.ts";

const CLAIM_ID_RE = /claim-\d{8}-\d{3}/;
// Conclusion-like heuristic: lines asserting a finding. Intentionally loose.
const CONCLUSION_RE = /\b(we (found|conclude|show|observe)|therefore|conclusion|results? (show|indicate))\b/i;

export interface ReconcileReport {
  configured: boolean;
  /** Conclusion-like lines lacking a claim id: "<relpath>:<lineno>". */
  unreferenced: string[];
  /** Ids of zero-edge (ungrounded) drafts. */
  ungroundedDrafts: string[];
}

export function reconcile(
  hostRoot: string,
  config: CairnConfig,
  claims: ClaimFile[],
): ReconcileReport {
  const ungroundedDrafts = claims
    .filter((c) => c.frontmatter.status === "draft" && c.frontmatter.grounding.length === 0)
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
