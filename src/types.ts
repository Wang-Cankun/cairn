/**
 * Cairn v1 — pinned shared contracts.
 *
 * This file is the SINGLE TYPESCRIPT SOURCE OF TRUTH for cross-module shapes. The three
 * parallel builders (CLI/core, site, skill) code against these types. The prose companion is
 * `docs/CONTRACTS.md`; keep the two in sync — if they ever disagree, fix both, do not fork.
 *
 * Hard rules encoded here (do not "fix" away):
 *  - Claim files in git are the source of truth; SQLite is a derived, throwaway index.
 *  - Freshness is COMPUTED at read time from evidence fingerprints — there is deliberately
 *    NO freshness field on ClaimFile. `Freshness` appears only on read-time/published shapes.
 *  - Published head.json + snapshots contain CANONICAL CLAIMS ONLY (decision A). Drafts live
 *    only in the LOCAL terminal projection (`LocalHeadView`), never in a shared artifact.
 *  - Snapshot id = short content hash of the canonical claim SET ONLY, excluding timestamps
 *    (decision E). See SNAPSHOT_ID_FIELDS for the exact reproducible inputs.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Enums / unions
// ──────────────────────────────────────────────────────────────────────────────

/** Claim lifecycle state as stored on disk. Only these two exist in claim files (ADR-0001).
 *  `canonical-candidate` is an INTERNAL, in-memory validate/publish state — never written. */
export type ClaimStatus = "draft" | "canonical";

/** Verification axis. v1 stores the honest default "unverified" only; machinery is v2. */
export type Verification =
  | "unverified"
  | "verified"
  | "contradicted"
  | "unverifiable";

/** What a grounding edge points at. */
export type EvidenceKind = "target" | "file" | "data" | "external";

/** How a grounding edge's fingerprint was/should-be computed. Maps to a tier (see Tier). */
export type FingerprintMethod =
  | "pipeline-meta" // read a pipeline tool's meta store (e.g. targets _targets/meta/meta `data` col)
  | "sha256" // hash the local file at `location`
  | "size-mtime" // weak local fallback: size+mtime signature
  | "remote-md5"; // ssh md5sum on a remote host; unreachable -> unknown

/** Computed freshness state (ADR-0002). NEVER stored in a claim file. */
export type FreshnessState = "fresh" | "stale" | "unknown";

/**
 * Fingerprint quality tier, shown on the badge. Derived from FingerprintMethod:
 *   pipeline-meta -> "pipeline"  (top: rigorous, free)
 *   sha256        -> "content"   (mid: direct content hash)
 *   size-mtime    -> "weak"      (low: heuristic, not content)
 *   remote-md5    -> "remote"    (self-reported on remote host)
 * Never flatten an unknown into fresh; the tier travels with the badge.
 */
export type Tier = "pipeline" | "content" | "weak" | "remote";

// ──────────────────────────────────────────────────────────────────────────────
// On-disk claim file (SOURCE OF TRUTH)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A single claim -> evidence grounding edge.
 * `ref` is the logical handle (target name, relative file path, dataset id, external URL/DOI).
 * `location` is the concrete place to re-fingerprint from. For kind:file it usually equals ref;
 * for kind:target it is the pipeline meta store. Paths are RELATIVE TO THE HOST PROJECT ROOT
 * (the dir containing `cairn/`), never to cwd, so re-fingerprinting is location-independent
 * (decision D).
 */
export interface GroundingEdge {
  kind: EvidenceKind;
  ref: string;
  fingerprint: string; // stamped at authoring; "unknown" allowed only when unreachable at stamp time
  method: FingerprintMethod;
  location: string; // host-root-relative path or meta-store handle
}

/** A claim -> claim dependency edge is just the target claim id (string). Does NOT ground. */
export type ClaimId = string; // shape: claim-YYYYMMDD-NNN

/**
 * The parsed YAML frontmatter of a claim file. The markdown BODY (freeform notes / caveats) is
 * intentionally NOT represented here — it is unparsed in v1 (carried separately as `body`).
 *
 * NOTE the absence of any freshness field. That is load-bearing (ADR-0002), not an omission.
 */
