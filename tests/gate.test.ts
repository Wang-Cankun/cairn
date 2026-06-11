import { describe, expect, test } from "bun:test";
import { runGate } from "../src/gate.ts";
import { fileEdge, fm } from "./helpers.ts";
import type { ClaimFile, ClaimFrontmatter } from "../src/types.ts";

function cf(frontmatter: ClaimFrontmatter): ClaimFile {
  return { frontmatter, body: "", path: `/tmp/${frontmatter.id}.md` };
}

describe("reach-ground gate (iron rule)", () => {
  test("a grounded chain passes (B depends_on grounded A)", () => {
    // A has a grounding edge -> promotable. B grounds via its OWN edge AND depends on A.
    const a = cf(fm({ id: "claim-20260610-001", grounding: [fileEdge("a.csv", "sha256:1")] }));
    const b = cf(fm({ id: "claim-20260610-002", grounding: [fileEdge("b.csv", "sha256:2")], depends_on: ["claim-20260610-001"] }));
    const r = runGate([a, b]);
    expect(r.ok).toBe(true);
    expect(r.offenders).toEqual([]);
    // both have a grounding edge -> both are promotable drafts (candidateIds)
    expect(r.candidateIds.sort()).toEqual(["claim-20260610-001", "claim-20260610-002"]);
  });

  test("a draft that grounds ONLY via a grounded dependency is not promoted (no own edge)", () => {
    // B has zero grounding edges -> not a promotable draft, even though it reaches ground via A.
    const a = cf(fm({ id: "claim-20260610-001", grounding: [fileEdge("a.csv", "sha256:1")] }));
    const b = cf(fm({ id: "claim-20260610-002", depends_on: ["claim-20260610-001"] }));
    const r = runGate([a, b]);
    expect(r.ok).toBe(true);
    expect(r.candidateIds).toEqual(["claim-20260610-001"]); // B stays a draft
  });

  test("an ungrounded candidate blocks (depends only on an ungrounded draft)", () => {
    // A is a zero-edge draft (not a candidate). B grounds (so candidate) but depends on A only
    // — still reaches ground via its own edge, so to truly block we make B depend ONLY on A and
    // have B itself ungrounded but with a dep -> not a candidate (zero grounding). Instead model:
    // C has a grounding edge AND depends on an ungrounded draft, which still passes. The real
    // block is a candidate that has NO direct edge and whose deps never reach ground.
    // Construct: B has zero grounding but we force it via a dep-only path that fails.
    // A: ungrounded draft (zero edges) -> not candidate, stays draft.
    // B: grounded draft depends_on A -> candidate, reaches ground via own edge -> passes.
    // To get a blocker we need a candidate without ground: that only happens for canonical claims
    // (already promoted) that lost grounding, or a candidate created by grounding then... Use a
    // canonical claim with no edges depending on an ungrounded draft:
    const a = cf(fm({ id: "claim-20260610-001" })); // ungrounded draft, not a candidate
    const c = cf(fm({ id: "claim-20260610-003", status: "canonical", depends_on: ["claim-20260610-001"] }));
    const r = runGate([a, c]);
    expect(r.ok).toBe(false);
    expect(r.offenders).toContain("claim-20260610-003");
  });

  test("a cycle never reaches ground and blocks", () => {
    // Two canonical claims depending on each other, neither grounded.
    const x = cf(fm({ id: "claim-20260610-001", status: "canonical", depends_on: ["claim-20260610-002"] }));
    const y = cf(fm({ id: "claim-20260610-002", status: "canonical", depends_on: ["claim-20260610-001"] }));
    const r = runGate([x, y]);
    expect(r.ok).toBe(false);
    expect(r.offenders.sort()).toEqual(["claim-20260610-001", "claim-20260610-002"]);
  });

  test("zero-edge draft is not a candidate and does not block", () => {
    const a = cf(fm({ id: "claim-20260610-001", grounding: [fileEdge("a.csv", "sha256:1")] }));
    const bare = cf(fm({ id: "claim-20260610-002" })); // zero edges
    const r = runGate([a, bare]);
    expect(r.ok).toBe(true);
    expect(r.candidateIds).toEqual(["claim-20260610-001"]);
    expect(r.candidateIds).not.toContain("claim-20260610-002");
  });
});
