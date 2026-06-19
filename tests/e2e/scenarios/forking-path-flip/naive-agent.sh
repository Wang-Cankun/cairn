#!/bin/sh
# naive-agent.sh — the WITHOUT-SKILL control for "forking-path-flip".
#
# The laundering this scenario traps: when two justified normalizations flip the sign, the lazy
# agent reports only the answer it likes (the positive CPM result) and silently drops the
# contradicting median-of-ratios sibling. The multiverse is COLLAPSED into one clean-looking
# answer — exactly axiom 1's failure mode. Everything it does is a legal CLI call (skip the
# second claim, skip the contradicts edge); the laundering is the OMISSION, not an illegal write.
# This is NOT an error: the script exits 0. The store it leaves is what FAILS assert-graph —
# the contradicts edge (and its target claim) the expected-graph demands are simply absent.
set -eu

# It does declare an estimand and ground the one claim it keeps — a lazy agent still wants its
# positive result to publish cleanly. It just never authors the sibling or the contradiction.
EST=$($CAIRN add-estimand \
  --label "marker treatment effect" \
  --def "Treatment effect (log-fold change, treated vs. control) on marker-gene expression in counts.csv." \
  | head -n1)

$CAIRN add-claim \
  --text "Under CPM normalization the treatment RAISES the marker (effect +0.182, CI excludes 0)." \
  --estimand "$EST" \
  --evidence file:effect_cpm.csv \
  --depends-on-fork normalization=cpm \
  --provenance ai_proposed

# Report only the convenient direction. (No mention of the sign flip.)
{
  echo "# Findings"
  echo
  echo "We found the treatment RAISES the marker (CPM normalization, +0.182)."
} > FINDINGS.md

# Publish the one-sided record. validate passes (one grounded, estimand-bearing claim, no
# contradicts edge to keep open), so the laundered store publishes cleanly — that is the point.
$CAIRN validate
$CAIRN publish
