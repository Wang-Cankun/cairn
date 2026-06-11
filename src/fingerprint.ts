/**
 * fingerprint.ts — compute / re-compute an evidence edge's fingerprint by method.
 *
 * Methods:
 *  - sha256:        Bun.file + crypto over the local file at host-root-relative `location`.
 *  - size-mtime:    weak fallback "<size>-<mtimeMs>" when content hashing is impractical.
 *  - pipeline-meta: parse the targets meta store (a space-separated table with a header row),
 *                   look up the row by target name, read its `data` content-hash column.
 *  - remote-md5:    parse refs like `host:path`, run `ssh <host> md5sum <path>` (short timeout);
 *                   unreachable -> "unknown".
 *
 * All `location`/`ref` paths are HOST-ROOT-relative (decision D); callers pass hostRoot so
 * re-fingerprinting is location-independent.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import type { EvidenceKind, FingerprintMethod, GroundingEdge } from "./types.ts";

/** Sentinel for an unreachable / un-recheckable artifact. */
export const UNKNOWN = "unknown";

const SSH_TIMEOUT_MS = 5000;

function resolveHostPath(hostRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(hostRoot, p);
}

/** Pick a method from an evidence kind at stamping time (CONTRACTS §8). */
export function methodForKind(kind: EvidenceKind, hostRoot: string, ref: string, location: string): FingerprintMethod {
  switch (kind) {
    case "target":
      return "pipeline-meta";
    case "external":
      return "remote-md5";
    case "file":
      return "sha256";
    case "data": {
      // Treat as a local file if reachable; else remote.
      const abs = resolveHostPath(hostRoot, location || ref);
      if (existsSync(abs) && !ref.includes(":")) return "sha256";
      if (ref.includes(":")) return "remote-md5";
      return "sha256";
    }
  }
}

/** sha256 of a local file -> "sha256:<hex>", or UNKNOWN if unreachable. */
export function sha256File(hostRoot: string, location: string): string {
  const abs = resolveHostPath(hostRoot, location);
  if (!existsSync(abs)) return UNKNOWN;
  try {
    const buf = readFileSync(abs);
    const hex = createHash("sha256").update(buf).digest("hex");
    return `sha256:${hex}`;
  } catch {
    return UNKNOWN;
  }
}

/** Weak size+mtime signature -> "size-mtime:<bytes>-<mtimeMs>", or UNKNOWN if unreachable. */
export function sizeMtimeFile(hostRoot: string, location: string): string {
  const abs = resolveHostPath(hostRoot, location);
  if (!existsSync(abs)) return UNKNOWN;
  try {
    const st = statSync(abs);
    return `size-mtime:${st.size}-${Math.round(st.mtimeMs)}`;
  } catch {
    return UNKNOWN;
  }
}

/**
 * Parse the targets-style meta store and return the content hash for `targetName`.
 *
 * The meta store (`_targets/meta/meta`) is a space-separated table with a header row. We locate
 * the `name` and `data` columns from the header, then look up the row whose `name` equals
 * `targetName` and return its `data` cell (the content hash). Returns UNKNOWN if the store or row
 * is missing.
 */
export function pipelineMetaHash(hostRoot: string, metaStore: string, targetName: string): string {
  const abs = resolveHostPath(hostRoot, metaStore);
  if (!existsSync(abs)) return UNKNOWN;
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return UNKNOWN;
  }
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return UNKNOWN;
  const header = (lines[0] as string).split(/\s+/);
  const nameIdx = header.indexOf("name");
  const dataIdx = header.indexOf("data");
  if (nameIdx === -1 || dataIdx === -1) return UNKNOWN;
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] as string).split(/\s+/);
    if (cols[nameIdx] === targetName) {
      const data = cols[dataIdx];
      return data && data.length > 0 ? data : UNKNOWN;
    }
  }
  return UNKNOWN;
}

/**
 * Re-fingerprint a remote artifact via `ssh <host> md5sum <path>`. `ref` is `host:path`. Short
 * timeout; any failure (host unreachable, ssh error, no md5sum) -> UNKNOWN.
 */
export function remoteMd5(ref: string): string {
  const idx = ref.indexOf(":");
  if (idx === -1) return UNKNOWN;
  const host = ref.slice(0, idx);
  const path = ref.slice(idx + 1);
  if (!host || !path) return UNKNOWN;
  try {
    const res = spawnSync(
      "ssh",
      ["-o", "BatchMode=yes", "-o", `ConnectTimeout=3`, host, "md5sum", path],
      { timeout: SSH_TIMEOUT_MS, encoding: "utf8" },
    );
    if (res.status !== 0 || res.error || !res.stdout) return UNKNOWN;
    const hash = res.stdout.trim().split(/\s+/)[0];
    return hash && /^[0-9a-f]{32}$/i.test(hash) ? `md5:${hash}` : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/**
 * Compute the current fingerprint for an edge by its `method`. Used both at stamp time and at
 * freshness-recompute time. Returns UNKNOWN when the artifact is unreachable.
 */
export function fingerprintByMethod(
  hostRoot: string,
  method: FingerprintMethod,
  ref: string,
  location: string,
): string {
  switch (method) {
    case "sha256":
      return sha256File(hostRoot, location);
    case "size-mtime":
      return sizeMtimeFile(hostRoot, location);
    case "pipeline-meta":
      return pipelineMetaHash(hostRoot, location, ref);
    case "remote-md5":
      return remoteMd5(ref);
  }
}

/**
 * Stamp a fresh GroundingEdge from a kind+ref at author/ground time, choosing method by kind and
 * computing the fingerprint now (CONTRACTS §8). `location` defaults: file/data -> ref; target ->
 * the meta store; external -> ref.
 */
export function stampEdge(
  hostRoot: string,
  kind: EvidenceKind,
  ref: string,
  opts: { metaStore?: string } = {},
): GroundingEdge {
  const metaStore = opts.metaStore ?? "_targets/meta/meta";
  let location: string;
  if (kind === "target") location = metaStore;
  else if (kind === "external") location = ref;
  else location = ref; // file | data

  const method = methodForKind(kind, hostRoot, ref, location);
  const fingerprint = fingerprintByMethod(hostRoot, method, ref, location);
  return { kind, ref, fingerprint, method, location };
}
