#!/usr/bin/env bun
/**
 * Cairn v2 CLI — the SOLE writer to the OKF store. Deterministic, who-agnostic, auditable.
 *
 * On every write the CLI STAMPS `asserter` (who/model/session/time) and COMPUTES every locked field,
 * OVERRIDING any agent-supplied value (trust-field lock, ADR-0004). An agent can never self-stamp a
 * trust badge. All interpretation lives in the Skill, not here.
 *
 * Verbs: head, add-claim, add-estimand, add-confound, review, refresh, validate, publish, drafts,
 *        status, reconcile, migrate (+ --version / --help).
 *
 * Exit codes:
 *   0 ok · 1 usage/no-store · 2 unknown verb/bad args · 3 validate/publish gate failed · 4 runtime err
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { computeFreshness } from "./freshness.ts";
import { relockTrustFields, runGate } from "./gate.ts";
import { stampFingerprints } from "./fingerprint.ts";
import { isGrounded } from "./claimfile.ts";
import { buildOrientSurface, canonicalFrontmatter, toPublishedClaim } from "./snapshot.ts";
import { renderIndexMd } from "./render.ts";
import { publish, PublishError, referentialIntegrityViolations } from "./publish.ts";
import { reconcile } from "./reconcile.ts";
import {
  appendLog,
  isoNow,
  mintId,
  modifyClaim,
  readAllClaims,
  readClaim,
  readConfig,
  requireStore,
  resolveStoreForWrite,
  StoreError,
  writeClaim,
  writeConfound,
  writeEstimand,
} from "./store.ts";
import { EVIDENCE_KINDS, PROVENANCES } from "./types.ts";
import type {
  Asserter,
  ClaimFile,
  ClaimFrontmatter,
  ConfoundFrontmatter,
  EstimandFrontmatter,
  EvidenceArg,
  EvidenceKind,
  EvidenceLine,
  EvidenceRef,
  ForkChoice,
  FreshnessState,
  Provenance,
  ReviewEdge,
  StorePaths,
} from "./types.ts";

const VERBS = [
  "head",
  "add-claim",
  "add-estimand",
  "add-confound",
  "review",
  "refresh",
  "validate",
  "publish",
  "drafts",
  "status",
  "reconcile",
  "migrate",
] as const;

function fail(msg: string, code: number): never {
  console.error(`cairn: ${msg}`);
  process.exit(code);
}

// ── argv parsing ────────────────────────────────────────────────────────────────

interface Parsed {
  positionals: string[];
  flags: Record<string, string[]>;
  bools: Set<string>;
}

/** Flags whose presence is a boolean toggle (no value consumed). */
const BOOL_FLAGS = new Set(["unerasable"]);

function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string[]> = {};
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        const key = body.slice(0, eq);
        (flags[key] ??= []).push(body.slice(eq + 1));
        continue;
      }
      const key = body;
      if (BOOL_FLAGS.has(key)) {
        bools.add(key);
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined) fail(`flag --${key} requires a value`, 2);
      (flags[key] ??= []).push(next as string);
      i++;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags, bools };
}

function first(parsed: Parsed, key: string): string | undefined {
  return parsed.flags[key]?.[0];
}

// ── input parsers ─────────────────────────────────────────────────────────────

/** Parse `--evidence kind:ref` (kind ∈ file|external|dvc). Split on the FIRST `:`. */
function parseEvidence(spec: string): EvidenceArg {
  const idx = spec.indexOf(":");
  if (idx === -1) fail(`--evidence must be "kind:ref" (got "${spec}")`, 2);
  const kind = spec.slice(0, idx) as EvidenceKind;
  const ref = spec.slice(idx + 1);
  if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) {
    fail(`unknown evidence kind "${kind}" (${EVIDENCE_KINDS.join("|")})`, 2);
  }
  if (!ref) fail(`--evidence "${spec}" has empty ref`, 2);
  return { kind, ref };
}

/** Parse `--depends-on-fork axis=choice` — split on the FIRST `=`; both parts non-empty. */
function parseFork(spec: string): ForkChoice {
  const eq = spec.indexOf("=");
  if (eq <= 0 || eq === spec.length - 1) {
    fail(`--depends-on-fork must be "axis=choice" with non-empty parts (got "${spec}")`, 2);
  }
  return { axis: spec.slice(0, eq), choice: spec.slice(eq + 1) };
}

