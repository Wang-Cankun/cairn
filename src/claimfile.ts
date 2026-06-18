/**
 * claimfile.ts — parse / serialize / validate an OKF concept-node file (markdown + YAML frontmatter)
 * for all three node types: claim, estimand, confound.
 *
 * The on-disk file is the SOURCE OF TRUTH (ADR-0003). Each file is a YAML frontmatter HANDLE (the
 * machine-actionable fields the next agent scans cheaply) plus a markdown BODY (the natural-language
 * meaning / reasoning the agent drills into only when needed). The CLI acts on the handle; it never
 * parses the body for meaning, and no frontmatter value is duplicated verbatim in the body
 * (scan-cheap / drill-deep separation, PRD story 31).
 *
 * Field ownership is enforced only at the schema level here (types + enum membership). The
 * trust-field LOCK (overriding agent-supplied CLI-computed values) is applied by the writer/CLI, not
 * by this parser — this module faithfully parses whatever is on disk and validates its shape.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  Asserter,
  ClaimFile,
  ClaimFrontmatter,
  ConfoundFile,
  ConfoundFrontmatter,
  Corroboration,
  EstimandFile,
  EstimandFrontmatter,
  EvidenceKind,
  EvidenceLine,
  EvidenceRef,
  Fingerprint,
  FingerprintTier,
  ForkChoice,
  Lifecycle,
  NodeFile,
  Provenance,
  Resolution,
  ReviewEdge,
  Verification,
} from "./types.ts";
import {
  CORROBORATIONS,
  EVIDENCE_KINDS,
  FINGERPRINT_TIERS,
  ID_PREFIX,
  LIFECYCLES,
  PROVENANCES,
  RESOLUTIONS,
  VERIFICATIONS,
} from "./types.ts";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Id shape: `<prefix><hash>` where hash is lowercase hex (collision-extension allowed ⇒ length≥). */
const CLAIM_ID_RE = new RegExp(`^${ID_PREFIX.claim}[0-9a-f]+$`);
const ESTIMAND_ID_RE = new RegExp(`^${ID_PREFIX.estimand}[0-9a-f]+$`);
const CONFOUND_ID_RE = new RegExp(`^${ID_PREFIX.confound}[0-9a-f]+$`);

export class ClaimFileError extends Error {}

// ──────────────────────────────────────────────────────────────────────────────
// Small validation helpers
// ──────────────────────────────────────────────────────────────────────────────

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function requireStr(o: Record<string, unknown>, key: string, ctx: string): string {
  const v = o[key];
  if (!isStr(v) || v.length === 0) {
    throw new ClaimFileError(`${ctx}: missing or non-string "${key}"`);
  }
  return v;
}

function optStr(o: Record<string, unknown>, key: string, ctx: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (!isStr(v)) throw new ClaimFileError(`${ctx}: "${key}" must be a string`);
  return v;
}

function requireBool(o: Record<string, unknown>, key: string, ctx: string): boolean {
  const v = o[key];
  if (typeof v !== "boolean") throw new ClaimFileError(`${ctx}: "${key}" must be a boolean`);
  return v;
}

function obj(raw: unknown, ctx: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ClaimFileError(`${ctx}: not a YAML mapping`);
  }
  return raw as Record<string, unknown>;
}

function arr(o: Record<string, unknown>, key: string, ctx: string): unknown[] {
  const v = o[key] ?? [];
  if (!Array.isArray(v)) throw new ClaimFileError(`${ctx}: "${key}" must be an array`);
  return v;
}

function inEnum<T extends string>(value: string, allowed: readonly T[], ctx: string, key: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ClaimFileError(`${ctx}: "${key}" invalid: "${value}" (allowed: ${allowed.join(", ")})`);
  }
  return value as T;
}