export interface ClaimFrontmatter {
  id: ClaimId; // claim-YYYYMMDD-NNN
  text: string; // the conclusion, one sentence
  status: ClaimStatus; // draft | canonical
  verification: Verification; // v1: always "unverified" on author
  grounding: GroundingEdge[]; // >=1 required to leave draft / reach canonical
  depends_on: ClaimId[]; // claim->claim edges; do NOT count as grounding
  created_at: string; // ISO-8601 with offset, e.g. 2026-06-10T20:00:00-04:00
}

/** A claim file as loaded from disk: parsed frontmatter + raw unparsed markdown body. */
export interface ClaimFile {
  frontmatter: ClaimFrontmatter;
  body: string; // freeform notes; never parsed in v1
  path: string; // absolute path to the .md file (runtime convenience; not serialized)
}

// ──────────────────────────────────────────────────────────────────────────────
// Computed read-time shapes
// ──────────────────────────────────────────────────────────────────────────────

/** Per-claim computed freshness, with the tier that produced it. */
export interface Freshness {
  state: FreshnessState;
  tier: Tier; // worst/representative tier among grounding edges (see CONTRACTS.md rule)
  as_of: string; // ISO timestamp this freshness was computed (publish time for published head)
}

// ──────────────────────────────────────────────────────────────────────────────
// PUBLISHED head.json — CANONICAL ONLY (decision A). Shared artifact.
// ──────────────────────────────────────────────────────────────────────────────

/** A canonical claim as it appears in the PUBLISHED head.json (no drafts, no body, no status). */
export interface PublishedClaim {
  id: ClaimId;
  text: string;
  verification: Verification;
  freshness: Freshness; // frozen-at-publish (decision C); site labels it "as of as_of"
  grounding: GroundingEdge[];
  depends_on: ClaimId[];
}

/** Snapshot lineage recorded inside head.json. */
export interface SnapshotLineage {
  current: string; // this snapshot id (content hash, decision E)
  previous: string | null; // prior snapshot id, or null for the first publish
}

/**
 * The PUBLISHED head.json. Canonical claims ONLY — NOT even a draft count (decision A).
 * Written to: snapshots/<id>/data/head.json AND mirrored at published/latest/data/head.json.
 * Consumed by: the static site bundle AND a fresh agent session (orient from this alone).
 */
export interface PublishedHead {
  schema: "cairn.head/1";
  snapshot: SnapshotLineage;
  published_at: string; // ISO; the "as of" the site stamps on every badge
  claims: PublishedClaim[]; // canonical only, stable-sorted by id
}

// ──────────────────────────────────────────────────────────────────────────────
// LOCAL terminal projection — canonical + drafts (decision A). NEVER serialized to a share.
// ──────────────────────────────────────────────────────────────────────────────

/** A pending draft as shown in LOCAL `cairn head` / `cairn drafts` terminal output only. */
export interface DraftView {
  id: ClaimId;
  text: string;
  grounded: boolean; // has >=1 grounding edge (candidate) vs zero (not a candidate)
}

/**
 * The LOCAL orient view printed to the terminal by `cairn head`. Includes pending drafts.
 * This object is terminal output / in-memory only — it is NEVER written into head.json or any
 * shared artifact. The published projection (PublishedHead) is the canonical-only counterpart.
 */
export interface LocalHeadView {
  canonical: PublishedClaim[]; // same per-claim shape, freshness computed live (as_of = now)
  drafts: DraftView[]; // pending drafts, including ungrounded ones
}

// ──────────────────────────────────────────────────────────────────────────────
// diff.json — vs previous snapshot. Shared artifact (snapshots/<id>/data/diff.json).
// ──────────────────────────────────────────────────────────────────────────────

/** A claim whose text changed between snapshots. */
export interface TextChange {
  id: ClaimId;
  before: string;
  after: string;
}

/** A claim whose computed freshness changed between snapshots. */
export interface FreshnessChange {
  id: ClaimId;
  before: FreshnessState;
  after: FreshnessState;
}

