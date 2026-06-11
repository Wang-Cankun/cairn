/**
 * index.ts — build the DERIVED, throwaway SQLite index (bun:sqlite, in-memory) from claim files.
 *
 * The DB is NEVER the source of truth (ADR-0003) and never committed. It exists for the
 * reach-ground CTE (gate.ts) and as a convenient relational view of the graph. Rebuild on demand;
 * discard after the command.
 *
 * Tables (CONTRACTS §10):
 *   claim(id, text, status, verification, created_at)
 *   claim_evidence(claim_id, kind, ref, fingerprint, method, location)
 *   claim_dep(claim_id, depends_on)
 */

import { Database } from "bun:sqlite";
import type { ClaimFile } from "./types.ts";

export type ClaimRowStatus = "draft" | "canonical" | "canonical-candidate";

/**
 * Build an in-memory derived index from claim files.
 *
 * `candidateOverride`, when given, maps a claim id to an in-memory status override (used by the
 * publish/validate gate to mark grounded drafts as `canonical-candidate` WITHOUT touching disk).
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
      status TEXT NOT NULL,
      verification TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE claim_evidence (
      claim_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      method TEXT NOT NULL,
      location TEXT NOT NULL
    );
    CREATE TABLE claim_dep (
      claim_id TEXT NOT NULL,
      depends_on TEXT NOT NULL
    );
  `);

  const insClaim = db.prepare(
    "INSERT INTO claim (id, text, status, verification, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insEv = db.prepare(
    "INSERT INTO claim_evidence (claim_id, kind, ref, fingerprint, method, location) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insDep = db.prepare("INSERT INTO claim_dep (claim_id, depends_on) VALUES (?, ?)");

  const tx = db.transaction((files: ClaimFile[]) => {
    for (const c of files) {
      const fm = c.frontmatter;
      const status = candidateOverride?.get(fm.id) ?? fm.status;
      insClaim.run(fm.id, fm.text, status, fm.verification, fm.created_at);
      for (const g of fm.grounding) {
        insEv.run(fm.id, g.kind, g.ref, g.fingerprint, g.method, g.location);
      }
      for (const d of fm.depends_on) {
        insDep.run(fm.id, d);
      }
    }
  });
  tx(claims);
  return db;
}
