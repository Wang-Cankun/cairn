/**
 * init.test.ts — the `cairn init` scaffold verb at the CLI seam. Spawns the real `bun run src/cli.ts`
 * in a temp host dir and asserts ONLY on exit code + stdout + the emitted OKF files on disk. Mirrors
 * cli.test.ts: each test sets cwd = its temp host root so store discovery walks up correctly.
 *
 * init is what the E2E harness and real projects use to make a directory Cairn-ready. The two
 * load-bearing properties it must hold: it stands up the full skeleton + a config, and it is
 * IDEMPOTENT — a second init must never clobber an existing config or any authored claim.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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

/** Read + parse cairn/config.json from a host (the file init emits). */
function readConfig(h: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(h, "cairn", "config.json"), "utf8"));
}

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — init scaffold", () => {
  test("init stands up the OKF skeleton: dirs + config.json + index.md + log.md", () => {
    const h = host("init");
    const r = run(h, ["init"]);
    expect(r.code).toBe(0);

    // The three node dirs + snapshots dir.
    expect(existsSync(join(h, "cairn", "claims"))).toBe(true);
    expect(existsSync(join(h, "cairn", "estimands"))).toBe(true);
    expect(existsSync(join(h, "cairn", "confounds"))).toBe(true);
    expect(existsSync(join(h, "cairn", "snapshots"))).toBe(true);
    // Self-describing surface + time spine.
    expect(existsSync(join(h, "cairn", "index.md"))).toBe(true);
    expect(existsSync(join(h, "cairn", "config.json"))).toBe(true);
    expect(readFileSync(join(h, "cairn", "log.md"), "utf8")).toContain("- init ");

    // Default config when no flags: findings_globs = ["FINDINGS.md"], no remote_host.
    const config = readConfig(h);
    expect(config.findings_globs).toEqual(["FINDINGS.md"]);
    expect(config.remote_host).toBeUndefined();
  });

  test("init is idempotent: a second init preserves config and any authored claim", () => {
    const h = host("initidem");
    expect(run(h, ["init", "--findings", "paper.md"]).code).toBe(0);

    // Author a claim into the initialized store.
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    run(h, ["add-claim", "--text", "A grounded draft.", "--evidence", "file:e.csv", "--provenance", "ai_proposed"]);
    const claimsDir = join(h, "cairn", "claims");
    const claimFile = readdirSync(claimsDir).filter((f) => f.endsWith(".md"))[0]!;
    const before = readFileSync(join(claimsDir, claimFile), "utf8");
    const configBefore = readFileSync(join(h, "cairn", "config.json"), "utf8");

    // Re-init: must report "kept existing" config and clobber nothing.
    const r2 = run(h, ["init", "--findings", "SHOULD_NOT_REPLACE.md"]);
    expect(r2.code).toBe(0);
    expect(r2.stdout).toContain("kept existing");

    // Config byte-identical (the new --findings flag was ignored — config is never overwritten).
    expect(readFileSync(join(h, "cairn", "config.json"), "utf8")).toBe(configBefore);
    expect(readConfig(h).findings_globs).toEqual(["paper.md"]);
    // The claim file is untouched.
    const after = readFileSync(join(claimsDir, claimFile), "utf8");
    expect(after).toBe(before);
  });

  test("--findings (repeatable) and --remote-host are honored in config.json", () => {
    const h = host("initflags");
    const r = run(h, [
      "init",
      "--findings",
      "FINDINGS.md",
      "--findings",
      "results/*.md",
      "--remote-host",
      "osc",
    ]);
    expect(r.code).toBe(0);
    const config = readConfig(h);
    expect(config.findings_globs).toEqual(["FINDINGS.md", "results/*.md"]);
    expect(config.remote_host).toBe("osc");
  });

  test("init NEVER overwrites an existing config.json", () => {
    const h = host("initkeep");
    // Pre-seed a store with an owner-authored config.
    mkdirSync(join(h, "cairn", "claims"), { recursive: true });
    const owner = JSON.stringify({ findings_globs: ["CUSTOM.md"], remote_host: "myhost" });
    writeFileSync(join(h, "cairn", "config.json"), owner, "utf8");

    const r = run(h, ["init", "--findings", "WOULD_OVERWRITE.md", "--remote-host", "elsewhere"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("kept existing");
    // The existing config survives byte-for-byte (flags are ignored when a config is present).
    expect(readFileSync(join(h, "cairn", "config.json"), "utf8")).toBe(owner);
  });
});
