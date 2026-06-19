/**
 * Cairn v2 — pinned shared contracts (OKF deterministic anti-laundering substrate).
 *
 * This file is the SINGLE TYPESCRIPT SOURCE OF TRUTH for cross-module shapes. Every other module
 * (claimfile, store, gates, fingerprint, freshness, snapshot, publish, cli, skill) conforms to
 * these types. If a builder disagrees with this file, the builder is wrong.
 *
 * The foundational invariant (ADR-0004): the CLI enforces CONSISTENCY WITH WHAT WAS DECLARED,
 * never TRUTH OF THE DECLARATION. Two kinds of fields exist on every concept node:
 *
 *   AGENT-ASSERTED  — what the Agent knows while analysing. Stored verbatim, never overridden.
 *                     (text, estimand id-ref, evidence_lines, depends_on_fork, contradicts,
 *                      inherits_caveat, provenance, deflation_route, and the markdown body.)
 *
 *   CLI-COMPUTED / LOCKED — a "trust badge". The Agent may SUPPLY a value; the CLI DISCARDS it
 *                     and writes its own computed value on every write (trust-field lock, ADR-0004
 *                     / PRD story 25). An agent can never self-stamp a trust badge.
 *                     (id, asserter, reviewed_by, corroboration, fingerprints, freshness,
 *                      reach_ground, lifecycle, resolution, verification.)
 *
 * Other hard rules encoded here (do not "fix" away):
 *  - Concept-node files in the OKF bundle are the source of truth; SQLite is a derived, throwaway
 *    index (ADR-0003). Freshness is COMPUTED at read time and CASCADES over dependency edges
 *    (ADR-0002) — it is locked onto a written shape only by the CLI, never hand-set.
 *  - Estimands are compared by id STRING-EQUALITY only; the CLI never reads an estimand body for
 *    meaning (ADR-0005). There is NO E/N/U / equivalence-type field anywhere — that is a lens that
 *    lives in the body narrative and in the Skill axioms, not in this schema.
 *  - Verification is TERRITORY-LOCKED (ADR-0006 Gate A): agent-sourced provenance can never reach
 *    `verified`. Corroboration is a SEPARATE axis, DERIVED from distinct reviewer ids (Gate B),
 *    never a rung on verification, never hand-set.
 *  - Handle vs body: frontmatter holds machine-actionable handles (ids, refs, enums, flags); the
 *    body holds natural-language meaning. The CLI acts on the handle; it never parses the body.
 */

// ══════════════════════════════════════════════════════════════════════════════
// 0. Identity / discriminator
// ══════════════════════════════════════════════════════════════════════════════

/** The OKF node-type discriminator carried in every concept file's frontmatter. */
export type NodeType = "claim" | "estimand" | "confound";

/** A claim id. Shape: `clm-<short-hash>` (content-addressed at mint, collision-extended). */
export type ClaimId = string;
/** An estimand id. Shape: `est-<short-hash>`. */
export type EstimandId = string;
/** A confound id. Shape: `cfd-<short-hash>`. */
export type ConfoundId = string;

/**
 * An asserter identity. PINNED: the asserter-id IS the `who` string (a stable human/model/agent
 * label). Two writes are "same asserter" iff their `who` strings are byte-equal. The CLI never
 * judges whether two distinct `who` ids are genuinely independent (ADR-0006 ceiling).
 */
export type AsserterId = string;

/** Id-prefix table (the only place the prefixes are pinned). */
export const ID_PREFIX = {
  claim: "clm-",
  estimand: "est-",
  confound: "cfd-",
} as const satisfies Record<NodeType, string>;

/** Length (hex chars) of the short content hash inside a minted node id (before collision-ext). */
export const NODE_ID_HASH_LEN = 12;

// ══════════════════════════════════════════════════════════════════════════════
// 1. Evidence refs & fingerprints (the grounding-edge carriers)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * An evidence ref kind, as declared by the Agent on an evidence line.
 *   file:<path>      — a host-root-relative file; fingerprinted by content/size-mtime.
 *   external:<uri>   — an unreachable-by-default artifact (URL/DOI); contributes `unknown` freshness.
 *   dvc:<path.dvc>   — a DVC pointer; the `.dvc` md5 is read as the TOP fingerprint tier.
 */
