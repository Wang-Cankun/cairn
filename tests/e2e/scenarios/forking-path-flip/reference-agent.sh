#!/bin/sh
# reference-agent.sh — the WITH-SKILL golden path for "forking-path-flip".
#
# Two equally-justified normalizations flip the sign for the SAME question (the marker
# treatment effect). A faithful agent declares ONE estimand (same question → reuse the id),
# authors BOTH claims grounded on their own result CSV, and records the disagreement as a
# contradicts edge — so the multiverse is EXPRESSED, never collapsed into the positive answer
# (axioms 1, 2, 4). It then publishes, promoting both grounded drafts to canonical; resolution
# stays open while the contradicts edge stands.
set -eu

# 1. Declare the estimand ONCE — both normalizations target the same quantity/question.
#    add-estimand prints the id on its first stdout line.
EST=$($CAIRN add-estimand \
  --label "marker treatment effect" \
  --def "Treatment effect (log-fold change, treated vs. control) on marker-gene expression in counts.csv." \
  | head -n1)

# 2. Author the median-of-ratios claim FIRST so we can cite its id from the CPM claim's
#    contradicts edge. Grounded on its own result artifact; cites the shared estimand.
MEDRATIO=$($CAIRN add-claim \
  --text "Under median-of-ratios normalization the treatment LOWERS the marker (effect -0.144); robust to the treated-group library-size outliers." \
  --estimand "$EST" \
  --evidence file:effect_medratio.csv \
  --depends-on-fork normalization=median-of-ratios \
  --provenance ai_proposed \
  --deflation-route "clarify-estimand: pin which normalization the question intends, or run an independent cohort" \
  | sed -n 's/^created \(clm-[0-9a-f]*\).*/\1/p')

# 3. Author the CPM claim, grounded on its own artifact, citing the SAME estimand, and record
#    the disagreement with the median-of-ratios sibling as a contradicts edge (keep the scar).
$CAIRN add-claim \
  --text "Under CPM normalization the treatment RAISES the marker (effect +0.182, CI excludes 0)." \
  --estimand "$EST" \
  --evidence file:effect_cpm.csv \
  --depends-on-fork normalization=cpm \
  --contradicts "$MEDRATIO" \
  --provenance ai_proposed \
  --deflation-route "clarify-estimand: pin which normalization the question intends, or run an independent cohort"

# 4. Write the honest finding — BOTH directions, each carrying a claim id reference.
{
  echo "# Findings"
  echo
  echo "We found the marker treatment effect is normalization-dependent and the sign FLIPS:"
  echo "- CPM normalization gives a positive effect (+0.182)."
  echo "- median-of-ratios gives a negative effect (-0.144), kept as a contradicting sibling ($MEDRATIO)."
} > FINDINGS.md

# 5. Publish — promotes both grounded drafts to canonical. Resolution stays OPEN: a contested
#    fork is never silently settled (axiom 4). validate must pass first.
$CAIRN validate
$CAIRN publish
