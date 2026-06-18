/**
 * fingerprint.ts — compute / re-compute the fingerprint of one evidence ref (ADR-0002 / ADR-0003).
 *
 * Freshness is derived from a fingerprint of the EVIDENCE ARTIFACT a claim points at, not from the
 * compute process (ADR-0002). Each EvidenceRef is fingerprinted into a tiered Fingerprint:
 *
 *   dvc:<path.dvc>   -> tier `dvc-md5`     — read the md5 out of the `.dvc` pointer (TOP tier:
 *                       rigorous + versioned). The `.dvc` file is YAML with an `outs:` list; the
 *                       first out's `md5` is the artifact's content hash.
 *   file:<path>      -> tier `content-hash` — sha256 of the local file bytes; falls back to
 *                       `size-mtime` (weak) if the file is too large / unreadable but stat-able;
 *                       `unknown` if unreachable.
 *   external:<uri>   -> tier `unknown`     — unreachable-by-default (URL/DOI); a false `fresh` is the
 *                       enemy, so an external ref contributes `unknown` freshness.
 *
 * The `targets-hash` tier (a pipeline meta store's content hash) is reachable from a `dvc`/`file`
 * ref only when the ref names a meta store; v2 does not auto-derive it from kind, so it is computed
 * only on explicit request via `targetsHash`. It remains in the tier ordering for completeness.
 *
 * All paths are HOST-ROOT-relative (decision D); callers pass `hostRoot` so re-fingerprinting is
 * location-independent. `value` is null exactly when `tier === "unknown"`.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import type { EvidenceRef, Fingerprint, FingerprintTier } from "./types.ts";

/** Sentinel tier for an unreachable / un-recheckable artifact. */
export const UNKNOWN_TIER: FingerprintTier = "unknown";

/** Size (bytes) above which `file:` refs fall back to size-mtime rather than full sha256. */
const SHA256_MAX_BYTES = 256 * 1024 * 1024; // 256 MiB

const SSH_TIMEOUT_MS = 5000;

function resolveHostPath(hostRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(hostRoot, p);
}

/** Build a `Fingerprint` value; `value` is forced null iff the tier is `unknown`. */
function fp(ref: string, tier: FingerprintTier, value: string | null, taken_at: string): Fingerprint {
  return { ref, tier, value: tier === "unknown" ? null : value, taken_at };
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-kind fingerprinters (each returns a {tier,value}; value null ⇒ unknown)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Read the top-tier md5 out of a DVC pointer file. A `.dvc` file is YAML of the shape:
 *   outs:
 *     - md5: <hash>
 *       path: <relpath>
 * We return the first out's `md5` as the `dvc-md5` value. Unreachable / malformed ⇒ unknown.
 */
export function dvcMd5(hostRoot: string, dvcPath: string): { tier: FingerprintTier; value: string | null } {
  const abs = resolveHostPath(hostRoot, dvcPath);
  if (!existsSync(abs)) return { tier: "unknown", value: null };
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(abs, "utf8"));
  } catch {
    return { tier: "unknown", value: null };
  }
  if (typeof parsed !== "object" || parsed === null) return { tier: "unknown", value: null };
  const outs = (parsed as Record<string, unknown>).outs;
  if (!Array.isArray(outs) || outs.length === 0) return { tier: "unknown", value: null };
  const first = outs[0];
  if (typeof first !== "object" || first === null) return { tier: "unknown", value: null };
  const md5 = (first as Record<string, unknown>).md5;
  if (typeof md5 !== "string" || md5.length === 0) return { tier: "unknown", value: null };
  return { tier: "dvc-md5", value: `md5:${md5}` };
}

/**
 * sha256 of a local file. Returns `content-hash` on success, falls back to `size-mtime` (weak) when
 * the file is stat-able but too large/unreadable to hash, and `unknown` if unreachable.
 */
export function contentHash(hostRoot: string, location: string): { tier: FingerprintTier; value: string | null } {
  const abs = resolveHostPath(hostRoot, location);
  if (!existsSync(abs)) return { tier: "unknown", value: null };
  let size: number;
  let mtimeMs: number;
  try {
    const st = statSync(abs);
    size = st.size;
    mtimeMs = st.mtimeMs;
  } catch {
    return { tier: "unknown", value: null };
  }
  if (size <= SHA256_MAX_BYTES) {
    try {
      const buf = readFileSync(abs);
      const hex = createHash("sha256").update(buf).digest("hex");
      return { tier: "content-hash", value: `sha256:${hex}` };
    } catch {
      // fall through to size-mtime
    }
  }
  return { tier: "size-mtime", value: `size-mtime:${size}-${Math.round(mtimeMs)}` };
}