function parseProvenance(v: string | undefined): Provenance {
  if (!v) fail(`add-claim requires --provenance (${PROVENANCES.join("|")})`, 2);
  if (!(PROVENANCES as readonly string[]).includes(v)) {
    fail(`unknown provenance "${v}" (${PROVENANCES.join("|")})`, 2);
  }
  return v as Provenance;
}

// ── asserter identity (who-agnostic; defaulted from environment) ─────────────────

/**
 * Build the asserting-agent stamp. Identity is the `who` string. It is supplied by the orchestrator
 * via flags or the environment so the CLI stays who-agnostic; defaults keep it usable bare.
 *   who:     --as | CAIRN_ASSERTER | $USER | "unknown"
 *   model:   --model | CAIRN_MODEL | ""
 *   session: --session | CAIRN_SESSION | ""
 */
function stampAsserter(parsed: Parsed, time: string): Asserter {
  const who =
    first(parsed, "as") ?? process.env.CAIRN_ASSERTER ?? process.env.USER ?? "unknown";
  // model/session are stamped too; the claim-file validator requires them non-empty, so default to a
  // visible placeholder rather than "" when the orchestrator supplies neither.
  const model = first(parsed, "model") ?? process.env.CAIRN_MODEL ?? "unspecified";
  const session = first(parsed, "session") ?? process.env.CAIRN_SESSION ?? "unspecified";
  return { who, model, session, time };
}

/**
 * Build an Asserter for a modify whose `who` identity is supplied directly (e.g. `review --by`), with
 * model/session defaulted from the environment. Used by the different-asserter VERSION path so the
 * modifying agent — not the original author — is stamped on the live file.
 */
function stampAsserterFor(who: string, time: string): Asserter {
  const model = process.env.CAIRN_MODEL ?? "unspecified";
  const session = process.env.CAIRN_SESSION ?? "unspecified";
  return { who, model, session, time };
}

// ── stdin (for --def / --caveat bodies) ──────────────────────────────────────────

