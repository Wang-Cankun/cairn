#!/usr/bin/env bash
# tests/acceptance.sh — full Cairn v1 end-to-end loop against a temp copy of the demo project.
#
# Exercises: add-claim (target-grounded, file-grounded, dep+file-grounded), a leftover zero-edge
# draft, validate, publish (promote 3 + report leftover), canonical-only head.json, snapshot +
# share-link integrity, a mutation -> refresh -> stale cascade, a second publish with a real diff +
# immutable old snapshot + latest/ mirroring the NEW snapshot, and a negative reach-ground gate
# test. Exits NONZERO on the first failed assertion.
#
# Requires: the site bundle prebuilt at site/dist (run `bun run build:site` first).

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO/src/cli.ts"
DEMO="$REPO/fixtures/demo-project"
PASS=0
FAIL=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
die()  { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); echo; echo "ACCEPTANCE FAILED ($FAIL failure(s))"; exit 1; }

# cairn <args...> run inside the temp host (cwd = host root so store discovery walks up correctly).
cairn() { ( cd "$HOST" && bun run "$CLI" "$@" ); }

# --- 0. prerequisites -------------------------------------------------------------
[ -f "$REPO/site/dist/index.html" ] || die "site bundle missing (run: bun run build:site)"
[ -d "$DEMO" ] || die "demo project missing at $DEMO"

HOST="$(mktemp -d "${TMPDIR:-/tmp}/cairn-acc-XXXXXX")"
trap 'rm -rf "$HOST"' EXIT
cp -R "$DEMO/." "$HOST/"
echo "acceptance host: $HOST"
echo

# ==================================================================================
echo "[1] author claims"
# c1: target-grounded
cairn add-claim --text "Treatment scores exceed control in step 07." --evidence target:scores_step_07 >/dev/null \
  || die "add-claim c1 (target) nonzero exit"
# c2: file-grounded
cairn add-claim --text "Model metrics report AUC 0.93." --evidence file:outputs/model_metrics.json >/dev/null \
  || die "add-claim c2 (file) nonzero exit"
# discover the actual allocated ids (per-day counter)
C1="$(ls "$HOST/cairn/claims" | sed -n '1p' | sed 's/\.md$//')"
C2="$(ls "$HOST/cairn/claims" | sed -n '2p' | sed 's/\.md$//')"
[ -n "$C1" ] && [ -n "$C2" ] || die "could not resolve claim ids C1/C2"
# c3: depends on c2 AND file-grounded (own grounding edge so it is promotable per §6.3)
cairn add-claim --text "Step 07 scores corroborate the model's separation." \
  --evidence file:outputs/step07_scores.csv --depends-on "$C2" >/dev/null \
  || die "add-claim c3 (dep+file) nonzero exit"
C3="$(ls "$HOST/cairn/claims" | sed -n '3p' | sed 's/\.md$//')"
# c4: leftover zero-edge draft (no grounding, no deps) -> must NOT promote, must be reported
cairn add-claim --text "Loose hunch, not yet grounded." >/dev/null \
  || die "add-claim c4 (zero-edge draft) nonzero exit"
C4="$(ls "$HOST/cairn/claims" | sed -n '4p' | sed 's/\.md$//')"
pass "authored 4 drafts: $C1 (target), $C2 (file), $C3 (dep+file), $C4 (zero-edge)"

# ==================================================================================
echo "[2] validate passes (3 grounded candidates reach ground; zero-edge ignored)"
cairn validate >/dev/null 2>&1 || die "validate should pass with 3 grounded candidates"
pass "validate exit 0"

# ==================================================================================
echo "[3] first publish"
PUB1="$(cairn publish 2>&1)" || die "publish #1 nonzero exit:\n$PUB1"
echo "$PUB1" | grep -q "promoted draft->canonical: 3" || die "publish #1 should promote exactly 3 (got: $(echo "$PUB1" | grep promoted))"
# leftover zero-edge draft must be reported as ungrounded
echo "$PUB1" | grep -q "$C4" || die "publish #1 should report leftover ungrounded draft $C4"
SNAP1="$(echo "$PUB1" | sed -n 's/^published snapshot \([0-9a-f]*\).*/\1/p')"
[ -n "$SNAP1" ] || die "could not parse snapshot id from publish #1"
pass "publish #1 promoted 3, reported leftover $C4, snapshot=$SNAP1"

