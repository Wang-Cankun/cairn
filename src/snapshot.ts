/**
 * snapshot.ts — projection helpers (v2): build PublishedClaim shapes, compute the reproducible
 * snapshot id, build the orient surface, and compute the diff vs a previous snapshot head.
 *
 * The published VIEW is canonical-only (drafts never appear). The snapshot id hashes that view —
 * locked axes + COMPUTED freshness state — while EXCLUDING all wall-clock timestamps, so the same
 * view is byte-reproducible AND an artifact mutation (→ refresh) yields a NEW id.
 */

import { createHash } from "node:crypto";
import type {
  ClaimFile,
  ClaimFrontmatter,
  EstimandId,
  EvidenceLine,
  EvidenceRef,
  ForkChoice,
  FreshnessState,
  OrientSurface,
  PublishedClaim,
  SnapshotDiff,
  SnapshotIdInput,
  SurfacedContradiction,
} from "./types.ts";
import { SNAPSHOT_ID_LEN } from "./types.ts";
import { isComparableEstimandGroup } from "./gate.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Canonical (reproducible) ordering of a claim's array fields
// ──────────────────────────────────────────────────────────────────────────────

function sortEvidenceLines(lines: EvidenceLine[]): EvidenceLine[] {
  const sortRefs = (refs: EvidenceRef[]): EvidenceRef[] =>
    [...refs].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
      return 0;
    });
  return [...lines]
    .map((l) => ({ name: l.name, refs: sortRefs(l.refs) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function sortForks(forks: ForkChoice[]): ForkChoice[] {
  return [...forks].sort((a, b) => {
    if (a.axis !== b.axis) return a.axis < b.axis ? -1 : 1;
    if (a.choice !== b.choice) return a.choice < b.choice ? -1 : 1;
    return 0;
  });
}

function sortStrs(xs: string[]): string[] {
  return [...xs].sort();
}

function estimandOf(fm: ClaimFrontmatter): EstimandId | null {
  return fm.estimand ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// PublishedClaim projection
// ──────────────────────────────────────────────────────────────────────────────

/** Build a PublishedClaim from a canonical frontmatter + its computed freshness state. */
export function toPublishedClaim(fm: ClaimFrontmatter, freshness: FreshnessState): PublishedClaim {
  return {
    id: fm.id,
    text: fm.text,
    estimand: estimandOf(fm),
    provenance: fm.provenance,
    verification: fm.verification,
    corroboration: fm.corroboration,
    resolution: fm.resolution,
    freshness,
    reach_ground: fm.reach_ground,
    evidence_lines: sortEvidenceLines(fm.evidence_lines),
    depends_on_fork: sortForks(fm.depends_on_fork),
    contradicts: sortStrs(fm.contradicts),
    inherits_caveat: sortStrs(fm.inherits_caveat),
  };
}

/** Filter ClaimFiles to canonical frontmatter, sorted by id. */
export function canonicalFrontmatter(claims: ClaimFile[]): ClaimFrontmatter[] {
  return claims
    .map((c) => c.frontmatter)
    .filter((fm) => fm.lifecycle === "canonical")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ──────────────────────────────────────────────────────────────────────────────
// Snapshot id (content-addressed; excludes timestamps; includes freshness state)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute the reproducible snapshot id: hash the published VIEW of the canonical set INCLUDING each
 * claim's locked axes and COMPUTED freshness state, EXCLUDING all wall-clock timestamps. Arrays are
 * canonically sorted (claims by id; evidence/forks/contradicts/caveats ordered). The id is the first
 * SNAPSHOT_ID_LEN hex chars of sha256 over the canonical JSON of the SnapshotIdInput.
 *
 * `freshness` maps claim id → computed FreshnessState. Throws if a canonical claim is missing one.
 */
export function computeSnapshotId(
  canonical: ClaimFrontmatter[],
  freshness: Map<string, FreshnessState>,
): string {
  const input: SnapshotIdInput = {
    claims: [...canonical]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((fm) => {
        const fr = freshness.get(fm.id);
        if (fr === undefined) throw new Error(`computeSnapshotId: missing freshness for ${fm.id}`);
        return {
          id: fm.id,
          text: fm.text,
          type: "claim" as const,
          estimand: estimandOf(fm),
          provenance: fm.provenance,
          verification: fm.verification,
          corroboration: fm.corroboration,
          resolution: fm.resolution,
          lifecycle: "canonical" as const,
          freshness: fr,
          reach_ground: fm.reach_ground,
          evidence_lines: sortEvidenceLines(fm.evidence_lines),
          depends_on_fork: sortForks(fm.depends_on_fork),
          contradicts: sortStrs(fm.contradicts),
          inherits_caveat: sortStrs(fm.inherits_caveat),
        };
      }),
  };
  const json = JSON.stringify(input);
  const hex = createHash("sha256").update(json, "utf8").digest("hex");
  return hex.slice(0, SNAPSHOT_ID_LEN);
}

// ──────────────────────────────────────────────────────────────────────────────
// Orient surface (the index.md model) — surfaces contradictions & staleness
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the orient surface: canonical claims (live freshness), plus the UNRESOLVED contradictions and
 * the stale set, surfaced rather than buried. A contradiction is surfaced from a canonical claim's
 * `contradicts` edge that is still live within the canonical set AND the carrying claim's resolution
 * is `open` (an edge on a `settled` claim is, by the resolution gate, already cleared/superseded).
 *
 * COLLAPSE-REFUSAL guard (gate c.2 / ADR-0005): surfacing a contradiction GROUPS the two claims as a
 * comparable pair (same question, opposing answers). Two claims on DIFFERENT estimand ids are different
 * questions — not comparable — so pairing them as a "contradiction" would be a meaningless collapse.
 * We therefore surface a contradiction ONLY when the carrying claim and the cited claim share a
 * BYTE-EQUAL estimand id (string-equality, never meaning) — exactly the boundary collapseRefusalViolation
 * guards. A cross-estimand `contradicts` edge is NOT surfaced as a contradiction (the collapse is
 * refused at the orient surface, not silently performed).
 */
export function buildOrientSurface(
  canonical: ClaimFrontmatter[],
  freshness: Map<string, FreshnessState>,
): OrientSurface {
  const published = canonical.map((fm) => toPublishedClaim(fm, freshness.get(fm.id) ?? "unknown"));
  const liveIds = new Set(canonical.map((fm) => fm.id));
  const estimandById = new Map(canonical.map((fm) => [fm.id, fm.estimand]));

  const contradictions: SurfacedContradiction[] = [];
  for (const fm of canonical) {
    if (fm.resolution === "settled") continue; // a settled claim's edges are cleared/superseded
    for (const cited of [...fm.contradicts].sort()) {
      if (!liveIds.has(cited)) continue;
      // Collapse-refusal (gate c.2, shared predicate): only a same-estimand pair is comparable, so only
      // such a pair may be surfaced as a contradiction. A cross-estimand / missing-id pair is refused.
      if (!isComparableEstimandGroup([fm.estimand, estimandById.get(cited)])) continue;
      contradictions.push({ claim: fm.id, contradicts: cited, estimand: estimandOf(fm) });
    }
  }

  const stale: string[] = canonical
    .filter((fm) => {
      const fr = freshness.get(fm.id) ?? "unknown";
      return fr === "stale" || fr === "unknown";
    })
    .map((fm) => fm.id)
    .sort();

  return { canonical: published, contradictions, stale };
}

// ──────────────────────────────────────────────────────────────────────────────
// Diff (this snapshot vs the previous one) — appended to log.md per publish
// ──────────────────────────────────────────────────────────────────────────────

/** Compute the diff of `current` published claims vs a previous published claim set (or null). */
export function computeDiff(
  current: PublishedClaim[],
  previous: { against: string | null; claims: PublishedClaim[] } | null,
): SnapshotDiff {
  const against = previous ? previous.against : null;
  const prevById = new Map<string, PublishedClaim>();
  if (previous) for (const c of previous.claims) prevById.set(c.id, c);
  const curById = new Map<string, PublishedClaim>();
  for (const c of current) curById.set(c.id, c);

  const added: PublishedClaim[] = [];
  const removed: string[] = [];
  const text_changed: SnapshotDiff["text_changed"] = [];
  const freshness_changed: SnapshotDiff["freshness_changed"] = [];
  const verification_changed: SnapshotDiff["verification_changed"] = [];
  const resolution_changed: SnapshotDiff["resolution_changed"] = [];

  for (const c of current) {
    const prev = prevById.get(c.id);
    if (!prev) {
      added.push(c);
      continue;
    }
    if (prev.text !== c.text) text_changed.push({ id: c.id, before: prev.text, after: c.text });
    if (prev.freshness !== c.freshness)
      freshness_changed.push({ id: c.id, before: prev.freshness, after: c.freshness });
    if (prev.verification !== c.verification)
      verification_changed.push({ id: c.id, before: prev.verification, after: c.verification });
    if (prev.resolution !== c.resolution)
      resolution_changed.push({ id: c.id, before: prev.resolution, after: c.resolution });
  }
  if (previous) {
    for (const c of previous.claims) {
      if (!curById.has(c.id)) removed.push(c.id);
    }
  }
  removed.sort();

  return {
    against,
    added,
    removed,
    text_changed,
    freshness_changed,
    verification_changed,
    resolution_changed,
    counts: {
      added: added.length,
      removed: removed.length,
      text_changed: text_changed.length,
      freshness_changed: freshness_changed.length,
      verification_changed: verification_changed.length,
      resolution_changed: resolution_changed.length,
    },
  };
}
