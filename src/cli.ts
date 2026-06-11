#!/usr/bin/env bun
/**
 * Cairn CLI — the SOLE writer to the store. All 8 v1 verbs (CONTRACTS §8).
 *
 * Exit codes:
 *   0 ok · 1 usage/no-store · 2 unknown verb/bad args · 3 validate gate failed · 4 runtime error
 */

import { computeFreshness } from "./freshness.ts";
import { runGate } from "./gate.ts";
import { stampEdge } from "./fingerprint.ts";
import { canonicalFrontmatter, toPublishedClaim } from "./snapshot.ts";
import { publish, PublishError } from "./publish.ts";
import {
  allocateClaimId,
  isoNow,
  readAllClaims,
  readClaim,
  requireStore,
  resolveStoreForWrite,
  writeClaim,
} from "./store.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ClaimFrontmatter,
  DraftView,
  EvidenceArg,
  EvidenceKind,
  StorePaths,
} from "./types.ts";

const VERBS = ["head", "add-claim", "ground", "refresh", "validate", "publish", "drafts", "status"] as const;
const KINDS: EvidenceKind[] = ["target", "file", "data", "external"];

function fail(msg: string, code: number): never {
  console.error(`cairn: ${msg}`);
  process.exit(code);
}

/** Tiny argv parser: collects repeatable flags into string[] and positionals. */
interface Parsed {
  positionals: string[];
  flags: Record<string, string[]>;
}
function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        fail(`flag --${key} requires a value`, 2);
      }
      (flags[key] ??= []).push(next as string);
      i++;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function parseEvidence(spec: string): EvidenceArg {
  const idx = spec.indexOf(":");
  if (idx === -1) fail(`--evidence must be "kind:ref" (got "${spec}")`, 2);
  const kind = spec.slice(0, idx) as EvidenceKind;
  const ref = spec.slice(idx + 1);
  if (!KINDS.includes(kind)) fail(`unknown evidence kind "${kind}" (target|file|data|external)`, 2);
  if (!ref) fail(`--evidence "${spec}" has empty ref`, 2);
  return { kind, ref };
}

function fmtFreshness(f: { state: string; tier: string }): string {
  return `${f.state}/${f.tier}`;
}

// ── verbs ───────────────────────────────────────────────────────────────────

function cmdHead(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const now = isoNow();
  const freshness = computeFreshness(claims, paths.hostRoot, now);
  const canonical = canonicalFrontmatter(claims);

  console.log(`canonical (${canonical.length}):`);
  for (const fm of canonical) {
    const fr = freshness.get(fm.id)!;
    const pc = toPublishedClaim(fm, fr);
    console.log(`  ${pc.id}  [${fmtFreshness(fr)}] [${pc.verification}]  ${pc.text}`);
  }
  const drafts: DraftView[] = claims
    .filter((c) => c.frontmatter.status === "draft")
    .map((c) => ({ id: c.frontmatter.id, text: c.frontmatter.text, grounded: c.frontmatter.grounding.length > 0 }));
  console.log(`\ndrafts (${drafts.length}):`);
  for (const d of drafts) {
    console.log(`  ${d.id}  ${d.grounded ? "[grounded]" : "[UNGROUNDED]"}  ${d.text}`);
  }

  // Write cairn/head.json (canonical only) — convenience refresh of the published head shape.
  const published = canonical.map((fm) => toPublishedClaim(fm, freshness.get(fm.id)!));
  const headJson = {
    schema: "cairn.head/1" as const,
    snapshot: { current: "", previous: null },
    published_at: now,
    claims: published,
  };
  Bun.write(paths.headJsonPath, JSON.stringify(headJson, null, 2) + "\n");
}

function cmdAddClaim(paths: StorePaths, parsed: Parsed): void {
  const text = parsed.flags.text?.[0];
  if (!text) fail("add-claim requires --text", 2);
  const id = allocateClaimId(paths);
  const grounding = (parsed.flags.evidence ?? []).map((spec) => {
    const ev = parseEvidence(spec);
    return stampEdge(paths.hostRoot, ev.kind, ev.ref);
  });
  const depends_on = parsed.flags["depends-on"] ?? [];
  const fm: ClaimFrontmatter = {
    id,
    text,
    status: "draft",
    verification: "unverified",
    grounding,
    depends_on,
    created_at: isoNow(),
  };
  const path = writeClaim(paths, fm);
  console.log(`created ${id} (draft, ${grounding.length} grounding, ${depends_on.length} deps)`);
  console.log(path);
}

function cmdGround(paths: StorePaths, parsed: Parsed): void {
  const id = parsed.positionals[0];
  if (!id) fail("ground requires a claim id: cairn ground <id> --evidence kind:ref", 2);
  const claim = readClaim(paths, id);
  if (!claim) fail(`claim ${id} not found`, 2);
  const specs = parsed.flags.evidence ?? [];
  if (specs.length === 0) fail("ground requires at least one --evidence kind:ref", 2);
  const newEdges = specs.map((spec) => {
    const ev = parseEvidence(spec);
    return stampEdge(paths.hostRoot, ev.kind, ev.ref);
  });
  const fm: ClaimFrontmatter = {
    ...claim!.frontmatter,
    grounding: [...claim!.frontmatter.grounding, ...newEdges],
  };
  writeClaim(paths, fm, claim!.body);
  console.log(`grounded ${id}: +${newEdges.length} edge(s), now ${fm.grounding.length} total`);
}

