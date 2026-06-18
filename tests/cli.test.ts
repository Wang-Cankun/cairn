/**
 * cli.test.ts — the v2 CLI seam. Spawns the real `bun run src/cli.ts` in a temp host dir and asserts
 * ONLY on exit code + stdout/stderr + the emitted OKF files on disk. Never reaches into internals.
 *
 * The CLI is the SOLE writer; store discovery walks up from cwd to find cairn/claims, so each test
 * sets cwd = its temp host root. Ids are scraped from stdout / `ls`, never hardcoded (clm-/est-/cfd-
 * are content hashes). Locked trust fields are read back out of the serialized claim file.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const HOSTS: string[] = [];
function host(tag: string): string {
  const h = mkdtempSync(join(tmpdir(), `cairn-${tag}-`));
  HOSTS.push(h);
  return h;
}
afterAll(() => {
  for (const h of HOSTS) {
    try {
      rmSync(h, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}
function run(cwd: string, args: string[], env: Record<string, string> = {}): Run {
  const p = Bun.spawnSync(["bun", "run", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

// ── store-introspection helpers (read the EMITTED files; never reach into src) ──

function claimIds(h: string): string[] {
  const dir = join(h, "cairn", "claims");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}
function readClaimFile(h: string, id: string): string {
  return readFileSync(join(h, "cairn", "claims", `${id}.md`), "utf8");
}
/** Extract a top-level scalar from the YAML frontmatter of a serialized claim file. */
function fmScalar(file: string, key: string): string | undefined {
  const fmBlock = file.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmBlock) return undefined;
  // Match the LAST top-level occurrence of `key:` (locked scalars are single-line).
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = fmBlock[1]!.match(re);
  if (!m) return undefined;
  return m[1]!.replace(/^["']|["']$/g, "").trim();
}
function latestSnapshotId(h: string): string | null {
  const log = join(h, "cairn", "log.md");
  if (!existsSync(log)) return null;
  const ids = readFileSync(log, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^- publish\s+([0-9a-f]+)\b/)?.[1])
    .filter(Boolean) as string[];
  return ids.length ? ids[ids.length - 1]! : null;
}
function snapshotHead(h: string, id: string): {
  snapshot: string;
  previous: string | null;
  claims: Array<Record<string, unknown>>;
} {
  return JSON.parse(readFileSync(join(h, "cairn", "snapshots", id, "head.json"), "utf8"));
}

