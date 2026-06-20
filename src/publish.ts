/**
 * publish.ts — the DATA side of `cairn publish` (spec §(d), §(e)).
 *
 * v2 OKF bundle freeze (ADR-0003): a publish freezes an IMMUTABLE, CONTENT-ADDRESSED, canonical-only
 * OKF bundle into `snapshots/<snapshot-hash>/` and appends a diff entry to `log.md` (the time spine).
 * The v1 self-invented snapshot format and bundled React site are RETIRED — a snapshot is a plain OKF
 * bundle (claims/ estimands/ confounds/ + a frozen index.md) rendered by a standard OKF visualizer.
 *
 * Steps:
 *  1. validate — run all promotion gates (runGate). Block (PublishError) on any violation.
 *  2. Promote passing grounded drafts to lifecycle:canonical (rewrite their files; CLI is sole writer),
 *     re-locking every CLI-computed field on the rewrite.
 *  3. Compute the published head (canonical only) with freshness frozen-at-publish.
 *  4. Content-hash the canonical view → snapshot id (excludes timestamps; includes freshness state).
 *  5. Freeze the canonical-only OKF bundle into snapshots/<id>/ (claims/estimands/confounds + index.md
 *     + a machine head.json for diffing). Immutable: never rewrite a complete snapshot.
 *  6. Emit the live orient surface to cairn/index.md, append a diff entry to log.md.
 *  7. Run the warn-only reconcile (never blocks).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeFreshness } from "./freshness.ts";
import { candidateSet, runGate } from "./gate.ts";
import { deriveCorroboration, lockedResolution, lockedVerification } from "./gate.ts";
import { reconcile, type ReconcileReport } from "./reconcile.ts";
import {
  buildOrientSurface,
  canonicalFrontmatter,
  computeDiff,
  computeSnapshotId,
  toPublishedClaim,
} from "./snapshot.ts";
import { renderIndexMd } from "./render.ts";
import { appendLog, isoNow, nodeExists, readAllClaims, readConfig, writeClaim } from "./store.ts";
import { isGrounded } from "./claimfile.ts";
import type {
  ClaimFile,
  GateResult,
  GateViolation,
  PublishedClaim,
  SnapshotDiff,
  StorePaths,
} from "./types.ts";

export class PublishError extends Error {}

/** A frozen snapshot's machine head, written into snapshots/<id>/head.json for lineage + diffing. */
export interface SnapshotHead {
  snapshot: string; // this snapshot id
  previous: string | null; // the prior snapshot id (lineage)
  published_at: string; // ISO-8601 (informational; NOT part of the id)
  claims: PublishedClaim[]; // canonical-only published view
}

export interface PublishResult {
  snapshotId: string;
  previousId: string | null;
  promoted: string[]; // ids promoted draft->canonical this publish
  head: SnapshotHead;
  diff: SnapshotDiff;
  reconcile: ReconcileReport;
  reused: boolean; // true if snapshot id already existed (no-op re-publish)
}

/**
 * Resolve the previous published snapshot id from the log.md time spine. We scan log.md for the most
 * recent `publish <id>` marker. Returns null if no prior publish is recorded.
 */
function previousSnapshotId(paths: StorePaths): string | null {
  if (!existsSync(paths.logPath)) return null;
  let text: string;
  try {
    text = readFileSync(paths.logPath, "utf8");
  } catch {
    return null;
  }
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^- publish\s+([0-9a-f]+)\b/);
    if (m && m[1]) ids.push(m[1]);
  }
  return ids.length > 0 ? (ids[ids.length - 1] as string) : null;
}

/** Read a prior frozen snapshot's head.json (for diffing). Returns null if unreadable/absent. */
function readSnapshotHead(paths: StorePaths, id: string): SnapshotHead | null {
  const headPath = join(paths.snapshotsDir, id, "head.json");
  if (!existsSync(headPath)) return null;
  try {
    return JSON.parse(readFileSync(headPath, "utf8")) as SnapshotHead;
  } catch {
    return null;
  }
}

