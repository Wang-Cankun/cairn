import { describe, expect, test } from "bun:test";
import { computeFreshness } from "../src/freshness.ts";
import { stampEdge } from "../src/fingerprint.ts";
import { fileEdge, fm, putArtifact, tempHost } from "./helpers.ts";
import type { ClaimFile, ClaimFrontmatter } from "../src/types.ts";

function cf(frontmatter: ClaimFrontmatter): ClaimFile {
  return { frontmatter, body: "", path: `/tmp/${frontmatter.id}.md` };
}
const AS_OF = "2026-06-10T20:30:00-04:00";

describe("freshness from evidence fingerprint", () => {
  test("fresh when the file still matches the stamp", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const edge = stampEdge(hostRoot, "file", "out/a.csv");
    expect(edge.fingerprint).toStartWith("sha256:");
    const claim = cf(fm({ id: "claim-20260610-001", status: "canonical", grounding: [edge] }));
    const fr = computeFreshness([claim], hostRoot, AS_OF).get("claim-20260610-001")!;
    expect(fr.state).toBe("fresh");
    expect(fr.tier).toBe("content");
    expect(fr.as_of).toBe(AS_OF);
  });

  test("stale when the file content changes after stamping", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const edge = stampEdge(hostRoot, "file", "out/a.csv");
    putArtifact(hostRoot, "out/a.csv", "v2-changed"); // mutate the artifact
    const claim = cf(fm({ id: "claim-20260610-001", status: "canonical", grounding: [edge] }));
    const fr = computeFreshness([claim], hostRoot, AS_OF).get("claim-20260610-001")!;
    expect(fr.state).toBe("stale");
  });

  test("unknown when the artifact is missing/unreachable", () => {
    const { hostRoot } = tempHost();
    const claim = cf(fm({ id: "claim-20260610-001", status: "canonical", grounding: [fileEdge("out/missing.csv", "sha256:deadbeef")] }));
    const fr = computeFreshness([claim], hostRoot, AS_OF).get("claim-20260610-001")!;
    expect(fr.state).toBe("unknown");
  });

  test("dependency cascade: a claim is stale if a dependency is stale", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const aEdge = stampEdge(hostRoot, "file", "out/a.csv");
    putArtifact(hostRoot, "out/b.csv", "vb");
    const bEdge = stampEdge(hostRoot, "file", "out/b.csv");
    putArtifact(hostRoot, "out/a.csv", "v2"); // A becomes stale

    const a = cf(fm({ id: "claim-20260610-001", status: "canonical", grounding: [aEdge] }));
    const b = cf(fm({ id: "claim-20260610-002", status: "canonical", grounding: [bEdge], depends_on: ["claim-20260610-001"] }));
    const fr = computeFreshness([a, b], hostRoot, AS_OF);
    expect(fr.get("claim-20260610-001")!.state).toBe("stale");
    expect(fr.get("claim-20260610-002")!.state).toBe("stale"); // cascaded from A
  });

  test("cascade is cycle-safe (mutual deps do not hang)", () => {
    const { hostRoot } = tempHost();
    putArtifact(hostRoot, "out/a.csv", "v1");
    const aEdge = stampEdge(hostRoot, "file", "out/a.csv");
    const x = cf(fm({ id: "claim-20260610-001", status: "canonical", grounding: [aEdge], depends_on: ["claim-20260610-002"] }));
    const y = cf(fm({ id: "claim-20260610-002", status: "canonical", grounding: [aEdge], depends_on: ["claim-20260610-001"] }));
    const fr = computeFreshness([x, y], hostRoot, AS_OF);
    expect(fr.get("claim-20260610-001")!.state).toBe("fresh");
    expect(fr.get("claim-20260610-002")!.state).toBe("fresh");
  });
});
