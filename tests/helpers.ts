/**
 * Shared test helpers (v2): build a temp host store + construct v2 OKF claim frontmatters quickly.
 *
 * v2 nodes are markdown + YAML frontmatter; a claim carries agent-asserted handles (text, estimand,
 * evidence_lines, depends_on_fork, contradicts, inherits_caveat, provenance) plus CLI-locked fields
 * (id, asserter, reviewed_by, corroboration, fingerprints, freshness, reach_ground, lifecycle,
 * resolution, verification). These helpers fabricate a well-formed ClaimFrontmatter for unit tests.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeClaimFile } from "../src/claimfile.ts";
import { resolveStoreForWrite } from "../src/store.ts";
import type {
  Asserter,
  ClaimFrontmatter,
  EvidenceLine,
  Fingerprint,
  StorePaths,
} from "../src/types.ts";

export function tempHost(): { hostRoot: string; paths: StorePaths } {
  const hostRoot = mkdtempSync(join(tmpdir(), "cairn-test-"));
  const paths = resolveStoreForWrite(hostRoot);
  return { hostRoot, paths };
}

const DEFAULT_ASSERTER: Asserter = {
  who: "agent-A",
  model: "test-model",
  session: "test-session",
  time: "2026-06-10T20:00:00-04:00",
};

/**
 * Build a v2 ClaimFrontmatter from a partial override. Sensible defaults are supplied for every
 * required field so a test only states what it cares about. `id` is required (and must match the
 * `clm-<hex>` shape when it will be parsed, but unit tests that never serialize/parse may use any
 * stable string id — they exercise gate/freshness mechanism, not id-regex validation).
 */
export function fm(over: Partial<ClaimFrontmatter> & { id: string }): ClaimFrontmatter {
  const evidence_lines = over.evidence_lines ?? [];
  return {
    type: "claim",
    text: over.text ?? `claim ${over.id}`,
    ...(over.estimand !== undefined ? { estimand: over.estimand } : {}),
    evidence_lines,
    depends_on_fork: over.depends_on_fork ?? [],
    contradicts: over.contradicts ?? [],
    inherits_caveat: over.inherits_caveat ?? [],
    provenance: over.provenance ?? "ai_proposed",
    ...(over.deflation_route !== undefined ? { deflation_route: over.deflation_route } : {}),
    id: over.id,
    asserter: over.asserter ?? DEFAULT_ASSERTER,
    reviewed_by: over.reviewed_by ?? [],
    corroboration: over.corroboration ?? "self-asserted",
    fingerprints: over.fingerprints ?? [],
    freshness: over.freshness ?? "unknown",
    reach_ground: over.reach_ground ?? evidence_lines.some((l) => l.refs.length > 0),
    lifecycle: over.lifecycle ?? "draft",
    resolution: over.resolution ?? "open",
    verification: over.verification ?? "unverified",
  };
}

/** Build a single-ref `file:` evidence line named after the ref. */
export function fileEvidence(ref: string): EvidenceLine {
  return { name: ref, refs: [{ kind: "file", ref }] };
}

/** Build a stored content-hash fingerprint for a `file:` ref (for freshness baselining in tests). */
export function fileFingerprint(ref: string, value: string, taken_at = "2026-06-10T20:00:00-04:00"): Fingerprint {
  return { ref, tier: "content-hash", value, taken_at };
}

/** Write a claim file directly into the store (bypassing the CLI, for setup). */
export function putClaim(paths: StorePaths, frontmatter: ClaimFrontmatter, body = ""): void {
  mkdirSync(paths.claimsDir, { recursive: true });
  writeFileSync(join(paths.claimsDir, `${frontmatter.id}.md`), serializeClaimFile(frontmatter, body), "utf8");
}

/** Write an evidence artifact at a host-root-relative path. */
export function putArtifact(hostRoot: string, rel: string, content: string): void {
  const abs = join(hostRoot, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}
