import { describe, expect, test } from "bun:test";
import { computeFreshness } from "../src/freshness.ts";
import { fingerprintRef } from "../src/fingerprint.ts";
import { fileEvidence, fm, putArtifact, tempHost } from "./helpers.ts";
import type { ClaimFile, ClaimFrontmatter, EvidenceRef, Fingerprint } from "../src/types.ts";

function cf(frontmatter: ClaimFrontmatter): ClaimFile {
  return { frontmatter, body: "", path: `/tmp/${frontmatter.id}.md` };
}
const AS_OF = "2026-06-10T20:30:00-04:00";

/** Stamp the current fingerprint of a file: ref (the baseline a later refresh compares against). */
function stampFile(hostRoot: string, ref: string): Fingerprint {
  const evRef: EvidenceRef = { kind: "file", ref };
  return fingerprintRef(hostRoot, evRef, AS_OF);
}

describe("freshness from evidence fingerprint (v2: bare FreshnessState)", () => {
  test("fresh when the file still matches the stamp", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const stamp = stampFile(hostRoot, "out/a.csv");
    expect(stamp.tier).toBe("content-hash");
    expect(stamp.value).toStartWith("sha256:");
    const claim = cf(
      fm({ id: "claim-001", lifecycle: "canonical", evidence_lines: [fileEvidence("out/a.csv")], fingerprints: [stamp] }),
    );
    const state = computeFreshness([claim], hostRoot, AS_OF).get("claim-001");
    expect(state).toBe("fresh");
  });

  test("stale when the file content changes after stamping", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const stamp = stampFile(hostRoot, "out/a.csv");
    putArtifact(hostRoot, "out/a.csv", "v2-changed"); // mutate the artifact
    const claim = cf(
      fm({ id: "claim-001", lifecycle: "canonical", evidence_lines: [fileEvidence("out/a.csv")], fingerprints: [stamp] }),
    );
    expect(computeFreshness([claim], hostRoot, AS_OF).get("claim-001")).toBe("stale");
  });

  test("unknown when the artifact is missing/unreachable", () => {
    const { hostRoot } = tempHost();
    // A stored content-hash baseline whose file no longer exists -> recompute is unknown -> unknown.
    const stamp: Fingerprint = { ref: "out/missing.csv", tier: "content-hash", value: "sha256:deadbeef", taken_at: AS_OF };
    const claim = cf(
      fm({ id: "claim-001", lifecycle: "canonical", evidence_lines: [fileEvidence("out/missing.csv")], fingerprints: [stamp] }),
    );
    expect(computeFreshness([claim], hostRoot, AS_OF).get("claim-001")).toBe("unknown");
  });

  test("a claim with zero evidence refs has no evidence -> unknown (never a false fresh)", () => {
    const { hostRoot } = tempHost();
    const claim = cf(fm({ id: "claim-001", lifecycle: "canonical" }));
    expect(computeFreshness([claim], hostRoot, AS_OF).get("claim-001")).toBe("unknown");
  });

  test("stale if ANY ref is stale; unknown dominates fresh only when no ref is stale", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const fresh = stampFile(hostRoot, "out/a.csv");
    // second ref baselined then deleted -> unknown
    putArtifact(hostRoot, "out/b.csv", "vb");
    const gone = stampFile(hostRoot, "out/b.csv");
    putArtifact(hostRoot, "out/a.csv", "v2"); // a now stale

    const claim = cf(
      fm({
        id: "claim-001",
        lifecycle: "canonical",
        evidence_lines: [
          { name: "two", refs: [{ kind: "file", ref: "out/a.csv" }, { kind: "file", ref: "out/b.csv" }] },
        ],
        fingerprints: [fresh, gone],
      }),
    );
    // a=stale, b=fresh -> any-stale wins -> stale.
    expect(computeFreshness([claim], hostRoot, AS_OF).get("claim-001")).toBe("stale");
  });

  test("computeFreshness is order-independent across claims", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/x.csv", "vx");
    const sx = stampFile(hostRoot, "out/x.csv");
    putArtifact(hostRoot, "out/y.csv", "vy");
    const sy = stampFile(hostRoot, "out/y.csv");
    putArtifact(hostRoot, "out/x.csv", "vx-changed"); // x becomes stale

    const x = cf(fm({ id: "claim-001", lifecycle: "canonical", evidence_lines: [fileEvidence("out/x.csv")], fingerprints: [sx] }));
    const y = cf(fm({ id: "claim-002", lifecycle: "canonical", evidence_lines: [fileEvidence("out/y.csv")], fingerprints: [sy] }));

    for (const order of [[x, y], [y, x]] as ClaimFile[][]) {
      const fr = computeFreshness(order, hostRoot, AS_OF);
      expect(fr.get("claim-001")).toBe("stale");
      expect(fr.get("claim-002")).toBe("fresh");
    }
  });
});
