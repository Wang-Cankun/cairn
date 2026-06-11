import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
