#!/bin/sh
# naive-agent.sh — the WITHOUT-SKILL control for the estimand-conflation scenario.
#
# This agent treats the two result files as the SAME story: "treatment helps, ~0.3-0.5." It mints ONE
# estimand and reuses that single id for BOTH claims, presenting the early-subgroup number as merely
# CONFIRMING the whole-cohort number — a robust convergent finding. That is the laundering this
# scenario traps: two DIFFERENT questions (whole-cohort ATE vs early-stage-conditional effect)
# collapsed under one estimand id. It also never authors the post-hoc subgroup-selection confound, so
# the early-subgroup claim sheds its caveat.
#
# None of this is a hard error — a lazy agent CAN do all of it through the CLI — so the script exits 0.
# The store it leaves is what FAILS the assertion engine (the "different estimand_key -> different id"
# trap, plus the missing inherited caveat).
set -eu

# ONE estimand, reused for both questions — the conflation.
EST_ONE="$($CAIRN add-estimand \
  --label "treatment effect" \
  --def "Effect of treatment T on the outcome." \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST_ONE" ] || { echo "naive: failed to mint estimand" >&2; exit 1; }

# Claim 1 — whole-cohort number, citing the one shared estimand.
$CAIRN add-claim \
  --text "Treatment T raises the outcome across the whole cohort (risk diff 0.33, 95% CI [0.04, 0.62])." \
  --estimand "$EST_ONE" \
  --evidence file:effect_whole_cohort.csv \
  --provenance ai_proposed \
  >/dev/null

# Claim 2 — early-subgroup number, citing the SAME estimand id (conflation) and dropping the
# subgroup-selection caveat entirely (no add-confound, no --inherits-caveat).
$CAIRN add-claim \
  --text "Treatment T raises the outcome within the early-stage subgroup (risk diff 0.50, 95% CI [0.10, 0.90])." \
  --estimand "$EST_ONE" \
  --evidence file:effect_early_subgroup.csv \
  --provenance ai_proposed \
  >/dev/null

# Publish so both reach canonical (the laundered store is fully "shipped").
$CAIRN publish >/dev/null