function readStdinSync(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// ── verbs ───────────────────────────────────────────────────────────────────────

/**
 * head — emit/refresh the OKF index.md orient surface (canonical + live freshness + SURFACED
 * unresolved contradictions & staleness). Read-only re: claims; writes only cairn/index.md.
 */
function cmdHead(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const now = isoNow();
  const freshness = computeFreshness(claims, paths.hostRoot, now, readConfig(paths).remote_host);
  const canonical = canonicalFrontmatter(claims);
  const surface = buildOrientSurface(canonical, freshness);

  writeFileSync(paths.indexPath, renderIndexMd(surface, now), "utf8");

  console.log(`orient surface → ${paths.indexPath}`);
  console.log(`  canonical: ${surface.canonical.length}`);
  console.log(`  unresolved contradictions: ${surface.contradictions.length}`);
  for (const x of surface.contradictions) {
    console.log(`    ${x.claim} contradicts ${x.contradicts}${x.estimand ? ` (estimand ${x.estimand})` : ""}`);
  }
  console.log(`  stale/unknown: ${surface.stale.length}`);
  for (const id of surface.stale) console.log(`    ${id}`);
}

/**
 * add-claim — mint clm-<hash>, stamp asserter, COMPUTE every locked field (overriding any supplied
 * value). Draft-soft: may be created bare/ungrounded (ADR-0001). One cheap in-flow call.
 */
function cmdAddClaim(paths: StorePaths, parsed: Parsed): void {
  const text = first(parsed, "text");
  if (!text) fail("add-claim requires --text", 2);
  const provenance = parseProvenance(first(parsed, "provenance"));
  const time = isoNow();
  const asserter = stampAsserter(parsed, time);
  const config = readConfig(paths);

  // AGENT-ASSERTED handles.
  const evidenceArgs = (parsed.flags.evidence ?? []).map(parseEvidence);
  const refs: EvidenceRef[] = evidenceArgs.map((e) => ({ kind: e.kind, ref: e.ref }));
  // One evidence line carries all refs declared on this in-flow call (the Agent may later refine).
  const evidence_lines: EvidenceLine[] =
    refs.length > 0 ? [{ name: "evidence", refs }] : [];
  const depends_on_fork = (parsed.flags["depends-on-fork"] ?? []).map(parseFork);
  const contradicts = parsed.flags.contradicts ?? [];
  const inherits_caveat = parsed.flags["inherits-caveat"] ?? [];
  const estimand = first(parsed, "estimand");
  const deflation_route = first(parsed, "deflation-route");

  const id = mintId(paths, "claim", `${text}\n${asserter.who}\n${time}`);

  // CLI-COMPUTED / LOCKED fields (overriding any supplied value).
  const fingerprints = stampFingerprints(paths.hostRoot, refs, time, config.remote_host);

  const fm: ClaimFrontmatter = {
    type: "claim",
    text,
    ...(estimand ? { estimand } : {}),
    evidence_lines,
    depends_on_fork,
    contradicts,
    inherits_caveat,
    provenance,
    ...(deflation_route ? { deflation_route } : {}),
    id,
    asserter,
    reviewed_by: [],
    corroboration: "self-asserted",
    fingerprints,
    freshness: "unknown",
    reach_ground: refs.length > 0,
    lifecycle: "draft",
    resolution: "open",
    verification: "unverified",
  };
  // Lock freshness from the just-stamped fingerprints (the CLI never trusts a supplied value).
  const fr = computeFreshness([{ frontmatter: fm, body: "", path: "" }], paths.hostRoot, time, config.remote_host);
  fm.freshness = fr.get(id) ?? "unknown";

  const path = writeClaim(paths, fm, skeletonBody(fm));
  appendLog(paths, `- add-claim ${id} by ${asserter.who} at ${time} (${refs.length} evidence ref(s))`);
  console.log(`created ${id} (draft, ${refs.length} evidence ref(s), provenance=${provenance})`);
  console.log(path);
}

/** A skeleton claim body cueing the three required movements (Skill fills the prose). */
function skeletonBody(fm: ClaimFrontmatter): string {
  return [
    "## Conclusion, with its conditions",
    "",
    "<state the claim and the fork(s) it is conditional on, in prose>",
    "",
    "## The contradiction and the caveat",
    "",
    fm.contradicts.length > 0 || fm.inherits_caveat.length > 0
      ? "<for each contradicts / inherited caveat, explain why it matters>"
      : "<none declared>",
    "",
    "## What would change it",
    "",
    fm.deflation_route ?? "<the deflation route: what would shrink the residual uncertainty>",
  ].join("\n");
}

/** add-estimand — mint est-<hash>, stamp asserter, body = the natural-language definition. */
function cmdAddEstimand(paths: StorePaths, parsed: Parsed): void {
  const time = isoNow();
  const asserter = stampAsserter(parsed, time);
  const label = first(parsed, "label");
  const def = first(parsed, "def") ?? readStdinSync();
  if (!def.trim()) fail("add-estimand requires a definition via --def <str> or stdin", 2);
  const id = mintId(paths, "estimand", def);
  const fm: EstimandFrontmatter = {
    type: "estimand",
    id,
    asserter,
    ...(label ? { label } : {}),
  };
  const path = writeEstimand(paths, fm, def.trim());
  appendLog(paths, `- add-estimand ${id} by ${asserter.who} at ${time}`);
  console.log(id);
  console.log(path);
}

/** add-confound — mint cfd-<hash>, stamp asserter, set unerasable (default true), body = the caveat. */
function cmdAddConfound(paths: StorePaths, parsed: Parsed): void {
  const time = isoNow();
  const asserter = stampAsserter(parsed, time);
  const label = first(parsed, "label");
  // PINNED default true: unerasable unless explicitly --unerasable=false.
  const unerasable = parsed.bools.has("unerasable")
    ? true
    : first(parsed, "unerasable") === "false"
      ? false
      : true;
  const caveat = first(parsed, "caveat") ?? readStdinSync();
  if (!caveat.trim()) fail("add-confound requires a caveat via --caveat <str> or stdin", 2);
  const id = mintId(paths, "confound", caveat);
  const fm: ConfoundFrontmatter = {
    type: "confound",
    id,
    unerasable,
    asserter,
    ...(label ? { label } : {}),
  };
  const path = writeConfound(paths, fm, caveat.trim());
  appendLog(paths, `- add-confound ${id} by ${asserter.who} at ${time} (unerasable=${unerasable})`);
  console.log(id);
  console.log(path);
}

/**
 * review <claim> --by <asserter> [--note <str>] — append a review edge (set semantics, distinct by
 * asserter-id), then RE-DERIVE corroboration (Gate B). Corroboration rises to cross-reviewed only with
 * ≥2 distinct reviewers byte-distinct from the author. A modify whose stamped asserter differs from the
 * claim's author is a version event (log entry). The --note is carried, NEVER verified.
 */
function cmdReview(paths: StorePaths, parsed: Parsed): void {
  const id = parsed.positionals[0];
  if (!id) fail("review requires a claim id: cairn review <clm-id> --by <asserter>", 2);
  const by = first(parsed, "by");
  if (!by) fail("review requires --by <asserter-id>", 2);
  const note = first(parsed, "note");
  const claim = readClaim(paths, id);
  if (!claim) fail(`claim ${id} not found`, 2);

  const time = isoNow();
  const fm = claim.frontmatter;
  // Set semantics: distinct by asserter-id. A repeat review by the same id refreshes its edge.
  const edges: ReviewEdge[] = fm.reviewed_by.filter((e) => e.asserter !== by);
  const edge: ReviewEdge = { asserter: by, time, ...(note ? { note } : {}) };
  edges.push(edge);

  // Trust-field lock on EVERY write (c.6 / ADR-0004): re-lock verification/resolution/corroboration
  // against their derived values, so a hand-edited trust badge cannot survive a review write. liveIds
  // is the full live claim set (for the resolution lock).
  const liveIds = new Set(readAllClaims(paths).map((c) => c.frontmatter.id));
  const next: ClaimFrontmatter = relockTrustFields({ ...fm, reviewed_by: edges }, liveIds);

  // A modify whose stamped asserter differs from the claim's prior author is a VERSION event (PRD
  // story 18): the prior content is preserved and the modifying asserter re-stamped, never a silent
  // overwrite. A same-asserter review is a plain in-place rewrite.
  // review changes only CLI-owned fields (reviewed_by/corroboration), never authored content, so this
  // is a plain in-place rewrite that leaves authorship anchored to the original author — keeping the
  // corroboration author-exclusion sound. modifyClaim routes it as a non-version write.
  const writer = stampAsserterFor(by, time);
  const v = modifyClaim(paths, claim, next, claim.body, writer);
  appendLog(
    paths,
    `- review ${id} by ${by} at ${time} → corroboration=${next.corroboration}` +
      (v.versioned ? ` (version: prior preserved at ${v.priorPath})` : ""),
  );
  if (by === fm.asserter.who) {
    console.warn(`note: --by "${by}" equals the claim's own asserter; a self-review never raises corroboration`);
  }
  if (v.versioned) console.log(`version event: prior content preserved (different asserter) → ${v.priorPath}`);
  console.log(`reviewed ${id}: ${edges.length} reviewer(s), corroboration=${next.corroboration}`);
}

/**
 * refresh — recompute fingerprints + freshness across evidence lines, re-lock the fields, and rewrite
 * affected claim files; surfaces newly stale/unknown claims. `--claim <id>` scopes to one claim.
 */
function cmdRefresh(paths: StorePaths, parsed: Parsed): void {
  const claims = readAllClaims(paths);
  const config = readConfig(paths);
  const time = isoNow();
  const scope = first(parsed, "claim");

  // Recompute freshness by comparing each claim's STORED baseline fingerprint against the CURRENT
  // artifact (ADR-0002). refresh does NOT re-stamp the baseline — re-stamping would launder a moved
  // artifact into a false `fresh`, the exact enemy. The baseline is only (re)stamped at author time.
  const freshness = computeFreshness(claims, paths.hostRoot, time, config.remote_host);

  // Trust-field lock on EVERY write (c.6 / ADR-0004): refresh re-locks ALL CLI-computed fields, not
  // only freshness/reach_ground. A hand-edited verification:verified (agent-sourced), resolution:settled
  // (live contradicts), or corroboration:cross-reviewed (unsupported reviewer set) is overridden here —
  // the spec mandates the lock on every write verb, not only at validate/publish.
  const liveIds = new Set(claims.map((c) => c.frontmatter.id));

  let changed = 0;
  for (const c of claims) {
    const fm = c.frontmatter;
    if (scope && fm.id !== scope) continue;
    const next: ClaimFrontmatter = relockTrustFields(
      {
        ...fm,
        freshness: freshness.get(fm.id) ?? "unknown",
        reach_ground: isGrounded(fm),
      },
      liveIds,
    );
    // Recompute-only write (CLI-owned fields): never a version event, asserter unchanged.
    modifyClaim(paths, c, next, c.body, fm.asserter);
    changed++;
  }
  appendLog(paths, `- refresh ${scope ?? "(all)"} at ${time} (${changed} claim(s) re-checked)`);
  console.log(`refreshed ${changed} claim(s) @ ${time}`);
  const stale = claims
    .filter((c) => (scope ? c.frontmatter.id === scope : true))
    .filter((c) => {
      const f = freshness.get(c.frontmatter.id) ?? "unknown";
      return f === "stale" || f === "unknown";
    })
    .map((c) => `${c.frontmatter.id} [${freshness.get(c.frontmatter.id)}]`);
  if (stale.length > 0) {
    console.log(`stale/unknown (${stale.length}):`);
    for (const s of stale) console.log(`  ${s}`);
  }
}

/**
 * validate — run all gates over the candidate-canonical set. Exits non-zero (3) on any violation,
 * naming the gate + offending claim. Read-only (no writes). The promotion/publish precondition.
 */
function cmdValidate(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const gate = runGate(claims);
  // Combine the pure gate suite with referential integrity (cited estimand / inherited confound nodes
  // must exist) so `cairn validate` is the same precondition publish enforces — not a weaker one.
  const violations = [...gate.violations, ...referentialIntegrityViolations(paths, claims)];
  if (violations.length === 0) {
    console.log(
      `validate: OK — ${gate.candidateIds.length} grounded draft(s) would promote, no violations ` +
        `(gates + referential integrity)`,
    );
    process.exit(0);
  }
  console.error(`validate: FAILED — ${violations.length} gate violation(s):`);
  for (const v of violations) console.error(`  [${v.gate}] ${v.claim}: ${v.message}`);
  process.exit(3);
}

/** publish — validate, then freeze an immutable content-addressed OKF snapshot + append to log.md. */
function cmdPublish(paths: StorePaths): void {
  let result;
  try {
    result = publish(paths);
  } catch (e) {
    if (e instanceof PublishError) {
      console.error(`publish: ${e.message}`);
      process.exit(3);
    }
    throw e;
  }
  const { snapshotId, previousId, promoted, diff, reconcile: rec, reused } = result;
  console.log(`published snapshot ${snapshotId}${reused ? " (reused, no change)" : ""}`);
  console.log(`  previous: ${previousId ?? "(none — first publish)"}`);
  console.log(`  promoted draft→canonical: ${promoted.length}${promoted.length ? " (" + promoted.join(", ") + ")" : ""}`);
  console.log(
    `  since ${diff.against ?? "(none)"}: +${diff.counts.added} -${diff.counts.removed} ` +
      `text:${diff.counts.text_changed} fresh:${diff.counts.freshness_changed} ` +
      `verif:${diff.counts.verification_changed} resol:${diff.counts.resolution_changed}`,
  );
  console.log(`  bundle: ${join(paths.snapshotsDir, snapshotId)}/`);
  console.log(`  index:  ${paths.indexPath}`);
  console.log(`  log:    ${paths.logPath}`);
  console.log(`  reconcile: ${rec.configured ? `${rec.unreferenced.length} unreferenced conclusion-like line(s)` : "not configured"}`);
  if (rec.configured) for (const u of rec.unreferenced) console.log(`    ${u}`);
  console.log(`  ungrounded drafts: ${rec.ungroundedDrafts.length}${rec.ungroundedDrafts.length ? " (" + rec.ungroundedDrafts.join(", ") + ")" : ""}`);
}

/** drafts — list lifecycle:draft claims (ungrounded threads visible, not silently rotting). */
function cmdDrafts(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const drafts = claims.filter((c) => c.frontmatter.lifecycle === "draft");
  console.log(`drafts (${drafts.length}):`);
  for (const c of drafts) {
    const grounded = isGrounded(c.frontmatter);
    const est = c.frontmatter.estimand ? ` estimand=${c.frontmatter.estimand}` : "";
    console.log(`  ${c.frontmatter.id}  ${grounded ? "[grounded]" : "[UNGROUNDED]"}${est}  ${c.frontmatter.text}`);
  }
}

/** status — counts of draft/canonical, stale/unknown, open contradictions, draft backlog. */
function cmdStatus(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const now = isoNow();
  const config = readConfig(paths);
  const canonical = claims.filter((c) => c.frontmatter.lifecycle === "canonical");
  const drafts = claims.filter((c) => c.frontmatter.lifecycle === "draft");
  const ungrounded = drafts.filter((c) => !isGrounded(c.frontmatter)).length;

  const freshness = computeFreshness(claims, paths.hostRoot, now, config.remote_host);
  const canonicalIds = new Set(canonical.map((c) => c.frontmatter.id));
  const staleN = canonical.filter((c) => {
    const f = freshness.get(c.frontmatter.id) ?? "unknown";
    return f === "stale" || f === "unknown";
  }).length;
  // Open contradictions: live contradicts edges on canonical, open claims.
  let openContra = 0;
  for (const c of canonical) {
    if (c.frontmatter.resolution === "settled") continue;
    for (const cited of c.frontmatter.contradicts) if (canonicalIds.has(cited)) openContra++;
  }
  // Last snapshot from the log time spine.
  let lastSnapshot = "(none)";
  if (existsSync(paths.logPath)) {
    const ids = readFileSync(paths.logPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^- publish\s+([0-9a-f]+)\b/)?.[1])
      .filter(Boolean) as string[];
    if (ids.length > 0) lastSnapshot = ids[ids.length - 1] as string;
  }

  console.log(`store:                 ${paths.storeDir}`);
  console.log(`canonical:             ${canonical.length}`);
  console.log(`drafts:                ${drafts.length}`);
  console.log(`ungrounded drafts:     ${ungrounded}`);
  console.log(`stale/unknown canon:   ${staleN}`);
  console.log(`open contradictions:   ${openContra}`);
  console.log(`last snapshot:         ${lastSnapshot}`);
}