/**
 * Read the targets-style meta store and return the content hash for `targetName` as a `targets-hash`
 * fingerprint. The meta store is a space-separated table with a header row; we read the `data`
 * column for the row whose `name` equals `targetName`. Unreachable / missing ⇒ unknown.
 * (Not auto-selected from EvidenceKind in v2; available for explicit use.)
 */
export function targetsHash(
  hostRoot: string,
  metaStore: string,
  targetName: string,
): { tier: FingerprintTier; value: string | null } {
  const abs = resolveHostPath(hostRoot, metaStore);
  if (!existsSync(abs)) return { tier: "unknown", value: null };
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { tier: "unknown", value: null };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return { tier: "unknown", value: null };
  const header = (lines[0] as string).split(/\s+/);
  const nameIdx = header.indexOf("name");
  const dataIdx = header.indexOf("data");
  if (nameIdx === -1 || dataIdx === -1) return { tier: "unknown", value: null };
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] as string).split(/\s+/);
    if (cols[nameIdx] === targetName) {
      const data = cols[dataIdx];
      return data && data.length > 0
        ? { tier: "targets-hash", value: `targets:${data}` }
        : { tier: "unknown", value: null };
    }
  }
  return { tier: "unknown", value: null };
}

/**
 * Re-fingerprint a remote artifact via `ssh <remote_host> md5sum <path>`. Short timeout; any failure
 * (host unreachable, ssh error, no md5sum) ⇒ unknown. Used as the freshness source for a `file:` ref
 * whose bytes live on a configured remote host rather than the local host root.
 */
export function remoteMd5(ref: string, remoteHost?: string): { tier: FingerprintTier; value: string | null } {
  let host: string;
  let path: string;
  if (remoteHost) {
    host = remoteHost;
    path = ref;
  } else {
    const idx = ref.indexOf(":");
    if (idx === -1) return { tier: "unknown", value: null };
    host = ref.slice(0, idx);
    path = ref.slice(idx + 1);
  }
  if (!host || !path) return { tier: "unknown", value: null };
  try {
    const res = spawnSync(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=3", host, "md5sum", path],
      { timeout: SSH_TIMEOUT_MS, encoding: "utf8" },
    );
    if (res.status !== 0 || res.error || !res.stdout) return { tier: "unknown", value: null };
    const hash = res.stdout.trim().split(/\s+/)[0];
    return hash && /^[0-9a-f]{32}$/i.test(hash)
      ? { tier: "content-hash", value: `md5:${hash}` }
      : { tier: "unknown", value: null };
  } catch {
    return { tier: "unknown", value: null };
  }
}

/**
 * Compute the current fingerprint for one evidence ref, dispatching by `kind`. This is the single
 * entry point used at both stamp time (author/refresh) and freshness-recompute time.
 *
 *   dvc      -> dvcMd5      (top tier)
 *   file     -> contentHash locally; or remoteMd5 when a remote host is configured and the file is
 *               not present in the local host root (remote HPC artifacts, ADR-0002)
 *   external -> unknown     (unreachable by default)
 */
export function fingerprintRef(hostRoot: string, ref: EvidenceRef, taken_at: string, remoteHost?: string): Fingerprint {
  switch (ref.kind) {
    case "dvc": {
      const r = dvcMd5(hostRoot, ref.ref);
      return fp(ref.ref, r.tier, r.value, taken_at);
    }
    case "file": {
      const abs = resolveHostPath(hostRoot, ref.ref);
      if (!existsSync(abs) && remoteHost) {
        const r = remoteMd5(ref.ref, remoteHost);
        return fp(ref.ref, r.tier, r.value, taken_at);
      }
      const r = contentHash(hostRoot, ref.ref);
      return fp(ref.ref, r.tier, r.value, taken_at);
    }
    case "external":
      return fp(ref.ref, "unknown", null, taken_at);
  }
}

/**
 * Stamp fingerprints for every ref across a claim's evidence lines (flattened). Order follows the
 * lines' refs in declaration order; one Fingerprint per ref.
 */
export function stampFingerprints(
  hostRoot: string,
  refs: EvidenceRef[],
  taken_at: string,
  remoteHost?: string,
): Fingerprint[] {
  return refs.map((r) => fingerprintRef(hostRoot, r, taken_at, remoteHost));
}
