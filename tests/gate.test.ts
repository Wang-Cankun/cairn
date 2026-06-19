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

/** Ids of claims named by any verification-lock violation. */
function verifOffenders(claims: ClaimFile[]): string[] {
  return runGate(claims)
    .violations.filter((v) => v.gate === "verification-lock")
    .map((v) => v.claim)
    .sort();
}

/** A fully-valid canonical claim (grounded + estimand) except for the fields under test. */
function canonical(over: Partial<ClaimFrontmatter> & { id: string }): ClaimFile {
  return cf(
    fm({
      lifecycle: "canonical",
      evidence_lines: [fileEvidence("e.csv")],
      estimand: "est-00000000aaaa",
      ...over,
    }),
  );
}

describe("verification territory-lock (Gate A) — only territory reaches verified/contradicted", () => {
  test("a non-territory provenance cannot be `contradicted` (territory-only, symmetric with verified)", () => {
    // ai_proposed is not territory: an agent cannot self-stamp that the territory contradicted a claim.
    const c = canonical({ id: "clm-c0000001", provenance: "ai_proposed", verification: "contradicted" });
    expect(verifOffenders([c])).toEqual(["clm-c0000001"]);
  });

  test("an experimental (territory) provenance MAY be `contradicted`", () => {
    const c = canonical({ id: "clm-c0000002", provenance: "experimental", verification: "contradicted" });
    expect(verifOffenders([c])).toEqual([]);
  });

  test("the lock set is exactly {verified, contradicted}: an agent-sourced `unverifiable` is NOT locked", () => {
    // unverified/unverifiable assert the territory has NOT (or cannot) speak — agent-settable, not locked.
    const a = canonical({ id: "clm-c0000003", provenance: "ai_proposed", verification: "unverifiable" });
    const b = canonical({ id: "clm-c0000004", provenance: "ai_proposed", verification: "unverified" });
    expect(verifOffenders([a, b])).toEqual([]);
  });
});

/** Ids of claims named by any estimand-required violation. */
function estimandOffenders(claims: ClaimFile[]): string[] {
  return runGate(claims)
    .violations.filter((v) => v.gate === "estimand-required")
    .map((v) => v.claim)
    .sort();
}

describe("estimand-required gate — a canonical candidate must declare an estimand (ADR-0005)", () => {
  test("a grounded draft with NO estimand is blocked from promotion (estimand-required violation)", () => {
    const c = cf(fm({ id: "clm-e0000001", evidence_lines: [fileEvidence("a.csv")] })); // grounded, no estimand
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(estimandOffenders([c])).toEqual(["clm-e0000001"]);
  });

  test("a grounded draft WITH an estimand clears the gate", () => {
    const c = cf(fm({ id: "clm-e0000002", evidence_lines: [fileEvidence("a.csv")], estimand: "est-00000000aaaa" }));
    expect(runGate([c]).ok).toBe(true);
    expect(estimandOffenders([c])).toEqual([]);
  });

  test("a zero-edge draft with no estimand is EXEMPT (not a candidate; soft authoring lives before the gate)", () => {
    const bare = cf(fm({ id: "clm-e0000003" })); // no evidence, no estimand
    expect(runGate([bare]).ok).toBe(true);
    expect(estimandOffenders([bare])).toEqual([]);
  });

  test("an ALREADY-canonical claim missing an estimand is also flagged (the gate runs over every candidate, not just drafts)", () => {
    const c = cf(fm({ id: "clm-e0000004", lifecycle: "canonical", evidence_lines: [fileEvidence("a.csv")] })); // canonical, grounded, NO estimand
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(estimandOffenders([c])).toEqual(["clm-e0000004"]);
  });
});

describe("reach-ground gate (iron rule) — v2: per-claim grounding edge", () => {
  test("two grounded drafts both pass and are both promotable candidates", () => {
    const a = cf(fm({ id: "claim-20260610-001", evidence_lines: [fileEvidence("a.csv")], estimand: "est-00000000aaaa" }));
    const b = cf(fm({ id: "claim-20260610-002", evidence_lines: [fileEvidence("b.csv")], estimand: "est-00000000aaaa" }));
    const r = runGate([a, b]);
    expect(r.ok).toBe(true);
    expect(reachOffenders([a, b])).toEqual([]);
    // both carry a grounding edge -> both are promotable drafts (candidateIds)
    expect(r.candidateIds.sort()).toEqual(["claim-20260610-001", "claim-20260610-002"]);
  });

  test("a zero-edge draft is NOT a candidate (softness lives before the gate) and never blocks", () => {
    const a = cf(fm({ id: "claim-20260610-001", evidence_lines: [fileEvidence("a.csv")], estimand: "est-00000000aaaa" }));
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
    const c = cf(fm({ id: "claim-20260610-004", lifecycle: "canonical", evidence_lines: [fileEvidence("c.csv")], estimand: "est-00000000aaaa" }));
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
