#!/bin/sh
# naive-agent.sh — the WITHOUT-SKILL control for the "staleness" scenario.
#
# Authors the SAME grounded conclusion as the reference agent, and the SAME pipeline
# rerun regenerates results.csv underneath it. The laundering is an omission a real
# lazy agent commits: it NEVER runs `cairn refresh` after the rerun. So the claim
# keeps the `freshness: fresh` the CLI stamped at authoring time — a FALSE fresh on a
# conclusion whose output has moved. The store it leaves FAILS the scenario's trapped
# check (expected freshness:stale); the script itself does its work cleanly and exits 0
# (skipping refresh is not an error — it is the whole point of the control).
#
# Same env/cwd contract as reference-agent.sh; never hardcode paths.
set -eu

# ── Author: identical estimand + grounded claim (a competent author, just no Skill). ──
EST="$(
  $CAIRN add-estimand \
    --label "treated-vs-control mean response" \
    --def "Does the treated group show a higher mean response than control in this cohort, at significance?" \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1
)"
[ -n "$EST" ] || { echo "naive-agent: add-estimand printed no est- id" >&2; exit 1; }

$CAIRN add-claim \
  --text "Treated mean response exceeds control (12.4 vs 9.1, p=0.012) in this cohort." \
  --estimand "$EST" \
  --evidence file:results.csv \
  --depends-on-fork exclusions=original \
  --provenance ai_proposed \
  >/dev/null

# ── The pipeline gets re-run: results.csv is regenerated, numbers move (same as ref). ──
cat > results.csv <<'CSV'
group,n,mean_response,p_value
treated,44,10.8,0.071
control,46,9.3,0.071
CSV

# ── THE LAUNDERING: no `cairn refresh`. The moved artifact is never re-checked, so the
#    claim's freshness stays the authoring-time `fresh` — a false fresh. (No-op on
#    purpose: the control commits the omission and exits 0.) ──
:
