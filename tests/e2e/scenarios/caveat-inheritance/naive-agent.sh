#!/bin/sh
# naive-agent.sh — the WITHOUT-SKILL control for the caveat-inheritance scenario.
#
# THE LAUNDERING (exactly what a lazy agent does, all through the CLI — no illegal hand-write):
#   * never runs `add-confound`, so there is NO confound node;
#   * inlines the batch caveat as PROSE in the DE claim's text and deflation-route, paraphrasing it once;
#   * OMITS the caveat entirely from the pathway claim (no node, no edge) — the scar is dropped as the
#     conclusion travels to the second claim.
# Neither claim carries an `inherits_caveat` edge. This is intentional and NOT an error: the script
# still exits 0. The store it leaves is what FAILS the trapped checks (confound node exists; both
# inherits_caveat edges present).
set -eu

# Same shared estimand and grounded evidence as the reference agent — the laundering is ONLY the caveat.
EST="$($CAIRN add-estimand \
  --label "treated-vs-control contrast" \
  --def "The treated-vs-control differential effect on gene expression in this 8-sample cohort." \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST" ] || { echo "naive-agent: add-estimand produced no est- id" >&2; exit 1; }

# Claim 1 — the DE signal. The batch caveat is PARAPHRASED INLINE (in the text + deflation route) instead
# of being a referenced confound node. No --inherits-caveat.
C_DE="$($CAIRN add-claim \
  --text "The treatment differential-expression signal upregulates GENE1/GENE2 and downregulates GENE3 in treated-vs-control (note: batch is confounded with group)." \
  --estimand "$EST" \
  --evidence file:de_results.csv \
  --deflation-route "Re-sequence with batches balanced across groups to separate the batch effect." \
  --provenance ai_proposed \
  | sed -n 's/^created \(clm-[0-9a-f]*\).*$/\1/p' | head -1)"
[ -n "$C_DE" ] || { echo "naive-agent: add-claim (DE) produced no clm- id" >&2; exit 1; }

# Claim 2 — the pathway enrichment. The caveat is DROPPED entirely here: no prose, no node, no edge.
C_PW="$($CAIRN add-claim \
  --text "The treated-vs-control ranking shows pathway enrichment for inflammatory-response and cell-cycle." \
  --estimand "$EST" \
  --evidence file:pathway_enrichment.csv \
  --provenance ai_proposed \
  | sed -n 's/^created \(clm-[0-9a-f]*\).*$/\1/p' | head -1)"
[ -n "$C_PW" ] || { echo "naive-agent: add-claim (pathway) produced no clm- id" >&2; exit 1; }

# The shared findings still reference both claim ids (the laundering here is the caveat, not reconcile),
# so the reconcile dimension stays clean and the FAIL is isolated to the confound/edge checks.
cat > FINDINGS.md <<EOF
# Findings — T-vs-C study

We found the treatment differential-expression signal upregulates GENE1/GENE2 ($C_DE).
Results show pathway enrichment for inflammatory-response and cell-cycle ($C_PW).
EOF
