/**
 * Regression: remote evidence host wiring (CONTRACT §8) — v2.
 *
 * The bug: remoteMd5 derived the ssh host by splitting `ref` on ':' (assuming ref = host:path) and
 * config.remote_host was read NOWHERE, so a BARE remote path returned UNKNOWN unconditionally — the
 * remote-HPC grounding path was dead.
 *
 * v2 fix: remote_host (from cairn/config.json) is threaded through `fingerprintRef`. A `file:` ref
 * whose bytes are NOT in the local host root but a remote_host is configured re-fingerprints via
 * `ssh <remote_host> md5sum <ref>`. These tests pin the host-resolution branches deterministically
 * WITHOUT touching the network: against an unreachable host the honest result is `unknown` (never a
 * false fresh).
 */
import { describe, expect, test } from "bun:test";
import { fingerprintRef, remoteMd5 } from "../src/fingerprint.ts";
import { tempHost } from "./helpers.ts";
import type { EvidenceRef } from "../src/types.ts";

// A host name that cannot resolve/connect — ssh fails fast under BatchMode, so this is offline-safe.
const DEAD_HOST = "cairn-test-nonexistent-host.invalid";

describe("remote evidence host wiring (CONTRACT §8) — v2", () => {
  test("bare ref with NO host configured is honestly UNKNOWN (the reported bug's safe floor)", () => {
    // ref has no ':' and no remote_host -> nothing to ssh -> unknown (never a false fingerprint).
    expect(remoteMd5("/scratch/run42/calls.vcf.gz")).toEqual({ tier: "unknown", value: null });
  });

  test("bare ref WITH remote_host resolves the host (ssh attempted; dead host -> honest unknown)", () => {
    // The regression: previously this short-circuited to unknown WITHOUT using remote_host. Now the
    // host is used; against an unreachable host the honest result is still unknown (not a false fresh).
    expect(remoteMd5("/scratch/run42/calls.vcf.gz", DEAD_HOST)).toEqual({ tier: "unknown", value: null });
  });

  test("legacy host:path ref still works when no remote_host is configured (backward compat)", () => {
    expect(remoteMd5(`${DEAD_HOST}:/scratch/run42/calls.vcf.gz`)).toEqual({ tier: "unknown", value: null });
  });

  test("fingerprintRef(file, absent-local, {remoteHost}) routes to the remote ssh path -> honest unknown", () => {
    const { hostRoot } = tempHost();
    // No local file at this bare path; remote_host configured -> remote md5, not a doomed local sha256.
    const ref: EvidenceRef = { kind: "file", ref: "/scratch/run42/calls.vcf.gz" };
    const fpRemote = fingerprintRef(hostRoot, ref, "2026-06-10T20:00:00-04:00", DEAD_HOST);
    expect(fpRemote.ref).toBe("/scratch/run42/calls.vcf.gz"); // bare ref preserved
    // Unreachable at stamp time -> honest unknown fingerprint (a false `fresh` is the enemy).
    expect(fpRemote.tier).toBe("unknown");
    expect(fpRemote.value).toBeNull();
  });

  test("fingerprintRef(file, absent-local, NO remoteHost) stays local sha256 -> unknown (missing), not remote", () => {
    const { hostRoot } = tempHost();
    const ref: EvidenceRef = { kind: "file", ref: "/scratch/run42/matrix.h5" };
    const fpLocal = fingerprintRef(hostRoot, ref, "2026-06-10T20:00:00-04:00");
    // No remote host -> local path; file absent -> unknown (honest), never a false fresh.
    expect(fpLocal.tier).toBe("unknown");
    expect(fpLocal.value).toBeNull();
  });

  test("external: ref is always unknown by default (unreachable-by-default; never false fresh)", () => {
    const { hostRoot } = tempHost();
    const ref: EvidenceRef = { kind: "external", ref: "https://doi.org/10.x" };
    const fpExt = fingerprintRef(hostRoot, ref, "2026-06-10T20:00:00-04:00", DEAD_HOST);
    expect(fpExt.tier).toBe("unknown");
    expect(fpExt.value).toBeNull();
  });
});
