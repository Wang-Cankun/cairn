import { describe, expect, test } from "bun:test";
import { computeSnapshotId } from "../src/snapshot.ts";
import { fileEdge, fm } from "./helpers.ts";
import type { Freshness } from "../src/types.ts";

const AS_OF_A = "2026-06-10T20:30:00-04:00";
const AS_OF_B = "2026-06-11T09:00:00-04:00"; // different wall-clock; must NOT affect the id

function freshnessMap(entries: Record<string, { state: Freshness["state"]; tier: Freshness["tier"] }>, as_of: string): Map<string, Freshness> {
  const m = new Map<string, Freshness>();
  for (const [id, f] of Object.entries(entries)) m.set(id, { state: f.state, tier: f.tier, as_of });
  return m;
}

describe("computeSnapshotId (Option X: freshness is part of identity, timestamps are not)", () => {
  const claim = fm({
    id: "claim-20260610-001",
    status: "canonical",
    grounding: [fileEdge("a.csv", "sha256:abc")],
  });

  test("stable when nothing changes (idempotent no-op republish)", () => {
    const id1 = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_A));
    const id2 = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_A));
    expect(id1).toBe(id2);
  });

  test("stable across DIFFERENT timestamps (as_of excluded from the id)", () => {
    const id1 = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_A));
    const id2 = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_B));
    expect(id1).toBe(id2);
  });

  test("CHANGES when freshness state changes (fresh -> stale yields a NEW id)", () => {
    const fresh = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_A));
    const stale = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "stale", tier: "content" } }, AS_OF_A));
    expect(stale).not.toBe(fresh);
  });

  test("CHANGES when freshness tier changes", () => {
    const a = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_A));
    const b = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "pipeline" } }, AS_OF_A));
    expect(b).not.toBe(a);
  });

  test("16 hex chars", () => {
    const id = computeSnapshotId([claim], freshnessMap({ "claim-20260610-001": { state: "fresh", tier: "content" } }, AS_OF_A));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  test("throws if a canonical claim has no computed freshness", () => {
    expect(() => computeSnapshotId([claim], new Map())).toThrow(/missing freshness/);
  });
});