export type EvidenceKind = "file" | "external" | "dvc";

/**
 * A single artifact reference inside a named evidence line. `kind` is the declared class; `ref` is
 * the logical handle (a host-root-relative path for `file`/`dvc`, a URI for `external`).
 */
export interface EvidenceRef {
  kind: EvidenceKind;
  ref: string;
}

/**
 * The fingerprint tier, ordered TOP -> WEAK (ADR-0002 / ADR-0003).
 *   dvc-md5       — read from a `.dvc` pointer's md5 (top: rigorous, versioned).
 *   targets-hash  — read from a pipeline meta store (e.g. {targets} _targets/meta).
 *   content-hash  — sha256 of local file bytes.
 *   size-mtime    — weak local fallback: size + mtime signature.
 *   unknown       — unreachable at stamp/refresh time (e.g. external:, offline remote).
 * Never flatten `unknown` into a real tier; the tier travels with the fingerprint.
 */
export type FingerprintTier =
  | "dvc-md5"
  | "targets-hash"
  | "content-hash"
  | "size-mtime"
  | "unknown";

/**
 * A stamped fingerprint of one evidence ref. CLI-COMPUTED: written by the CLI from the claim's
 * `evidence_lines` at author/refresh, and re-read on `refresh`. `value` is null when the tier is
 * `unknown` (unreachable). `taken_at` records when it was last computed.
 */
export interface Fingerprint {
  ref: string; // the EvidenceRef.ref this fingerprint is of
  tier: FingerprintTier;
  value: string | null; // null iff tier === "unknown"
  taken_at: string; // ISO-8601
}

/** Computed freshness state (ADR-0002). CLI-LOCKED; never hand-set. */
export type FreshnessState = "fresh" | "stale" | "unknown";

// ══════════════════════════════════════════════════════════════════════════════
// 2. Asserter / review (SEPIO asserting-agent stamps)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The asserting-agent stamp. CLI-COMPUTED: stamped on create and on every modify. Identity is the
 * `who` string (see AsserterId). A modify whose stamped `who` differs from the existing node's
 * `asserter.who` creates a VERSION (log.md entry + preserved prior), never a silent overwrite
 * (PRD story 18).
 */
export interface Asserter {
  who: AsserterId; // stable asserter-id; identity is byte-equality of this string
  model: string; // model label, e.g. "claude-opus-4-8"
  session: string; // orchestrator-supplied session id
  time: string; // ISO-8601
}

/**
 * One appended review edge. CLI-COMPUTED (appended by the `review` verb; set semantics, distinct by
 * `asserter`). `note` carries the independence narrative the CLI CARRIES but DOES NOT VERIFY
 * (ADR-0006 ceiling).
 */
export interface ReviewEdge {
  asserter: AsserterId; // the reviewer's asserter-id
  time: string; // ISO-8601
  note?: string; // independence narrative; carried, never verified
}

/**
 * Corroboration axis (ADR-0006 Gate B). DERIVED, never hand-set:
 *   `cross-reviewed` iff `reviewed_by` contains >=2 distinct asserter-ids, EACH distinct from the
 *   node's own `asserter.who`; else `self-asserted`. Corroboration is a SEPARATE axis, never a rung
 *   on verification (a rung would read "half-verified" — forbidden masquerade).
 */
export type Corroboration = "self-asserted" | "cross-reviewed";

// ══════════════════════════════════════════════════════════════════════════════
// 3. Claim agent-asserted handle fields
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Source class of a claim (AGENT-ASSERTED). Drives the verification territory-lock (ADR-0006
 * Gate A): only TERRITORY provenance — confirmation by something independent of the analysis system
 * (wet-lab, independent cohort) — may reach `verified`/`contradicted`. See TERRITORY_PROVENANCE.
 */
export type Provenance = "ai_proposed" | "literature" | "experimental";

/**
 * The TERRITORY provenances Gate A admits to `verified`/`contradicted` (ADR-0006). ALLOWLIST,
 * default-safe: any provenance NOT listed here can never reach `verified`/`contradicted`, so a future
 * provenance value is locked out until it is explicitly admitted as territory. PINNED: only
 * `experimental` is territory. A human *reviewing* the analysis is consensus, recorded on
 * `reviewed_by`/`corroboration`, NOT territory; a citation (`literature`) is not confirmation of THIS
 * analysis. The complement (everything else) is the agent-sourced set that can never be verified.
 */
