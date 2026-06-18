/**
 * store.ts — the OKF bundle: discovery, read/write of the three concept-node types, id minting,
 * timestamp + config helpers.
 *
 * The Cairn store is a self-contained, text-only OKF directory decoupled from the host project's
 * git history (ADR-0003):
 *
 *   <hostRoot>/cairn/
 *     claims/      <clm-id>.md   (type: claim)
 *     estimands/   <est-id>.md   (type: estimand)
 *     confounds/   <cfd-id>.md   (type: confound)
 *     index.md     orient surface emitted by `head`
 *     log.md       append-only time spine
 *     snapshots/   immutable content-addressed publish freezes
 *     config.json  optional
 *
 * Discovery walks up from cwd looking for a `cairn/` dir containing a `claims/` dir; the dir
 * CONTAINING `cairn/` is the hostRoot — all evidence paths are relative to it. There is no `init`
 * verb; the first write auto-creates the skeleton. The derived SQLite index is NOT part of the
 * portable bundle (rebuilt on demand; stored outside / gitignored).
 *
 * Ids are CONTENT-ADDRESSED at mint (PINNED `clm-/est-/cfd-<short-hash>`), collision-extended: hash
 * the minting input, take NODE_ID_HASH_LEN hex chars, and lengthen the slice until the id is unused.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  parseClaimFile,
  parseConfoundFile,
  parseEstimandFile,
  parseNodeFile,
  serializeClaimFile,
  serializeConfoundFile,
  serializeEstimandFile,
} from "./claimfile.ts";
import { ID_PREFIX, NODE_ID_HASH_LEN } from "./types.ts";
import type {
  CairnConfig,
  ClaimFile,
  ClaimFrontmatter,
  ConfoundFile,
  ConfoundFrontmatter,
  EstimandFile,
  EstimandFrontmatter,
  NodeFile,
  NodeType,
  StorePaths,
} from "./types.ts";

export class StoreError extends Error {}

function pathsFrom(hostRoot: string): StorePaths {
  const storeDir = join(hostRoot, "cairn");
  return {
    hostRoot,
    storeDir,
    claimsDir: join(storeDir, "claims"),
    estimandsDir: join(storeDir, "estimands"),
    confoundsDir: join(storeDir, "confounds"),
    snapshotsDir: join(storeDir, "snapshots"),
    indexPath: join(storeDir, "index.md"),
    logPath: join(storeDir, "log.md"),
    configPath: join(storeDir, "config.json"),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Discovery
// ──────────────────────────────────────────────────────────────────────────────

/** Find an existing store by walking up from `start`. Returns null if none found. */
export function findStore(start: string = process.cwd()): StorePaths | null {
  let dir = resolve(start);
  while (true) {
    const claimsDir = join(dir, "cairn", "claims");
    if (existsSync(claimsDir) && statSync(claimsDir).isDirectory()) {
      return pathsFrom(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Resolve the store for a read. Throws if no store exists. */
export function requireStore(start: string = process.cwd()): StorePaths {
  const s = findStore(start);
  if (!s) {
    throw new StoreError(
      "no Cairn store found (no cairn/claims/ in this directory or any parent). " +
        "Run `cairn add-claim` to create one.",
    );
  }
  return s;
}

/** Resolve the store for a write. If none exists, auto-create the OKF skeleton rooted at cwd. */
export function resolveStoreForWrite(start: string = process.cwd()): StorePaths {
  const existing = findStore(start);
  if (existing) {
    ensureSkeleton(existing);
    return existing;
  }
  const paths = pathsFrom(resolve(start));
  ensureSkeleton(paths);
  return paths;
}

/** Create the three node dirs + snapshots dir (idempotent). index.md/log.md are emitted lazily. */
export function ensureSkeleton(paths: StorePaths): void {
  for (const d of [paths.claimsDir, paths.estimandsDir, paths.confoundsDir, paths.snapshotsDir]) {
    mkdirSync(d, { recursive: true });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Reads (per node type + mixed)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A preserved prior-version sidecar (`<id>.v<hash>.md`, written by modifyClaim on a different-asserter
 * modify). These are immutable history, NOT live nodes, so they are skipped by every live read — they
 * never enter readAll*, the candidate set, snapshots, or the orient surface.
 */
const VERSION_SIDECAR_RE = /\.v[0-9a-f]+\.md$/;

function readDirMd(dir: string): { full: string; raw: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !VERSION_SIDECAR_RE.test(f))
    .map((f) => {
      const full = join(dir, f);
      return { full, raw: readFileSync(full, "utf8") };
    });
}

function byId<T extends { frontmatter: { id: string } }>(a: T, b: T): number {
  return a.frontmatter.id < b.frontmatter.id ? -1 : a.frontmatter.id > b.frontmatter.id ? 1 : 0;
}

/** Read every claim file under claims/, sorted by id. Throws on the first malformed file. */
export function readAllClaims(paths: StorePaths): ClaimFile[] {
  return readDirMd(paths.claimsDir)
    .map(({ full, raw }) => parseClaimFile(raw, full))
    .sort(byId);
}

/** Read every estimand file under estimands/, sorted by id. */
export function readAllEstimands(paths: StorePaths): EstimandFile[] {
  return readDirMd(paths.estimandsDir)
    .map(({ full, raw }) => parseEstimandFile(raw, full))
    .sort(byId);
}

/** Read every confound file under confounds/, sorted by id. */
export function readAllConfounds(paths: StorePaths): ConfoundFile[] {
  return readDirMd(paths.confoundsDir)
    .map(({ full, raw }) => parseConfoundFile(raw, full))
    .sort(byId);
}

/** Read all three node types into one list (dispatch by frontmatter type). */
export function readAllNodes(paths: StorePaths): NodeFile[] {
  const out: NodeFile[] = [];
  for (const dir of [paths.claimsDir, paths.estimandsDir, paths.confoundsDir]) {
    for (const { full, raw } of readDirMd(dir)) out.push(parseNodeFile(raw, full));
  }
  return out;
}

function dirForId(paths: StorePaths, id: string): string | null {
  if (id.startsWith(ID_PREFIX.claim)) return paths.claimsDir;
  if (id.startsWith(ID_PREFIX.estimand)) return paths.estimandsDir;
  if (id.startsWith(ID_PREFIX.confound)) return paths.confoundsDir;
  return null;
}

/** Read a single claim by id. Returns null if not present. */
export function readClaim(paths: StorePaths, id: string): ClaimFile | null {
  const full = join(paths.claimsDir, `${id}.md`);
  if (!existsSync(full)) return null;
  return parseClaimFile(readFileSync(full, "utf8"), full);
}

/** Read a single estimand by id. Returns null if not present. */
export function readEstimand(paths: StorePaths, id: string): EstimandFile | null {
  const full = join(paths.estimandsDir, `${id}.md`);
  if (!existsSync(full)) return null;
  return parseEstimandFile(readFileSync(full, "utf8"), full);
}

/** Read a single confound by id. Returns null if not present. */
export function readConfound(paths: StorePaths, id: string): ConfoundFile | null {
  const full = join(paths.confoundsDir, `${id}.md`);
  if (!existsSync(full)) return null;
  return parseConfoundFile(readFileSync(full, "utf8"), full);
}

/** True iff a node with this id exists in its kind's dir (by id-prefix routing). */
export function nodeExists(paths: StorePaths, id: string): boolean {
  const dir = dirForId(paths, id);
  if (!dir) return false;
  return existsSync(join(dir, `${id}.md`));
}

// ──────────────────────────────────────────────────────────────────────────────
// Writes (per node type)
// ──────────────────────────────────────────────────────────────────────────────

/** Write (create or overwrite) a claim file. Returns the full path. */
export function writeClaim(paths: StorePaths, fm: ClaimFrontmatter, body = ""): string {
  mkdirSync(paths.claimsDir, { recursive: true });
  const full = join(paths.claimsDir, `${fm.id}.md`);
  writeFileSync(full, serializeClaimFile(fm, body), "utf8");
  return full;
}

/**
 * The result of a versioned claim modify: whether a different-asserter version was created and where
 * the prior content was preserved (PRD story 18; CONTEXT "Asserter").
 */
export interface VersionResult {
  path: string;
  versioned: boolean;
  priorPath: string | null;
}

/** The AGENT-ASSERTED content of a claim (the half the author owns; CLI-locked fields excluded). */
function authoredContent(fm: ClaimFrontmatter, body: string): string {
  return JSON.stringify({
    text: fm.text,
    estimand: fm.estimand ?? null,
    evidence_lines: fm.evidence_lines,
    depends_on_fork: fm.depends_on_fork,
    contradicts: fm.contradicts,
    inherits_caveat: fm.inherits_caveat,
    provenance: fm.provenance,
    deflation_route: fm.deflation_route ?? null,
    body,
  });
}

/**
 * Modify an existing claim, honoring the different-asserter VERSION rule (PRD story 18, spec a.2;
 * CONTEXT "Asserter"): when a writer whose `who` differs from the claim's PRIOR `asserter.who` changes
 * the claim's AGENT-ASSERTED content (text / estimand / evidence / forks / contradicts / caveats /
 * provenance / deflation / body), the prior content is PRESERVED as an immutable content-addressed
 * `<id>.v<hash>.md` sidecar in claims/ and the modifying asserter is re-stamped (the "last modified"
 * asserter, CONTEXT line 130) — never a silent overwrite.
 *
 * A write that touches only CLI-OWNED fields (review appending a `reviewed_by` edge; refresh recomputing
 * fingerprints/freshness) does NOT change authored content, so it is a plain in-place rewrite that
 * leaves AUTHORSHIP intact. This is deliberate: corroboration (Gate B) counts reviewers byte-distinct
 * from the original AUTHOR, so re-stamping the author on a review would drift that identity and corrupt
 * the count. Authorship only moves when authored content actually changes hands.
 *
 * `prior` is the claim as last read from disk. `nextFm`/`nextBody` are the new content. `writer` is the
 * modifying asserter (its `who` decides same-vs-different).
 */
export function modifyClaim(
  paths: StorePaths,
  prior: ClaimFile,
  nextFm: ClaimFrontmatter,
  nextBody: string,
  writer: { who: string; model: string; session: string; time: string },
): VersionResult {
  mkdirSync(paths.claimsDir, { recursive: true });
  const full = join(paths.claimsDir, `${nextFm.id}.md`);
  const differentAsserter = writer.who !== prior.frontmatter.asserter.who;
  const contentChanged =
    authoredContent(prior.frontmatter, prior.body) !== authoredContent(nextFm, nextBody);

  // A version is created only when a DIFFERENT asserter changes AUTHORED content. CLI-only field writes
  // (review/refresh) by anyone, and any same-asserter write, are plain in-place rewrites.
  if (!(differentAsserter && contentChanged)) {
    writeFileSync(full, serializeClaimFile(nextFm, nextBody), "utf8");
    return { path: full, versioned: false, priorPath: null };
  }

  // Preserve the prior content as an immutable, content-addressed, collision-extended sidecar.
  const seed = serializeClaimFile(prior.frontmatter, prior.body);
  const hex = createHash("sha256").update(seed).digest("hex");
  let priorPath = join(paths.claimsDir, `${nextFm.id}.v${hex.slice(0, NODE_ID_HASH_LEN)}.md`);
  for (let len = NODE_ID_HASH_LEN; existsSync(priorPath) && len < hex.length; len++) {
    priorPath = join(paths.claimsDir, `${nextFm.id}.v${hex.slice(0, len + 1)}.md`);
  }
  writeFileSync(priorPath, seed, "utf8");

  // Re-stamp the modifying asserter on the live file (the "last modified" authorship moves).
  const written: ClaimFrontmatter = {
    ...nextFm,
    asserter: { who: writer.who, model: writer.model, session: writer.session, time: writer.time },
  };
  writeFileSync(full, serializeClaimFile(written, nextBody), "utf8");
  return { path: full, versioned: true, priorPath };
}

/** Write (create or overwrite) an estimand file. Returns the full path. */
export function writeEstimand(paths: StorePaths, fm: EstimandFrontmatter, body = ""): string {
  mkdirSync(paths.estimandsDir, { recursive: true });
  const full = join(paths.estimandsDir, `${fm.id}.md`);
  writeFileSync(full, serializeEstimandFile(fm, body), "utf8");
  return full;
}

/** Write (create or overwrite) a confound file. Returns the full path. */
export function writeConfound(paths: StorePaths, fm: ConfoundFrontmatter, body = ""): string {
  mkdirSync(paths.confoundsDir, { recursive: true });
  const full = join(paths.confoundsDir, `${fm.id}.md`);
  writeFileSync(full, serializeConfoundFile(fm, body), "utf8");
  return full;
}

// ──────────────────────────────────────────────────────────────────────────────
// Id minting (content-addressed, collision-extended)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Mint a content-addressed node id of the given kind. `seed` is the minting input (e.g. the claim
 * text + asserter + time, or the estimand/confound body). The id is `<prefix><hex slice>`, sliced at
 * NODE_ID_HASH_LEN and lengthened until it does not already exist on disk (collision extension).
 */
export function mintId(paths: StorePaths, kind: NodeType, seed: string): string {
  const prefix = ID_PREFIX[kind];
  const hex = createHash("sha256").update(seed).digest("hex");
  for (let len = NODE_ID_HASH_LEN; len <= hex.length; len++) {
    const id = `${prefix}${hex.slice(0, len)}`;
    if (!nodeExists(paths, id)) return id;
  }
  // Exhausted the hash (astronomically unlikely): append a uniquifier.
  return `${prefix}${hex}${Date.now().toString(16)}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Log (append-only time spine)
// ──────────────────────────────────────────────────────────────────────────────

/** Append a line to log.md (the OKF time spine). Creates the file with a header if absent. */
export function appendLog(paths: StorePaths, line: string): void {
  mkdirSync(paths.storeDir, { recursive: true });
  const existing = existsSync(paths.logPath) ? readFileSync(paths.logPath, "utf8") : "";
  const head = existing.length > 0 ? existing : "# Cairn log\n\n";
  writeFileSync(paths.logPath, head + line.replace(/\n*$/, "") + "\n", "utf8");
}

// ──────────────────────────────────────────────────────────────────────────────
// Timestamps & config
// ──────────────────────────────────────────────────────────────────────────────

/** ISO-8601 timestamp with local offset (e.g. 2026-06-10T20:00:00-04:00). */
export function isoNow(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${oh}:${om}`
  );
}

/** Load optional cairn/config.json. Returns {} if absent or unparseable. */
export function readConfig(paths: StorePaths): CairnConfig {
  if (!existsSync(paths.configPath)) return {};
  try {
    return JSON.parse(readFileSync(paths.configPath, "utf8")) as CairnConfig;
  } catch {
    return {};
  }
}
