import { describe, expect, test } from "bun:test";
import { parseClaimFile, serializeClaimFile, validateFrontmatter, ClaimFileError } from "../src/claimfile.ts";
import { fileEdge, fm } from "./helpers.ts";

describe("claimfile roundtrip", () => {
  test("serialize then parse yields the same frontmatter", () => {
    const original = fm({
      id: "claim-20260610-001",
      text: "Step 07 scores correlate with the outcome.",
      status: "canonical",
      grounding: [fileEdge("outputs/step07_scores.csv", "sha256:abc123")],
      depends_on: ["claim-20260609-014"],
    });
    const text = serializeClaimFile(original, "Some freeform note.\n");
    const parsed = parseClaimFile(text, "/tmp/claim-20260610-001.md");
    expect(parsed.frontmatter).toEqual(original);
    expect(parsed.body.trim()).toBe("Some freeform note.");
  });

  test("frontmatter key order is stable / deterministic", () => {
    const a = serializeClaimFile(fm({ id: "claim-20260610-002", grounding: [fileEdge("a.csv", "sha256:1")] }));
    const b = serializeClaimFile(fm({ id: "claim-20260610-002", grounding: [fileEdge("a.csv", "sha256:1")] }));
    expect(a).toBe(b);
    expect(a.indexOf("id:")).toBeLessThan(a.indexOf("text:"));
    expect(a.indexOf("status:")).toBeLessThan(a.indexOf("created_at:"));
  });

  test("rejects a bad id shape", () => {
    expect(() => validateFrontmatter({ ...fm({ id: "claim-20260610-001" }), id: "nope" })).toThrow(ClaimFileError);
  });

  test("rejects an invalid grounding method", () => {
    const raw = { ...fm({ id: "claim-20260610-001" }), grounding: [{ kind: "file", ref: "a", fingerprint: "x", method: "bogus", location: "a" }] };
    expect(() => validateFrontmatter(raw)).toThrow(ClaimFileError);
  });

  test("missing frontmatter block throws", () => {
    expect(() => parseClaimFile("no frontmatter here", "/tmp/x.md")).toThrow(ClaimFileError);
  });

  test("there is no freshness field in serialized output", () => {
    const text = serializeClaimFile(fm({ id: "claim-20260610-003", grounding: [fileEdge("a.csv", "sha256:1")] }));
    expect(text).not.toContain("freshness");
  });
});
