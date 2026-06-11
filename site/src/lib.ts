import type { FreshnessState, FingerprintMethod, Tier, Verification } from "./types";

/** Human label for a freshness state. `unknown` is NEVER flattened into fresh. */
export const FRESHNESS_LABEL: Record<FreshnessState, string> = {
  fresh: "fresh",
  stale: "stale",
  unknown: "unknown",
};

/** Tier display label (shown on the freshness badge alongside the state). */
export const TIER_LABEL: Record<Tier, string> = {
  pipeline: "pipeline-meta",
  content: "content hash",
  remote: "remote",
  weak: "size+mtime",
};

/** Method → tier, mirrors /src/types.ts METHOD_TIER. */
export const METHOD_TIER: Record<FingerprintMethod, Tier> = {
  "pipeline-meta": "pipeline",
  sha256: "content",
  "size-mtime": "weak",
  "remote-md5": "remote",
};

export const METHOD_LABEL: Record<FingerprintMethod, string> = {
  "pipeline-meta": "pipeline-meta",
  sha256: "sha256",
  "size-mtime": "size+mtime",
  "remote-md5": "remote-md5",
};

/**
 * Verification is shown PLAINLY and honestly. `unverified` is the v1 honest default and is
 * styled exactly like every other verification value — never dressed up to look settled.
 */
export const VERIFICATION_LABEL: Record<Verification, string> = {
  unverified: "unverified",
  verified: "verified",
  contradicted: "contradicted",
  unverifiable: "unverifiable",
};

/** Format an ISO-8601 timestamp for the "as of" qualifier. Falls back to the raw string. */
export function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short snapshot id for display (already short, but guard against long inputs). */
export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 16 ? id.slice(0, 16) : id;
}

/** Truncate a fingerprint for inline display while keeping its method prefix readable. */
export function shortFingerprint(fp: string): string {
  if (fp === "unknown") return "unknown";
  if (fp.length <= 22) return fp;
  // keep a leading "sha256:" style prefix if present
  const ci = fp.indexOf(":");
  if (ci > 0 && ci < 12) {
    const prefix = fp.slice(0, ci + 1);
    const rest = fp.slice(ci + 1);
    return `${prefix}${rest.slice(0, 12)}…`;
  }
  return `${fp.slice(0, 16)}…`;
}
