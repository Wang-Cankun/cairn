/**
 * claimfile.ts — parse / serialize a claim file (markdown + YAML frontmatter), and validate its
 * shape. The claim file is the SOURCE OF TRUTH (ADR-0003). There is deliberately NO freshness
 * field (ADR-0002).
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ClaimFile,
  ClaimFrontmatter,
  ClaimStatus,
  EvidenceKind,
  FingerprintMethod,
  GroundingEdge,
  Verification,
} from "./types.ts";

const STATUSES: ClaimStatus[] = ["draft", "canonical"];
const VERIFICATIONS: Verification[] = ["unverified", "verified", "contradicted", "unverifiable"];
const KINDS: EvidenceKind[] = ["target", "file", "data", "external"];
const METHODS: FingerprintMethod[] = ["pipeline-meta", "sha256", "size-mtime", "remote-md5"];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class ClaimFileError extends Error {}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function requireStr(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (!isStr(v) || v.length === 0) {
    throw new ClaimFileError(`claim frontmatter: missing or non-string "${key}"`);
  }
  return v;
}

function parseGroundingEdge(raw: unknown, i: number): GroundingEdge {
  if (typeof raw !== "object" || raw === null) {
    throw new ClaimFileError(`grounding[${i}] is not an object`);
  }
  const o = raw as Record<string, unknown>;
  const kind = requireStr(o, "kind");
  const method = requireStr(o, "method");
  if (!KINDS.includes(kind as EvidenceKind)) {
    throw new ClaimFileError(`grounding[${i}].kind invalid: "${kind}"`);
  }
  if (!METHODS.includes(method as FingerprintMethod)) {
    throw new ClaimFileError(`grounding[${i}].method invalid: "${method}"`);
  }
  return {
    kind: kind as EvidenceKind,
    ref: requireStr(o, "ref"),
    fingerprint: requireStr(o, "fingerprint"),
    method: method as FingerprintMethod,
    location: requireStr(o, "location"),
  };
}

/** Validate + coerce a parsed YAML object into a ClaimFrontmatter. Throws ClaimFileError. */
export function validateFrontmatter(raw: unknown): ClaimFrontmatter {
  if (typeof raw !== "object" || raw === null) {
    throw new ClaimFileError("frontmatter is not a YAML mapping");
  }
  const o = raw as Record<string, unknown>;

  const id = requireStr(o, "id");
  if (!/^claim-\d{8}-\d{3}$/.test(id)) {
    throw new ClaimFileError(`id "${id}" must match claim-YYYYMMDD-NNN`);
  }
  const text = requireStr(o, "text");
  const status = requireStr(o, "status");
  if (!STATUSES.includes(status as ClaimStatus)) {
    throw new ClaimFileError(`status invalid: "${status}"`);
  }
  const verification = requireStr(o, "verification");
  if (!VERIFICATIONS.includes(verification as Verification)) {
    throw new ClaimFileError(`verification invalid: "${verification}"`);
  }

  const groundingRaw = o.grounding ?? [];
  if (!Array.isArray(groundingRaw)) {
    throw new ClaimFileError("grounding must be an array");
  }
  const grounding = groundingRaw.map(parseGroundingEdge);

  const dependsRaw = o.depends_on ?? [];
  if (!Array.isArray(dependsRaw)) {
    throw new ClaimFileError("depends_on must be an array");
  }
  const depends_on = dependsRaw.map((d, i) => {
    if (!isStr(d)) throw new ClaimFileError(`depends_on[${i}] is not a string`);
    return d;
  });

  const created_at = requireStr(o, "created_at");

  return {
    id,
    text,
    status: status as ClaimStatus,
    verification: verification as Verification,
    grounding,
    depends_on,
    created_at,
  };
}

/** Parse raw file text into a ClaimFile. `path` is recorded for runtime convenience. */
export function parseClaimFile(rawText: string, path: string): ClaimFile {
  const m = rawText.match(FRONTMATTER_RE);
  if (!m) {
    throw new ClaimFileError(`${path}: no YAML frontmatter (--- ... --- block) found`);
  }
  const yamlText = m[1] ?? "";
  const body = m[2] ?? "";
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (e) {
    throw new ClaimFileError(`${path}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  const frontmatter = validateFrontmatter(parsed);
  return { frontmatter, body, path };
}

/**
 * Serialize a ClaimFrontmatter (+ optional body) back to claim-file text. Keys are emitted in a
 * stable, contract order so claim files have deterministic, diff-friendly content.
 */
export function serializeClaimFile(fm: ClaimFrontmatter, body = ""): string {
  // Build an ordered plain object; yaml.stringify preserves insertion order.
  const ordered: Record<string, unknown> = {
    id: fm.id,
    text: fm.text,
    status: fm.status,
    verification: fm.verification,
    grounding: fm.grounding.map((g) => ({
      kind: g.kind,
      ref: g.ref,
      fingerprint: g.fingerprint,
      method: g.method,
      location: g.location,
    })),
    depends_on: fm.depends_on,
    created_at: fm.created_at,
  };
  const yamlText = stringifyYaml(ordered, { lineWidth: 0 }).trimEnd();
  const trimmedBody = body.replace(/^\r?\n+/, "").replace(/\s+$/, "");
  const bodyPart = trimmedBody.length > 0 ? `\n${trimmedBody}\n` : "\n";
  return `---\n${yamlText}\n---\n${bodyPart}`;
}

/** Convenience: a claim is "grounded" iff it has >=1 grounding edge. */
export function isGrounded(fm: ClaimFrontmatter): boolean {
  return fm.grounding.length > 0;
}
