#!/bin/sh
# reference-agent.sh — the WITH-SKILL golden path for the estimand-conflation scenario.
#
# The two result files look like the same "treatment helps" story, but they answer DIFFERENT
# questions: the whole-cohort average effect vs the effect conditional on early stage (a post-hoc
# subgroup). The Skill's axiom 2 (Declare the estimand) says: same question -> reuse one id;
# DIFFERENT question -> MINT a separate id. So this agent mints TWO estimands and grounds one claim
# on each, never collapsing the subgroup under the whole-cohort question. The post-hoc subgroup cut
# carries an unerasable selection caveat, authored as its OWN confound node and INHERITED by
# reference (axiom on caveats), never copied into prose. Finally it publishes so both grounded drafts
# cross draft->canonical.
set -eu

# Distinct estimands — the load-bearing move. Two questions, two ids (ADR-0005: ids compared by
# string-equality only; the CLI never reads the body for meaning, so the SEPARATION must be ours).
EST_WHOLE="$($CAIRN add-estimand \
  --label "ATE, whole cohort" \
  --def "Average treatment effect of T on the outcome over the ENTIRE enrolled cohort (both stages pooled)." \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST_WHOLE" ] || { echo "ref: failed to mint whole-cohort estimand" >&2; exit 1; }

EST_EARLY="$($CAIRN add-estimand \
  --label "ATE, early-stage subgroup" \
  --def "Treatment effect of T on the outcome CONDITIONAL on early stage — a different population and a different question from the whole-cohort ATE." \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST_EARLY" ] || { echo "ref: failed to mint early-subgroup estimand" >&2; exit 1; }

# The post-hoc subgroup cut carries an unerasable selection caveat: its OWN confound node, inherited
# by reference (never copied into the claim body).
CFD_SUBGROUP="$($CAIRN add-confound \
  --label "post-hoc subgroup selection" \
  --caveat "The early-stage cut is a post-hoc subgroup chosen after seeing the data; its effect estimate carries a subgroup-selection bias the whole-cohort estimate does not." \
  | sed -n 's/^\(cfd-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$CFD_SUBGROUP" ] || { echo "ref: failed to mint subgroup confound" >&2; exit 1; }

# Claim 1 — the whole-cohort ATE, grounded on its own result file, citing the whole-cohort estimand.
$CAIRN add-claim \
  --text "Treatment T raises the outcome across the whole cohort (risk diff 0.33, 95% CI [0.04, 0.62])." \
  --estimand "$EST_WHOLE" \
  --evidence file:effect_whole_cohort.csv \
  --provenance ai_proposed \
  >/dev/null

# Claim 2 — the early-subgroup effect: a SEPARATE estimand, grounded on its own result file, and
# inheriting the post-hoc subgroup-selection caveat by reference.
$CAIRN add-claim \
  --text "Treatment T raises the outcome within the early-stage subgroup (risk diff 0.50, 95% CI [0.10, 0.90])." \
  --estimand "$EST_EARLY" \
  --evidence file:effect_early_subgroup.csv \
  --inherits-caveat "$CFD_SUBGROUP" \
  --provenance ai_proposed \
  >/dev/null

# Publish: both grounded drafts cross draft->canonical (no contradiction edge, so resolution stays
# clean and the reach-ground gate passes for both).
$CAIRN publish >/dev/null
