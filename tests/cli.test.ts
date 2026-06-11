import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublishedHead } from "../src/types.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

function run(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const p = Bun.spawnSync(["bun", "run", CLI, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe("CLI smoke test (temp host fixture)", () => {
  test("add-claim -> ground -> validate -> publish end to end", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-cli-"));
    // Evidence artifact lives at host root (host-root-relative paths).
    writeFileSync(join(host, "scores.csv"), "a,b\n1,2\n", "utf8");

    // 1. add a draft claim WITH a grounding edge (stamped now)
    const add = run(host, ["add-claim", "--text", "Scores correlate.", "--evidence", "file:scores.csv"]);
    expect(add.code).toBe(0);
    expect(existsSync(join(host, "cairn", "claims"))).toBe(true);

    // 2. add a second, ungrounded draft, then ground it
    const add2 = run(host, ["add-claim", "--text", "Secondary finding."]);
    expect(add2.code).toBe(0);
    writeFileSync(join(host, "more.csv"), "x\n1\n", "utf8");

    const drafts = run(host, ["drafts"]);
    expect(drafts.code).toBe(0);
    const secondId = (drafts.stdout.match(/claim-\d{8}-002/) ?? [])[0];
    expect(secondId).toBeTruthy();
    const ground = run(host, ["ground", secondId!, "--evidence", "file:more.csv"]);
    expect(ground.code).toBe(0);

    // 3. validate passes (both grounded)
    const validate = run(host, ["validate"]);
    expect(validate.code).toBe(0);
    expect(validate.stdout).toContain("OK");

    // 4. head prints canonical + drafts and writes head.json
    const head = run(host, ["head"]);
    expect(head.code).toBe(0);
    expect(head.stdout).toContain("canonical");
    expect(head.stdout).toContain("drafts");

    // 5. publish promotes both drafts and writes the snapshot + share link
    const pub = run(host, ["publish"]);
    expect(pub.code).toBe(0);
    expect(pub.stdout).toContain("published snapshot");

    const headPath = join(host, "cairn", "head.json");
    expect(existsSync(headPath)).toBe(true);
    const published = JSON.parse(readFileSync(headPath, "utf8")) as PublishedHead;
    expect(published.schema).toBe("cairn.head/1");
    expect(published.claims.length).toBe(2); // both promoted to canonical
    // canonical only: no draft/status leakage, no body
    for (const c of published.claims) {
      expect(c).not.toHaveProperty("status");
      expect(c).not.toHaveProperty("body");
      expect(c.freshness.as_of).toBe(published.published_at); // frozen-at-publish
    }
    // snapshot dir + share link exist; head.json mirrored
    const snapDir = join(host, "cairn", "snapshots", published.snapshot.current);
    expect(existsSync(join(snapDir, "data", "head.json"))).toBe(true);
    expect(existsSync(join(snapDir, "data", "diff.json"))).toBe(true);
    expect(existsSync(join(host, "cairn", "published", "latest", "data", "head.json"))).toBe(true);

    // status reflects promotion
    const status = run(host, ["status"]);
    expect(status.stdout).toContain("canonical:    2");
    expect(status.stdout).toContain(`last snapshot: ${published.snapshot.current}`);
  });

  test("status reports the real last snapshot even after head/refresh clobber cairn/head.json", () => {
    // Regression: head/refresh rewrite cairn/head.json with snapshot.current="". status must read
    // lineage from published/latest/ (the durable source publish trusts), not cairn/head.json,
    // else it reports "last snapshot: (none)" right after a real publish.
    const host = mkdtempSync(join(tmpdir(), "cairn-status-"));
    writeFileSync(join(host, "scores.csv"), "a\n1\n", "utf8");
    run(host, ["add-claim", "--text", "A claim.", "--evidence", "file:scores.csv"]);
    const pub = run(host, ["publish"]);
    const snapId = (pub.stdout.match(/published snapshot (\w+)/) ?? [])[1];
    expect(snapId).toBeTruthy();

    // Normal agent loop: orient via `head` (and `refresh`), which clobber cairn/head.json.
    expect(run(host, ["head"]).code).toBe(0);
    expect(run(host, ["refresh"]).code).toBe(0);
    // cairn/head.json now carries no snapshot id...
    const headJson = JSON.parse(readFileSync(join(host, "cairn", "head.json"), "utf8"));
    expect(headJson.snapshot.current).toBe("");
    // ...yet status still reports the real snapshot from published/latest/.
    const status = run(host, ["status"]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain(`last snapshot: ${snapId}`);
  });

  test("publish is reproducible: same head -> same snapshot id (excludes timestamps)", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-repro-"));
    writeFileSync(join(host, "scores.csv"), "a\n1\n", "utf8");
    run(host, ["add-claim", "--text", "Repro claim.", "--evidence", "file:scores.csv"]);
    const p1 = run(host, ["publish"]);
    const id1 = (p1.stdout.match(/published snapshot (\w+)/) ?? [])[1];
    // republish without changing the head: id is stable, snapshot reused
    const p2 = run(host, ["publish"]);
    const id2 = (p2.stdout.match(/published snapshot (\w+)/) ?? [])[1];
    expect(id1).toBe(id2);
    expect(p2.stdout).toContain("reused");
  });

  test("freshness-only change (artifact mutated -> refresh -> publish) yields a NEW snapshot id; old snapshot stays byte-identical", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-freshid-"));
    writeFileSync(join(host, "scores.csv"), "a\n1\n", "utf8");
    run(host, ["add-claim", "--text", "A claim.", "--evidence", "file:scores.csv"]);

    const p1 = run(host, ["publish"]);
    const id1 = (p1.stdout.match(/published snapshot (\w+)/) ?? [])[1];
    expect(id1).toBeTruthy();
    const snap1Head = join(host, "cairn", "snapshots", id1!, "data", "head.json");
    const oldBytes = readFileSync(snap1Head);

    // Mutate the grounded artifact so the claim is now genuinely stale, then refresh + publish.
    writeFileSync(join(host, "scores.csv"), "a\n2-changed\n", "utf8");
    run(host, ["refresh"]);
    const p2 = run(host, ["publish"]);
    const id2 = (p2.stdout.match(/published snapshot (\w+)/) ?? [])[1];
    expect(id2).toBeTruthy();

    // NEW id (freshness changed the published view), NOT the reused branch.
    expect(id2).not.toBe(id1);
    expect(p2.stdout).not.toContain("reused");

    // published/latest now shows the claim as stale.
    const latest = JSON.parse(
      readFileSync(join(host, "cairn", "published", "latest", "data", "head.json"), "utf8"),
    ) as PublishedHead;
    expect(latest.snapshot.current).toBe(id2!);
    expect(latest.claims[0]!.freshness.state).toBe("stale");

    // Old snapshot dir is byte-identical (immutability preserved).
    expect(readFileSync(snap1Head).equals(oldBytes)).toBe(true);
  });

  test("robustness: a wedged half-snapshot (dir without data/head.json) does not wedge future publishes", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-wedge-"));
    writeFileSync(join(host, "scores.csv"), "a\n1\n", "utf8");
    run(host, ["add-claim", "--text", "A claim.", "--evidence", "file:scores.csv"]);

    // Simulate a prior publish that created the snapshot dir but crashed before writing data/.
    // We can't know the id in advance, so do a real publish, then DELETE its data/head.json to
    // recreate the "dir exists but incomplete" wedge, while keeping the same content head.
    const p1 = run(host, ["publish"]);
    const id1 = (p1.stdout.match(/published snapshot (\w+)/) ?? [])[1];
    expect(id1).toBeTruthy();
    const snapHead = join(host, "cairn", "snapshots", id1!, "data", "head.json");
    // Remove the completion marker -> wedged half-snapshot for THIS content head.
    Bun.spawnSync(["rm", snapHead]);
    expect(existsSync(snapHead)).toBe(false);

    // A republish of the same content must COMPLETE the half-snapshot, not crash (ENOENT) or wedge.
    const p2 = run(host, ["publish"]);
    expect(p2.code).toBe(0);
    expect(existsSync(snapHead)).toBe(true);
    // latest/ mirrors the (now-complete) snapshot.
    expect(existsSync(join(host, "cairn", "published", "latest", "data", "head.json"))).toBe(true);
  });

  test("ground dedupes identical evidence edges (no duplicate appended)", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-dedupe-"));
    writeFileSync(join(host, "e.csv"), "a\n1\n", "utf8");
    run(host, ["add-claim", "--text", "Dedupe me."]);
    const drafts = run(host, ["drafts"]);
    const id = (drafts.stdout.match(/claim-\d{8}-\d{3}/) ?? [])[0];
    expect(id).toBeTruthy();

    const g1 = run(host, ["ground", id!, "--evidence", "file:e.csv"]);
    expect(g1.code).toBe(0);
    // Re-ground the SAME evidence: must be skipped as a duplicate.
    const g2 = run(host, ["ground", id!, "--evidence", "file:e.csv"]);
    expect(g2.code).toBe(0);
    expect(g2.stdout).toContain("now 1 total");
    expect(g2.stdout).toMatch(/duplicate skipped/);

    const claimText = readFileSync(join(host, "cairn", "claims", `${id}.md`), "utf8");
    const occurrences = (claimText.match(/ref: e\.csv/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  test("add-claim accepts dash-leading text (argv parser consumes next token / --flag=value)", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-dash-"));
    // `--text "-initial dip"`: value begins with `-`; the parser must consume it, not reject it.
    const add = run(host, ["add-claim", "--text", "-initial dip"]);
    expect(add.code).toBe(0);
    const drafts = run(host, ["drafts"]);
    expect(drafts.stdout).toContain("-initial dip");

    // `--text=...` form also works (and supports a leading dash).
    const add2 = run(host, ["add-claim", "--text=-second dip"]);
    expect(add2.code).toBe(0);
    const drafts2 = run(host, ["drafts"]);
    expect(drafts2.stdout).toContain("-second dip");
  });

  test("no-store failure exits 1 (StoreError), matching the documented usage/no-store contract", () => {
    // A read verb with NO store anywhere up the tree must exit 1, not 4.
    const empty = mkdtempSync(join(tmpdir(), "cairn-nostore-"));
    const r = run(empty, ["head"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no Cairn store");
  });

  test("validate warns (without blocking) on a dangling depends_on", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-dangling-"));
    const claims = join(host, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(
      join(claims, "claim-20260610-001.md"),
      `---\nid: claim-20260610-001\ntext: "grounded but deps a ghost"\nstatus: canonical\nverification: unverified\ngrounding:\n  - kind: file\n    ref: a.csv\n    fingerprint: "sha256:1"\n    method: sha256\n    location: a.csv\ndepends_on:\n  - claim-20260610-999\ncreated_at: 2026-06-10T20:00:00-04:00\n---\n`,
    );
    const v = run(host, ["validate"]);
    // Dangling deps are warn-only: the gate still passes (own grounding edge), exit 0.
    expect(v.code).toBe(0);
    expect(v.stderr + v.stdout).toContain("dangling depends_on");
    expect(v.stderr + v.stdout).toContain("claim-20260610-999");
  });

  test("validate fails (nonzero) on an unreachable-ground canonical cycle", () => {
    const host = mkdtempSync(join(tmpdir(), "cairn-cycle-"));
    const claims = join(host, "cairn", "claims");
    Bun.spawnSync(["mkdir", "-p", claims]);
    const mk = (id: string, dep: string) =>
      `---\nid: ${id}\ntext: "c"\nstatus: canonical\nverification: unverified\ngrounding: []\ndepends_on:\n  - ${dep}\ncreated_at: 2026-06-10T20:00:00-04:00\n---\n`;
    writeFileSync(join(claims, "claim-20260610-001.md"), mk("claim-20260610-001", "claim-20260610-002"));
    writeFileSync(join(claims, "claim-20260610-002.md"), mk("claim-20260610-002", "claim-20260610-001"));
    const v = run(host, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("FAILED");
  });
});