export const TERRITORY_PROVENANCE: readonly Provenance[] = ["experimental"] as const;

/**
 * A named line of evidence with one or more artifact refs (AGENT-ASSERTED). This is the grounding-
 * edge carrier: a claim reaches ground when an evidence line's refs terminate at evidence (any kind
 * counts as ground; `external:` is reachable-as-ground but contributes `unknown` freshness).
 */
export interface EvidenceLine {
  name: string; // human-named line, e.g. "DE on log-CPM"
  refs: EvidenceRef[]; // >=1 in practice; carried verbatim
}

/**
 * A declared fork the claim is conditional on (AGENT-ASSERTED). PINNED grammar: `axis=choice` —
 * `axis` and `choice` are non-empty, split on the FIRST `=` only (so `choice` may contain `=`); no
 * spaces around the separator. The CLI does not interpret whether the fork is arbitrary.
 */
export interface ForkChoice {
  axis: string; // non-empty
  choice: string; // non-empty; may itself contain `=`
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. Claim CLI-computed / locked enum axes
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lifecycle axis (ADR-0001). CLI-LOCKED, set by promotion. `draft` is the soft pre-gate state;
 * `canonical` only after the reach-ground gate passes. Drafts are NEVER emitted into index.md or
 * any snapshot bundle.
 */
export type Lifecycle = "draft" | "canonical";

/**
 * Resolution axis (ADR-0001 extension) — orthogonal to lifecycle. CLI-LOCKED. `settled` is refused
 * while any `contradicts` edge is unresolved; a contested claim may remain `canonical` but stay
 * `open`. This is the structural block on the NK CLOSED-NEGATIVE recurrence. Default `open`.
 */
export type Resolution = "open" | "settled";

/**
 * Verification axis (ADR-0006 Gate A). CLI-LOCKED & territory-locked. Default `unverified` — the
 * inheritable warning light. The CLI refuses `verified` for agent-sourced provenance.
 */
export type Verification = "unverified" | "verified" | "contradicted" | "unverifiable";

// ══════════════════════════════════════════════════════════════════════════════
// 5. The claim handle (frontmatter) — asserted + locked, fully discriminated
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A claim's full frontmatter handle: AGENT-ASSERTED fields (carried verbatim) + CLI-COMPUTED/LOCKED
 * fields (overridden on every write). See the field-ownership table in CONTRACT for who owns what.
 *
 * The markdown BODY is carried separately on ClaimFile, not here (handle vs body separation). No
 * frontmatter value is duplicated verbatim in the body (scan-cheap / drill-deep, PRD story 31).
 */
export interface ClaimFrontmatter {
  // — discriminator —
  type: "claim";

  // ───────────────────────────── AGENT-ASSERTED ─────────────────────────────
  /** One-line conclusion stated with its conditions. The machine-actionable summary. */
  text: string;
  /**
   * Single estimand id-ref (AGENT-ASSERTED). Compared by string-equality only (ADR-0005). May be
   * absent on a `draft`; REQUIRED to cross to `canonical` — the estimand-required gate (c.1b) refuses
   * a candidate with no estimand id (presence check only; the body is never read).
   */
  estimand?: EstimandId;
  /** Named evidence lines; each line carries >=1 artifact ref. The grounding-edge carrier. */
  evidence_lines: EvidenceLine[];
  /** Fork(s) the claim is conditional on. Declarative; the CLI does not interpret them. */
  depends_on_fork: ForkChoice[];
  /** Structural record of disagreement — claim ids this claim contradicts. Drives gate c.3. */
  contradicts: ClaimId[];
  /** Unerasable caveats inherited BY REFERENCE (confound ids). Propagation is a graph edge. */
  inherits_caveat: ConfoundId[];
  /** Source class of the claim. Drives the verification territory-lock (Gate A). */
  provenance: Provenance;
  /**
   * Free-narrative pointer to what would shrink the residual uncertainty (PRD story 9). PINNED:
   * free narrative, NO controlled vocabulary. The Agent MAY prefix a convention token
   * ({clarify-estimand, more-validation, redo-experiment}) but the CLI enforces none.
   */
  deflation_route?: string;

