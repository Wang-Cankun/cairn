/**
 * store.ts — store discovery (walk up from cwd), read/write claim files, claim-id allocation.
 *
 * Discovery: walk up from cwd looking for a `cairn/` dir containing a `claims/` dir. The dir
 * CONTAINING `cairn/` is the hostRoot — all evidence paths are relative to it (decision D). There
 * is no `init` verb; the first write auto-creates `cairn/claims/` (decision: CONTRACTS §2).
 */

import { readdirSync, existsSync, statSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseClaimFile, serializeClaimFile } from "./claimfile.ts";
import type { CairnConfig, ClaimFile, ClaimFrontmatter, StorePaths } from "./types.ts";

export class StoreError extends Error {}

function pathsFrom(hostRoot: string): StorePaths {
  const storeDir = join(hostRoot, "cairn");
  return {
    hostRoot,
    storeDir,
    claimsDir: join(storeDir, "claims"),
    snapshotsDir: join(storeDir, "snapshots"),
    publishedLatestDir: join(storeDir, "published", "latest"),
    headJsonPath: join(storeDir, "head.json"),
    configPath: join(storeDir, "config.json"),
  };
}

/** Find an existing store by walking up from `start`. Returns null if none found. */
export function findStore(start: string = process.cwd()): StorePaths | null {
  let dir = resolve(start);
  // eslint-disable-next-line no-constant-condition
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

/**
 * Resolve the store for a read. Throws if no store exists (reads require a store to exist).
 */
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

/**
 * Resolve the store for a write. If none exists, auto-create `cairn/claims/` rooted at cwd
 * (no `init` verb — decision CONTRACTS §2).
 */
export function resolveStoreForWrite(start: string = process.cwd()): StorePaths {
  const existing = findStore(start);
  if (existing) return existing;
  const hostRoot = resolve(start);
  const paths = pathsFrom(hostRoot);
  mkdirSync(paths.claimsDir, { recursive: true });
  return paths;
}

/** Read every claim file under claims/, sorted by id. Throws on the first malformed file. */
export function readAllClaims(paths: StorePaths): ClaimFile[] {
  if (!existsSync(paths.claimsDir)) return [];
  const files = readdirSync(paths.claimsDir).filter((f) => f.endsWith(".md"));
  const claims: ClaimFile[] = [];
  for (const f of files) {
    const full = join(paths.claimsDir, f);
    const raw = readFileSync(full, "utf8");
    claims.push(parseClaimFile(raw, full));
  }
  claims.sort((a, b) => (a.frontmatter.id < b.frontmatter.id ? -1 : a.frontmatter.id > b.frontmatter.id ? 1 : 0));
  return claims;
}

/** Read a single claim by id. Returns null if not present. */
export function readClaim(paths: StorePaths, id: string): ClaimFile | null {
  const full = join(paths.claimsDir, `${id}.md`);
  if (!existsSync(full)) return null;
  return parseClaimFile(readFileSync(full, "utf8"), full);
}

/** Write (create or overwrite) a claim file from its frontmatter + body. Returns the path. */
export function writeClaim(paths: StorePaths, fm: ClaimFrontmatter, body = ""): string {
  mkdirSync(paths.claimsDir, { recursive: true });
  const full = join(paths.claimsDir, `${fm.id}.md`);
  writeFileSync(full, serializeClaimFile(fm, body), "utf8");
  return full;
}

/** YYYYMMDD in local time, used in claim ids. */
function localDateStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Allocate the next claim id: `claim-YYYYMMDD-NNN`, NNN a zero-padded per-day counter starting at
 * 001, looking at existing claim files for today.
 */
export function allocateClaimId(paths: StorePaths, now = new Date()): string {
  const stamp = localDateStamp(now);
  const prefix = `claim-${stamp}-`;
  let max = 0;
  if (existsSync(paths.claimsDir)) {
    for (const f of readdirSync(paths.claimsDir)) {
      if (f.startsWith(prefix) && f.endsWith(".md")) {
        const n = Number.parseInt(f.slice(prefix.length, prefix.length + 3), 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

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
