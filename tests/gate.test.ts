import { describe, expect, test } from "bun:test";
import { runGate } from "../src/gate.ts";
import {
  BODY_HEADER_CONCLUSION,
  BODY_HEADER_CONTRADICTION,
  BODY_HEADER_DEFLATION,
  CUE_CONCLUSION,
  CUE_CONTRADICTION,
  CUE_DEFLATION,
  CUE_NONE_DECLARED,
  skeletonBody,
} from "../src/claimbody.ts";
import { fileEvidence, fm } from "./helpers.ts";
import type { ClaimFile, ClaimFrontmatter } from "../src/types.ts";

/**
 * A body that DELIVERS all three movements (every required section header present, no skeleton cue
 * left), so the body-movements gate (ADR-0007) is a no-op for tests that are about OTHER gates. Tests
 * that exercise the body gate itself pass an explicit body to `cf`, overriding this default.
 */
const CLEAN_BODY = [
  "## Conclusion, with its conditions",
  "",
  "The effect holds under the stated fork.",
  "",
  "## The contradiction and the caveat",
  "",
  "The sibling reverses the sign under the same estimand; this is why it matters.",
  "",
  "## What would change it",
  "",
  "A pre-registered replication would shrink the residual.",
].join("\n");

function cf(frontmatter: ClaimFrontmatter, body = CLEAN_BODY): ClaimFile {
  return { frontmatter, body, path: `/tmp/${frontmatter.id}.md` };
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

/** Ids+detail of every body-movements violation. */
function bodyOffenders(claims: ClaimFile[]): Array<{ claim: string; detail?: string }> {
  return runGate(claims)
    .violations.filter((v) => v.gate === "body-movements")
    .map((v) => ({ claim: v.claim, detail: v.detail }))
    .sort((a, b) => (a.claim + a.detail).localeCompare(b.claim + b.detail));
}

/** A filled body that clears all three movements (no skeleton cue remains). */
const FILLED_BODY = [
  "## Conclusion, with its conditions",
  "",
  "The effect holds, conditional on the cohort-Z fork.",
  "",
  "## The contradiction and the caveat",
  "",
  "The sibling reverses the sign under the same estimand; this is why it matters.",
  "",
  "## What would change it",
  "",
  "A pre-registered replication would shrink the residual.",
].join("\n");

describe("body-movements gate — the body's narrative movements must be present at canonical (ADR-0007)", () => {
  test("(a) a candidate with an UNFILLED conclusion cue is blocked (always-required movement)", () => {
    // A no-edge claim whose body still carries the conclusion cue (movement 1) — must fail.
    const f = fm({
      id: "clm-b0000001",
      lifecycle: "canonical",
      evidence_lines: [fileEvidence("e.csv")],
      estimand: "est-00000000aaaa",
    });
    const c = cf(f, skeletonBody(f)); // skeleton = unfilled cues; no edges ⇒ "<none declared>" branch
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    // conclusion + deflation cues fire; the contradiction cue does NOT (no edge ⇒ "<none declared>").
    expect(bodyOffenders([c])).toEqual([
      { claim: "clm-b0000001", detail: "conclusion" },
      { claim: "clm-b0000001", detail: "deflation" },
    ]);
  });

  test("(b) a no-edge claim with '<none declared>' + filled conclusion/deflation PASSES (legitimately complete)", () => {
    // Movement 2 is not required without an edge: "<none declared>" is a complete state. Fill the other two.
    const body = [
      "## Conclusion, with its conditions",
      "",
      "The effect holds under the stated fork.",
      "",
      "## The contradiction and the caveat",
      "",
      CUE_NONE_DECLARED, // legitimately complete — NOT a cue the gate matches
      "",
      "## What would change it",
      "",
      "A replication would shrink the residual.",
    ].join("\n");
    const c = cf(
      fm({
        id: "clm-b0000002",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
      }),
      body,
    );
    const r = runGate([c]);
    expect(r.ok).toBe(true);
    expect(bodyOffenders([c])).toEqual([]);
  });

  test("(c) a claim WITH a contradicts edge but an UNFILLED contradiction movement is blocked", () => {
    // The contradiction movement is required because the claim declares a contradicts edge.
    const f = fm({
      id: "clm-b0000003",
      lifecycle: "canonical",
      evidence_lines: [fileEvidence("e.csv")],
      estimand: "est-00000000aaaa",
      contradicts: ["clm-other000001"],
    });
    // Fill conclusion + deflation, but leave the contradiction cue (skeletonBody emits it when an edge exists).
    const body = [
      "## Conclusion, with its conditions",
      "",
      "The effect holds.",
      "",
      "## The contradiction and the caveat",
      "",
      CUE_CONTRADICTION, // still unfilled
      "",
      "## What would change it",
      "",
      "A replication would shrink the residual.",
    ].join("\n");
    const c = cf(f, body);
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(bodyOffenders([c])).toEqual([{ claim: "clm-b0000003", detail: "contradiction" }]);
  });

  test("(c') the same applies to an inherits_caveat edge (movement 2 required, count never read)", () => {
    const f = fm({
      id: "clm-b0000004",
      lifecycle: "canonical",
      evidence_lines: [fileEvidence("e.csv")],
      estimand: "est-00000000aaaa",
      inherits_caveat: ["cfd-000000000001"],
    });
    const c = cf(f, skeletonBody(f)); // edge ⇒ skeleton carries the contradiction cue (and the other two)
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(bodyOffenders([c])).toEqual([
      { claim: "clm-b0000004", detail: "conclusion" },
      { claim: "clm-b0000004", detail: "contradiction" },
      { claim: "clm-b0000004", detail: "deflation" },
    ]);
  });

  test("(d) a FULLY-FILLED body PASSES regardless of edges", () => {
    const c = cf(
      fm({
        id: "clm-b0000005",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
        contradicts: ["clm-other000001"],
      }),
      FILLED_BODY,
    );
    const r = runGate([c]);
    expect(r.ok).toBe(true);
    expect(bodyOffenders([c])).toEqual([]);
  });

  test("(e) a DRAFT with the unfilled skeleton is EXEMPT — but only when it is NOT a candidate (zero-edge)", () => {
    // A zero-edge draft is not a candidate; the body-movements gate never runs over it.
    const f = fm({ id: "clm-b0000006" }); // draft, ungrounded ⇒ not a candidate
    const c = cf(f, skeletonBody(f));
    const r = runGate([c]);
    expect(r.ok).toBe(true);
    expect(bodyOffenders([c])).toEqual([]);
  });

  test("(e') a GROUNDED draft is a candidate — its unfilled body IS gated (drafts are not unconditionally exempt)", () => {
    // ADR-0007: the exemption is for non-candidate drafts. A grounded draft is a promotion candidate, so
    // the gate binds at the draft→canonical boundary exactly as reach-ground/estimand do.
    const f = fm({
      id: "clm-b0000007",
      evidence_lines: [fileEvidence("e.csv")],
      estimand: "est-00000000aaaa",
    });
    const c = cf(f, skeletonBody(f)); // no edges ⇒ conclusion + deflation cues only
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(bodyOffenders([c])).toEqual([
      { claim: "clm-b0000007", detail: "conclusion" },
      { claim: "clm-b0000007", detail: "deflation" },
    ]);
  });

  test("the conclusion cue alone fails even when contradiction (no edge) and deflation are fine", () => {
    const body = [
      "## Conclusion, with its conditions",
      "",
      CUE_CONCLUSION, // only this is unfilled
      "",
      "## The contradiction and the caveat",
      "",
      CUE_NONE_DECLARED,
      "",
      "## What would change it",
      "",
      "A replication would shrink the residual.",
    ].join("\n");
    const c = cf(
      fm({
        id: "clm-b0000008",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
      }),
      body,
    );
    expect(bodyOffenders([c])).toEqual([{ claim: "clm-b0000008", detail: "conclusion" }]);
  });

  test("the deflation cue is gone once a real deflation_route is supplied (skeletonBody echoes it verbatim)", () => {
    const f = fm({
      id: "clm-b0000009",
      lifecycle: "canonical",
      evidence_lines: [fileEvidence("e.csv")],
      estimand: "est-00000000aaaa",
      deflation_route: "Run an RCT on an independent cohort.",
    });
    // skeletonBody echoes deflation_route verbatim, so only conclusion remains unfilled here.
    const c = cf(f, skeletonBody(f));
    expect(c.body).not.toContain(CUE_DEFLATION);
    expect(c.body).toContain("Run an RCT on an independent cohort.");
    expect(bodyOffenders([c])).toEqual([{ claim: "clm-b0000009", detail: "conclusion" }]);
  });

  // ── Empty-body escape (ADR-0007 §Consequences: the body can no longer be empty at canonical) ──────
  // A body with no cues AND no headers (deleted skeleton / empty / handle pasted in) must NOT slip past.
  // Cue-absence alone would pass it — the section-header requirement is what refuses it.

  test("(f) an EMPTY body is REFUSED — both always-required movements fire (no cue, but no header either)", () => {
    const c = cf(
      fm({
        id: "clm-b0000010",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
      }),
      "", // empty body: carries no cue, but delivers no movement either
    );
    const r = runGate([c]);
    expect(r.ok).toBe(false);
    expect(bodyOffenders([c])).toEqual([
      { claim: "clm-b0000010", detail: "conclusion" },
      { claim: "clm-b0000010", detail: "deflation" },
    ]);
  });

  test("(f') a WHITESPACE-only body is REFUSED (same escape, no headers present)", () => {
    const c = cf(
      fm({
        id: "clm-b0000011",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
      }),
      "   \n\n   \t\n",
    );
    expect(runGate([c]).ok).toBe(false);
    expect(bodyOffenders([c])).toEqual([
      { claim: "clm-b0000011", detail: "conclusion" },
      { claim: "clm-b0000011", detail: "deflation" },
    ]);
  });

  test("(f'') a body that just RESTATES the handle (no headers) is REFUSED — header presence is required", () => {
    const c = cf(
      fm({
        id: "clm-b0000012",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
        text: "T raises O.",
      }),
      "T raises O.", // handle pasted as the entire body: no section headers ⇒ no movement delivered
    );
    expect(runGate([c]).ok).toBe(false);
    expect(bodyOffenders([c])).toEqual([
      { claim: "clm-b0000012", detail: "conclusion" },
      { claim: "clm-b0000012", detail: "deflation" },
    ]);
  });

  test("(f''') deleting ONLY the conclusion header (prose present elsewhere) fails just that movement", () => {
    // Header present is load-bearing per movement: drop the conclusion section, keep deflation intact.
    const body = [
      // BODY_HEADER_CONCLUSION intentionally omitted
      "The effect holds under the stated fork.",
      "",
      BODY_HEADER_DEFLATION,
      "",
      "A replication would shrink the residual.",
    ].join("\n");
    const c = cf(
      fm({
        id: "clm-b0000013",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
      }),
      body,
    );
    expect(bodyOffenders([c])).toEqual([{ claim: "clm-b0000013", detail: "conclusion" }]);
  });

  test("(f'''') a contradiction-edge claim missing its contradiction header is refused for that movement", () => {
    // Conclusion + deflation delivered; the required contradiction section header is absent.
    const body = [
      BODY_HEADER_CONCLUSION,
      "",
      "The effect holds.",
      "",
      // BODY_HEADER_CONTRADICTION intentionally omitted though an edge is declared
      BODY_HEADER_DEFLATION,
      "",
      "A replication would shrink the residual.",
    ].join("\n");
    const c = cf(
      fm({
        id: "clm-b0000014",
        lifecycle: "canonical",
        evidence_lines: [fileEvidence("e.csv")],
        estimand: "est-00000000aaaa",
        contradicts: ["clm-other000001"],
      }),
      body,
    );
    expect(bodyOffenders([c])).toEqual([{ claim: "clm-b0000014", detail: "contradiction" }]);
  });
});