/** reconcile — warn-only: unreferenced conclusion-like lines in findings + ungrounded drafts. */
function cmdReconcile(paths: StorePaths, parsed: Parsed): void {
  const claims = readAllClaims(paths);
  let config = readConfig(paths);
  const override = first(parsed, "findings");
  if (override) config = { ...config, findings_globs: [override] };
  const rec = reconcile(paths.hostRoot, config, claims);
  console.log(`reconcile: ${rec.configured ? "configured" : "not configured"}`);
  console.log(`  unreferenced conclusion-like lines: ${rec.unreferenced.length}`);
  for (const u of rec.unreferenced) console.log(`    ${u}`);
  console.log(`  ungrounded drafts: ${rec.ungroundedDrafts.length}`);
  for (const d of rec.ungroundedDrafts) console.log(`    ${d}`);
}

/**
 * migrate --from <v1-store> — strip a v1 claim store to the new OKF skeleton. v1 claim files use a
 * fundamentally different schema (date-counter ids, grounding edges, no estimand/confound nodes); a
 * faithful field-by-field port would silently fabricate estimands and provenance. So v2 migration is
 * SKELETON-ONLY: it stands up the OKF bundle (claims/estimands/confounds + index.md/log.md) at the
 * target so the agent re-authors v1 conclusions as v2 claims (declaring estimands, provenance, etc.)
 * via the Skill — migration, not greenfield. We report what was found so nothing is silently dropped.
 */