function cmdRefresh(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const now = isoNow();
  const freshness = computeFreshness(claims, paths.hostRoot, now);
  const canonical = canonicalFrontmatter(claims);
  console.log(`refreshed freshness for ${canonical.length} canonical claim(s) @ ${now}`);
  for (const fm of canonical) {
    const fr = freshness.get(fm.id)!;
    console.log(`  ${fm.id}  [${fmtFreshness(fr)}]  ${fm.text}`);
  }
  const published = canonical.map((fm) => toPublishedClaim(fm, freshness.get(fm.id)!));
  Bun.write(
    paths.headJsonPath,
    JSON.stringify({ schema: "cairn.head/1", snapshot: { current: "", previous: null }, published_at: now, claims: published }, null, 2) + "\n",
  );
}

function cmdValidate(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const gate = runGate(claims);
  if (gate.ok) {
    console.log(`validate: OK — ${gate.candidateIds.length} grounded draft(s) would promote, no offenders`);
    process.exit(0);
  }
  console.error(`validate: FAILED — these candidates cannot reach ground (cycles/ungrounded deps):`);
  for (const id of gate.offenders) console.error(`  ${id}`);
  process.exit(3);
}

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
  console.log(`  promoted draft->canonical: ${promoted.length}${promoted.length ? " (" + promoted.join(", ") + ")" : ""}`);
  console.log(
    `  since ${diff.against ?? "(none)"}: +${diff.counts.added} -${diff.counts.removed} ` +
      `text:${diff.counts.text_changed} fresh:${diff.counts.freshness_changed} verif:${diff.counts.verification_changed}`,
  );
  console.log(`  head.json: ${paths.headJsonPath}`);
  console.log(`  share link: ${paths.publishedLatestDir}/`);
  console.log(`  reconcile: ${rec.configured ? `${rec.unreferenced.length} unreferenced conclusion-like line(s)` : "not configured"}`);
  if (rec.configured) for (const u of rec.unreferenced) console.log(`    ${u}`);
  console.log(`  ungrounded drafts: ${rec.ungroundedDrafts.length}${rec.ungroundedDrafts.length ? " (" + rec.ungroundedDrafts.join(", ") + ")" : ""}`);
}

function cmdDrafts(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const drafts = claims.filter((c) => c.frontmatter.status === "draft");
  console.log(`drafts (${drafts.length}):`);
  for (const c of drafts) {
    const grounded = c.frontmatter.grounding.length > 0;
    console.log(`  ${c.frontmatter.id}  ${grounded ? "[grounded]" : "[UNGROUNDED]"}  ${c.frontmatter.text}`);
  }
}

function cmdStatus(paths: StorePaths): void {
  const claims = readAllClaims(paths);
  const canonical = claims.filter((c) => c.frontmatter.status === "canonical").length;
  const drafts = claims.filter((c) => c.frontmatter.status === "draft");
  const ungrounded = drafts.filter((c) => c.frontmatter.grounding.length === 0).length;
  // Read the last snapshot id from published/latest/data/head.json — the DURABLE lineage source
  // publish trusts (publish.ts readPreviousHead). cairn/head.json is NOT used here: `head` and
  // `refresh` clobber it with snapshot.current="" (they are read-only re: lineage), so reading it
  // would report "(none)" right after a real publish. latest/ only ever holds a published head.
  let lastSnapshot = "(none)";
  const latestHead = join(paths.publishedLatestDir, "data", "head.json");
  if (existsSync(latestHead)) {
    try {
      const h = JSON.parse(readFileSync(latestHead, "utf8"));
      if (h?.snapshot?.current) lastSnapshot = h.snapshot.current;
    } catch {
      /* ignore */
    }
  }
  console.log(`store:        ${paths.storeDir}`);
  console.log(`canonical:    ${canonical}`);
  console.log(`drafts:       ${drafts.length}`);
  console.log(`ungrounded:   ${ungrounded}`);
  console.log(`last snapshot: ${lastSnapshot}`);
}

// ── dispatch ──────────────────────────────────────────────────────────────────

function main(): void {
  const verb = process.argv[2];
  const rest = process.argv.slice(3);

  if (!verb || verb === "--help" || verb === "-h") {
    console.log("cairn — local claim-graph store (CLI is the sole writer)\n");
    console.log("usage: cairn <verb> [...args]\n");
    console.log(`verbs: ${VERBS.join(", ")}`);
    process.exit(verb ? 0 : 1);
  }
  if (!(VERBS as readonly string[]).includes(verb)) {
    fail(`unknown verb "${verb}". known: ${VERBS.join(", ")}`, 2);
  }

  const parsed = parseArgs(rest);

  try {
    if (verb === "add-claim") {
      cmdAddClaim(resolveStoreForWrite(), parsed);
      return;
    }
    if (verb === "ground") {
      cmdGround(requireStore(), parsed);
      return;
    }
    const paths = requireStore();
    switch (verb) {
      case "head":
        cmdHead(paths);
        return;
      case "refresh":
        cmdRefresh(paths);
        return;
      case "validate":
        cmdValidate(paths);
        return;
      case "publish":
        cmdPublish(paths);
        return;
      case "drafts":
        cmdDrafts(paths);
        return;
      case "status":
        cmdStatus(paths);
        return;
    }
  } catch (e) {
    fail((e as Error).message, 4);
  }
}

main();
