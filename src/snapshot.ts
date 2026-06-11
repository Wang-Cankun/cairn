/**
 * snapshot.ts — projection helpers: build PublishedClaim shapes, compute the reproducible snapshot
 * id (decision E), and compute the diff vs a previous head.
 */

import { createHash } from "node:crypto";
import type {
  ClaimFile,
  ClaimFrontmatter,
  Freshness,
  GroundingEdge,
  PublishedClaim,
  PublishedHead,
  SnapshotDiff,
  SnapshotIdInput,
} from "./types.ts";
import { SNAPSHOT_ID_LEN } from "./types.ts";

/** Sort grounding edges by [ref, location] for reproducible ordering. */
function sortGrounding(edges: GroundingEdge[]): GroundingEdge[] {
  return [...edges].sort((a, b) => {
    if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
    if (a.location !== b.location) return a.location < b.location ? -1 : 1;
    return 0;
  });
}

/** Build a PublishedClaim from a canonical frontmatter + its computed freshness. */
export function toPublishedClaim(fm: ClaimFrontmatter, freshness: Freshness): PublishedClaim {
  return {
    id: fm.id,
    text: fm.text,
    verification: fm.verification,
    freshness,
    grounding: sortGrounding(fm.grounding),
    depends_on: [...fm.depends_on].sort(),
  };
}

/**
 * Compute the reproducible snapshot id (decision E): hash the canonical claim SET only, excluding
 * timestamps. Sort grounding by [ref,location], depends_on lexicographically, claims by id.
 * sha256 over canonical (stable-key) JSON; first SNAPSHOT_ID_LEN hex chars.
 */
export function computeSnapshotId(canonical: ClaimFrontmatter[]): string {
  const input: SnapshotIdInput = {
    claims: [...canonical]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((fm) => ({
        id: fm.id,
        text: fm.text,
        status: "canonical" as const,
        verification: fm.verification,
        grounding: sortGrounding(fm.grounding).map((g) => ({
          kind: g.kind,
          ref: g.ref,
          fingerprint: g.fingerprint,
          method: g.method,
          location: g.location,
        })),
        depends_on: [...fm.depends_on].sort(),
      })),
  };
  // Canonical JSON: keys are written in a fixed order by construction above; JSON.stringify
  // preserves insertion order for plain objects.
  const json = JSON.stringify(input);
  const hex = createHash("sha256").update(json, "utf8").digest("hex");
  return hex.slice(0, SNAPSHOT_ID_LEN);
}

/** Compute the diff of `current` published claims vs a previous PublishedHead (or null). */
export function computeDiff(
  current: PublishedClaim[],
  previous: PublishedHead | null,
): SnapshotDiff {
  const against = previous ? previous.snapshot.current : null;
  const prevById = new Map<string, PublishedClaim>();
  if (previous) for (const c of previous.claims) prevById.set(c.id, c);
  const curById = new Map<string, PublishedClaim>();
  for (const c of current) curById.set(c.id, c);

  const added: PublishedClaim[] = [];
  const removed: string[] = [];
  const text_changed: SnapshotDiff["text_changed"] = [];
  const freshness_changed: SnapshotDiff["freshness_changed"] = [];
  const verification_changed: SnapshotDiff["verification_changed"] = [];

  for (const c of current) {
    const prev = prevById.get(c.id);
    if (!prev) {
      added.push(c);
      continue;
    }
    if (prev.text !== c.text) text_changed.push({ id: c.id, before: prev.text, after: c.text });
    if (prev.freshness.state !== c.freshness.state)
      freshness_changed.push({ id: c.id, before: prev.freshness.state, after: c.freshness.state });
    if (prev.verification !== c.verification)
      verification_changed.push({ id: c.id, before: prev.verification, after: c.verification });
  }
  if (previous) {
    for (const c of previous.claims) {
      if (!curById.has(c.id)) removed.push(c.id);
    }
  }
  removed.sort();

  return {
    schema: "cairn.diff/1",
    against,
    added,
    removed,
    text_changed,
    freshness_changed,
    verification_changed,
    counts: {
      added: added.length,
      removed: removed.length,
      text_changed: text_changed.length,
      freshness_changed: freshness_changed.length,
      verification_changed: verification_changed.length,
    },
  };
}

/** Helper: filter ClaimFiles to canonical frontmatter, sorted by id. */
export function canonicalFrontmatter(claims: ClaimFile[]): ClaimFrontmatter[] {
  return claims
    .map((c) => c.frontmatter)
    .filter((fm) => fm.status === "canonical")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