# ==================================================================================
echo "[4] head.json: exactly 3 canonical, all fresh, ZERO drafts (decision A)"
HEAD="$HOST/cairn/head.json"
[ -f "$HEAD" ] || die "cairn/head.json missing"
NCLAIM="$(bun -e 'const h=require(process.argv[1]);console.log(h.claims.length)' "$HEAD")"
[ "$NCLAIM" = "3" ] || die "head.json should have 3 canonical claims, got $NCLAIM"
NFRESH="$(bun -e 'const h=require(process.argv[1]);console.log(h.claims.filter(c=>c.freshness.state==="fresh").length)' "$HEAD")"
[ "$NFRESH" = "3" ] || die "all 3 head claims should be fresh, got $NFRESH"
# no drafts, not even a count, and no leftover draft id present
bun -e 'const h=require(process.argv[1]);if("drafts"in h||JSON.stringify(h).includes(process.argv[2]))process.exit(1)' "$HEAD" "$C4" \
  || die "head.json must not contain drafts/draft-count nor the leftover draft id $C4"
pass "head.json = 3 canonical, all fresh, canonical-only (no drafts)"

# ==================================================================================
echo "[5] snapshot dir contains index.html + data/head.json (site wired, decision F)"
SNAPDIR="$HOST/cairn/snapshots/$SNAP1"
[ -f "$SNAPDIR/index.html" ] || die "snapshot missing index.html"
[ -f "$SNAPDIR/data/head.json" ] || die "snapshot missing data/head.json"
[ -d "$SNAPDIR/assets" ] || die "snapshot missing assets/ (real bundle, not placeholder)"
# the snapshot's head.json data must be the REAL published head (3 canonical), not dev fixtures
SNAPN="$(bun -e 'const h=require(process.argv[1]);console.log(h.claims.length)' "$SNAPDIR/data/head.json")"
[ "$SNAPN" = "3" ] || die "snapshot data/head.json should have 3 claims (dev fixtures not overwritten?), got $SNAPN"
pass "snapshot self-contained: index.html + assets/ + real data/head.json"

# ==================================================================================
echo "[6] published/latest/ mirrors newest snapshot exactly (decision B)"
LATEST="$HOST/cairn/published/latest"
[ -f "$LATEST/data/head.json" ] || die "published/latest/data/head.json missing"
diff -q "$LATEST/data/head.json" "$SNAPDIR/data/head.json" >/dev/null \
  || die "latest/data/head.json should match newest snapshot data/head.json"
pass "published/latest mirrors snapshot $SNAP1"

# ==================================================================================
echo "[7] mutate evidence -> refresh -> c2-dependent + c2 read stale"
# Mutate the step07 csv that c3 grounds on.
echo "S07,treatment,0.99" >> "$HOST/outputs/step07_scores.csv"
REFRESH="$(cairn refresh 2>&1)" || die "refresh nonzero exit"
# c3 grounds on step07_scores.csv -> must be stale now
echo "$REFRESH" | grep -q "$C3" && echo "$REFRESH" | grep "$C3" | grep -q "stale" \
  || die "c3 ($C3) should read stale after mutating its evidence:\n$REFRESH"
# head.json (rewritten by refresh) must reflect the stale state
C3STATE="$(bun -e 'const h=require(process.argv[1]);const c=h.claims.find(c=>c.id===process.argv[2]);console.log(c?c.freshness.state:"MISSING")' "$HEAD" "$C3")"
[ "$C3STATE" = "stale" ] || die "head.json should show $C3 stale after refresh, got $C3STATE"
pass "after mutation+refresh: $C3 stale, head.json reflects it"

