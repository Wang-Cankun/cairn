#!/usr/bin/env bun
/**
 * assert-graph.ts — the E2E harness ASSERTION ENGINE.
 *
 * Reads a Cairn store produced by a scenario agent (reference-agent.sh / naive-agent.sh) and scores
 * it against a hand-authored expected-graph.json (the ground truth). It is the SINGLE OARACLE every
 * scenario conforms to: scenarios describe what a good agent's store should look like; this engine
 * decides pass/fail. The runner invokes it once per (scenario × agent) run.
 *
 * It NEVER re-parses markdown by hand. It uses the project's OWN parsers (readAllClaims /
 * readAllConfounds / readConfig from src/store.ts) so the asserted graph is exactly what the CLI
 * wrote, and computes the reconcile count via src/reconcile.ts. The on-disk frontmatter is the
 * source of truth (ADR-0003): the CLI-LOCKED fields (freshness / verification / lifecycle) are read
 * straight off the parsed frontmatter — the same locked values the acceptance harness reads with
 * `fmval` — never recomputed here.
 *
 * CLI usage:   bun run tests/e2e/lib/assert-graph.ts <storeProjectDir> <expectedGraphPath>
 *   <storeProjectDir>   a project dir containing a `cairn/` store (we resolve the store under it)
 *   <expectedGraphPath> path to the scenario's expected-graph.json (the EXPECTED-GRAPH schema)
 * Exit code: 0 iff every ASSERTED check passes; 1 otherwise. (A `null` expectation = "don't assert".)
 *
 * Importable:  import { runAssertions } from "./assert-graph.ts";
 *              runAssertions(storeProjectDir, expectedGraphPath) -> { checks, passed, failed }.
 */

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findStore, readAllClaims, readAllConfounds, readConfig } from "../../../src/store.ts";
import { reconcile } from "../../../src/reconcile.ts";
import type {
  ClaimFile,
  ConfoundFile,
  EvidenceKind,
  FreshnessState,
  Lifecycle,
  Verification,
} from "../../../src/types.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 0. The expected-graph schema (MIRRORS tests/e2e/CONTRACT.md §a verbatim)
// ══════════════════════════════════════════════════════════════════════════════

/** One expected evidence ref: a kind + a substring of the actual ref (loose, substring match). */
interface ExpectedEvidence {
  kind: EvidenceKind;
  ref_contains: string;
}

/** One expected claim node, keyed by an author-chosen logical name unique within the file. */
interface ExpectedClaim {
  /** Logical name, unique in this file. Used only to wire contradicts/caveats across claims. */
  key: string;
  /** Substring used to find THE actual claim by its frontmatter `text` (unique match required). */
  text_contains: string;
  /** Logical estimand name. Claims sharing it MUST share one actual estimand id; differing keys MUST differ. */
  estimand_key?: string | null;
  /** Other claim keys this claim must carry a `contradicts` edge to. */
  contradicts?: string[];
  /** Confound keys this claim must carry an `inherits_caveat` edge to. */
  caveats?: string[];
  /** Each expected evidence kind+ref_contains must be present on the claim. */
  evidence?: ExpectedEvidence[];
  /** Expected CLI-locked freshness (null = don't assert). */
  freshness?: FreshnessState | null;
  /** Expected CLI-locked verification (null = don't assert). */
  verification?: Verification | null;
  /** Expected CLI-locked lifecycle (null = don't assert). */
  lifecycle?: Lifecycle | null;
}

/** One expected confound node, keyed by the caveat key referenced from claims. */
interface ExpectedConfound {
  key: string;
  text_contains: string;
}

interface ExpectedReconcile {
  min_unreferenced?: number | null;
  max_unreferenced?: number | null;
}

