/**
 * Shared test helpers: build a temp host store + write claim files quickly.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeClaimFile } from "../src/claimfile.ts";
import { resolveStoreForWrite } from "../src/store.ts";
import type { ClaimFrontmatter, GroundingEdge, StorePaths } from "../src/types.ts";

export function tempHost(): { hostRoot: string; paths: StorePaths } {
  const hostRoot = mkdtempSync(join(tmpdir(), "cairn-test-"));
  const paths = resolveStoreForWrite(hostRoot);
  return { hostRoot, paths };
}

export function fm(over: Partial<ClaimFrontmatter> & { id: string }): ClaimFrontmatter {
  return {
    id: over.id,
    text: over.text ?? `claim ${over.id}`,
    status: over.status ?? "draft",
    verification: over.verification ?? "unverified",
    grounding: over.grounding ?? [],
    depends_on: over.depends_on ?? [],
    created_at: over.created_at ?? "2026-06-10T20:00:00-04:00",
  };
}

export function fileEdge(ref: string, fingerprint: string): GroundingEdge {
  return { kind: "file", ref, fingerprint, method: "sha256", location: ref };
}

/** Write a claim file directly into the store (bypassing the CLI, for setup). */
export function putClaim(paths: StorePaths, frontmatter: ClaimFrontmatter, body = ""): void {
  mkdirSync(paths.claimsDir, { recursive: true });
  writeFileSync(join(paths.claimsDir, `${frontmatter.id}.md`), serializeClaimFile(frontmatter, body), "utf8");
}

/** Write an evidence artifact at a host-root-relative path; returns its sha256:... fingerprint. */
export function putArtifact(hostRoot: string, rel: string, content: string): void {
  const abs = join(hostRoot, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}