function parseAsserter(raw: unknown, ctx: string): Asserter {
  const o = obj(raw, `${ctx}.asserter`);
  return {
    who: requireStr(o, "who", `${ctx}.asserter`),
    model: requireStr(o, "model", `${ctx}.asserter`),
    session: requireStr(o, "session", `${ctx}.asserter`),
    time: requireStr(o, "time", `${ctx}.asserter`),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Claim sub-shape parsers
// ──────────────────────────────────────────────────────────────────────────────

function parseEvidenceRef(raw: unknown, ctx: string): EvidenceRef {
  const o = obj(raw, ctx);
  const kind = requireStr(o, "kind", ctx);
  return {
    kind: inEnum<EvidenceKind>(kind, EVIDENCE_KINDS, ctx, "kind"),
    ref: requireStr(o, "ref", ctx),
  };
}

function parseEvidenceLine(raw: unknown, i: number): EvidenceLine {
  const ctx = `evidence_lines[${i}]`;
  const o = obj(raw, ctx);
  const refs = arr(o, "refs", ctx).map((r, j) => parseEvidenceRef(r, `${ctx}.refs[${j}]`));
  return { name: requireStr(o, "name", ctx), refs };
}

function parseForkChoice(raw: unknown, i: number): ForkChoice {
  const ctx = `depends_on_fork[${i}]`;
  // Accept either the structured {axis,choice} or the raw `axis=choice` string for resilience.
  if (isStr(raw)) {
    const eq = raw.indexOf("=");
    if (eq <= 0 || eq === raw.length - 1) {
      throw new ClaimFileError(`${ctx}: "${raw}" must be axis=choice with non-empty parts`);
    }
    return { axis: raw.slice(0, eq), choice: raw.slice(eq + 1) };
  }
  const o = obj(raw, ctx);
  const axis = requireStr(o, "axis", ctx);
  const choice = requireStr(o, "choice", ctx);
  return { axis, choice };
}

function parseReviewEdge(raw: unknown, i: number): ReviewEdge {
  const ctx = `reviewed_by[${i}]`;
  const o = obj(raw, ctx);
  const edge: ReviewEdge = {
    asserter: requireStr(o, "asserter", ctx),
    time: requireStr(o, "time", ctx),
  };
  const note = optStr(o, "note", ctx);
  if (note !== undefined) edge.note = note;
  return edge;
}

function parseFingerprint(raw: unknown, i: number): Fingerprint {
  const ctx = `fingerprints[${i}]`;
  const o = obj(raw, ctx);
  const tier = inEnum<FingerprintTier>(requireStr(o, "tier", ctx), FINGERPRINT_TIERS, ctx, "tier");
  const rawValue = o.value;
  let value: string | null;
  if (rawValue === null || rawValue === undefined) value = null;
  else if (isStr(rawValue)) value = rawValue;
  else throw new ClaimFileError(`${ctx}: "value" must be a string or null`);
  if (tier === "unknown" && value !== null) {
    throw new ClaimFileError(`${ctx}: tier "unknown" must have null value`);
  }
  return { ref: requireStr(o, "ref", ctx), tier, value, taken_at: requireStr(o, "taken_at", ctx) };
}

function strList(o: Record<string, unknown>, key: string): string[] {
  return arr(o, key, key).map((v, i) => {
    if (!isStr(v)) throw new ClaimFileError(`${key}[${i}] is not a string`);
    return v;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Frontmatter validators (one per node type)
// ──────────────────────────────────────────────────────────────────────────────

/** Validate + coerce a parsed YAML mapping into a ClaimFrontmatter. */
export function validateClaimFrontmatter(raw: unknown): ClaimFrontmatter {
  const o = obj(raw, "claim frontmatter");
  const id = requireStr(o, "id", "claim frontmatter");
  if (!CLAIM_ID_RE.test(id)) {
    throw new ClaimFileError(`claim id "${id}" must match ${ID_PREFIX.claim}<hex>`);
  }

  const evidence_lines = arr(o, "evidence_lines", "claim frontmatter").map(parseEvidenceLine);
  const depends_on_fork = arr(o, "depends_on_fork", "claim frontmatter").map(parseForkChoice);
  const contradicts = strList(o, "contradicts");
  const inherits_caveat = strList(o, "inherits_caveat");
  const reviewed_by = arr(o, "reviewed_by", "claim frontmatter").map(parseReviewEdge);
  const fingerprints = arr(o, "fingerprints", "claim frontmatter").map(parseFingerprint);

  const fm: ClaimFrontmatter = {
    type: "claim",
    text: requireStr(o, "text", "claim frontmatter"),
    evidence_lines,
    depends_on_fork,
    contradicts,
    inherits_caveat,
    provenance: inEnum<Provenance>(
      requireStr(o, "provenance", "claim frontmatter"),
      PROVENANCES,
      "claim frontmatter",
      "provenance",
    ),
    id,
    asserter: parseAsserter(o.asserter, "claim frontmatter"),
    reviewed_by,
    corroboration: inEnum<Corroboration>(
      requireStr(o, "corroboration", "claim frontmatter"),
      CORROBORATIONS,
      "claim frontmatter",
      "corroboration",
    ),
    fingerprints,
    freshness: inEnum(requireStr(o, "freshness", "claim frontmatter"), ["fresh", "stale", "unknown"] as const, "claim frontmatter", "freshness"),
    reach_ground: requireBool(o, "reach_ground", "claim frontmatter"),
    lifecycle: inEnum<Lifecycle>(requireStr(o, "lifecycle", "claim frontmatter"), LIFECYCLES, "claim frontmatter", "lifecycle"),
    resolution: inEnum<Resolution>(requireStr(o, "resolution", "claim frontmatter"), RESOLUTIONS, "claim frontmatter", "resolution"),
    verification: inEnum<Verification>(
      requireStr(o, "verification", "claim frontmatter"),
      VERIFICATIONS,
      "claim frontmatter",
      "verification",
    ),
  };

  const estimand = optStr(o, "estimand", "claim frontmatter");
  if (estimand !== undefined) {
    if (!ESTIMAND_ID_RE.test(estimand)) {
      throw new ClaimFileError(`claim estimand "${estimand}" must match ${ID_PREFIX.estimand}<hex>`);
    }
    fm.estimand = estimand;
  }
  const deflation_route = optStr(o, "deflation_route", "claim frontmatter");
  if (deflation_route !== undefined) fm.deflation_route = deflation_route;

  for (const [i, c] of contradicts.entries()) {
    if (!CLAIM_ID_RE.test(c)) throw new ClaimFileError(`contradicts[${i}] "${c}" must be a claim id`);
  }
  for (const [i, c] of inherits_caveat.entries()) {
    if (!CONFOUND_ID_RE.test(c)) throw new ClaimFileError(`inherits_caveat[${i}] "${c}" must be a confound id`);
  }
  return fm;
}

/** Validate + coerce a parsed YAML mapping into an EstimandFrontmatter (NO E/N/U field). */
export function validateEstimandFrontmatter(raw: unknown): EstimandFrontmatter {
  const o = obj(raw, "estimand frontmatter");
  const id = requireStr(o, "id", "estimand frontmatter");
  if (!ESTIMAND_ID_RE.test(id)) {
    throw new ClaimFileError(`estimand id "${id}" must match ${ID_PREFIX.estimand}<hex>`);
  }
  const fm: EstimandFrontmatter = {
    type: "estimand",
    id,
    asserter: parseAsserter(o.asserter, "estimand frontmatter"),
  };
  const label = optStr(o, "label", "estimand frontmatter");
  if (label !== undefined) fm.label = label;
  return fm;
}

/** Validate + coerce a parsed YAML mapping into a ConfoundFrontmatter. */
export function validateConfoundFrontmatter(raw: unknown): ConfoundFrontmatter {
  const o = obj(raw, "confound frontmatter");
  const id = requireStr(o, "id", "confound frontmatter");
  if (!CONFOUND_ID_RE.test(id)) {
    throw new ClaimFileError(`confound id "${id}" must match ${ID_PREFIX.confound}<hex>`);
  }
  const fm: ConfoundFrontmatter = {
    type: "confound",
    id,
    unerasable: requireBool(o, "unerasable", "confound frontmatter"),
    asserter: parseAsserter(o.asserter, "confound frontmatter"),
  };
  const label = optStr(o, "label", "confound frontmatter");
  if (label !== undefined) fm.label = label;
  return fm;
}

// ──────────────────────────────────────────────────────────────────────────────
// File parsing (split frontmatter from body, dispatch by `type`)
// ──────────────────────────────────────────────────────────────────────────────

function splitFile(rawText: string, path: string): { yamlText: string; body: string; type: string } {
  const m = rawText.match(FRONTMATTER_RE);
  if (!m) throw new ClaimFileError(`${path}: no YAML frontmatter (--- ... --- block) found`);
  const yamlText = m[1] ?? "";
  const body = m[2] ?? "";
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (e) {
    throw new ClaimFileError(`${path}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ClaimFileError(`${path}: frontmatter is not a YAML mapping`);
  }
  const type = (parsed as Record<string, unknown>).type;
  if (!isStr(type)) throw new ClaimFileError(`${path}: frontmatter missing string "type" discriminator`);
  return { yamlText, body, type };
}

/** Parse a node file, dispatching on the `type` discriminator. */
export function parseNodeFile(rawText: string, path: string): NodeFile {
  const m = rawText.match(FRONTMATTER_RE);
  if (!m) throw new ClaimFileError(`${path}: no YAML frontmatter (--- ... --- block) found`);
  const body = m[2] ?? "";
  let parsed: unknown;
  try {
    parsed = parseYaml(m[1] ?? "");
  } catch (e) {
    throw new ClaimFileError(`${path}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  const type = (parsed as Record<string, unknown> | null)?.type;
  switch (type) {
    case "claim":
      return { frontmatter: validateClaimFrontmatter(parsed), body, path };
    case "estimand":
      return { frontmatter: validateEstimandFrontmatter(parsed), body, path };
    case "confound":
      return { frontmatter: validateConfoundFrontmatter(parsed), body, path };
    default:
      throw new ClaimFileError(`${path}: unknown or missing node type "${String(type)}"`);
  }
}

/** Parse a claim file; throws if the file is not a `type: claim` node. */
export function parseClaimFile(rawText: string, path: string): ClaimFile {
  const node = parseNodeFile(rawText, path);
  if (node.frontmatter.type !== "claim") {
    throw new ClaimFileError(`${path}: expected a claim file, got type "${node.frontmatter.type}"`);
  }
  return { frontmatter: node.frontmatter, body: node.body, path: node.path };
}

/** Parse an estimand file; throws if the file is not a `type: estimand` node. */
export function parseEstimandFile(rawText: string, path: string): EstimandFile {
  const node = parseNodeFile(rawText, path);
  if (node.frontmatter.type !== "estimand") {
    throw new ClaimFileError(`${path}: expected an estimand file, got type "${node.frontmatter.type}"`);
  }
  return { frontmatter: node.frontmatter, body: node.body, path: node.path };
}

/** Parse a confound file; throws if the file is not a `type: confound` node. */
export function parseConfoundFile(rawText: string, path: string): ConfoundFile {
  const node = parseNodeFile(rawText, path);
  if (node.frontmatter.type !== "confound") {
    throw new ClaimFileError(`${path}: expected a confound file, got type "${node.frontmatter.type}"`);
  }
  return { frontmatter: node.frontmatter, body: node.body, path: node.path };
}

// ──────────────────────────────────────────────────────────────────────────────
// Serialization (fixed contract key order; handle in frontmatter, narrative in body)
// ──────────────────────────────────────────────────────────────────────────────

function emit(ordered: Record<string, unknown>, body: string): string {
  const yamlText = stringifyYaml(ordered, { lineWidth: 0 }).trimEnd();
  const trimmedBody = body.replace(/^\r?\n+/, "").replace(/\s+$/, "");
  const bodyPart = trimmedBody.length > 0 ? `\n${trimmedBody}\n` : "\n";
  return `---\n${yamlText}\n---\n${bodyPart}`;
}

/**
 * Serialize a claim. Key order follows the ClaimFrontmatter declaration order (CONTRACT note 3):
 * type, text, estimand, evidence_lines, depends_on_fork, contradicts, inherits_caveat, provenance,
 * deflation_route, id, asserter, reviewed_by, corroboration, fingerprints, freshness, reach_ground,
 * lifecycle, resolution, verification. This order must stay aligned with the snapshot-id input
 * builder and the SQLite index inserts. Optional fields are emitted only when present.
 */
export function serializeClaimFile(fm: ClaimFrontmatter, body = ""): string {
  const ordered: Record<string, unknown> = { type: fm.type, text: fm.text };
  if (fm.estimand !== undefined) ordered.estimand = fm.estimand;
  ordered.evidence_lines = fm.evidence_lines.map((l) => ({
    name: l.name,
    refs: l.refs.map((r) => ({ kind: r.kind, ref: r.ref })),
  }));
  ordered.depends_on_fork = fm.depends_on_fork.map((f) => ({ axis: f.axis, choice: f.choice }));
  ordered.contradicts = fm.contradicts;
  ordered.inherits_caveat = fm.inherits_caveat;
  ordered.provenance = fm.provenance;
  if (fm.deflation_route !== undefined) ordered.deflation_route = fm.deflation_route;
  ordered.id = fm.id;
  ordered.asserter = { who: fm.asserter.who, model: fm.asserter.model, session: fm.asserter.session, time: fm.asserter.time };
  ordered.reviewed_by = fm.reviewed_by.map((r) => {
    const e: Record<string, unknown> = { asserter: r.asserter, time: r.time };
    if (r.note !== undefined) e.note = r.note;
    return e;
  });
  ordered.corroboration = fm.corroboration;
  ordered.fingerprints = fm.fingerprints.map((f) => ({ ref: f.ref, tier: f.tier, value: f.value, taken_at: f.taken_at }));
  ordered.freshness = fm.freshness;
  ordered.reach_ground = fm.reach_ground;
  ordered.lifecycle = fm.lifecycle;
  ordered.resolution = fm.resolution;
  ordered.verification = fm.verification;
  return emit(ordered, body);
}

/** Serialize an estimand. Body = the natural-language definition. */
export function serializeEstimandFile(fm: EstimandFrontmatter, body = ""): string {
  const ordered: Record<string, unknown> = { type: fm.type, id: fm.id };
  if (fm.label !== undefined) ordered.label = fm.label;
  ordered.asserter = { who: fm.asserter.who, model: fm.asserter.model, session: fm.asserter.session, time: fm.asserter.time };
  return emit(ordered, body);
}

/** Serialize a confound. Body = the unerasable caveat. */
export function serializeConfoundFile(fm: ConfoundFrontmatter, body = ""): string {
  const ordered: Record<string, unknown> = { type: fm.type, id: fm.id, unerasable: fm.unerasable };
  if (fm.label !== undefined) ordered.label = fm.label;
  ordered.asserter = { who: fm.asserter.who, model: fm.asserter.model, session: fm.asserter.session, time: fm.asserter.time };
  return emit(ordered, body);
}

// ──────────────────────────────────────────────────────────────────────────────
// Convenience
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A claim is "grounded" (has the structural prerequisite for reach-ground) iff it carries >=1
 * evidence ref across its evidence lines. The full transitive reach-ground query lives in gate.ts;
 * this is the local, single-claim check.
 */
export function isGrounded(fm: ClaimFrontmatter): boolean {
  return fm.evidence_lines.some((l) => l.refs.length > 0);
}