interface ExpectedGraph {
  scenario: string;
  description: string;
  claims?: ExpectedClaim[];
  confounds?: ExpectedConfound[];
  reconcile?: ExpectedReconcile | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Scorecard shape
// ══════════════════════════════════════════════════════════════════════════════

/** One scored dimension: a human-readable check name, a pass flag, and an evidence detail. */
export interface Check {
  check: string;
  pass: boolean;
  detail: string;
}

export interface AssertionResult {
  checks: Check[];
  passed: number;
  failed: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. Resolution helpers (logical key -> actual node, via the project's parsers)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve an expected claim `key` to its actual claim by UNIQUE `text_contains` substring match over
 * the parsed frontmatter `text`. Returns the matched ClaimFile, or a reason string when the match is
 * absent or ambiguous (zero or ≥2 hits both fail — the harness demands an unambiguous capture).
 */
function resolveClaim(
  expected: ExpectedClaim,
  claims: ClaimFile[],
): { ok: true; file: ClaimFile } | { ok: false; reason: string } {
  const hits = claims.filter((c) => c.frontmatter.text.includes(expected.text_contains));
  if (hits.length === 1) return { ok: true, file: hits[0] as ClaimFile };
  if (hits.length === 0) {
    return { ok: false, reason: `no claim whose text contains "${expected.text_contains}"` };
  }
  return {
    ok: false,
    reason: `${hits.length} claims match text_contains "${expected.text_contains}" (must be unique): ${hits
      .map((c) => c.frontmatter.id)
      .join(", ")}`,
  };
}

/** Resolve a confound `key` to its actual confound by UNIQUE substring match over body OR label. */
function resolveConfound(
  expected: ExpectedConfound,
  confounds: ConfoundFile[],
): { ok: true; file: ConfoundFile } | { ok: false; reason: string } {
  const hits = confounds.filter(
    (c) =>
      c.body.includes(expected.text_contains) ||
      (c.frontmatter.label ?? "").includes(expected.text_contains),
  );
  if (hits.length === 1) return { ok: true, file: hits[0] as ConfoundFile };
  if (hits.length === 0) {
    return { ok: false, reason: `no confound whose body/label contains "${expected.text_contains}"` };
  }
  return {
    ok: false,
    reason: `${hits.length} confounds match "${expected.text_contains}" (must be unique)`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. The assertion engine
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Score the store under `storeProjectDir` against `expectedGraphPath`. Pure (no process.exit), so it
 * is callable both from the CLI wrapper and from importing tests.
 */
export function runAssertions(storeProjectDir: string, expectedGraphPath: string): AssertionResult {
  const checks: Check[] = [];
  const add = (check: string, pass: boolean, detail: string) => checks.push({ check, pass, detail });

  // ── load the expected graph ──
  const projectDir = resolve(storeProjectDir);
  const expected = JSON.parse(readFileSync(resolve(expectedGraphPath), "utf8")) as ExpectedGraph;

  // ── resolve the store under the project dir, read with the project's OWN parsers ──
  const paths = findStore(projectDir);
  if (!paths) {
    add("store resolved", false, `no cairn/ store found under ${projectDir}`);
    return { checks, passed: 0, failed: checks.length };
  }
  add("store resolved", true, paths.storeDir);

  let claims: ClaimFile[];
  let confounds: ConfoundFile[];
  try {
    claims = readAllClaims(paths); // project parser; sorted by id
    confounds = readAllConfounds(paths);
  } catch (e) {
    add("store parses", false, `parser threw: ${(e as Error).message}`);
    return { checks, passed: 0, failed: checks.length };
  }
  add("store parses", true, `${claims.length} claim(s), ${confounds.length} confound(s)`);

  // ── resolve every expected claim key -> actual id once (the wiring table) ──
  const expectedClaims = expected.claims ?? [];
  const claimIdByKey = new Map<string, string>(); // logical key -> actual clm- id
  const fileByKey = new Map<string, ClaimFile>();

  // (a) CLAIM CAPTURE — each expected claim is matched, uniquely, by text_contains.
  for (const ec of expectedClaims) {
    const r = resolveClaim(ec, claims);
    if (r.ok) {
      claimIdByKey.set(ec.key, r.file.frontmatter.id);
      fileByKey.set(ec.key, r.file);
      add(`claim[${ec.key}] captured`, true, `text_contains "${ec.text_contains}" → ${r.file.frontmatter.id}`);
    } else {
      add(`claim[${ec.key}] captured`, false, r.reason);
    }
  }

  // (b) CONFOUND NODES EXIST — each expected confound is matched uniquely (for caveat wiring).
  const expectedConfounds = expected.confounds ?? [];
  const confoundIdByKey = new Map<string, string>();
  for (const ecf of expectedConfounds) {
    const r = resolveConfound(ecf, confounds);
    if (r.ok) {
      confoundIdByKey.set(ecf.key, r.file.frontmatter.id);
      add(`confound[${ecf.key}] exists`, true, `→ ${r.file.frontmatter.id}`);
    } else {
      add(`confound[${ecf.key}] exists`, false, r.reason);
    }
  }

  // (c) ESTIMAND IDENTITY — group resolved claims by estimand_key. Same key ⇒ one shared id; different
  // keys ⇒ pairwise-distinct ids. Compared by id STRING-EQUALITY only (ADR-0005). A null/absent key is
  // skipped (don't assert). A claim whose key failed to resolve is skipped (its capture already failed).
  const estimandGroups = new Map<string, Set<string>>(); // estimand_key -> set of actual estimand ids
  for (const ec of expectedClaims) {
    if (ec.estimand_key === undefined || ec.estimand_key === null) continue;
    const file = fileByKey.get(ec.key);
    if (!file) continue; // capture already failed; don't double-penalize
    const actual = file.frontmatter.estimand ?? "(none)";
    let set = estimandGroups.get(ec.estimand_key);
    if (set === undefined) {
      set = new Set<string>();
      estimandGroups.set(ec.estimand_key, set);
    }
    set.add(actual);
  }
  // same estimand_key -> exactly one actual id
  for (const [ekey, ids] of estimandGroups) {
    const pass = ids.size === 1 && !ids.has("(none)");
    add(
      `estimand[${ekey}] shared`,
      pass,
      pass
        ? `all claims citing "${ekey}" share ${[...ids][0]}`
        : `claims citing "${ekey}" resolve to ${ids.size} distinct estimand id(s): ${[...ids].join(", ")}`,
    );
  }
  // different estimand_key -> different actual id (pairwise distinctness across single-id groups)
  const singleId = new Map<string, string>(); // estimand_key -> its sole id (only for clean groups)
  for (const [ekey, ids] of estimandGroups) if (ids.size === 1 && !ids.has("(none)")) singleId.set(ekey, [...ids][0] as string);
  const ekeys = [...singleId.keys()];
  for (let i = 0; i < ekeys.length; i++) {
    for (let j = i + 1; j < ekeys.length; j++) {
      const a = ekeys[i] as string;
      const b = ekeys[j] as string;
      const pass = singleId.get(a) !== singleId.get(b);
      add(
        `estimand[${a}]≠[${b}]`,
        pass,
        pass
          ? `distinct: ${singleId.get(a)} ≠ ${singleId.get(b)}`
          : `DIFFERENT estimand keys collapsed to one id ${singleId.get(a)} (different question laundered)`,
      );
    }
  }

  // ── per-claim edge / grounding / locked-axis checks ──
  for (const ec of expectedClaims) {
    const file = fileByKey.get(ec.key);
    if (!file) continue; // capture failed; skip its dependent checks (already counted as a fail)
    const fm = file.frontmatter;

    // (d) CONTRADICTS EDGES PRESENT — each expected contradicts key maps to an id on this claim's edge.
    for (const otherKey of ec.contradicts ?? []) {
      const otherId = claimIdByKey.get(otherKey);
      if (otherId === undefined) {
        add(`claim[${ec.key}] contradicts [${otherKey}]`, false, `target key "${otherKey}" did not resolve`);
        continue;
      }
      const pass = fm.contradicts.includes(otherId);
      add(
        `claim[${ec.key}] contradicts [${otherKey}]`,
        pass,
        pass ? `edge → ${otherId} present` : `missing contradicts edge → ${otherId} (have: ${fm.contradicts.join(", ") || "none"})`,
      );
    }

    // (e) INHERITS_CAVEAT EDGES PRESENT — each expected caveat key maps to a confound id on the edge.
    for (const caveatKey of ec.caveats ?? []) {
      const cfdId = confoundIdByKey.get(caveatKey);
      if (cfdId === undefined) {
        add(`claim[${ec.key}] inherits_caveat [${caveatKey}]`, false, `caveat key "${caveatKey}" did not resolve to a confound`);
        continue;
      }
      const pass = fm.inherits_caveat.includes(cfdId);
      add(
        `claim[${ec.key}] inherits_caveat [${caveatKey}]`,
        pass,
        pass ? `edge → ${cfdId} present` : `missing inherits_caveat edge → ${cfdId} (have: ${fm.inherits_caveat.join(", ") || "none"})`,
      );
    }

    // (f) GROUNDING — each expected {kind, ref_contains} is present among the claim's evidence refs.
    const refs = fm.evidence_lines.flatMap((l) => l.refs);
    for (const ev of ec.evidence ?? []) {
      const pass = refs.some((r) => r.kind === ev.kind && r.ref.includes(ev.ref_contains));
      add(
        `claim[${ec.key}] evidence ${ev.kind}:~"${ev.ref_contains}"`,
        pass,
        pass
          ? `grounded on ${ev.kind} ref containing "${ev.ref_contains}"`
          : `no ${ev.kind} evidence ref contains "${ev.ref_contains}" (have: ${refs.map((r) => `${r.kind}:${r.ref}`).join(", ") || "none"})`,
      );
    }

    // (g) FRESHNESS state (CLI-LOCKED on disk; null = don't assert).
    if (ec.freshness !== undefined && ec.freshness !== null) {
      const pass = fm.freshness === ec.freshness;
      add(`claim[${ec.key}] freshness=${ec.freshness}`, pass, pass ? `is ${fm.freshness}` : `expected ${ec.freshness}, got ${fm.freshness}`);
    }

    // (h) VERIFICATION state (CLI-LOCKED; null = don't assert).
    if (ec.verification !== undefined && ec.verification !== null) {
      const pass = fm.verification === ec.verification;
      add(`claim[${ec.key}] verification=${ec.verification}`, pass, pass ? `is ${fm.verification}` : `expected ${ec.verification}, got ${fm.verification}`);
    }

    // (i) LIFECYCLE (CLI-LOCKED; null = don't assert).
    if (ec.lifecycle !== undefined && ec.lifecycle !== null) {
      const pass = fm.lifecycle === ec.lifecycle;
      add(`claim[${ec.key}] lifecycle=${ec.lifecycle}`, pass, pass ? `is ${fm.lifecycle}` : `expected ${ec.lifecycle}, got ${fm.lifecycle}`);
    }
  }

  // (j) RECONCILE unreferenced count within [min, max] (null on a bound = open-ended on that side).
  if (expected.reconcile) {
    const { min_unreferenced: lo, max_unreferenced: hi } = expected.reconcile;
    if ((lo !== undefined && lo !== null) || (hi !== undefined && hi !== null)) {
      const rec = reconcile(paths.hostRoot, readConfig(paths), claims);
      const n = rec.unreferenced.length;
      const okLo = lo === undefined || lo === null || n >= lo;
      const okHi = hi === undefined || hi === null || n <= hi;
      const pass = okLo && okHi;
      const range = `[${lo ?? "-∞"}, ${hi ?? "+∞"}]`;
      add(
        `reconcile unreferenced in ${range}`,
        pass,
        pass ? `${n} unreferenced conclusion-like line(s) in range` : `${n} unreferenced, outside ${range}`,
      );
    }
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  return { checks, passed, failed };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. CLI wrapper (scorecard to stdout, exit 0/1)
// ══════════════════════════════════════════════════════════════════════════════

function printScorecard(scenarioLabel: string, result: AssertionResult): void {
  console.log(`── assert-graph: ${scenarioLabel} ──`);
  for (const c of result.checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.check}  —  ${c.detail}`);
  }
  console.log(`  totals: ${result.passed} pass / ${result.failed} fail (${result.checks.length} checks)`);
  console.log(result.failed === 0 ? "ASSERT-GRAPH: PASS" : "ASSERT-GRAPH: FAIL");
}

function mainCli(): void {
  const [storeProjectDir, expectedGraphPath] = process.argv.slice(2);
  if (!storeProjectDir || !expectedGraphPath) {
    console.error("usage: bun run tests/e2e/lib/assert-graph.ts <storeProjectDir> <expectedGraphPath>");
    process.exit(2);
  }
  if (!existsSync(expectedGraphPath)) {
    console.error(`assert-graph: expected-graph not found: ${expectedGraphPath}`);
    process.exit(2);
  }
  const result = runAssertions(storeProjectDir, expectedGraphPath);
  let label = expectedGraphPath;
  try {
    label = (JSON.parse(readFileSync(expectedGraphPath, "utf8")) as ExpectedGraph).scenario ?? expectedGraphPath;
  } catch {
    /* keep the path as the label */
  }
  printScorecard(label, result);
  process.exit(result.failed === 0 ? 0 : 1);
}

if (import.meta.main) mainCli();