/**
 * Re-lock every CLI-computed field on a claim frontmatter to its derived value (trust-field lock,
 * c.6 / ADR-0004), given the live candidate ids (for resolution) and computed freshness. This is the
 * write-time enforcement: an agent-supplied trust badge is discarded and replaced by the computed
 * value. `reach_ground` is the per-claim grounding-edge check; freshness comes from computeFreshness.
 */
function relock(
  fm: ClaimFile["frontmatter"],
  liveIds: ReadonlySet<string>,
  freshness: Map<string, import("./types.ts").FreshnessState>,
): ClaimFile["frontmatter"] {
  return {
    ...fm,
    corroboration: deriveCorroboration(fm),
    freshness: freshness.get(fm.id) ?? "unknown",
    reach_ground: isGrounded(fm),
    resolution: lockedResolution(fm, liveIds),
    verification: lockedVerification(fm),
  };
}

/**
 * Referential-integrity violations: every CANDIDATE-canonical claim's cited estimand (if declared) and
 * each inherited confound MUST EXIST as a node on disk. This is the existence companion to the pure
 * estimand-required PRESENCE gate (gate c.1b): presence says "the field is set", existence says "the
 * node it points at is really there", so a canonical claim never ships referencing a question/caveat
 * absent from the bundle (and freezeBundle never silently skips a missing referenced node). It compares
 * ids and tests file existence ONLY — it never reads a node body — so the ADR-0004/0005 ceiling (the
 * CLI judges ids, never meaning) holds. It lives here, NOT in the pure (filesystem-free) gate.ts,
 * because verifying existence necessarily touches the store.
 */
export function referentialIntegrityViolations(
  paths: StorePaths,
  claims: ClaimFile[],
): GateViolation[] {
  const { candidates } = candidateSet(claims);
  const out: GateViolation[] = [];
  for (const c of candidates) {
    const fm = c.frontmatter;
    if (fm.estimand !== undefined && !nodeExists(paths, fm.estimand)) {
      out.push({
        gate: "referential-integrity",
        claim: fm.id,
        detail: fm.estimand,
        message: `claim ${fm.id} cites estimand ${fm.estimand} but no estimands/${fm.estimand}.md exists (a canonical claim's question node must exist)`,
      });
    }
    for (const cfd of fm.inherits_caveat) {
      if (!nodeExists(paths, cfd)) {
        out.push({
          gate: "referential-integrity",
          claim: fm.id,
          detail: cfd,
          message: `claim ${fm.id} inherits caveat ${cfd} but no confounds/${cfd}.md exists (an inherited confound node must exist)`,
        });
      }
    }
  }
  return out;
}

/**
 * Run the data side of publish against an already-resolved store. Returns a PublishResult; throws
 * PublishError (naming the failing gate + claim) if validate fails.
 */
