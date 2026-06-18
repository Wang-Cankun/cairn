/**
 * index.ts — build the DERIVED, throwaway SQLite index (bun:sqlite, in-memory) from claim files.
 *
 * The DB is NEVER the source of truth (ADR-0003) and is never part of the portable OKF bundle; it is
 * rebuilt on demand and discarded after the command. The v2 gates (gate.ts) operate directly on
 * `ClaimFile[]` in pure TypeScript — the v2 schema carries no claim→claim dependency edge, so no
 * recursive reach-ground CTE is required. This module remains as a convenient RELATIONAL VIEW of the
 * graph for ad-hoc queries / future tooling, not as a dependency of any gate.
 *
 * Tables (v2 schema):
 *   claim(id, text, lifecycle, verification, resolution, corroboration, provenance, freshness, reach_ground)
 *   claim_evidence(claim_id, line, kind, ref)   — one row per evidence ref (flattened over lines)
 *   claim_contradicts(claim_id, contradicts)    — one row per contradicts edge
 *   claim_caveat(claim_id, confound)            — one row per inherited confound caveat
 */

import { Database } from "bun:sqlite";
import type { ClaimFile } from "./types.ts";

/** In-memory status override for a claim (used when a caller wants to mark a candidate set). */
export type ClaimRowStatus = "draft" | "canonical" | "canonical-candidate";

/**
 * Build an in-memory derived index from claim files.
 *
 * `candidateOverride`, when given, maps a claim id to an in-memory `lifecycle` override (e.g. mark a
 * grounded draft as `canonical-candidate`) WITHOUT touching disk.
 */
export function buildIndex(
  claims: ClaimFile[],
  candidateOverride?: Map<string, ClaimRowStatus>,
): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE claim (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      lifecycle TEXT NOT NULL,
      verification TEXT NOT NULL,
      resolution TEXT NOT NULL,
      corroboration TEXT NOT NULL,
      provenance TEXT NOT NULL,
      freshness TEXT NOT NULL,
      reach_ground INTEGER NOT NULL
    );
    CREATE TABLE claim_evidence (
      claim_id TEXT NOT NULL,
      line TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL
    );
    CREATE TABLE claim_contradicts (
      claim_id TEXT NOT NULL,
      contradicts TEXT NOT NULL
    );
    CREATE TABLE claim_caveat (
      claim_id TEXT NOT NULL,
      confound TEXT NOT NULL
    );
  `);

  const insClaim = db.prepare(
    "INSERT INTO claim (id, text, lifecycle, verification, resolution, corroboration, provenance, freshness, reach_ground) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insEv = db.prepare(
    "INSERT INTO claim_evidence (claim_id, line, kind, ref) VALUES (?, ?, ?, ?)",
  );
  const insContra = db.prepare(
    "INSERT INTO claim_contradicts (claim_id, contradicts) VALUES (?, ?)",
  );
  const insCaveat = db.prepare("INSERT INTO claim_caveat (claim_id, confound) VALUES (?, ?)");

  const tx = db.transaction((files: ClaimFile[]) => {
    for (const c of files) {
      const fm = c.frontmatter;
      const lifecycle = candidateOverride?.get(fm.id) ?? fm.lifecycle;
      insClaim.run(
        fm.id,
        fm.text,
        lifecycle,
        fm.verification,
        fm.resolution,
        fm.corroboration,
        fm.provenance,
        fm.freshness,
        fm.reach_ground ? 1 : 0,
      );
      for (const line of fm.evidence_lines) {
        for (const r of line.refs) {
          insEv.run(fm.id, line.name, r.kind, r.ref);
        }
      }
      for (const cid of fm.contradicts) insContra.run(fm.id, cid);
      for (const cfd of fm.inherits_caveat) insCaveat.run(fm.id, cfd);
    }
  });
  tx(claims);
  return db;
}
