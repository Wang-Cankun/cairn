import { describe, expect, test } from "bun:test";
import { computeSnapshotId } from "../src/snapshot.ts";
import { fileEvidence, fm } from "./helpers.ts";
import type { FreshnessState } from "../src/types.ts";

function freshnessMap(entries: Record<string, FreshnessState>): Map<string, FreshnessState> {
  return new Map(Object.entries(entries));
}

describe("computeSnapshotId (Option X: freshness STATE is part of identity, timestamps are not)", () => {
  const claim = fm({
    id: "clm-aaaa0000bbbb",
    lifecycle: "canonical",
    evidence_lines: [fileEvidence("a.csv")],
    fingerprints: [
      { ref: "a.csv", tier: "content-hash", value: "sha256:abc", taken_at: "2026-06-10T20:30:00-04:00" },
    ],
  });

  test("stable when nothing changes (idempotent no-op republish)", () => {
    const id1 = computeSnapshotId([claim], freshnessMap({ "clm-aaaa0000bbbb": "fresh" }));
    const id2 = computeSnapshotId([claim], freshnessMap({ "clm-aaaa0000bbbb": "fresh" }));
    expect(id1).toBe(id2);
  });

  test("CHANGES when freshness state changes (fresh -> stale yields a NEW id)", () => {
    const fresh = computeSnapshotId([claim], freshnessMap({ "clm-aaaa0000bbbb": "fresh" }));
    const stale = computeSnapshotId([claim], freshnessMap({ "clm-aaaa0000bbbb": "stale" }));
    expect(stale).not.toBe(fresh);
  });

  test("CHANGES when a locked axis changes (e.g. resolution open -> settled)", () => {
    const open = computeSnapshotId([claim], freshnessMap({ "clm-aaaa0000bbbb": "fresh" }));
    const settled = computeSnapshotId(
      [{ ...claim, resolution: "settled" }],
      freshnessMap({ "clm-aaaa0000bbbb": "fresh" }),
    );
    expect(settled).not.toBe(open);
  });

  test("16 hex chars", () => {
    const id = computeSnapshotId([claim], freshnessMap({ "clm-aaaa0000bbbb": "fresh" }));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  test("throws if a canonical claim has no computed freshness", () => {
    expect(() => computeSnapshotId([claim], new Map())).toThrow(/missing freshness/);
  });
});