  // ──────────────────────────── CLI-COMPUTED / LOCKED ────────────────────────
  /** Stable claim id (`clm-<hash>`). Minted by the CLI at add-claim; immutable. */
  id: ClaimId;
  /** Asserting-agent stamp; stamped on create and every modify. */
  asserter: Asserter;
  /** Appended review edges; set semantics, distinct by asserter-id. */
  reviewed_by: ReviewEdge[];
  /** Derived corroboration (Gate B); never hand-set. */
  corroboration: Corroboration;
  /** Stamped fingerprints, one per evidence ref, computed at author/refresh. */
  fingerprints: Fingerprint[];
  /** Derived freshness (ADR-0002); cascades over dependency edges. Never hand-set. */
  freshness: FreshnessState;
  /** Derived reach-ground (ADR-0001); recursive query. Never hand-set. */
  reach_ground: boolean;
  /** Lifecycle, set by promotion. */
  lifecycle: Lifecycle;
  /** Resolution axis, orthogonal to lifecycle. Default `open`. */
  resolution: Resolution;
  /** Verification, territory-locked. Default `unverified`. */
  verification: Verification;
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. Estimand & confound handles (minimal; meaning lives in the body)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The estimand handle (ADR-0005). MINIMAL by design. NO E/N/U field, no equivalence-type field.
 * The body IS the meaning (the natural-language statement of which quantity/question). The CLI
 * compares estimands by `id` string-equality ONLY; it never reads the body.
 */
export interface EstimandFrontmatter {
  type: "estimand";
  /** Stable estimand id (`est-<hash>`). CLI-minted; immutable. */
  id: EstimandId;
  /** Asserting-agent stamp. CLI-COMPUTED. */
  asserter: Asserter;
  /** Optional short human-scanning label (AGENT-ASSERTED, free string). */
  label?: string;
}

/**
 * The confound handle (PRD stories 7-8). The body IS the unerasable caveat (the design confound in
 * prose). Claims reference it via `inherits_caveat: [<id>]`; propagation is a graph edge with one
 * source of truth.
 */
export interface ConfoundFrontmatter {
  type: "confound";
  /** Stable confound id (`cfd-<hash>`). CLI-minted; immutable. */
  id: ConfoundId;
  /** Whether the caveat is unerasable (AGENT-ASSERTED; default true, PINNED). */
  unerasable: boolean;
  /** Asserting-agent stamp. CLI-COMPUTED. */
  asserter: Asserter;
  /** Optional short human-scanning label (AGENT-ASSERTED, free string). */
  label?: string;
}

/** Discriminated union over the three OKF node frontmatters (by `type`). */
export type NodeFrontmatter = ClaimFrontmatter | EstimandFrontmatter | ConfoundFrontmatter;

// ══════════════════════════════════════════════════════════════════════════════
// 7. On-disk node files (frontmatter handle + markdown body)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A claim file as loaded from disk: parsed frontmatter handle + raw markdown body. The body, per
 * a.3, contains three prose movements (conclusion-with-conditions; the contradiction & caveat
 * explained; what would change it). The CLI carries the body but does not parse it for meaning.
 */
export interface ClaimFile {
  frontmatter: ClaimFrontmatter;
  body: string;
  path: string; // absolute path to the .md file (runtime convenience; not serialized)
}

/** An estimand file: handle + body (the definition). */
export interface EstimandFile {
  frontmatter: EstimandFrontmatter;
  body: string; // THE definition — the natural-language statement of the quantity/question
  path: string;
}

/** A confound file: handle + body (the unerasable caveat). */
export interface ConfoundFile {
  frontmatter: ConfoundFrontmatter;
  body: string; // THE caveat — the design confound in prose
  path: string;
}

/** Discriminated union over the three OKF node files. */
export type NodeFile = ClaimFile | EstimandFile | ConfoundFile;

// ══════════════════════════════════════════════════════════════════════════════
// 8. Computed read-time / published projections
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A canonical claim as it appears on the orient surface (`index.md`) and in a snapshot bundle. This
 * is the published VIEW: locked axes + live-recomputed freshness, no draft, no version history. The
 * body is rendered alongside by the OKF visualizer, not carried here.
 */
export interface PublishedClaim {
  id: ClaimId;
  text: string;
  estimand: EstimandId | null; // null only if somehow absent (gate forbids on canonical)
  provenance: Provenance;
  verification: Verification;
  corroboration: Corroboration;
  resolution: Resolution;
  freshness: FreshnessState; // recomputed at emit
  reach_ground: boolean;
  evidence_lines: EvidenceLine[];
  depends_on_fork: ForkChoice[];
  contradicts: ClaimId[];
  inherits_caveat: ConfoundId[];
}

/** A draft as surfaced by `drafts` / `status` (ungrounded threads visible, not silently rotting). */
export interface DraftView {
  id: ClaimId;
  text: string;
  reach_ground: boolean; // does it reach ground yet (promotion candidacy)
  estimand: EstimandId | null;
}

/**
 * A surfaced unresolved contradiction for the orient surface. `index.md` MUST surface these
 * prominently, never bury them under canonical positives (PRD stories 10-11; ADR-0004).
 */
export interface SurfacedContradiction {
  claim: ClaimId; // the claim carrying the contradicts edge
  contradicts: ClaimId; // the claim it disagrees with
  estimand: EstimandId | null; // the shared estimand id (siblings) if any
}

/**
 * The orient surface emitted by `head` into `index.md`: canonical claims with live freshness, with
 * unresolved contradictions and staleness surfaced. This is the session-start orient read.
 */
export interface OrientSurface {
  canonical: PublishedClaim[]; // canonical only, stable-sorted by id
  contradictions: SurfacedContradiction[]; // unresolved, surfaced prominently
  stale: ClaimId[]; // canonical claims whose freshness is stale|unknown
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. Snapshot identity & diff (the time spine)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The EXACT, ordered inputs hashed to produce a snapshot id. Hash the published VIEW of the
 * canonical set INCLUDING each claim's locked axes and COMPUTED freshness state, while EXCLUDING all
 * wall-clock timestamps (taken_at, asserter.time, etc.), so the same published view is
 * byte-reproducible AND an artifact mutation (-> refresh) yields a NEW id. Arrays are SORTED before
 * hashing (claims by id; evidence/contradicts/caveats/forks canonically ordered). The id is a SHORT
 * prefix of sha256 over the canonical JSON of this structure.
 */
export interface SnapshotIdInput {
  claims: Array<{
    id: ClaimId;
    text: string;
    type: "claim";
    estimand: EstimandId | null;
    provenance: Provenance;
    verification: Verification;
    corroboration: Corroboration;
    resolution: Resolution;
    lifecycle: "canonical"; // only canonical claims enter the id
    freshness: FreshnessState; // computed; NO timestamp
    reach_ground: boolean;
    evidence_lines: EvidenceLine[]; // sorted
    depends_on_fork: ForkChoice[]; // sorted
    contradicts: ClaimId[]; // sorted
    inherits_caveat: ConfoundId[]; // sorted
  }>;
}

/** Length (hex chars) of a snapshot id (a content-addressed snapshots/<hash>/ directory name). */
export const SNAPSHOT_ID_LEN = 16;

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

/** A claim whose resolution changed between snapshots (the contested-claim time signal). */
export interface ResolutionChange {
  id: ClaimId;
  before: Resolution;
  after: Resolution;
}

export interface DiffCounts {
  added: number;
  removed: number;
  text_changed: number;
  freshness_changed: number;
  verification_changed: number;
  resolution_changed: number;
}

/** The diff of THIS snapshot vs its previous one (appended to log.md per publish). */
export interface SnapshotDiff {
  against: string | null; // previous snapshot id; null on first publish
  added: PublishedClaim[];
  removed: ClaimId[];
  text_changed: TextChange[];
  freshness_changed: FreshnessChange[];
  verification_changed: VerificationChange[];
  resolution_changed: ResolutionChange[];
  counts: DiffCounts;
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. Gates — shared result shape
// ══════════════════════════════════════════════════════════════════════════════

/** The gate ids (each maps to a deterministic rule in section (c) of the spec). */
export type GateId =
  | "reach-ground" // c.1, ADR-0001
  | "estimand-required" // c.1b, ADR-0005 (a canonical candidate must declare an estimand)
  | "estimand-collapse" // c.2, ADR-0005
  | "resolution" // c.3, ADR-0001 extension
  | "verification-lock" // c.4, ADR-0006 Gate A
  | "corroboration" // c.5, ADR-0006 Gate B
  | "trust-field-lock" // c.6, ADR-0004 (meta-gate)
  | "referential-integrity"; // cited estimand / inherited confound node must EXIST (publish/validate, fs)

/** One gate violation: which gate, which offending node/edge, and a human message. */
export interface GateViolation {
  gate: GateId;
  claim: ClaimId; // the offending claim id (or the source of an offending edge)
  detail?: string; // e.g. the contradicting id, the differing estimand id
  message: string;
}

/** The result of running gates over a candidate set. `ok` iff no violations. Read-only. */
export interface GateResult {
  ok: boolean;
  violations: GateViolation[];
  candidateIds: ClaimId[]; // claims that WOULD be promoted on pass (grounded drafts + canonical)
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. Config & store paths (host-side runtime)
// ══════════════════════════════════════════════════════════════════════════════

/** Optional cairn/config.json. Absent => all fields default; reconcile reports "not configured". */
export interface CairnConfig {
  /** Globs (host-root-relative) of shared findings/paper files to scan in warn-only reconcile. */
  findings_globs?: string[];
  /** Optional remote host alias for remote fingerprinting of dvc/remote refs (ssh config name). */
  remote_host?: string;
}

/**
 * Resolved Cairn OKF store paths after walking up from cwd to find the bundle. The bundle is a
 * self-contained text-only OKF directory (ADR-0003): claims/ estimands/ confounds/ + index.md,
 * log.md, snapshots/. The derived SQLite index is NOT part of the portable bundle.
 */
export interface StorePaths {
  hostRoot: string; // dir CONTAINING the store — root all evidence paths are relative to
  storeDir: string; // <hostRoot>/cairn
  claimsDir: string; // <hostRoot>/cairn/claims
  estimandsDir: string; // <hostRoot>/cairn/estimands
  confoundsDir: string; // <hostRoot>/cairn/confounds
  snapshotsDir: string; // <hostRoot>/cairn/snapshots
  indexPath: string; // <hostRoot>/cairn/index.md   (orient surface emitted by `head`)
  logPath: string; // <hostRoot>/cairn/log.md      (append-only time spine)
  configPath: string; // <hostRoot>/cairn/config.json (may not exist)
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. CLI argument shapes (parsed before stamping)
// ══════════════════════════════════════════════════════════════════════════════

/** Parsed `--evidence kind:ref` argument before fingerprint stamping. */
export interface EvidenceArg {
  kind: EvidenceKind;
  ref: string;
}

/** Parsed `--depends-on-fork axis=choice` argument (split on first `=`). */
export interface ForkArg {
  axis: string;
  choice: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// 13. Constant tables (the only value-level exports)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fingerprint tier ordering, BEST -> WORST (ADR-0002/0003). Used to pick a claim's representative
 * tier and to compare tiers. `unknown` is strictly worst.
 */
export const TIER_ORDER: readonly FingerprintTier[] = [
  "dvc-md5",
  "targets-hash",
  "content-hash",
  "size-mtime",
  "unknown",
] as const;

/** Allowed evidence-ref kinds (for `--evidence` parsing / validation). */
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ["file", "external", "dvc"] as const;

/** Allowed provenance enum values (for validation). */
export const PROVENANCES: readonly Provenance[] = [
  "ai_proposed",
  "literature",
  "experimental",
] as const;

/** Allowed verification enum values (for validation; the CLI still locks the value). */
export const VERIFICATIONS: readonly Verification[] = [
  "unverified",
  "verified",
  "contradicted",
  "unverifiable",
] as const;

/** Allowed lifecycle values. */
export const LIFECYCLES: readonly Lifecycle[] = ["draft", "canonical"] as const;

/** Allowed resolution values. */
export const RESOLUTIONS: readonly Resolution[] = ["open", "settled"] as const;

/** Allowed corroboration values (CLI-derived; listed for validation/coercion). */
export const CORROBORATIONS: readonly Corroboration[] = ["self-asserted", "cross-reviewed"] as const;

/** Allowed fingerprint tiers (for validation). */
export const FINGERPRINT_TIERS: readonly FingerprintTier[] = [
  "dvc-md5",
  "targets-hash",
  "content-hash",
  "size-mtime",
  "unknown",
] as const;
