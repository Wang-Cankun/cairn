import { describe, expect, test } from "bun:test";
import { runGate } from "../src/gate.ts";
import { fileEvidence, fm } from "./helpers.ts";
import type { ClaimFile, ClaimFrontmatter } from "../src/types.ts";

function cf(frontmatter: ClaimFrontmatter): ClaimFile {
  return { frontmatter, body: "", path: `/tmp/${frontmatter.id}.md` };
}

/** Ids of claims named by any reach-ground violation. */
function reachOffenders(claims: ClaimFile[]): string[] {
  return runGate(claims)
    .violations.filter((v) => v.gate === "reach-ground")
    .map((v) => v.claim)
    .sort();
}

describe("reach-ground gate (iron rule) — v2: per-claim grounding edge", () => {
  test("two grounded drafts both pass and are both promotable candidates", () => {
    const a = cf(fm({ id: "claim-20260610-001", evidence_lines: [fileEvidence("a.csv")] }));
    const b = cf(fm({ id: "claim-20260610-002", evidence_lines: [fileEvidence("b.csv")] }));
    const r = runGate([a, b]);
    expect(r.ok).toBe(true);
    expect(reachOffenders([a, b])).toEqual([]);
    // both carry a grounding edge -> both are promotable drafts (candidateIds)
    expect(r.candidateIds.sort()).toEqual(["claim-20260610-001", "claim-20260610-002"]);
  });

  test("a zero-edge draft is NOT a candidate (softness lives before the gate) and never blocks", () => {
    const a = cf(fm({ id: "claim-20260610-001", evidence_lines: [fileEvidence("a.csv")] }));
    const bare = cf(fm({ id: "claim-20260610-002" })); // zero evidence refs
    const r = runGate([a, bare]);
    expect(r.ok).toBe(true);
    expect(r.candidateIds).toEqual(["claim-20260610-001"]); // bare stays a draft, not promoted
    expect(r.candidateIds).not.toContain("claim-20260610-002");
  });

  test("an ungrounded CANONICAL claim blocks (it is already a candidate and cannot reach ground)", () => {
    // A canonical claim that carries no evidence ref cannot reach ground -> reach-ground violation.
    const c = cf(fm({ id: "claim-20260610-003", lifecycle: "canonical" })); // no evidence
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(reachOffenders([c])).toContain("claim-20260610-003");
  });

  test("a grounded canonical claim passes", () => {
    const c = cf(fm({ id: "claim-20260610-004", lifecycle: "canonical", evidence_lines: [fileEvidence("c.csv")] }));
    const r = runGate([c]);
    expect(r.ok).toBe(true);
    expect(reachOffenders([c])).toEqual([]);
  });

  test("mixed set: ungrounded canonical blocks, grounded draft promotes", () => {
    const bad = cf(fm({ id: "claim-20260610-001", lifecycle: "canonical" })); // ungrounded canonical
    const good = cf(fm({ id: "claim-20260610-002", evidence_lines: [fileEvidence("g.csv")] })); // grounded draft
    const r = runGate([bad, good]);
    expect(r.ok).toBe(false);
    expect(reachOffenders([bad, good])).toEqual(["claim-20260610-001"]);
    // the grounded draft is still a promotion candidate
    expect(r.candidateIds).toEqual(["claim-20260610-002"]);
  });
});
