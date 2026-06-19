#!/bin/sh
# reference-agent.sh — the WITH-SKILL golden path for the caveat-inheritance scenario.
#
# The task's design flaw (sequencing batch perfectly confounded with treatment group) taints BOTH
# the DE claim and the pathway claim, because both descend from the same confounded contrast. A good
# agent records that caveat ONCE as a confound node and inherits it BY REFERENCE from both claims —
# never copies the prose, never drops it from the second claim. Both claims cite ONE shared estimand
# (the treated-vs-control contrast in this cohort) and each grounds on its own results file.
set -eu

# AUTHOR (touchpoint 2): name the estimand once — both conclusions target the same question.
EST="$($CAIRN add-estimand \
  --label "treated-vs-control contrast" \
  --def "The treated-vs-control differential effect on gene expression in this 8-sample cohort." \
  | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST" ] || { echo "reference-agent: add-estimand produced no est- id" >&2; exit 1; }

# A caveat that cannot be erased gets its OWN node (add-confound), referenced — never inlined as prose.
CFD="$($CAIRN add-confound \
  --label "batch confounded with group" \
  --caveat "The sequencing batch is perfectly confounded with the treatment group (every treated sample in batchA, every control in batchB), so the measured contrast is inseparable from a batch effect." \
  | sed -n 's/^\(cfd-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$CFD" ] || { echo "reference-agent: add-confound produced no cfd- id" >&2; exit 1; }

# Claim 1 — the treatment differential-expression signal, grounded on its own results file, inheriting
# the batch confound BY REFERENCE.
C_DE="$($CAIRN add-claim \
  --text "The treatment differential-expression signal upregulates GENE1/GENE2 and downregulates GENE3 in treated-vs-control." \
  --estimand "$EST" \
  --evidence file:de_results.csv \
  --inherits-caveat "$CFD" \
  --provenance ai_proposed \
  | sed -n 's/^created \(clm-[0-9a-f]*\).*$/\1/p' | head -1)"
[ -n "$C_DE" ] || { echo "reference-agent: add-claim (DE) produced no clm- id" >&2; exit 1; }

# Claim 2 — the pathway enrichment, grounded on its own results file, inheriting the SAME confound node
# (same scar, one source of truth) and citing the SAME estimand.
C_PW="$($CAIRN add-claim \
  --text "The treated-vs-control ranking shows pathway enrichment for inflammatory-response and cell-cycle." \
  --estimand "$EST" \
  --evidence file:pathway_enrichment.csv \
  --inherits-caveat "$CFD" \
  --provenance ai_proposed \
  | sed -n 's/^created \(clm-[0-9a-f]*\).*$/\1/p' | head -1)"
[ -n "$C_PW" ] || { echo "reference-agent: add-claim (pathway) produced no clm- id" >&2; exit 1; }

# PUBLISH (touchpoint 4): the shared findings reference BOTH conclusions by claim id, so the warn-only
# reconcile finds no unreferenced conclusion-like line.
cat > FINDINGS.md <<EOF
# Findings — T-vs-C study

We found the treatment differential-expression signal upregulates GENE1/GENE2 ($C_DE).
Results show pathway enrichment for inflammatory-response and cell-cycle ($C_PW).
EOF