export function publish(paths: StorePaths, opts: { now?: Date } = {}): PublishResult {
  const now = opts.now ?? new Date();
  const published_at = isoNow(now);
  const config = readConfig(paths);

  let claims = readAllClaims(paths);

  // 1. validate — all promotion gates (pure mechanism) PLUS referential integrity (cited estimand /
  // inherited confound nodes must exist on disk; the one check that must touch the store).
  const gate: GateResult = runGate(claims);
  const violations: GateViolation[] = [
    ...gate.violations,
    ...referentialIntegrityViolations(paths, claims),
  ];
  if (violations.length > 0) {
    const lines = violations.map((v) => `${v.gate}/${v.claim}: ${v.message}`);
    throw new PublishError(`validate failed (${violations.length} violation(s)):\n  ${lines.join("\n  ")}`);
  }

  // 2. Promote passing grounded drafts to canonical (rewrite files), RE-LOCKING every CLI-computed
  // field on the rewrite (trust-field lock c.6 / ADR-0004). This is the write-time override the
  // contract describes ("override on every write"), not merely the blocking gate above: even though the
  // gate already refused an illegal verified/cross-reviewed/settled, the promotion write still re-locks
  // so the canonical file is the derived value, never an agent-supplied one.
  //
  // liveIds for the resolution lock = the candidate-canonical set (canonical + grounded drafts being
  // promoted now); freshness is computed once here so the promotion write stamps the frozen-at-publish
  // freshness too.
  const preFreshness = computeFreshness(claims, paths.hostRoot, published_at, config.remote_host);
  const { candidates } = candidateSet(claims);
  const promoteLiveIds: ReadonlySet<string> = new Set(candidates.map((c) => c.frontmatter.id));

  const promotable = new Set(gate.candidateIds);
  const promoted: string[] = [];
  for (const c of claims) {
    if (promotable.has(c.frontmatter.id) && c.frontmatter.lifecycle === "draft") {
      const locked = relock({ ...c.frontmatter, lifecycle: "canonical" as const }, promoteLiveIds, preFreshness);
      writeClaim(paths, locked, c.body);
      promoted.push(locked.id);
    }
  }
  if (promoted.length > 0) claims = readAllClaims(paths);

  // 3. Published head: canonical only, freshness frozen at publish (as_of = published_at).
  const freshness = computeFreshness(claims, paths.hostRoot, published_at, config.remote_host);

  // 3b. RE-LOCK every canonical claim's LIVE file to the just-computed freshness + reach_ground BEFORE
  // freezing, so the byte-for-byte frozen copy (freezeBundle) can never disagree with head.json / the
  // snapshot id. A publish AFTER an artifact change but WITHOUT a prior `refresh` would otherwise freeze
  // a claim file still stamped `fresh` while head.json (computed live) says `stale` — the exact
  // false-fresh enemy Cairn exists to kill, frozen into an immutable bundle. Recompute-only write
  // (asserter unchanged, body preserved): freshness is recomputed from the STORED fingerprints, never
  // re-baselined (re-baselining would launder a moved artifact into a false `fresh`), and the pure trust
  // fields are re-derived (already gate-validated equal). Only files that actually drift are rewritten,
  // so an already-consistent store (e.g. a refresh-then-publish) sees no churn.
  let relocked = false;
  for (const c of claims) {
    const fm = c.frontmatter;
    if (fm.lifecycle !== "canonical") continue;
    const fr = freshness.get(fm.id) ?? "unknown";
    if (fm.freshness === fr && fm.reach_ground === isGrounded(fm)) continue;
    writeClaim(paths, relock(fm, promoteLiveIds, freshness), c.body);
    relocked = true;
  }
  if (relocked) claims = readAllClaims(paths);

  const canonical = canonicalFrontmatter(claims);
  const publishedClaims: PublishedClaim[] = canonical.map((fm) =>
    toPublishedClaim(fm, freshness.get(fm.id) ?? "unknown"),
  );

  // 4. Snapshot id (content-addressed; excludes timestamps; includes freshness state).
  const snapshotId = computeSnapshotId(canonical, freshness);

  // Previous lineage from the log.md time spine; ignore a previous that equals THIS id (idempotent
  // re-publish of identical content) so the diff points at the genuinely prior distinct snapshot.
  const rawPrevId = previousSnapshotId(paths);
  const previousId = rawPrevId && rawPrevId !== snapshotId ? rawPrevId : null;
  const previousHead = previousId ? readSnapshotHead(paths, previousId) : null;
  const diff = computeDiff(
    publishedClaims,
    previousHead ? { against: previousHead.snapshot, claims: previousHead.claims } : null,
  );

  const head: SnapshotHead = {
    snapshot: snapshotId,
    previous: previousId,
    published_at,
    claims: publishedClaims,
  };

  // 5. Freeze the immutable, content-addressed, canonical-only OKF bundle. A complete snapshot is
  // identified by its head.json existing; a half-built dir (crash mid-freeze) is cleared and rebuilt.
  const snapshotDir = join(paths.snapshotsDir, snapshotId);
  const snapshotHeadPath = join(snapshotDir, "head.json");
  const reused = existsSync(snapshotHeadPath);
  if (!reused) {
    if (existsSync(snapshotDir)) rmSync(snapshotDir, { recursive: true, force: true });
    freezeBundle(paths, snapshotDir, claims, canonical, publishedClaims, freshness);
    writeFileSync(snapshotHeadPath, JSON.stringify(head, null, 2) + "\n", "utf8");
  }

  // 6. Emit the live orient surface to cairn/index.md + append the diff entry to log.md.
  const orient = buildOrientSurface(canonical, freshness);
  writeFileSync(paths.indexPath, renderIndexMd(orient, published_at), "utf8");
  appendLog(paths, logEntry(snapshotId, previousId, published_at, promoted, diff, reused));

  // 7. Warn-only reconcile (never blocks).
  const report = reconcile(paths.hostRoot, config, claims);

  return { snapshotId, previousId, promoted, head, diff, reconcile: report, reused };
}

