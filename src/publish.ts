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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Read the previous published head for lineage/diff. Source = `published/latest/data/head.json`,
 * which is written ONLY by publish — NOT the mutable convenience `cairn/head.json`, which `refresh`
 * and `head` clobber (they set snapshot.current="") and would otherwise erase publish lineage.
 * Falls back to `cairn/head.json` only if it carries a real (non-empty) snapshot id, for stores
 * predating the latest/ dir. Returns null on first publish.
 */
function readPreviousHead(paths: StorePaths): PublishedHead | null {
  const latestHead = join(paths.publishedLatestDir, "data", "head.json");
  for (const candidate of [latestHead, paths.headJsonPath]) {
    if (!existsSync(candidate)) continue;
    try {
      const h = JSON.parse(readFileSync(candidate, "utf8")) as PublishedHead;
      if (h?.snapshot?.current) return h;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Resolve the prebuilt site bundle dir (decision F). Precedence: explicit arg, then
 * CAIRN_SITE_DIST env, then the repo's own `site/dist` (resolved relative to THIS source file, so
 * it works regardless of cwd / where the host store lives). Returns null if none resolves to an
 * existing dir.
 */
export function resolveSiteDist(siteDist?: string): string | null {
  const candidates = [siteDist, process.env.CAIRN_SITE_DIST].filter(Boolean) as string[];
  // Repo-relative default: src/publish.ts -> ../site/dist
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(join(here, "..", "site", "dist"));
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  return null;
}

/**
 * Copy the prebuilt static site bundle (decision F) into the snapshot dir. Copies `index.html`,
 * `assets/` and `fonts/` only — NOT the bundle's `data/` (those are DEV fixtures; the real
 * `data/head.json` + `data/diff.json` are written separately by publish). Caller passes a resolved
 * dist dir (see resolveSiteDist); throws PublishError if it is missing so the operator is told to
 * build the site first.
 */
export function copySiteBundle(snapshotDir: string, dist: string | null): void {
  if (!dist) {
    throw new PublishError(
      "prebuilt site bundle not found (site/dist/index.html missing). Run `bun run build:site` first.",
    );
  }
  // Copy everything except data/ (dev fixtures overwritten by the real data written separately).
  cpSync(dist, snapshotDir, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(dist.length).replace(/^[/\\]/, "");
      return rel !== "data" && !rel.startsWith("data/") && !rel.startsWith("data\\");
    },
  });
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

  // Resolve the prebuilt site bundle up front so we fail BEFORE mutating any files (promoting
  // drafts, writing snapshots) if the site has not been built (decision F).
  const dist = resolveSiteDist(opts.siteDist);
  if (!dist) {
    throw new PublishError(
      "prebuilt site bundle not found (site/dist/index.html missing). Run `bun run build:site` first.",
    );
  }

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
  // Load config once: remote_host drives remote-md5 re-fingerprinting (CONTRACTS §8), reused below
  // for the warn-only reconcile.
  const config = readConfig(paths);
  const canonical = canonicalFrontmatter(claims);
  const freshness = computeFreshness(claims, paths.hostRoot, published_at, config.remote_host);
  const publishedClaims: PublishedClaim[] = canonical.map((fm) => {
    const fr = freshness.get(fm.id);
    if (!fr) throw new PublishError(`internal: missing freshness for ${fm.id}`);
    return toPublishedClaim(fm, fr);
  });

  // 4. Snapshot id (Option X): hashes the published VIEW — canonical claims INCLUDING their
  // computed freshness {state, tier} — while excluding all wall-clock timestamps. So a
  // freshness-only change (artifact mutated -> refresh -> publish) yields a NEW id, while a true
  // no-op republish (same claims, same freshness) is idempotent.
  const snapshotId = computeSnapshotId(canonical, freshness);
  // Previous lineage comes from published/latest/ (durable; refresh/head can't clobber it).
  const previousHead = readPreviousHead(paths);
  // Re-publishing the SAME content head (same id) is a no-op for lineage/diff: don't diff a head
  // against itself. Treat a previous head whose id equals this id as "no previous" so `against`
  // points at the genuinely prior DISTINCT snapshot (or null on the very first publish).
  const effectivePrev = previousHead && previousHead.snapshot.current !== snapshotId ? previousHead : null;
  const previousId = effectivePrev ? effectivePrev.snapshot.current : null;

  const head: PublishedHead = {
    schema: "cairn.head/1",
    snapshot: { current: snapshotId, previous: previousId },
    published_at,
    claims: publishedClaims,
  };
  const diff = computeDiff(publishedClaims, effectivePrev);

  // 5. Write the immutable snapshot (never mutate an existing COMPLETE one). Robustness: gate
  // `reused` on the snapshot's data/head.json EXISTING, not merely the dir. A prior publish that
  // created the dir but crashed before writing data/ leaves a wedged half-snapshot; treating the
  // dir alone as "reused" would skip the data write and then crash at the cpSync of data/head.json
  // (ENOENT) on every future publish. By checking the completion marker (data/head.json) we
  // (re)write a half-built snapshot to completion instead of wedging. A genuinely complete snapshot
  // is still left byte-identical (immutability preserved: we only write when incomplete).
  const snapshotDir = join(paths.snapshotsDir, snapshotId);
  const snapshotHead = join(snapshotDir, "data", "head.json");
  const reused = existsSync(snapshotHead);
  if (!reused) {
    // Copy the prebuilt static bundle FIRST (index.html + assets/ + fonts/, NOT its dev data/),
    // then write the real data/ on top so the snapshot is self-contained (decision F). If a wedged
    // half-snapshot dir exists, clear it first so the bundle copy starts clean.
    if (existsSync(snapshotDir)) rmSync(snapshotDir, { recursive: true, force: true });
    mkdirSync(snapshotDir, { recursive: true });
    copySiteBundle(snapshotDir, dist);
    const dataDir = join(snapshotDir, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(snapshotHead, JSON.stringify(head, null, 2) + "\n", "utf8");
    writeFileSync(join(dataDir, "diff.json"), JSON.stringify(diff, null, 2) + "\n", "utf8");
  }

  // 6. Mirror newest snapshot to published/latest/ (COPY, decision B) + cairn/head.json.
  // latest/ and cairn/head.json mirror the IMMUTABLE snapshot exactly. For a reused id (republish
  // of identical content), that snapshot keeps its ORIGINAL frozen-at-publish freshness (decisions
  // C+E: same content head == same immutable snapshot), so latest/ and head.json stay byte-aligned
  // with the snapshot rather than carrying a divergent freshly-frozen copy.
  if (existsSync(paths.publishedLatestDir)) {
    rmSync(paths.publishedLatestDir, { recursive: true, force: true });
  }
  mkdirSync(paths.publishedLatestDir, { recursive: true });
  cpSync(snapshotDir, paths.publishedLatestDir, { recursive: true });
  cpSync(join(snapshotDir, "data", "head.json"), paths.headJsonPath);

  // 7. Warn-only reconcile (never blocks).
  const report = reconcile(paths.hostRoot, config, claims);

  return { snapshotId, previousId, promoted, head, diff, reconcile: report, reused };
}