function cmdMigrate(parsed: Parsed): void {
  const from = first(parsed, "from");
  if (!from) fail("migrate requires --from <v1-store>", 2);
  if (!existsSync(from)) fail(`v1 store "${from}" not found`, 2);
  const v1ClaimsDir = existsSync(join(from, "claims"))
    ? join(from, "claims")
    : existsSync(join(from, "cairn", "claims"))
      ? join(from, "cairn", "claims")
      : null;
  const v1Count = v1ClaimsDir
    ? readdirSync(v1ClaimsDir).filter((f) => f.endsWith(".md")).length
    : 0;

  const paths = resolveStoreForWrite();
  const time = isoNow();
  // Emit an empty orient surface + log header so the OKF skeleton is self-describing.
  if (!existsSync(paths.indexPath)) {
    writeFileSync(paths.indexPath, renderIndexMd({ canonical: [], contradictions: [], stale: [] }, time), "utf8");
  }
  appendLog(paths, `- migrate from ${from} at ${time} (${v1Count} v1 claim file(s) found; OKF skeleton ready)`);

  console.log(`migrated: OKF skeleton ready at ${paths.storeDir}`);
  console.log(`  v1 store:        ${from}`);
  console.log(`  v1 claim files:  ${v1Count} (NOT auto-ported — re-author as v2 claims via the Skill,`);
  console.log(`                   declaring estimand + provenance per conclusion; v1 had neither)`);
  console.log(`  next: cairn add-estimand … ; cairn add-claim --estimand … --provenance …`);
}

