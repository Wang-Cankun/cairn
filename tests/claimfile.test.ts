import { describe, expect, test } from "bun:test";
import { parseClaimFile, serializeClaimFile, validateClaimFrontmatter, ClaimFileError } from "../src/claimfile.ts";
import { fileEvidence, fm } from "./helpers.ts";

describe("claimfile roundtrip (v2 OKF claim)", () => {
  test("serialize then parse yields the same frontmatter", () => {
    const original = fm({
      id: "clm-abc123def456",
      text: "Step 07 scores correlate with the outcome.",
      estimand: "est-0011223344aa",
      lifecycle: "canonical",
      evidence_lines: [fileEvidence("outputs/step07_scores.csv")],
      fingerprints: [
        { ref: "outputs/step07_scores.csv", tier: "content-hash", value: "sha256:abc123", taken_at: "2026-06-10T20:00:00-04:00" },
      ],
      freshness: "fresh",
    });
    const text = serializeClaimFile(original, "Some freeform note.\n");
    const parsed = parseClaimFile(text, "/tmp/clm-abc123def456.md");
    expect(parsed.frontmatter).toEqual(original);
    expect(parsed.body.trim()).toBe("Some freeform note.");
  });

  test("frontmatter key order is stable / deterministic (declaration order)", () => {
    const mk = () =>
      serializeClaimFile(fm({ id: "clm-002a002a002a", evidence_lines: [fileEvidence("a.csv")] }));
    const a = mk();
    const b = mk();
    expect(a).toBe(b);
    // type discriminator first, then the agent-asserted text, then locked fields later.
    expect(a.indexOf("type:")).toBeLessThan(a.indexOf("text:"));
    expect(a.indexOf("text:")).toBeLessThan(a.indexOf("id:"));
    // lifecycle / resolution / verification are the trailing locked axes, after id/asserter.
    expect(a.indexOf("id:")).toBeLessThan(a.indexOf("lifecycle:"));
    expect(a.indexOf("lifecycle:")).toBeLessThan(a.indexOf("resolution:"));
    expect(a.indexOf("resolution:")).toBeLessThan(a.indexOf("verification:"));
  });

  test("rejects a bad id shape", () => {
    expect(() => validateClaimFrontmatter({ ...fm({ id: "clm-abc123def456" }), id: "nope" })).toThrow(ClaimFileError);
  });

  test("rejects an invalid evidence kind", () => {
    const raw = {
      ...fm({ id: "clm-abc123def456" }),
      evidence_lines: [{ name: "bad", refs: [{ kind: "bogus", ref: "a" }] }],
    };
    expect(() => validateClaimFrontmatter(raw)).toThrow(ClaimFileError);
  });

  test("rejects an invalid provenance enum", () => {
    const raw = { ...fm({ id: "clm-abc123def456" }), provenance: "made-up" };
    expect(() => validateClaimFrontmatter(raw)).toThrow(ClaimFileError);
  });

  test("missing frontmatter block throws", () => {
    expect(() => parseClaimFile("no frontmatter here", "/tmp/x.md")).toThrow(ClaimFileError);
  });

  test("freshness IS a locked, serialized field in v2 (CLI stamps it on write)", () => {
    const text = serializeClaimFile(
      fm({ id: "clm-003b003b003b", evidence_lines: [fileEvidence("a.csv")], freshness: "fresh" }),
    );
    expect(text).toContain("freshness: fresh");
  });
});