# ==================================================================================
echo "[8] second publish: new snapshot id, diff reports freshness change, old snapshot immutable"
# capture old snapshot bytes for immutability check
OLD_HEAD_BYTES="$(shasum "$SNAPDIR/data/head.json" | awk '{print $1}')"
# Materially change the head so a genuinely NEW content-addressed snapshot id is produced
# (decision E excludes freshness from the id — a freshness-only change is, correctly, the SAME
# snapshot). Grounding the leftover draft c4 promotes it on publish #2, changing the canonical set.
cairn ground "$C4" --evidence file:outputs/model_metrics.json >/dev/null || die "ground c4 failed"
PUB2="$(cairn publish 2>&1)" || die "publish #2 nonzero exit:\n$PUB2"
SNAP2="$(echo "$PUB2" | sed -n 's/^published snapshot \([0-9a-f]*\).*/\1/p')"
[ -n "$SNAP2" ] || die "could not parse snapshot id from publish #2"
[ "$SNAP2" != "$SNAP1" ] || die "publish #2 snapshot id should differ from #1 (freshness changed the head)"
SNAPDIR2="$HOST/cairn/snapshots/$SNAP2"
# diff.json of the NEW snapshot reports the freshness change against SNAP1
DIFF2="$SNAPDIR2/data/diff.json"
AGAINST="$(bun -e 'const d=require(process.argv[1]);console.log(d.against)' "$DIFF2")"
[ "$AGAINST" = "$SNAP1" ] || die "diff #2 should be against $SNAP1, got $AGAINST"
NFC="$(bun -e 'const d=require(process.argv[1]);console.log(d.counts.freshness_changed)' "$DIFF2")"
[ "$NFC" -ge 1 ] || die "diff #2 should report >=1 freshness_changed, got $NFC"
# old snapshot dir byte-identical (immutability)
NEW_HEAD_BYTES="$(shasum "$SNAPDIR/data/head.json" | awk '{print $1}')"
[ "$OLD_HEAD_BYTES" = "$NEW_HEAD_BYTES" ] || die "old snapshot $SNAP1 data/head.json was mutated (immutability violated)"
# latest/ now mirrors the NEW snapshot
diff -q "$LATEST/data/head.json" "$SNAPDIR2/data/head.json" >/dev/null \
  || die "published/latest should now mirror NEW snapshot $SNAP2"
diff -q "$LATEST/data/head.json" "$SNAPDIR/data/head.json" >/dev/null \
  && die "published/latest should NOT still mirror old snapshot $SNAP1"
pass "publish #2: new snapshot $SNAP2, diff freshness_changed=$NFC vs $SNAP1, old snapshot immutable, latest mirrors new"

# ==================================================================================
echo "[9] negative: a canonical claim depending only on an ungrounded draft FAILS validate"
NEG="$(mktemp -d "${TMPDIR:-/tmp}/cairn-neg-XXXXXX")"
mkdir -p "$NEG/cairn/claims"
# ungrounded draft (no edges)
cat > "$NEG/cairn/claims/claim-20260610-001.md" <<'EOF'
---
id: claim-20260610-001
text: "ungrounded base draft"
status: draft
verification: unverified
grounding: []
depends_on: []
created_at: 2026-06-10T20:00:00-04:00
---
EOF
# canonical candidate that can only reach ground via the ungrounded draft -> cannot reach ground
cat > "$NEG/cairn/claims/claim-20260610-002.md" <<'EOF'
---
id: claim-20260610-002
text: "rests only on an ungrounded draft"
status: canonical
verification: unverified
grounding: []
depends_on:
  - claim-20260610-001
created_at: 2026-06-10T20:00:00-04:00
---
EOF
NEGOUT="$( ( cd "$NEG" && bun run "$CLI" validate ) 2>&1 )"; NEGCODE=$?
rm -rf "$NEG"
[ "$NEGCODE" = "3" ] || die "negative validate should exit 3 (iron rule), got $NEGCODE"
echo "$NEGOUT" | grep -q "claim-20260610-002" || die "negative validate should name the offender claim-20260610-002"
pass "edge-bearing candidate whose dep chain can't reach ground FAILS validate (exit 3, offender named)"

# ==================================================================================
echo
echo "ACCEPTANCE PASSED — $PASS check(s), 0 failures"
exit 0
