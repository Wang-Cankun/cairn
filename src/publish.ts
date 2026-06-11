/**
 * publish.ts — the DATA side of `cairn publish` (CONTRACTS §§3-7, decisions A-F).
 *
 * Steps:
 *  1. Run the reach-ground gate over canonical + grounded-draft candidates. Block on failure.
 *  2. Promote passing grounded drafts to status:canonical (rewrite their claim files — CLI is the
 *     sole writer).
 *  3. Compute the published head (canonical only, decision A) with freshness frozen-at-publish
 *     (decision C, as_of = published_at).
 *  4. Content-hash the canonical set -> snapshot id (decision E, excludes timestamps).
 *  5. Write snapshots/<id>/data/{head.json,diff.json}; the static site assets are copied at a
 *     clearly-marked HOOK POINT (decision F — the integration pass wires the bundle source).
 *  6. Mirror the snapshot into published/latest/ (decision B, COPY) and update cairn/head.json.
 *  7. Run the warn-only reconcile (never blocks).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeFreshness } from "./freshness.ts";
import { runGate, type GateResult } from "./gate.ts";
import { reconcile, type ReconcileReport } from "./reconcile.ts";
import {
  canonicalFrontmatter,
  computeDiff,
  computeSnapshotId,
  toPublishedClaim,
} from "./snapshot.ts";
import { isoNow, readAllClaims, readConfig, writeClaim } from "./store.ts";
import type {
  ClaimFile,
  PublishedClaim,
  PublishedHead,
  SnapshotDiff,
  StorePaths,
} from "./types.ts";

export class PublishError extends Error {}

export interface PublishResult {
  snapshotId: string;
  previousId: string | null;
  promoted: string[]; // ids promoted draft->canonical this publish
  head: PublishedHead;
  diff: SnapshotDiff;
  reconcile: ReconcileReport;
  reused: boolean; // true if snapshot id already existed (no-op re-publish)
}

/** Read the previous published head (cairn/head.json), or null on first publish. */
function readPreviousHead(paths: StorePaths): PublishedHead | null {
  if (!existsSync(paths.headJsonPath)) return null;
  try {
    return JSON.parse(readFileSync(paths.headJsonPath, "utf8")) as PublishedHead;
  } catch {
    return null;
  }
}

/**
 * HOOK POINT (decision F): copy the prebuilt static site bundle into the snapshot dir. v1 data
 * pass leaves this for the integration pass to wire to the real bundle source. If a prebuilt
 * bundle exists at `<store>/../site/dist` or env CAIRN_SITE_DIST, copy it; otherwise write a
 * minimal placeholder index.html that loads ./data/head.json (so the snapshot is self-contained
 * and openable even before the React bundle is wired).
 */
export function copySiteBundle(snapshotDir: string, siteDist?: string): "bundle" | "placeholder" {
  const src = siteDist ?? process.env.CAIRN_SITE_DIST;
  if (src && existsSync(src)) {
    cpSync(src, snapshotDir, { recursive: true });
    return "bundle";
  }
  // Self-contained placeholder so the snapshot is openable; integration pass replaces this.
  const placeholder = `<!doctype html>
<meta charset="utf-8">
<title>Cairn published head</title>
<body>
<h1>Cairn — published head</h1>
<p>Static site bundle not yet wired (decision F hook point). Machine-readable data:</p>
<ul>
  <li><a href="./data/head.json">data/head.json</a></li>
  <li><a href="./data/diff.json">data/diff.json</a></li>
</ul>
</body>`;
  writeFileSync(join(snapshotDir, "index.html"), placeholder, "utf8");
  return "placeholder";
}

/**
 * Run the data side of publish against an already-resolved store. Returns a PublishResult; throws
 * PublishError (with offender ids) if the gate fails.
 */
export function publish(
  paths: StorePaths,
  opts: { now?: Date; siteDist?: string } = {},
): PublishResult {
  const now = opts.now ?? new Date();
  const published_at = isoNow(now);

  let claims = readAllClaims(paths);

  // 1. Gate.
  const gate: GateResult = runGate(claims);
  if (!gate.ok) {
    throw new PublishError(
      `reach-ground gate failed; these candidates cannot reach ground: ${gate.offenders.join(", ")}`,
    );
  }

  // 2. Promote passing grounded drafts to canonical (rewrite files).
  const promoted: string[] = [];
  for (const c of claims) {
    if (gate.candidateIds.includes(c.frontmatter.id) && c.frontmatter.status === "draft") {
      const fm = { ...c.frontmatter, status: "canonical" as const };
      writeClaim(paths, fm, c.body);
      promoted.push(fm.id);
    }
  }
  // Re-read so subsequent steps see promoted statuses.
  if (promoted.length > 0) claims = readAllClaims(paths);

  // 3. Published head: canonical only, freshness frozen at publish (as_of = published_at).
  const canonical = canonicalFrontmatter(claims);
  const freshness = computeFreshness(claims, paths.hostRoot, published_at);
  const publishedClaims: PublishedClaim[] = canonical.map((fm) => {
    const fr = freshness.get(fm.id);
    if (!fr) throw new PublishError(`internal: missing freshness for ${fm.id}`);
    return toPublishedClaim(fm, fr);
  });

  // 4. Snapshot id (excludes timestamps).
  const snapshotId = computeSnapshotId(canonical);
  // A head.json written by `head`/`refresh` carries snapshot.current === "" (no snapshot). Treat
  // that as "no previous snapshot" so the convenience head never pollutes publish lineage/diff.
  const prevRaw = readPreviousHead(paths);
  const previousHead = prevRaw && prevRaw.snapshot.current ? prevRaw : null;
  const previousId = previousHead ? previousHead.snapshot.current : null;

  const head: PublishedHead = {
    schema: "cairn.head/1",
    snapshot: { current: snapshotId, previous: previousId },
    published_at,
    claims: publishedClaims,
  };
  const diff = computeDiff(publishedClaims, previousHead);

  // 5. Write the immutable snapshot (never mutate an existing one).
  const snapshotDir = join(paths.snapshotsDir, snapshotId);
  const reused = existsSync(snapshotDir);
  if (!reused) {
    const dataDir = join(snapshotDir, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "head.json"), JSON.stringify(head, null, 2) + "\n", "utf8");
    writeFileSync(join(dataDir, "diff.json"), JSON.stringify(diff, null, 2) + "\n", "utf8");
    copySiteBundle(snapshotDir, opts.siteDist); // decision F hook point
  }

  // 6. Mirror newest snapshot to published/latest/ (COPY, decision B) + cairn/head.json.
  if (existsSync(paths.publishedLatestDir)) {
    rmSync(paths.publishedLatestDir, { recursive: true, force: true });
  }
  mkdirSync(paths.publishedLatestDir, { recursive: true });
  cpSync(snapshotDir, paths.publishedLatestDir, { recursive: true });
  writeFileSync(paths.headJsonPath, JSON.stringify(head, null, 2) + "\n", "utf8");

  // 7. Warn-only reconcile (never blocks).
  const report = reconcile(paths.hostRoot, readConfig(paths), claims);

  return { snapshotId, previousId, promoted, head, diff, reconcile: report, reused };
}
