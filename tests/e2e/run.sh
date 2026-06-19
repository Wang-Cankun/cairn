#!/usr/bin/env bash
# tests/e2e/run.sh — the E2E HARNESS RUNNER: prove every scenario under scenarios/ has TEETH.
#
# "Teeth" is the whole point of the suite (CONTRACT §intro): the same task, run through the same CLI,
# must produce OPPOSITE scorecards depending on whether the agent had the Skill. For each scenario we
# stand up two fresh temp projects and score both against the ONE hand-authored expected-graph.json:
#   • WITH-SKILL   (reference-agent.sh, the golden path) → must pass EVERY asserted check.
#   • WITHOUT-SKILL (naive-agent.sh, the control)        → must FAIL at least the trapped check(s).
# A scenario has teeth iff with==all-pass AND without==some-fail. If WITH fails anything the expected
# graph is wrong (or the golden path drifted); if WITHOUT passes everything the trap is toothless.
#
# Per (scenario × agent) the runner honors the CONTRACT §c env/cwd guarantee exactly: a fresh temp
# project with the scenario's data/ contents at the root, `cairn init` already run (which also seeds
# config.findings_globs=["FINDINGS.md"] so the reconcile dimension is live), and $CAIRN /
# $CAIRN_ASSERTER / $CAIRN_MODEL / $CAIRN_SESSION exported. Agent scripts run under POSIX `sh`. If a
# scenario ships a mutate.sh it is run (same env/cwd) after the agent and before a final `cairn
# refresh`, per §c step 5. Scoring is delegated to lib/assert-graph.ts (exit 0 = all pass, 1 = a fail).
#
# Exits 0 iff EVERY scenario has teeth; nonzero otherwise (the offenders are named). All temp dirs are
# removed on EXIT. Style mirrors tests/acceptance.sh (pass/die helpers, terse PASS/FAIL lines).

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$REPO/src/cli.ts"
SCEN_DIR="$REPO/tests/e2e/scenarios"
ASSERTER="$REPO/tests/e2e/lib/assert-graph.ts"

# Every temp project we mint gets tracked here and torn down on EXIT (no leftover stores).
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/cairn-e2e-XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

# Accumulators for the final cross-scenario verdict.
TEETH_OK=0          # scenarios that have teeth
TEETH_BAD=0         # scenarios that DON'T
OFFENDERS=""        # space-separated "scenario(reason)" list for the summary
declare -a ROWS     # rendered table rows, printed in one block at the end

# run_agent <scenario-dir> <agent-script> <asserter-who> <out-project-var>
# Stands up a fresh temp project per CONTRACT §c, runs the agent (+ optional mutate.sh + refresh),
# and scores it with assert-graph. Echoes "<pass> <total>" on stdout; the agent/assert logs go to
# stderr so the caller can keep the scorecard around without polluting the parsed pass/total.
run_agent() {
  scen_dir="$1"; agent="$2"; who="$3"
  proj="$(mktemp -d "$TMP_ROOT/${who}-XXXXXX")"

  # (1) copy the scenario's data/ CONTENTS into the project root (so file:results.csv resolves at cwd).
  if [ -d "$scen_dir/data" ]; then
    # cp the contents, not the dir itself; the trailing /. copies hidden files too.
    cp -R "$scen_dir/data/." "$proj/" 2>/dev/null || true
  fi

  # (2) cairn init there: skeleton + config.json (defaults findings_globs=["FINDINGS.md"]). cwd = proj
  # so store discovery resolves from it. Failure here is a HARD runner error, not a scenario verdict.
  ( cd "$proj" && bun run "$CLI" init ) >/dev/null 2>&1 \
    || { echo "RUNNER ERROR: cairn init failed in $proj" >&2; echo "0 0"; return; }

  # (3) export the CONTRACT §c env, then run the agent under POSIX sh from cwd = the project.
  (
    cd "$proj"
    export CAIRN="bun run $CLI"
    export CAIRN_ASSERTER="$who"
    export CAIRN_MODEL="e2e-harness"
    export CAIRN_SESSION="sess-$who"
    sh "$agent"
  ) >&2 || { echo "RUNNER ERROR: agent $agent (as $who) exited nonzero" >&2; echo "0 0"; return; }

  # (4) §c step 5: if the scenario ships a mutate.sh, run it (same env/cwd) then `cairn refresh`, so the
  # fresh→stale path is exercised. None of the current scenarios ship one; the hook is here per contract.
  if [ -f "$scen_dir/mutate.sh" ]; then
    (
      cd "$proj"
      export CAIRN="bun run $CLI"
      export CAIRN_ASSERTER="$who"
      export CAIRN_MODEL="e2e-harness"
      export CAIRN_SESSION="sess-$who"
      sh "$scen_dir/mutate.sh"
    ) >&2 || { echo "RUNNER ERROR: mutate.sh (as $who) exited nonzero" >&2; echo "0 0"; return; }
    ( cd "$proj" && bun run "$CLI" refresh ) >&2 \
      || { echo "RUNNER ERROR: post-mutate refresh failed" >&2; echo "0 0"; return; }
  fi

  # (5) score: assert-graph prints its scorecard (→ stderr so it's visible but not parsed) and a
  # "totals: N pass / M fail (T checks)" line we pull P/T from. Its exit code is informational here;
  # the pass/total numbers carry the verdict (with: P==T, without: P<T).
  out="$( cd "$proj" && bun run "$ASSERTER" "$proj" "$scen_dir/expected-graph.json" 2>/dev/null )"
  echo "$out" >&2
  p="$(sed -n 's/.*totals: \([0-9]*\) pass \/ \([0-9]*\) fail.*/\1/p' <<<"$out" | tail -1)"
  f="$(sed -n 's/.*totals: \([0-9]*\) pass \/ \([0-9]*\) fail.*/\2/p' <<<"$out" | tail -1)"
  [ -n "$p" ] && [ -n "$f" ] || { echo "RUNNER ERROR: could not parse assert-graph totals" >&2; echo "0 0"; return; }
  echo "$p $((p + f))"
}