/** A claim whose verification changed between snapshots. */
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

/**
 * The diff of THIS snapshot vs its previous one. `against` is the previous snapshot id (null on
 * the first publish, in which case every canonical claim is `added`).
 */
export interface SnapshotDiff {
  schema: "cairn.diff/1";
  against: string | null; // previous snapshot id
  added: PublishedClaim[]; // present now, absent before
  removed: ClaimId[]; // present before, absent now (ids only)
  text_changed: TextChange[];
  freshness_changed: FreshnessChange[];
  verification_changed: VerificationChange[];
  counts: DiffCounts;
}

// ──────────────────────────────────────────────────────────────────────────────
// Snapshot id — reproducible content hash (decision E)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The EXACT, ordered inputs hashed to produce a snapshot id. Hash the canonical claim SET only,
 * EXCLUDING all timestamps/generated_at, so the same head is byte-reproducible. Each grounding
 * entry contributes (kind, ref, fingerprint, method, location); arrays are SORTED before hashing
 * (grounding by [ref,location]; depends_on lexicographically; claims by id). The id is a SHORT
 * (16 hex char) prefix of sha256 over the canonical JSON of this structure.
 */
export interface SnapshotIdInput {
  claims: Array<{
    id: ClaimId;
    text: string;
    status: "canonical"; // only canonical claims enter the id
    verification: Verification;
    grounding: Array<Pick<GroundingEdge, "kind" | "ref" | "fingerprint" | "method" | "location">>;
    depends_on: ClaimId[]; // sorted
  }>;
}

/** Field-order contract for the per-claim hash input (documentation/assertion aid). */
export const SNAPSHOT_ID_FIELDS = [
  "id",
  "text",
  "status",
  "verification",
  "grounding", // each: kind, ref, fingerprint, method, location  (sorted by [ref, location])
  "depends_on", // sorted lexicographically
] as const;

/** Length (hex chars) of a snapshot id. */
export const SNAPSHOT_ID_LEN = 16;

// ──────────────────────────────────────────────────────────────────────────────
// config.json (optional, host-side)
// ──────────────────────────────────────────────────────────────────────────────

/** Optional cairn/config.json. Absent => all fields default; reconcile reports "not configured". */
export interface CairnConfig {
  /** Globs (host-root-relative) of shared findings/paper files to scan in warn-only reconcile. */
  findings_globs?: string[];
  /** Optional remote host alias for remote-md5 re-fingerprinting (ssh config name). */
  remote_host?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Store discovery (runtime)
// ──────────────────────────────────────────────────────────────────────────────

/** Resolved Cairn store paths after walking up from cwd to find `cairn/` with `claims/`. */
export interface StorePaths {
  hostRoot: string; // dir CONTAINING cairn/ — the root all evidence paths are relative to (decision D)
  storeDir: string; // <hostRoot>/cairn
  claimsDir: string; // <hostRoot>/cairn/claims
  snapshotsDir: string; // <hostRoot>/cairn/snapshots
  publishedLatestDir: string; // <hostRoot>/cairn/published/latest  (stable share link, decision B)
  headJsonPath: string; // <hostRoot>/cairn/head.json
  configPath: string; // <hostRoot>/cairn/config.json (may not exist)
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI add/ground edge spec (parsed from --evidence kind:ref)
// ──────────────────────────────────────────────────────────────────────────────

/** Parsed `--evidence kind:ref` argument before fingerprint stamping. */
export interface EvidenceArg {
  kind: EvidenceKind;
  ref: string;
}

/** Maps a FingerprintMethod to its display Tier. */
export const METHOD_TIER: Record<FingerprintMethod, Tier> = {
  "pipeline-meta": "pipeline",
  sha256: "content",
  "size-mtime": "weak",
  "remote-md5": "remote",
};

/** Tier ordering, best -> worst, for picking a claim's representative badge tier. */
export const TIER_ORDER: Tier[] = ["pipeline", "content", "remote", "weak"];
