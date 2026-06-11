/**
 * Site-side view of the Cairn published contracts.
 *
 * MIRRORS the published/diff subset of /src/types.ts (the cross-module source of truth) and
 * docs/CONTRACTS.md §3, §5, §9. The site consumes ONLY the PUBLISHED shapes — canonical claims
 * only (decision A), freshness frozen-at-publish (decision C). Keep in sync with /src/types.ts;
 * if they ever disagree, fix both, never fork.
 */

export type Verification =
  | "unverified"
  | "verified"
  | "contradicted"
  | "unverifiable";

export type EvidenceKind = "target" | "file" | "data" | "external";

export type FingerprintMethod =
  | "pipeline-meta"
  | "sha256"
  | "size-mtime"
  | "remote-md5";

export type FreshnessState = "fresh" | "stale" | "unknown";

export type Tier = "pipeline" | "content" | "weak" | "remote";

export interface GroundingEdge {
  kind: EvidenceKind;
  ref: string;
  fingerprint: string;
  method: FingerprintMethod;
  location: string;
}

export type ClaimId = string;

/** Per-claim freshness, FROZEN at publish (decision C). The site renders verbatim, never recomputes. */
export interface Freshness {
  state: FreshnessState;
  tier: Tier;
  as_of: string; // == published_at
}

/** A canonical claim in the PUBLISHED head.json (no drafts, no body, no status). */
export interface PublishedClaim {
  id: ClaimId;
  text: string;
  verification: Verification;
  freshness: Freshness;
  grounding: GroundingEdge[];
  depends_on: ClaimId[];
}

export interface SnapshotLineage {
  current: string;
  previous: string | null;
}

/** PUBLISHED head.json (canonical only). The site's primary data source. */
export interface PublishedHead {
  schema: "cairn.head/1";
  snapshot: SnapshotLineage;
  published_at: string;
  claims: PublishedClaim[];
  /** Optional, not in the strict contract but tolerated for display if a publisher adds it. */
  project?: string;
}

export interface TextChange {
  id: ClaimId;
  before: string;
  after: string;
}

export interface FreshnessChange {
  id: ClaimId;
  before: FreshnessState;
  after: FreshnessState;
}

export interface VerificationChange {
  id: ClaimId;
  before: Verification;
  after: Verification;
}

export interface DiffCounts {
  added: number;
  removed: number;
  text_changed: number;
  freshness_changed: number;
  verification_changed: number;
}

/** diff.json vs previous snapshot. `against` null on first publish. */
export interface SnapshotDiff {
  schema: "cairn.diff/1";
  against: string | null;
  added: PublishedClaim[];
  removed: ClaimId[];
  text_changed: TextChange[];
  freshness_changed: FreshnessChange[];
  verification_changed: VerificationChange[];
  counts: DiffCounts;
}