/**
 * Freeze the canonical-only OKF bundle into snapshots/<id>/: the frozen canonical claim files, the
 * estimand/confound nodes they reference (carried by reference into the bundle), and a frozen
 * index.md orient surface. Drafts are NEVER copied into a snapshot bundle (ADR-0001).
 */
function freezeBundle(
  paths: StorePaths,
  snapshotDir: string,
  claims: ClaimFile[],
  canonical: ClaimFile["frontmatter"][],
  publishedClaims: PublishedClaim[],
  freshness: Map<string, import("./types.ts").FreshnessState>,
): void {
  const claimsDir = join(snapshotDir, "claims");
  const estimandsDir = join(snapshotDir, "estimands");
  const confoundsDir = join(snapshotDir, "confounds");
  mkdirSync(claimsDir, { recursive: true });
  mkdirSync(estimandsDir, { recursive: true });
  mkdirSync(confoundsDir, { recursive: true });

  const canonicalIds = new Set(canonical.map((fm) => fm.id));
  const byId = new Map(claims.map((c) => [c.frontmatter.id, c]));

  // Frozen canonical claim files (copied byte-for-byte from the live store).
  const estimandRefs = new Set<string>();
  const confoundRefs = new Set<string>();
  for (const id of canonicalIds) {
    const c = byId.get(id);
    if (!c) continue;
    cpSync(c.path, join(claimsDir, `${id}.md`));
    if (c.frontmatter.estimand) estimandRefs.add(c.frontmatter.estimand);
    for (const cfd of c.frontmatter.inherits_caveat) confoundRefs.add(cfd);
  }

  // Carry referenced estimand / confound nodes into the bundle (by reference).
  for (const eid of estimandRefs) {
    const src = join(paths.estimandsDir, `${eid}.md`);
    if (existsSync(src)) cpSync(src, join(estimandsDir, `${eid}.md`));
  }
  for (const cid of confoundRefs) {
    const src = join(paths.confoundsDir, `${cid}.md`);
    if (existsSync(src)) cpSync(src, join(confoundsDir, `${cid}.md`));
  }

  // Frozen orient surface of this snapshot.
  const orient = buildOrientSurface(canonical, freshness);
  writeFileSync(join(snapshotDir, "index.md"), renderIndexMd(orient, undefined), "utf8");
}

/** A one-line, machine-greppable log.md entry for a publish (the time spine). */
function logEntry(
  snapshotId: string,
  previousId: string | null,
  published_at: string,
  promoted: string[],
  diff: SnapshotDiff,
  reused: boolean,
): string {
  const c = diff.counts;
  const tail =
    `prev=${previousId ?? "(none)"} at=${published_at} ` +
    `promoted=${promoted.length} +${c.added} -${c.removed} ` +
    `text=${c.text_changed} fresh=${c.freshness_changed} verif=${c.verification_changed} resol=${c.resolution_changed}` +
    (reused ? " (reused)" : "");
  return `- publish ${snapshotId}  ${tail}`;
}
