# 0003 — Files-in-git are the source of truth; artifacts are referenced, never ingested

Status: Accepted (2026-06-10)

## Context

Q4 asked whether the source of truth is SQLite itself or plain-text claim files in git with
SQLite as a derived index. The main argument for SQLite-as-truth was the fear of large files in
git. A real project (`loy-aml`, a Nature-level revision worked across many sessions) was
examined to settle it:

- Total size **29G**; weight is in artifacts: `data/` 11G, `scenic_results/` 3.4G, `osc/` 3.2G,
  `_targets/` 3.2G, `celloracle_results/` 1.2G, `figures/` 242M, etc.
- The project's own `.gitignore` already excludes all of it — `data/`, `_targets/`, every
  `*_results/`, `*.h5ad`, `*.rds`, `*.pdf`, `figures/`, `slides/`, and `results_*/` (commented
  "Results snapshots (generated, shared via email/Dropbox)"). Tracked big files: **zero**.
- `.git` is nonetheless **3.1G** — legacy history bloat, not current tracking.
- `_targets/meta/meta` exists and carries a content-hash `data` column per target.
- `FINDINGS.md` is **177KB**, hand-grown across sessions — a proto-claim store.

## Decision

**Source of truth = plain-text claim files in git. SQLite = a derived index, rebuilt on demand.
Artifacts are referenced by path + fingerprint, never ingested into the Cairn store.**

- A claim is a small text file (markdown + frontmatter), one per claim. The artifact it grounds
  on (an `.rds`, a results `.csv`, a figure) stays exactly where it lives — gitignored, on an
  external volume, or on a remote host. Cairn stores the *reference and fingerprint*, not the
  bytes. Cairn's git footprint stays text-only regardless of project size.
- The hard floor relocates from DB constraints to **CLI (sole writer) + `validate` gate + git
  diff visibility**, consistent with ADR-0001 ("soft before the gate, hard at the gate"): a
  malformed claim may sit in a file but cannot reach canonical and cannot hide.
- The **Cairn store is decoupled** from the host project's git history — its own small repo or a
  self-contained text-only subdir — so it stays portable and Worker-deployable, never inheriting
  multi-gigabyte history bloat.

## Consequences

- Large files are a non-issue: the size is in artifacts, which the store never touches. Cairn
  also reinforces good hygiene (reference artifacts, don't commit them) — the discipline the
  project already follows by hand.
- Claim changes appear in `git diff` / PRs, giving the collaboration/disagreement surface for
  free.
- Files end to end (truth + portable snapshots) makes the Cloudflare Worker future a delivery
  change, not a rewrite.
- The freshness fingerprint is tiered against real structure: targets targets read their `data`
  hash from `_targets/meta/meta` (top tier, free); loose result files are hashed directly
  (mid tier); unreachable remote artifacts read `unknown`.
- Cost accepted: enforcement is CLI/gate-layer, marginally softer than DB constraints. Mitigated
  by sole-writer CLI, the gate, and git visibility.
- Migration hint (not v1 scope): `FINDINGS.md` is the existing proto-store; a future `import`
  could decompose it into claim files.

## Alternatives considered

- **SQLite-as-truth** — rejected: its main justification (large files) dissolved once it was
  clear artifacts are referenced not ingested; and it forfeits git-diff review and easy
  Worker/Pages portability (Worker uses D1, a separate SQLite). SQLite remains, as a *derived*
  index for the reach-ground CTE, freshness, and diffs.
