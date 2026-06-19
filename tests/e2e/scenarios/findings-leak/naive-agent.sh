#!/bin/sh
# naive-agent.sh — the WITHOUT-SKILL control for the "findings-leak" scenario.
#
# A lazy agent does the analysis and writes its conclusions straight into the shared FINDINGS.md,
# but never opens Cairn: it authors NO claims, mints NO estimands, and leaves every conclusion line
# bare (no clm- id). That is exactly this scenario's laundering — the conclusions travel up into the
# shared write-up having shed every scar. Nothing here is a hard error (a real lazy agent CAN simply
# skip Cairn), so the script EXITS 0; it is the STORE it leaves that fails the trapped reconcile check.
set -eu

# The seed FINDINGS.md already carries the two conclusion-like lines with no claim id. The lazy agent
# would also jot its own summary line — still ungrounded, still no claim id. We append one to make the
# laundering explicit, then walk away without authoring a single claim.
cat >> FINDINGS.md <<'NOTE'

## Summary

Therefore the treatment clearly works and the model is good enough to ship.
NOTE

# No $CAIRN add-estimand. No $CAIRN add-claim. No $CAIRN publish. The leak stands.
exit 0