// ── version ───────────────────────────────────────────────────────────────────

function cmdVersion(): void {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  let pkgVersion = "?";
  try {
    pkgVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version ?? "?";
  } catch {
    /* ignore */
  }
  const git = (args: string[]): string => {
    const res = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
    return res.status === 0 ? res.stdout.trim() : "";
  };
  const commit = git(["rev-parse", "--short", "HEAD"]);
  const date = git(["log", "-1", "--format=%cs"]);
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]) ? "-dirty" : "";
  const gitPart = commit ? ` (${commit}${dirty}${date ? `, ${date}` : ""})` : "";
  console.log(`cairn ${pkgVersion}${gitPart}`);
}

// ── dispatch ──────────────────────────────────────────────────────────────────

function main(): void {
  const verb = process.argv[2];
  const rest = process.argv.slice(3);

  if (verb === "--version" || verb === "-v" || verb === "version") {
    cmdVersion();
    process.exit(0);
  }
  if (!verb || verb === "--help" || verb === "-h") {
    console.log("cairn — deterministic anti-laundering substrate over OKF (CLI is the sole writer)\n");
    console.log("usage: cairn <verb> [...args]\n");
    console.log(`verbs: ${VERBS.join(", ")}`);
    console.log("misc:  --version, --help");
    process.exit(verb ? 0 : 1);
  }
  if (!(VERBS as readonly string[]).includes(verb)) {
    fail(`unknown verb "${verb}". known: ${VERBS.join(", ")}`, 2);
  }

  const parsed = parseArgs(rest);

  try {
    switch (verb) {
      case "add-claim":
        cmdAddClaim(resolveStoreForWrite(), parsed);
        return;
      case "add-estimand":
        cmdAddEstimand(resolveStoreForWrite(), parsed);
        return;
      case "add-confound":
        cmdAddConfound(resolveStoreForWrite(), parsed);
        return;
      case "migrate":
        cmdMigrate(parsed);
        return;
      case "review":
        cmdReview(requireStore(), parsed);
        return;
      case "head":
        cmdHead(requireStore());
        return;
      case "refresh":
        cmdRefresh(requireStore(), parsed);
        return;
      case "validate":
        cmdValidate(requireStore());
        return;
      case "publish":
        cmdPublish(requireStore());
        return;
      case "drafts":
        cmdDrafts(requireStore());
        return;
      case "status":
        cmdStatus(requireStore());
        return;
      case "reconcile":
        cmdReconcile(requireStore(), parsed);
        return;
    }
  } catch (e) {
    if (e instanceof StoreError) fail((e as Error).message, 1);
    fail((e as Error).message, 4);
  }
}

main();