echo "cairn e2e runner — repo: $REPO"
echo "temp root: $TMP_ROOT"
echo

# ── per-scenario loop ──────────────────────────────────────────────────────────
for scen_dir in "$SCEN_DIR"/*/; do
  [ -f "$scen_dir/expected-graph.json" ] || continue
  scen="$(basename "$scen_dir")"

  echo "════════════════════════════════════════════════════════════════════════"
  echo "scenario: $scen"
  echo "── WITH-SKILL (reference-agent.sh) — EXPECT all-pass ──"
  read -r WP WT < <(run_agent "$scen_dir" "$scen_dir/reference-agent.sh" "ref-agent")

  echo "── WITHOUT-SKILL (naive-agent.sh) — EXPECT a trapped FAIL ──"
  read -r NP NT < <(run_agent "$scen_dir" "$scen_dir/naive-agent.sh" "naive-agent")

  # Teeth verdict: WITH must pass every asserted check (P==T, T>0); WITHOUT must fail at least one
  # (P<T against the SAME expected-graph — same total). A 0/0 means a hard runner error upstream.
  reason=""
  if [ "$WT" -eq 0 ]; then
    reason="with-skill run errored (0 checks)"
  elif [ "$WP" -ne "$WT" ]; then
    reason="with-skill failed $((WT - WP)) check(s) (golden path does not pass its own expected-graph)"
  elif [ "$NT" -eq 0 ]; then
    reason="without-skill run errored (0 checks)"
  elif [ "$NP" -ge "$NT" ]; then
    reason="without-skill passed all $NT check(s) (trap is toothless — laundering went undetected)"
  fi

  if [ -z "$reason" ]; then
    teeth="yes"; TEETH_OK=$((TEETH_OK + 1))
    echo "  TEETH  $scen — with: $WP/$WT, without: $NP/$NT"
  else
    teeth="no"; TEETH_BAD=$((TEETH_BAD + 1))
    OFFENDERS="$OFFENDERS $scen($reason)"
    echo "  NO TEETH  $scen — $reason"
  fi
  ROWS+=("$(printf '%-22s | with: %2s/%-2s | without: %2s/%-2s | teeth: %s' "$scen" "$WP" "$WT" "$NP" "$NT" "$teeth")")
  echo
done

# ── final cross-scenario summary table ───────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════════════"
echo "SUMMARY"
echo "────────────────────────────────────────────────────────────────────────"
for row in "${ROWS[@]}"; do echo "  $row"; done
echo "────────────────────────────────────────────────────────────────────────"
echo "  $((TEETH_OK + TEETH_BAD)) scenario(s): $TEETH_OK with teeth, $TEETH_BAD without"

if [ "$TEETH_BAD" -ne 0 ]; then
  echo
  echo "E2E FAILED — toothless scenario(s):$OFFENDERS"
  exit 1
fi
echo
echo "E2E PASSED — every scenario has teeth (with-skill passes all; without-skill fails the trap)"
exit 0
