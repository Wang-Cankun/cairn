#!/bin/sh
# reference-agent.sh — the WITH-SKILL golden path for the "findings-leak" scenario.
#
# A disciplined agent treats every conclusion in FINDINGS.md as something that must be grounded
# by a Cairn claim. For each of the two conclusion-like lines it: mints the estimand that line
# targets, authors a grounded canonical-bound claim citing the evidence file + the shared fork,
# then EDITS the FINDINGS.md line so it carries that claim's id — so the warn-only reconcile
# finds zero laundered conclusions. Finally it validates and publishes (promoting the grounded
# drafts to canonical). Operates only through $CAIRN against the already-initialized store in cwd.
set -eu

# A grounded claim's `add-claim` prints "created clm-… (draft, …)" on its first stdout line; pull
# the id out of that line (the CLI is the sole minter, so we never invent it ourselves).
claim_id() { sed -n 's/^created \(clm-[0-9a-f]*\) .*/\1/p' | head -1; }

# The shared fork both conclusions are conditional on: the score is the model's predicted
# probability on the held-out split (declared, never interpreted by the CLI).
FORK="scoring=held_out_probability"

# ── Conclusion 1: the per-sample score gap (grounded on scores.csv) ──
EST_GAP="$($CAIRN add-estimand \
  --label "treatment-vs-control score gap" \
  --def "By how much do treatment samples score higher than control samples on the held-out probability?" \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST_GAP" ] || { echo "reference-agent: add-estimand (gap) printed no est- id" >&2; exit 1; }

CLM_GAP="$($CAIRN add-claim \
  --text "We found that treatment samples score markedly higher than control samples." \
  --estimand "$EST_GAP" \
  --evidence file:scores.csv \
  --depends-on-fork "$FORK" \
  --provenance ai_proposed | claim_id)"
[ -n "$CLM_GAP" ] || { echo "reference-agent: add-claim (gap) printed no clm- id" >&2; exit 1; }

# ── Conclusion 2: the model's separation (grounded on model_metrics.json) — a DIFFERENT question ──
EST_SEP="$($CAIRN add-estimand \
  --label "logistic-regression separation" \
  --def "How well does the logistic-regression model separate the two groups (AUC) on the held-out split?" \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST_SEP" ] || { echo "reference-agent: add-estimand (sep) printed no est- id" >&2; exit 1; }

CLM_SEP="$($CAIRN add-claim \
  --text "The results show the logistic-regression model separates the two groups with high AUC." \
  --estimand "$EST_SEP" \
  --evidence file:model_metrics.json \
  --depends-on-fork "$FORK" \
  --provenance ai_proposed | claim_id)"
[ -n "$CLM_SEP" ] || { echo "reference-agent: add-claim (sep) printed no clm- id" >&2; exit 1; }

# ── Make each FINDINGS.md conclusion carry its claim id, so reconcile sees it as referenced.
# reconcile flags a conclusion-like line only when that SAME line carries no clm- id, so we append
# the id inline. The CLI never writes FINDINGS.md (it is the host's shared write-up), so editing it
# here is the agent's own honest bookkeeping, not a store hand-edit.
sed -i.bak \
  -e "s|\(We found that treatment samples score markedly higher than control samples\.\)|\1 (${CLM_GAP})|" \
  -e "s|\(The results show the logistic-regression model separates the two groups with high AUC\.\)|\1 (${CLM_SEP})|" \
  FINDINGS.md
rm -f FINDINGS.md.bak

# ── Promote the grounded drafts and freeze a snapshot (validate first; a clean gate is the precondition).
$CAIRN validate >/dev/null
$CAIRN publish  >/dev/null
