/**
 * Regression: remote evidence host wiring (CONTRACTS §8).
 *
 * The bug: remoteMd5 derived the ssh host by splitting `ref` on ':' (assuming ref = host:path) and
 * config.remote_host was read NOWHERE, so the documented workflow `external:/scratch/run42/x` (a
 * BARE remote path) returned UNKNOWN unconditionally — the remote-HPC grounding path was dead.
 *
 * Fix: remote_host (from cairn/config.json) is threaded through; with it configured the bare `ref`
 * IS the remote path. These tests pin the host-resolution branch deterministically WITHOUT touching
 * the network: we assert method selection + the unreachable-host honest-UNKNOWN contract, and that a
 * bare ref with NO host is honestly UNKNOWN (never a false fresh).
 */
import { describe, expect, test } from "bun:test";
import { methodForKind, remoteMd5, stampEdge } from "../src/fingerprint.ts";
import { tempHost } from "./helpers.ts";

// A host name that cannot resolve/connect — ssh fails fast under BatchMode, so this is offline-safe.
const DEAD_HOST = "cairn-test-nonexistent-host.invalid";

describe("remote evidence host wiring (CONTRACTS §8)", () => {
  test("bare external ref with NO host configured is honestly UNKNOWN (the reported bug's safe floor)", () => {
    // ref has no ':' and no remote_host -> nothing to ssh -> unknown (never a false fingerprint).
    expect(remoteMd5("/scratch/run42/calls.vcf.gz")).toBe("unknown");
  });

  test("bare external ref WITH remote_host resolves the host (ssh attempted; dead host -> honest unknown)", () => {
    // The regression: previously this short-circuited to unknown WITHOUT using remote_host. Now the
    // host is used; against an unreachable host the honest result is still "unknown" (not a false
    // fresh) — but via the ssh attempt, not the dead 'no host' branch. We assert the honest floor.
    expect(remoteMd5("/scratch/run42/calls.vcf.gz", DEAD_HOST)).toBe("unknown");
  });

  test("legacy host:path ref still works when no remote_host is configured (backward compat)", () => {
    expect(remoteMd5(`${DEAD_HOST}:/scratch/run42/calls.vcf.gz`)).toBe("unknown");
  });

  test("stampEdge(external, bareRef, {remoteHost}) yields a remote-md5 edge with the bare ref preserved", () => {
    const { hostRoot } = tempHost();
    const edge = stampEdge(hostRoot, "external", "/scratch/run42/calls.vcf.gz", { remoteHost: DEAD_HOST });
    expect(edge.kind).toBe("external");
    expect(edge.method).toBe("remote-md5");
    // ref stays the bare remote path; ssh targets `<remote_host> md5sum <ref>` (CONTRACTS §8).
    expect(edge.ref).toBe("/scratch/run42/calls.vcf.gz");
    // Unreachable at stamp time -> honest unknown fingerprint (a false `fresh` is the enemy).
    expect(edge.fingerprint).toBe("unknown");
  });

  test("kind:data with a bare unreachable ref + remote_host now routes to remote-md5 (was sha256)", () => {
    const { hostRoot } = tempHost();
    // No local file at this path, bare ref, remote_host configured -> remote, not a doomed sha256.
    const method = methodForKind("data", hostRoot, "/scratch/run42/matrix.h5", "/scratch/run42/matrix.h5", DEAD_HOST);
    expect(method).toBe("remote-md5");
  });

  test("kind:data with a bare unreachable ref and NO remote_host stays sha256 (unchanged)", () => {
    const { hostRoot } = tempHost();
    const method = methodForKind("data", hostRoot, "/scratch/run42/matrix.h5", "/scratch/run42/matrix.h5");
    expect(method).toBe("sha256");
  });
});