// id-shape regexes
const CLM = /clm-[0-9a-f]+/;
const EST = /est-[0-9a-f]+/;
const CFD = /cfd-[0-9a-f]+/;

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — authoring & locked fields", () => {
  test("add-claim writes a well-formed OKF claim with CLI-stamped locked fields", () => {
    const h = host("author");
    writeFileSync(join(h, "scores.csv"), "a,b\n1,2\n", "utf8");
    const add = run(
      h,
      ["add-claim", "--text", "Scores correlate.", "--evidence", "file:scores.csv", "--provenance", "ai_proposed"],
      { CAIRN_ASSERTER: "agent-A" },
    );
    expect(add.code).toBe(0);
    expect(add.stdout).toMatch(CLM);
    expect(existsSync(join(h, "cairn", "claims"))).toBe(true);

    const id = claimIds(h)[0]!;
    expect(id).toMatch(/^clm-[0-9a-f]+$/);
    const file = readClaimFile(h, id);

    // The handle carries the agent-asserted fields verbatim...
    expect(file).toContain("type: claim");
    expect(file).toContain("text: Scores correlate.");
    expect(file).toContain("provenance: ai_proposed");
    expect(file).toContain("kind: file");
    expect(file).toContain("ref: scores.csv");

    // ...and the CLI-stamped/locked fields (an agent never self-stamps these).
    expect(fmScalar(file, "id")).toBe(id);
    expect(file).toContain("who: agent-A");
    expect(fmScalar(file, "corroboration")).toBe("self-asserted");
    expect(fmScalar(file, "lifecycle")).toBe("draft"); // draft until a passing publish
    expect(fmScalar(file, "resolution")).toBe("open");
    expect(fmScalar(file, "verification")).toBe("unverified");
    expect(fmScalar(file, "reach_ground")).toBe("true"); // it has an evidence ref
    // freshness was computed from the just-stamped fingerprint of a real local file ⇒ fresh
    expect(fmScalar(file, "freshness")).toBe("fresh");

    // A fingerprint was stamped from the evidence (content-hash tier, sha256 value).
    expect(file).toContain("tier: content-hash");
    expect(file).toMatch(/value: sha256:/);

    // log.md time spine recorded the authoring event.
    expect(readFileSync(join(h, "cairn", "log.md"), "utf8")).toContain(`- add-claim ${id}`);
  });

  test("a bare draft (no evidence) is created soft: ungrounded, freshness unknown", () => {
    const h = host("draftsoft");
    const add = run(h, ["add-claim", "--text", "Loose hunch.", "--provenance", "ai_proposed"]);
    expect(add.code).toBe(0);
    const id = claimIds(h)[0]!;
    const file = readClaimFile(h, id);
    expect(fmScalar(file, "reach_ground")).toBe("false");
    expect(fmScalar(file, "freshness")).toBe("unknown");
    expect(fmScalar(file, "lifecycle")).toBe("draft");

    const drafts = run(h, ["drafts"]);
    expect(drafts.stdout).toContain("UNGROUNDED");
    expect(drafts.stdout).toContain(id);
  });

  test("an agent-supplied freshness/verification/corroboration is OVERRIDDEN by the CLI (trust-field lock)", () => {
    const h = host("override");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    // The agent tries to self-stamp trust badges via flags; the CLI must discard them.
    const add = run(h, [
      "add-claim",
      "--text",
      "Self-stamped, supposedly.",
      "--evidence",
      "file:e.csv",
      "--provenance",
      "ai_proposed",
      "--freshness",
      "fresh",
      "--verification",
      "verified",
      "--corroboration",
      "cross-reviewed",
      "--reach_ground",
      "true",
    ]);
    expect(add.code).toBe(0);
    const id = claimIds(h)[0]!;
    const file = readClaimFile(h, id);
    // verification is locked to unverified (ai_proposed can never be verified)...
    expect(fmScalar(file, "verification")).toBe("unverified");
    // ...corroboration is derived (no reviewers) to self-asserted...
    expect(fmScalar(file, "corroboration")).toBe("self-asserted");
    // ...and validate confirms no trust-field-lock violation slipped through.
    const v = run(h, ["validate"]);
    expect(v.code).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — gates via validate", () => {
  test("validate fails (nonzero, names reach-ground + the claim) when a canonical claim cannot reach ground", () => {
    const h = host("noground");
    const claims = join(h, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    // Hand-write a canonical claim with NO evidence refs ⇒ cannot reach ground.
    writeFileSync(
      join(claims, "clm-deadbeef0001.md"),
      [
        "---",
        "type: claim",
        "text: rests on nothing",
        "evidence_lines: []",
        "depends_on_fork: []",
        "contradicts: []",
        "inherits_caveat: []",
        "provenance: ai_proposed",
        "id: clm-deadbeef0001",
        "asserter:",
        "  who: a",
        "  model: m",
        "  session: s",
        "  time: 2026-06-10T20:00:00-04:00",
        "reviewed_by: []",
        "corroboration: self-asserted",
        "fingerprints: []",
        "freshness: unknown",
        "reach_ground: false",
        "lifecycle: canonical",
        "resolution: open",
        "verification: unverified",
        "---",
        "body",
        "",
      ].join("\n"),
    );
    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("FAILED");
    expect(v.stderr).toContain("reach-ground");
    expect(v.stderr).toContain("clm-deadbeef0001");
  });

  test("verified is REFUSED for ai_proposed provenance, ACCEPTED for experimental", () => {
    const h = host("verif");
    const claims = join(h, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const mk = (id: string, provenance: string, verification: string) =>
      [
        "---",
        "type: claim",
        `text: claim ${id}`,
        "evidence_lines:",
        "  - name: evidence",
        "    refs:",
        "      - kind: file",
        "        ref: e.csv",
        "depends_on_fork: []",
        "contradicts: []",
        "inherits_caveat: []",
        `provenance: ${provenance}`,
        `id: ${id}`,
        "asserter:",
        "  who: a",
        "  model: m",
        "  session: s",
        "  time: 2026-06-10T20:00:00-04:00",
        "reviewed_by: []",
        "corroboration: self-asserted",
        "fingerprints: []",
        "freshness: unknown",
        "reach_ground: true",
        "lifecycle: canonical",
        "resolution: open",
        `verification: ${verification}`,
        "---",
        "body",
        "",
      ].join("\n");

    // experimental + verified: the verification territory permits it ⇒ validate passes.
    writeFileSync(join(claims, "clm-aaaa00000001.md"), mk("clm-aaaa00000001", "experimental", "verified"));
    const ok = run(h, ["validate"]);
    expect(ok.code).toBe(0);

    // Now add an ai_proposed + verified claim: agent-sourced can NEVER be verified ⇒ validate fails.
    writeFileSync(join(claims, "clm-bbbb00000002.md"), mk("clm-bbbb00000002", "ai_proposed", "verified"));
    const bad = run(h, ["validate"]);
    expect(bad.code).toBe(3);
    expect(bad.stderr).toContain("verification-lock");
    expect(bad.stderr).toContain("clm-bbbb00000002");
    // The experimental claim is NOT named as an offender.
    expect(bad.stderr).not.toContain("clm-aaaa00000001");
  });

  test("settled is REFUSED while a contradiction is unresolved (canonical-but-not-settled)", () => {
    const h = host("settled");
    const claims = join(h, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const mk = (id: string, contradicts: string, resolution: string) =>
      [
        "---",
        "type: claim",
        `text: claim ${id}`,
        "evidence_lines:",
        "  - name: evidence",
        "    refs:",
        "      - kind: file",
        "        ref: e.csv",
        "depends_on_fork: []",
        contradicts ? `contradicts:\n  - ${contradicts}` : "contradicts: []",
        "inherits_caveat: []",
        "provenance: ai_proposed",
        `id: ${id}`,
        "asserter:",
        "  who: a",
        "  model: m",
        "  session: s",
        "  time: 2026-06-10T20:00:00-04:00",
        "reviewed_by: []",
        "corroboration: self-asserted",
        "fingerprints: []",
        "freshness: unknown",
        "reach_ground: true",
        "lifecycle: canonical",
        `resolution: ${resolution}`,
        "verification: unverified",
        "---",
        "body",
        "",
      ].join("\n");

    const A = "clm-cccc00000001";
    const B = "clm-dddd00000002";
    // A claims settled while it still contradicts B which is live ⇒ resolution gate fires.
    writeFileSync(join(claims, `${A}.md`), mk(A, B, "settled"));
    writeFileSync(join(claims, `${B}.md`), mk(B, "", "open"));

    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toMatch(/resolution|trust-field-lock/);
    expect(v.stderr).toContain(A);

    // If A drops the unresolved-settled stance (resolution: open), validate passes — it may stay canonical.
    writeFileSync(join(claims, `${A}.md`), mk(A, B, "open"));
    const ok = run(h, ["validate"]);
    expect(ok.code).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — review / corroboration (Gate B)", () => {
  test("corroboration stays self-asserted until ≥2 DIFFERENT-asserter reviews, then cross-reviewed", () => {
    const h = host("corrob");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    run(h, ["add-claim", "--text", "Reviewed claim.", "--evidence", "file:e.csv", "--provenance", "ai_proposed"], {
      CAIRN_ASSERTER: "author-A",
    });
    const id = claimIds(h)[0]!;

    // A self-review by the author never raises corroboration.
    const self = run(h, ["review", id, "--by", "author-A"]);
    expect(self.code).toBe(0);
    expect(fmScalar(readClaimFile(h, id), "corroboration")).toBe("self-asserted");

    // One distinct reviewer: still self-asserted (needs ≥2 distinct ≠ author).
    run(h, ["review", id, "--by", "reviewer-B", "--note", "independent look"]);
    expect(fmScalar(readClaimFile(h, id), "corroboration")).toBe("self-asserted");

    // Second distinct reviewer ≠ author ⇒ cross-reviewed.
    const r2 = run(h, ["review", id, "--by", "reviewer-C"]);
    expect(r2.code).toBe(0);
    expect(r2.stdout).toContain("cross-reviewed");
    const file = readClaimFile(h, id);
    expect(fmScalar(file, "corroboration")).toBe("cross-reviewed");
    // The note is carried (not verified) in the review edge.
    expect(file).toContain("independent look");
    // Still canonical-axis untouched: corroboration is a SEPARATE axis, never a verification rung.
    expect(fmScalar(file, "verification")).toBe("unverified");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — freshness, cascade, dvc", () => {
  test("freshness goes fresh → stale on artifact mutation, unknown for an external ref", () => {
    const h = host("fresh");
    writeFileSync(join(h, "data.csv"), "a\n1\n", "utf8");
    run(h, ["add-claim", "--text", "From local file.", "--evidence", "file:data.csv", "--provenance", "ai_proposed"]);
    const localId = claimIds(h)[0]!;
    expect(fmScalar(readClaimFile(h, localId), "freshness")).toBe("fresh");

    // external: ref is unreachable-by-default ⇒ unknown freshness.
    run(h, ["add-claim", "--text", "Cites a paper.", "--evidence", "external:https://doi.org/10.x", "--provenance", "literature"]);
    const extId = claimIds(h).find((i) => i !== localId)!;
    expect(fmScalar(readClaimFile(h, extId), "freshness")).toBe("unknown");

    // Mutate the local artifact, then refresh: the stored baseline no longer matches ⇒ stale.
    writeFileSync(join(h, "data.csv"), "a\n2-changed\n", "utf8");
    const ref = run(h, ["refresh"]);
    expect(ref.code).toBe(0);
    expect(ref.stdout).toContain(localId);
    expect(ref.stdout).toContain("stale");
    expect(fmScalar(readClaimFile(h, localId), "freshness")).toBe("stale");
  });

  test("a dvc: evidence ref pins the .dvc md5 (dvc-md5 tier); mutating the pointer goes stale", () => {
    const h = host("dvc");
    // A DVC pointer file: YAML with outs[0].md5 = the artifact content hash.
    writeFileSync(join(h, "big.bin.dvc"), "outs:\n  - md5: abc123def456abc123def456abc12345\n    path: big.bin\n", "utf8");
    run(h, ["add-claim", "--text", "Grounded on a DVC artifact.", "--evidence", "dvc:big.bin.dvc", "--provenance", "ai_proposed"]);
    const id = claimIds(h)[0]!;
    const file = readClaimFile(h, id);
    // The fingerprint reads the .dvc md5 as the TOP tier.
    expect(file).toContain("tier: dvc-md5");
    expect(file).toContain("value: md5:abc123def456abc123def456abc12345");
    expect(fmScalar(file, "freshness")).toBe("fresh");

    // Change the recorded md5 in the pointer ⇒ the baseline diverges ⇒ stale.
    writeFileSync(join(h, "big.bin.dvc"), "outs:\n  - md5: ffffffffffffffffffffffffffffffff\n    path: big.bin\n", "utf8");
    run(h, ["refresh"]);
    expect(fmScalar(readClaimFile(h, id), "freshness")).toBe("stale");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — orient surface & publish bundle", () => {
  test("head emits index.md surfacing unresolved contradictions + staleness above the canonical list", () => {
    const h = host("orient");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    // Two canonical claims that contradict each other, on the same estimand, plus a stale claim.
    const est = run(h, ["add-estimand", "--def", "Effect of X on Y in cohort Z."]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "X raises Y.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const A = claimIds(h)[0]!;
    run(h, [
      "add-claim",
      "--text",
      "X lowers Y.",
      "--evidence",
      "file:e.csv",
      "--estimand",
      est,
      "--provenance",
      "ai_proposed",
      "--contradicts",
      A,
    ]);
    run(h, ["publish"]); // promote both to canonical

    const head = run(h, ["head"]);
    expect(head.code).toBe(0);
    expect(head.stdout).toContain("unresolved contradictions: 1");

    const index = readFileSync(join(h, "cairn", "index.md"), "utf8");
    const contraPos = index.indexOf("Unresolved contradictions");
    const canonPos = index.indexOf("Canonical claims");
    expect(contraPos).toBeGreaterThanOrEqual(0);
    expect(canonPos).toBeGreaterThanOrEqual(0);
    // Contradictions section appears BEFORE the canonical-positives section (never buried).
    expect(contraPos).toBeLessThan(canonPos);
    expect(index).toContain("contradicts");
  });

  test("publish freezes a canonical-only OKF bundle + appends a log.md diff entry; drafts never enter it", () => {
    const h = host("publish");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    run(h, ["add-claim", "--text", "Grounded canonical-to-be.", "--evidence", "file:e.csv", "--provenance", "ai_proposed"]);
    run(h, ["add-claim", "--text", "Ungrounded draft, stays draft.", "--provenance", "ai_proposed"]);

    const pub = run(h, ["publish"]);
    expect(pub.code).toBe(0);
    expect(pub.stdout).toContain("published snapshot");
    const snapId = latestSnapshotId(h)!;
    expect(snapId).toBeTruthy();

    const snapDir = join(h, "cairn", "snapshots", snapId);
    // Canonical-only OKF bundle: claims/ + estimands/ + confounds/ + index.md + head.json.
    expect(existsSync(join(snapDir, "claims"))).toBe(true);
    expect(existsSync(join(snapDir, "estimands"))).toBe(true);
    expect(existsSync(join(snapDir, "confounds"))).toBe(true);
    expect(existsSync(join(snapDir, "index.md"))).toBe(true);
    expect(existsSync(join(snapDir, "head.json"))).toBe(true);
    // No retired v1 React/site artifacts.
    expect(existsSync(join(snapDir, "assets"))).toBe(false);
    expect(existsSync(join(snapDir, "data"))).toBe(false);
    expect(existsSync(join(h, "cairn", "published", "latest"))).toBe(false);

    // Exactly one canonical claim is frozen (the ungrounded draft did NOT promote / enter the bundle).
    const frozen = readdirSync(join(snapDir, "claims")).filter((f) => f.endsWith(".md"));
    expect(frozen.length).toBe(1);
    const head = snapshotHead(h, snapId);
    expect(head.claims.length).toBe(1);
    expect(head.snapshot).toBe(snapId);

    // log.md time spine carries the publish diff entry.
    expect(readFileSync(join(h, "cairn", "log.md"), "utf8")).toMatch(new RegExp(`- publish ${snapId}\\b`));

    // status reflects 1 canonical, 1 draft, and the last snapshot.
    const status = run(h, ["status"]);
    expect(status.stdout).toMatch(/canonical:\s+1/);
    expect(status.stdout).toMatch(/drafts:\s+1/);
    expect(status.stdout).toContain(snapId);
  });

  test("publish is reproducible (same view → same id, reused); a freshness-only change yields a NEW id and leaves the old snapshot byte-identical", () => {
    const h = host("repro");
    writeFileSync(join(h, "e.csv"), "a\n1\n", "utf8");
    run(h, ["add-claim", "--text", "Repro.", "--evidence", "file:e.csv", "--provenance", "ai_proposed"]);
    const p1 = run(h, ["publish"]);
    const id1 = p1.stdout.match(/published snapshot ([0-9a-f]+)/)![1]!;
    const oldBytes = readFileSync(join(h, "cairn", "snapshots", id1, "head.json"));

    // No change → same id, reused branch.
    const p2 = run(h, ["publish"]);
    const id2 = p2.stdout.match(/published snapshot ([0-9a-f]+)/)![1]!;
    expect(id2).toBe(id1);
    expect(p2.stdout).toContain("reused");

    // Mutate the artifact → refresh → publish: freshness state changes the view ⇒ NEW id.
    writeFileSync(join(h, "e.csv"), "a\n2-changed\n", "utf8");
    run(h, ["refresh"]);
    const p3 = run(h, ["publish"]);
    const id3 = p3.stdout.match(/published snapshot ([0-9a-f]+)/)![1]!;
    expect(id3).not.toBe(id1);
    expect(p3.stdout).not.toContain("reused");
    // Old snapshot remains immutable (byte-identical head.json).
    expect(readFileSync(join(h, "cairn", "snapshots", id1, "head.json")).equals(oldBytes)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — estimand collapse refusal", () => {
  test("collapse across DIFFERING estimand ids is refused (siblings only within one estimand id)", () => {
    // The CLI never PERFORMS collapse; the refusal is observable as: two claims on DIFFERENT estimand
    // ids are not surfaced as a contradiction pair (a contradiction is only meaningful within one
    // estimand). We assert the structural separation: differing estimand ids ⇒ no surfaced collapse.
    const h = host("collapse");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const est1 = run(h, ["add-estimand", "--def", "Estimand ONE: effect of A."]).stdout.match(EST)![0];
    const est2 = run(h, ["add-estimand", "--def", "Estimand TWO: effect of B, different question."]).stdout.match(EST)![0];
    expect(est1).not.toBe(est2);

    run(h, ["add-claim", "--text", "A claim.", "--evidence", "file:e.csv", "--estimand", est1, "--provenance", "ai_proposed"]);
    const A = claimIds(h)[0]!;
    // B declares a different estimand AND a contradicts edge to A — a cross-estimand "contradiction".
    run(h, [
      "add-claim",
      "--text",
      "B claim, different estimand.",
      "--evidence",
      "file:e.csv",
      "--estimand",
      est2,
      "--provenance",
      "ai_proposed",
      "--contradicts",
      A,
    ]);
    const pub = run(h, ["publish"]);
    expect(pub.code).toBe(0);
    // Both reach canonical (collapse refusal blocks GROUPING, never authoring/promotion).
    const head = run(h, ["head"]);
    expect(head.stdout).toMatch(/canonical: 2/);
    // The two estimands stay distinct on disk (the substrate never merged them into one).
    const estDir = join(h, "cairn", "estimands");
    expect(readdirSync(estDir).filter((f) => f.endsWith(".md")).length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — KEYSTONE: NK CLOSED-NEGATIVE", () => {
  test("a positive + contradicting sibling on the SAME estimand: contested claim is BLOCKED from settled, stays canonical, surfaced on orient", () => {
    const h = host("keystone");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");

    // One shared estimand; both claims cite it (true siblings).
    const est = run(h, ["add-estimand", "--label", "primary", "--def", "Does treatment T raise outcome O in cohort C?"]).stdout.match(
      EST,
    )![0];

    // Positive claim.
    run(h, ["add-claim", "--text", "T raises O.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const POS = claimIds(h)[0]!;
    // Contradicting sibling on the SAME estimand.
    run(h, [
      "add-claim",
      "--text",
      "T does not raise O (closed negative).",
      "--evidence",
      "file:e.csv",
      "--estimand",
      est,
      "--provenance",
      "ai_proposed",
      "--contradicts",
      POS,
    ]);
    const NEG = claimIds(h).find((i) => i !== POS)!;

    // Publish: BOTH reach canonical (neither side dropped; the multiverse is persisted).
    const pub = run(h, ["publish"]);
    expect(pub.code).toBe(0);
    const posFile = readClaimFile(h, POS);
    const negFile = readClaimFile(h, NEG);
    expect(fmScalar(posFile, "lifecycle")).toBe("canonical");
    expect(fmScalar(negFile, "lifecycle")).toBe("canonical");

    // (1) The contested claim is BLOCKED from settled while the contradiction is live.
    const claims = join(h, "cairn", "claims");
    // Hand-flip the contested claim to resolution: settled (simulating an agent trying to close it),
    // then assert validate refuses it (gate c.3) — it cannot be settled while NEG is live.
    const tampered = negFile.replace(/^resolution: open$/m, "resolution: settled");
    writeFileSync(join(claims, `${NEG}.md`), tampered);
    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toMatch(/resolution|trust-field-lock/);
    expect(v.stderr).toContain(NEG);
    // restore
    writeFileSync(join(claims, `${NEG}.md`), negFile);

    // (2) The contradiction is SURFACED on the orient surface (index.md), not buried.
    const head = run(h, ["head"]);
    expect(head.stdout).toContain("unresolved contradictions: 1");
    const index = readFileSync(join(h, "cairn", "index.md"), "utf8");
    const contraPos = index.indexOf("Unresolved contradictions");
    const canonPos = index.indexOf("Canonical claims");
    expect(contraPos).toBeGreaterThanOrEqual(0);
    expect(contraPos).toBeLessThan(canonPos); // surfaced ABOVE the canonical positives
    expect(index).toContain(NEG);
    expect(index).toContain(POS);
    // The substrate has earned itself: contested-but-canonical, never silently closed.
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — misc contract", () => {
  test("no-store read verb exits 1 with the documented message", () => {
    const empty = host("nostore");
    const r = run(empty, ["head"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no Cairn store");
  });

  test("unknown verb exits 2", () => {
    const empty = host("badverb");
    const r = run(empty, ["frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown verb");
  });

  test("add-claim accepts dash-leading --text (and the --flag=value form)", () => {
    const h = host("dash");
    expect(run(h, ["add-claim", "--text", "-initial dip", "--provenance", "ai_proposed"]).code).toBe(0);
    expect(run(h, ["drafts"]).stdout).toContain("-initial dip");
    expect(run(h, ["add-claim", "--text=-second dip", "--provenance", "ai_proposed"]).code).toBe(0);
    expect(run(h, ["drafts"]).stdout).toContain("-second dip");
  });

  test("add-confound mints a cfd- node with unerasable=true by default and the caveat as body", () => {
    const h = host("confound");
    const r = run(h, ["add-confound", "--label", "depth-confound", "--caveat", "depth ≡ group ≡ library."]);
    expect(r.code).toBe(0);
    const cid = r.stdout.match(CFD)![0];
    const file = readFileSync(join(h, "cairn", "confounds", `${cid}.md`), "utf8");
    expect(file).toContain("type: confound");
    expect(file).toContain("unerasable: true");
    expect(file).toContain("depth ≡ group ≡ library.");
  });
});
