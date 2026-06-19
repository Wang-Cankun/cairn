#!/bin/sh
# reference-agent.sh — the WITH-SKILL golden path for the "staleness" scenario.
#
# Mirrors the Skill's Author + Refresh touchpoints: conclude grounded on the output
# artifact (results.csv), and AFTER the pipeline regenerates that artifact, run
# `cairn refresh` so a conclusion standing on a moved output is recorded as `stale`
# rather than masquerading as still-current. The refresh is the whole point: it is
# what makes freshness flip fresh -> stale once the bytes move.
#
# Env/cwd contract (set by the runner): cwd is a fresh project with `data/` contents
# at the root and `cairn init` already run; $CAIRN invokes the CLI; $CAIRN_ASSERTER /
# $CAIRN_MODEL / $CAIRN_SESSION stamp the asserter. Never hardcode paths.
set -eu

# ── Author: declare the estimand, then conclude grounded on the output table. ──
EST="$(
  $CAIRN add-estimand \
    --label "treated-vs-control mean response" \
    --def "Does the treated group show a higher mean response than control in this cohort, at significance?" \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1
)"
[ -n "$EST" ] || { echo "reference-agent: add-estimand printed no est- id" >&2; exit 1; }

# The conclusion read off results.csv (the OUTPUT artifact), grounded on that file.
$CAIRN add-claim \
  --text "Treated mean response exceeds control (12.4 vs 9.1, p=0.012) in this cohort." \
  --estimand "$EST" \
  --evidence file:results.csv \
  --depends-on-fork exclusions=original \
  --provenance ai_proposed \
  >/dev/null

# ── The pipeline gets re-run: results.csv is regenerated, numbers move. ──
# This is the upstream rerun the task describes — same columns, different bytes,
# so the artifact the claim points at no longer fingerprints as it did at authoring.
cat > results.csv <<'CSV'
group,n,mean_response,p_value
treated,44,10.8,0.071
control,46,9.3,0.071
CSV

# ── Refresh: recompute freshness against the moved artifact -> claim goes stale. ──
# A careful agent does this after any rerun / regenerated output (the Skill's Refresh
# touchpoint). refresh never re-baselines, so the moved bytes read as `stale`.
$CAIRN refresh >/dev/null
