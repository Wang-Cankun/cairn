# Cairn — verb & field reference

Consult on demand; the protocol and the axioms live in [`SKILL.md`](SKILL.md). The CLI is the
sole writer and walks up from the cwd to find the store.

## Verbs

`init` · `head` · `drafts` · `status` · `add-estimand` · `add-claim` · `add-confound` · `review` ·
`refresh` · `validate` · `publish` · `reconcile` · `migrate`

## Global invocation (call `cairn` from any project)

The package ships a `bin.cairn` entry, so once, on the machine, link it to put `cairn` on `PATH`:

```
bun link            # run in the cairn repo root → registers the `cairn` bin globally
```

Now `cairn <verb>` works from inside any host project; the CLI walks up from the cwd to find the
`cairn/` store. If you prefer not to link, a one-line wrapper does the same:

```
#!/usr/bin/env bash
exec bun run /abs/path/to/cairn/src/cli.ts "$@"   # drop on PATH as `cairn`
```

(The package is `private`; this is local linking, not publishing.)

## Scaffolding a project

```
cairn init \
  --findings <glob> \      # repeatable; the shared findings/paper files reconcile scans (default FINDINGS.md)
  --remote-host <host> \   # optional ssh alias for remote fingerprinting of dvc/remote refs
  --dvc                    # optional: run `dvc init` if dvc is on PATH (non-fatal, never required)
```

Stands up the store skeleton (`claims/ estimands/ confounds/ snapshots/`) + `index.md` + `log.md`, and
writes `config.json` **only if absent**. Idempotent: re-running never overwrites an existing config or
any claim.

## Authoring

```
cairn add-estimand --label "<short scan label>" \
  --def "<which effect, which population, conditional on what>"
# → est-<hash>   (cite it on the claim)

cairn add-claim --text "<one-sentence conclusion with its conditions>" \
  --estimand est-<hash> \
  --evidence <kind>:<ref> \          # repeatable
  --provenance ai_proposed \
  --depends-on-fork <axis=choice> \  # repeatable
  --contradicts <clm-id> \           # repeatable
  --inherits-caveat <cfd-id> \       # repeatable
  --deflation-route "<what would shrink the residual uncertainty>"

cairn add-confound --label "<short label>" \
  --caveat "<the design confound in prose, e.g. depth ≡ group ≡ library>"
# → cfd-<hash>   (cite via --inherits-caveat; reference, never copy)

cairn review <clm-id> --by <asserter-id> --note "<independence narrative>"
# two distinct reviewers (each ≠ author) → corroboration: cross-reviewed
# (still canonical, never verified). The CLI counts ids; --note is carried, not verified.
```

**Evidence kinds:** `file:<path>` | `external:<uri>` | `dvc:<path.dvc>`. The CLI stamps the
fingerprint and its tier — you never type a hash. `external:` is unreachable-by-default →
`unknown` freshness (a false `fresh` is the enemy). A grounding edge must terminate at real
evidence; `--depends-on-fork` and `--contradicts` edges do **not** count as grounding. A claim
may be created bare and grounded a moment later.

## Fields: what you declare vs what the CLI computes (and locks)

| You declare (handles) | CLI computes & locks (a supplied value is discarded) |
|---|---|
| `text`, `estimand`, `evidence`, `depends_on_fork`, `contradicts`, `inherits_caveat`, `provenance`, `deflation_route`, body | `id`, `asserter`, `reviewed_by`, `corroboration`, `fingerprints`, `freshness`, `reach_ground`, `lifecycle`, `resolution`, `verification` |

## Gates (run by `validate`; each blocks `publish`)

- **reach-ground** — every canonical claim must reach real evidence; cycles never do.
- **estimand-required** — every canonical claim must declare an estimand id (a draft may omit it).
- **collapse-refusal** — claims with differing estimand ids are never merged into one multiverse.
- **resolution** — a `settled` write is refused while any `contradicts` edge stands.
- **verification territory-lock** — an agent can never set `verified`/`contradicted` (provenance must be `experimental`; a human reviewing the analysis feeds corroboration, not verification).
- **corroboration** — no self-review; `cross-reviewed` needs ≥2 distinct asserter ids.
- **trust-field lock** — any agent-supplied computed field is discarded and recomputed.

## Worked examples

**A — a claim on a fresh estimand**
```
cairn add-estimand --label "drug effect on marker, cohort A" \
  --def "Average effect of treatment on marker expression in cohort A, conditional on log1pPF normalization."
# → est-9f2a
cairn add-claim --text "Treatment raises marker expression ~2.3x vs control (cohort A, log1pPF)." \
  --estimand est-9f2a --evidence file:outputs/step07_scores.csv \
  --provenance ai_proposed --depends-on-fork normalization=log1pPF \
  --deflation-route "more-validation: replicate in cohort B before generalizing."
```

**B — a contested sibling on the SAME estimand (the contradiction stays open)**
```
cairn add-claim --text "Under quantile normalization the treatment effect is null (cohort A)." \
  --estimand est-9f2a --evidence file:outputs/step07_quantile.csv \
  --provenance ai_proposed --depends-on-fork normalization=quantile \
  --contradicts clm-<the-2.3x-claim>
```
Both stay canonical; neither becomes `settled`; `cairn head` surfaces the contradiction.

**C — an unerasable caveat inherited by reference**
```
cairn add-confound --label "depth≡group≡library" \
  --caveat "Sequencing depth is perfectly confounded with treatment group and library prep; effect and batch are inseparable by design."
# → cfd-1c4d
cairn add-claim --text "Cluster 3 is depleted post-treatment." \
  --estimand est-<...> --evidence dvc:data/counts.csv.dvc \
  --provenance ai_proposed --inherits-caveat cfd-1c4d \
  --deflation-route "redo-experiment: depth-matched design to break the confound."
```
