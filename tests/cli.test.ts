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
/**
 * Fill a claim body so it clears the body-movements gate (ADR-0007). There is no body-fill CLI verb
 * (add-claim only writes the skeleton), so we overwrite the body on disk — the same writeFileSync
 * idiom the tamper tests use — replacing every `<...>` skeleton cue with real prose for all three
 * movements. A fully-filled body has no cue left, so it passes regardless of the claim's edges.
 */
function fillBody(h: string, id: string): void {
  const file = readClaimFile(h, id);
  const fmEnd = file.indexOf("\n---", 3); // end of the closing frontmatter fence
  const head = file.slice(0, fmEnd + 4); // include the closing `---`
  const filled = [
    "",
    "",
    "## Conclusion, with its conditions",
    "",
    "The effect holds, conditional on the cohort-Z fork; under the alternate fork it attenuates.",
    "",
    "## The contradiction and the caveat",
    "",
    "The contesting sibling matters because it reverses the sign under the same estimand; the inherited caveat about depth confounding bounds the residual.",
    "",
    "## What would change it",
    "",
    "A pre-registered replication on an independent cohort would shrink the residual uncertainty.",
    "",
  ].join("\n");
  writeFileSync(join(h, "cairn", "claims", `${id}.md`), head + filled);
}
/**
 * Body lines that DELIVER all three movements (every required section header present, no skeleton cue),
 * so a hand-built canonical fixture clears the body-movements gate (ADR-0007) and only the gate UNDER
 * TEST fires. Spread these where a hand-built claim file would otherwise end with a bare `body` line.
 */
const MOVEMENTS_BODY: string[] = [
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
];
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
/**
 * Author an estimand NODE directly into the store (black-box: mirrors the CLI's serialized estimand
 * format), so a hand-written canonical claim that cites a FIXED estimand id satisfies referential
 * integrity. Tests that exercise OTHER gates use a placeholder estimand id as scaffolding; the
 * referenced node must still exist (a canonical claim may not cite a question node that isn't there).
 */
function putEstimand(h: string, id: string): void {
  const dir = join(h, "cairn", "estimands");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.md`),
    [
      "---",
      "type: estimand",
      `id: ${id}`,
      "asserter:",
      "  who: a",
      "  model: m",
      "  session: s",
      "  time: 2026-06-10T20:00:00-04:00",
      "---",
      "The question these claims answer.",
      "",
    ].join("\n"),
    "utf8",
  );
}

// id-shape regexes
const CLM = /clm-[0-9a-f]+/;
const EST = /est-[0-9a-f]+/;
const CFD = /cfd-[0-9a-f]+/;

// ════════════════════════════════════════════════════════════════════════════════
describe("init — greenfield store scaffold", () => {
  test("scaffolds the OKF skeleton + config/index/log on a bare host, and the fresh store validates", () => {
    const h = host("init");
    expect(existsSync(join(h, "cairn"))).toBe(false); // bare host, no store yet

    const r = run(h, ["init"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Cairn store ready");

    // skeleton dirs stood up
    for (const d of ["claims", "estimands", "confounds", "snapshots"]) {
      expect(existsSync(join(h, "cairn", d))).toBe(true);
    }
    // self-describing surface + log + config emitted
    expect(existsSync(join(h, "cairn", "index.md"))).toBe(true);
    expect(existsSync(join(h, "cairn", "log.md"))).toBe(true);
    const cfg = JSON.parse(readFileSync(join(h, "cairn", "config.json"), "utf8"));
    expect(cfg.findings_globs).toEqual(["FINDINGS.md"]); // default glob when none given

    // the bench depends on this: a freshly-init'd (empty) store passes validate
    expect(run(h, ["validate"]).code).toBe(0);
  });

  test("never clobbers an existing config (idempotent re-init keeps the owner's config)", () => {
    const h = host("init-idem");
    expect(run(h, ["init"]).code).toBe(0);
    writeFileSync(
      join(h, "cairn", "config.json"),
      JSON.stringify({ findings_globs: ["custom/*.md"] }) + "\n",
      "utf8",
    );
    const r2 = run(h, ["init"]);
    expect(r2.code).toBe(0);
    expect(r2.stdout).toContain("kept existing");
    const cfg = JSON.parse(readFileSync(join(h, "cairn", "config.json"), "utf8"));
    expect(cfg.findings_globs).toEqual(["custom/*.md"]); // untouched
  });

  test("--findings (repeatable) and --remote-host land in config.json", () => {
    const h = host("init-flags");
    const r = run(h, ["init", "--findings", "results/*.md", "--findings", "notes.md", "--remote-host", "osc"]);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(h, "cairn", "config.json"), "utf8"));
    expect(cfg.findings_globs).toEqual(["results/*.md", "notes.md"]);
    expect(cfg.remote_host).toBe("osc");
  });

  test("--dvc is a boolean toggle that never blocks init (dvc absent/failed just warns)", () => {
    const h = host("init-dvc");
    const r = run(h, ["init", "--dvc"]); // must not error on a missing value, and must not hard-fail
    expect(r.code).toBe(0);
    expect(existsSync(join(h, "cairn", "config.json"))).toBe(true);
  });
});

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
      "--estimand",
      "est-aaaa00000001",
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
    putEstimand(h, "est-aaaa00000001"); // the cited estimand node must exist (referential integrity)
    const id = claimIds(h)[0]!;
    const file = readClaimFile(h, id);
    // verification is locked to unverified (ai_proposed can never be verified)...
    expect(fmScalar(file, "verification")).toBe("unverified");
    // ...corroboration is derived (no reviewers) to self-asserted...
    expect(fmScalar(file, "corroboration")).toBe("self-asserted");
    // ...and validate confirms no trust-field-lock violation slipped through (body filled so the
    // body-movements gate (ADR-0007) does not block this candidate).
    fillBody(h, id);
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
        ...MOVEMENTS_BODY,
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
    putEstimand(h, "est-aaaa00000001"); // the cited estimand node must exist (referential integrity)
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
        "estimand: est-aaaa00000001",
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
        ...MOVEMENTS_BODY,
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

  test("a grounded draft with NO estimand is refused promotion to canonical (estimand-required)", () => {
    const h = host("estReq");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    // Grounded but estimand-less: a draft (soft) is fine, but it cannot cross to canonical.
    run(h, ["add-claim", "--text", "Grounded but no estimand.", "--evidence", "file:e.csv", "--provenance", "ai_proposed"]);
    const id = claimIds(h)[0]!;

    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("estimand-required");
    expect(v.stderr).toContain(id);

    // publish refuses too (it validates first); nothing is promoted.
    const pub = run(h, ["publish"]);
    expect(pub.code).toBe(3);
    expect(fmScalar(readClaimFile(h, id), "lifecycle")).toBe("draft");

    // Declaring an estimand unblocks it: re-author with --estimand, then publish promotes it.
    const est = run(h, ["add-estimand", "--def", "The question this claim answers."]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "Now with an estimand.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const id2 = claimIds(h).find((i) => i !== id)!;
    fillBody(h, id2); // id2 is a candidate too — fill its body so body-movements (ADR-0007) does not also flag it
    const pub2 = run(h, ["publish"]);
    // still fails because the FIRST estimand-less draft is grounded ⇒ still a candidate that blocks.
    expect(pub2.code).toBe(3);
    expect(pub2.stderr).toContain(id); // the estimand-less one is the offender
    expect(pub2.stderr).not.toContain(`estimand-required] ${id2}`); // the estimand'd one is clean
    expect(pub2.stderr).not.toContain(`body-movements] ${id2}`); // and its body is filled, so it is clean here too
  });

  test("human_reviewed is no longer a valid provenance (a human reviewing is consensus, not territory)", () => {
    const h = host("noHumanReviewed");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const r = run(h, ["add-claim", "--text", "Reviewed by a human.", "--evidence", "file:e.csv", "--provenance", "human_reviewed"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown provenance/);
    // the advertised allowed-set no longer offers human_reviewed
    expect(r.stderr).toMatch(/\(ai_proposed\|literature\|experimental\)/);
  });

  test("verification allowlist at the seam: experimental may be contradicted; ai_proposed cannot; literature cannot be verified", () => {
    const h = host("vallow");
    const claims = join(h, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    putEstimand(h, "est-aaaa00000001"); // the cited estimand node must exist (referential integrity)
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
        "estimand: est-aaaa00000001",
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
        ...MOVEMENTS_BODY,
        "",
      ].join("\n");

    // experimental (territory) + contradicted: the territory may refute ⇒ validate passes.
    writeFileSync(join(claims, "clm-aaaa00000011.md"), mk("clm-aaaa00000011", "experimental", "contradicted"));
    expect(run(h, ["validate"]).code).toBe(0);

    // ai_proposed + contradicted: territory-locked the same as verified ⇒ refused.
    writeFileSync(join(claims, "clm-bbbb00000012.md"), mk("clm-bbbb00000012", "ai_proposed", "contradicted"));
    const r1 = run(h, ["validate"]);
    expect(r1.code).toBe(3);
    expect(r1.stderr).toContain("verification-lock");
    expect(r1.stderr).toContain("clm-bbbb00000012");
    expect(r1.stderr).not.toContain("clm-aaaa00000011"); // the experimental one is clean

    // literature is NOT territory (allowlist is {experimental}) ⇒ literature + verified refused.
    rmSync(join(claims, "clm-bbbb00000012.md"));
    writeFileSync(join(claims, "clm-cccc00000013.md"), mk("clm-cccc00000013", "literature", "verified"));
    const r2 = run(h, ["validate"]);
    expect(r2.code).toBe(3);
    expect(r2.stderr).toContain("verification-lock");
    expect(r2.stderr).toContain("clm-cccc00000013");
  });

  test("refresh OVERRIDES a hand-edited illegal verification (write-time trust-field lock, not just a validate flag)", () => {
    const h = host("refreshlock");
    const claims = join(h, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    // A tampered claim: ai_proposed self-stamped as verified (illegal — agent-sourced is not territory).
    const id = "clm-dddd00000021";
    writeFileSync(
      join(claims, `${id}.md`),
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
        "provenance: ai_proposed",
        "estimand: est-aaaa00000001",
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
        "verification: verified",
        "---",
        ...MOVEMENTS_BODY,
        "",
      ].join("\n"),
    );
    // refresh is a write verb that re-locks every CLI-computed field; it must DISCARD the tampered value.
    expect(run(h, ["refresh"]).code).toBe(0);
    expect(fmScalar(readClaimFile(h, id), "verification")).toBe("unverified");
  });

  test("settled is REFUSED while a contradiction is unresolved (canonical-but-not-settled)", () => {
    const h = host("settled");
    const claims = join(h, "cairn", "claims");
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    putEstimand(h, "est-aaaa00000001"); // the cited estimand node must exist (referential integrity)
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
        "estimand: est-aaaa00000001",
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
        ...MOVEMENTS_BODY,
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
    // Both are candidates; fill their bodies so the body-movements gate (ADR-0007) does not block publish.
    for (const id of claimIds(h)) fillBody(h, id);
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
    const estPub = run(h, ["add-estimand", "--def", "Effect for the publish bundle test."]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "Grounded canonical-to-be.", "--evidence", "file:e.csv", "--estimand", estPub, "--provenance", "ai_proposed"]);
    run(h, ["add-claim", "--text", "Ungrounded draft, stays draft.", "--provenance", "ai_proposed"]);

    // Fill the candidate's body so the body-movements gate (ADR-0007) does not block promotion. The
    // ungrounded draft is not a candidate, so its skeleton body is harmless either way.
    for (const id of claimIds(h)) fillBody(h, id);
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
    const estRepro = run(h, ["add-estimand", "--def", "Repro estimand."]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "Repro.", "--evidence", "file:e.csv", "--estimand", estRepro, "--provenance", "ai_proposed"]);
    // Fill the body ONCE before the first publish so all three publishes see the same (filled) view —
    // body-movements (ADR-0007) must pass and the snapshot id must stay reproducible.
    fillBody(h, claimIds(h)[0]!);
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
    // Both are candidates; fill their bodies so body-movements (ADR-0007) does not block promotion.
    for (const id of claimIds(h)) fillBody(h, id);
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

    // Both are candidates; fill their bodies so body-movements (ADR-0007) does not block promotion.
    // (NEG declares a contradicts edge, so its contradiction movement must be filled too — fillBody does.)
    fillBody(h, POS);
    fillBody(h, NEG);

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

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — publish freezes a SELF-CONSISTENT snapshot (no false fresh)", () => {
  // The enemy is a false `fresh`. publish computes freshness live for head.json + the snapshot id, but
  // froze the claim FILES byte-for-byte from the live store — so a publish AFTER an artifact change but
  // WITHOUT a refresh could freeze a bundle whose head.json says `stale` while the claim file inside the
  // SAME snapshot still says `fresh`. A reader opening the frozen claim file sees the false fresh.
  test("publish without a prior refresh re-locks freshness so head.json and the frozen claim file agree", () => {
    const h = host("falsefresh");
    writeFileSync(join(h, "scores.csv"), "a,b\n1,2\n", "utf8");
    const est = run(h, ["add-estimand", "--def", "Does T raise O?"]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "T raises O.", "--evidence", "file:scores.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const id = claimIds(h)[0]!;
    fillBody(h, id); // body-movements (ADR-0007): fill before promotion

    // First publish promotes the grounded draft to canonical (file stamped freshness: fresh).
    expect(run(h, ["publish"]).code).toBe(0);
    expect(fmScalar(readClaimFile(h, id), "freshness")).toBe("fresh");

    // Mutate the evidence, then publish AGAIN with NO intervening refresh.
    writeFileSync(join(h, "scores.csv"), "a,b\n1,2\nMUTATED,9\n", "utf8");
    expect(run(h, ["publish"]).code).toBe(0);

    const snapId = latestSnapshotId(h)!;
    const headFreshness = String(snapshotHead(h, snapId).claims[0]!.freshness);
    const frozenFreshness = fmScalar(
      readFileSync(join(h, "cairn", "snapshots", snapId, "claims", `${id}.md`), "utf8"),
      "freshness",
    );
    const liveFreshness = fmScalar(readClaimFile(h, id), "freshness");

    // The mutation makes the claim genuinely stale; ALL THREE views must agree (no false fresh).
    expect(headFreshness).toBe("stale");
    expect(frozenFreshness).toBe("stale"); // was the bug: frozen file said "fresh"
    expect(liveFreshness).toBe("stale"); // live store must match its own head, not lie
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — referential integrity (a canonical claim's cited nodes must exist)", () => {
  // estimand-required (gate c.1b) is a PRESENCE check (the field is set). But a set field pointing at a
  // node that does not exist still ships a canonical claim referencing a question/caveat that isn't in
  // the bundle. Referential integrity (fs-touching, not the pure gate) closes that: a candidate's cited
  // estimand and inherited confounds must EXIST as nodes. This compares ids only — it never reads the
  // node body — so the ADR-0004/0005 ceiling (the CLI judges ids, never meaning) is preserved.
  test("a candidate citing a non-existent ESTIMAND node fails validate AND publish (exit 3), nothing frozen", () => {
    const h = host("dangling-est");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    // Grounded ⇒ a candidate; cites a well-shaped est- id whose node file was never authored.
    run(h, ["add-claim", "--text", "Cites a ghost estimand.", "--evidence", "file:e.csv", "--estimand", "est-deadbeef0001", "--provenance", "ai_proposed"]);

    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("referential-integrity");
    expect(v.stderr).toContain("est-deadbeef0001");

    const p = run(h, ["publish"]);
    expect(p.code).toBe(3);
    expect(p.stderr).toContain("est-deadbeef0001");
    expect(latestSnapshotId(h)).toBeNull(); // never reached the freeze

    // Authoring the missing estimand node unblocks both.
    const est = run(h, ["add-estimand", "--def", "The now-real question."]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "Cites a real estimand.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    // The ghost-citing claim still blocks; retract it by removing its file, then publish succeeds.
    rmSync(join(h, "cairn", "claims", claimIds(h).find((c) => readClaimFile(h, c).includes("est-deadbeef0001"))!) + ".md");
    // The surviving real-estimand claim is a candidate; fill its body for body-movements (ADR-0007).
    for (const c of claimIds(h)) fillBody(h, c);
    expect(run(h, ["publish"]).code).toBe(0);
  });

  test("a candidate inheriting a non-existent CONFOUND node fails validate; a real confound publishes clean", () => {
    const h = host("dangling-cfd");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const est = run(h, ["add-estimand", "--def", "A real question for the confound test."]).stdout.match(EST)![0];

    // Inherits a well-shaped cfd- id whose node file was never authored ⇒ blocked.
    run(h, ["add-claim", "--text", "Inherits a ghost confound.", "--evidence", "file:e.csv", "--estimand", est, "--inherits-caveat", "cfd-deadbeef0002", "--provenance", "ai_proposed"]);
    const ghostId = claimIds(h)[0]!;
    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("referential-integrity");
    expect(v.stderr).toContain("cfd-deadbeef0002");

    // Retract the ghost-citing claim; a real authored confound node clears the integrity check.
    rmSync(join(h, "cairn", "claims", `${ghostId}.md`));
    const cfd = run(h, ["add-confound", "--caveat", "A real, authored caveat."]).stdout.match(CFD)![0];
    run(h, ["add-claim", "--text", "Inherits a real confound.", "--evidence", "file:e.csv", "--estimand", est, "--inherits-caveat", cfd, "--provenance", "ai_proposed"]);
    // This candidate inherits a caveat edge, so its contradiction movement cue must also be filled
    // (body-movements, ADR-0007); fillBody clears all three movements.
    for (const c of claimIds(h)) fillBody(h, c);
    expect(run(h, ["publish"]).code).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("v2 CLI seam — body-movements gate (the body's narrative movements must be present, ADR-0007)", () => {
  // add-claim writes a SKELETON body full of `<...>` cues. A grounded+estimand'd claim is a
  // candidate-canonical, so the unfilled skeleton must block BOTH validate and publish — and a draft
  // (non-candidate) must NOT be blocked. The gate is pure literal-cue presence + edge count (ADR-0004).

  test("(a) an unfilled-skeleton candidate FAILS validate (exit 3, body-movements + the claim) AND publish freezes nothing", () => {
    const h = host("body-unfilled");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const est = run(h, ["add-estimand", "--def", "Does T raise O?"]).stdout.match(EST)![0];
    // Grounded + estimand'd ⇒ a candidate; body left as the unfilled skeleton (conclusion cue present).
    run(h, ["add-claim", "--text", "T raises O.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const id = claimIds(h)[0]!;

    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("body-movements");
    expect(v.stderr).toContain(id);

    // publish validates first ⇒ also refused; nothing is frozen and the claim stays a draft.
    const p = run(h, ["publish"]);
    expect(p.code).toBe(3);
    expect(p.stderr).toContain(id);
    expect(latestSnapshotId(h)).toBeNull(); // never reached the freeze
    expect(fmScalar(readClaimFile(h, id), "lifecycle")).toBe("draft");

    // Filling the body unblocks both: validate passes, publish promotes it to canonical.
    fillBody(h, id);
    expect(run(h, ["validate"]).code).toBe(0);
    expect(run(h, ["publish"]).code).toBe(0);
    expect(fmScalar(readClaimFile(h, id), "lifecycle")).toBe("canonical");
  });

  test("(c) a candidate WITH a contradicts edge but an unfilled contradiction movement FAILS validate", () => {
    const h = host("body-contra");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const est = run(h, ["add-estimand", "--def", "Does T raise O?"]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "T raises O.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const pos = claimIds(h)[0]!;
    run(h, ["add-claim", "--text", "T does not raise O.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed", "--contradicts", pos]);
    const neg = claimIds(h).find((i) => i !== pos)!;

    // Fill POS fully, but leave NEG's skeleton (it declares a contradicts edge ⇒ contradiction cue present).
    fillBody(h, pos);
    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("body-movements");
    expect(v.stderr).toContain(neg); // the unfilled contesting claim is the offender
    // POS is filled ⇒ it is NOT named by a body-movements violation.
    expect(v.stderr).not.toContain(`body-movements] ${pos}`);

    // Fill NEG too ⇒ both clear; publish promotes both.
    fillBody(h, neg);
    expect(run(h, ["validate"]).code).toBe(0);
    expect(run(h, ["publish"]).code).toBe(0);
  });

  test("(e) a DRAFT (ungrounded, non-candidate) with the unfilled skeleton does NOT fail validate", () => {
    const h = host("body-draft");
    // Ungrounded draft: not a candidate ⇒ the body-movements gate never runs over it (soft authoring).
    run(h, ["add-claim", "--text", "A loose hunch, body unfilled.", "--provenance", "ai_proposed"]);
    const id = claimIds(h)[0]!;
    // Sanity: its body still carries the conclusion cue (unfilled skeleton).
    expect(readClaimFile(h, id)).toContain("<state the claim and the fork(s)");
    const v = run(h, ["validate"]);
    expect(v.code).toBe(0);
    expect(v.stdout).toContain("OK");
  });

  test("(f) an EMPTY body (skeleton headers DELETED, no cue left) is still REFUSED at validate AND publish", () => {
    // The empty-body escape (ADR-0007 §Consequences: the body can no longer be empty at canonical). An
    // agent who deletes the skeleton headers rather than leaving the <...> cues has a body with NO cue —
    // a cue-absence-only gate would promote a blank narrative, permanently losing the reasoning. The
    // section-header requirement refuses it at BOTH CLI surfaces.
    const h = host("body-empty");
    writeFileSync(join(h, "e.csv"), "x\n1\n", "utf8");
    const est = run(h, ["add-estimand", "--def", "Does T raise O?"]).stdout.match(EST)![0];
    run(h, ["add-claim", "--text", "T raises O.", "--evidence", "file:e.csv", "--estimand", est, "--provenance", "ai_proposed"]);
    const id = claimIds(h)[0]!;

    // Overwrite the body to EMPTY, preserving the frontmatter through the closing fence.
    const file = readClaimFile(h, id);
    const fmEnd = file.indexOf("\n---", 3);
    writeFileSync(join(h, "cairn", "claims", `${id}.md`), file.slice(0, fmEnd + 4) + "\n");
    // No skeleton cue remains, but no movement is delivered either.
    expect(readClaimFile(h, id)).not.toContain("<state the claim and the fork(s)");

    const v = run(h, ["validate"]);
    expect(v.code).toBe(3);
    expect(v.stderr).toContain("body-movements");
    expect(v.stderr).toContain(id);

    const p = run(h, ["publish"]);
    expect(p.code).toBe(3);
    expect(p.stderr).toContain(id);
    expect(latestSnapshotId(h)).toBeNull(); // nothing frozen
    expect(fmScalar(readClaimFile(h, id), "lifecycle")).toBe("draft"); // stays a draft

    // Filling the three movements (headers + prose) unblocks both surfaces.
    fillBody(h, id);
    expect(run(h, ["validate"]).code).toBe(0);
    expect(run(h, ["publish"]).code).toBe(0);
    expect(fmScalar(readClaimFile(h, id), "lifecycle")).toBe("canonical");
  });
});
