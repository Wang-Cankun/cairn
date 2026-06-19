#!/usr/bin/env bash
# tests/acceptance.sh — full Cairn v2 end-to-end loop at the CLI seam against a self-contained temp
# host (no demo fixture, no site/dist — v2 snapshots are plain OKF bundles, the React site is retired).
#
# Exercises, all through the real CLI: authoring (estimand + grounded/ungrounded claims), the
# trust-field lock (a supplied verified is overridden), validate gates (reach-ground, verification
# territory-lock, resolution), corroboration via different-asserter review, freshness fresh→stale on
# mutation, a canonical-only publish bundle + log.md time spine, snapshot immutability + reproducible
# id, and the KEYSTONE NK CLOSED-NEGATIVE shape (contested-but-canonical, contradiction surfaced).
# Exits NONZERO on the first failed assertion.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO/src/cli.ts"
PASS=0
FAIL=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
die()  { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); echo; echo "ACCEPTANCE FAILED ($FAIL failure(s))"; exit 1; }

# cairn <args...> run inside the temp host (cwd = host root so store discovery walks up correctly).
cairn() { ( cd "$HOST" && bun run "$CLI" "$@" ); }
# first id of a given kind currently on disk
firstid() { ls "$HOST/cairn/$1" 2>/dev/null | sed -n '1p' | sed 's/\.md$//'; }
fmval() { # fmval <claim-id> <key> -> the top-level scalar from the claim frontmatter
  sed -n '/^---$/,/^---$/p' "$HOST/cairn/claims/$1.md" | sed -n "s/^$2: \\(.*\\)$/\\1/p" | tail -1
}

HOST="$(mktemp -d "${TMPDIR:-/tmp}/cairn-acc-XXXXXX")"
trap 'rm -rf "$HOST"' EXIT
echo "acceptance host: $HOST"
echo

# ==================================================================================
echo "[1] author an estimand + a grounded claim citing it"
printf 'a,b\n1,2\n' > "$HOST/scores.csv"
EST="$(cairn add-estimand --def "Does treatment T raise outcome O in cohort C?" | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
[ -n "$EST" ] || die "add-estimand did not print an est- id"
cairn add-claim --text "T raises O." --evidence file:scores.csv --estimand "$EST" \
  --provenance ai_proposed --as author-A >/dev/null || die "add-claim (grounded) nonzero exit"
C1="$(firstid claims)"
[ -n "$C1" ] || die "could not resolve grounded claim id"
[ "$(fmval "$C1" lifecycle)" = "draft" ] || die "new claim must be a draft"
[ "$(fmval "$C1" reach_ground)" = "true" ] || die "grounded claim must have reach_ground:true"
[ "$(fmval "$C1" freshness)" = "fresh" ] || die "claim on a present local file must be fresh"
[ "$(fmval "$C1" corroboration)" = "self-asserted" ] || die "new claim must be self-asserted"
pass "estimand $EST + grounded draft $C1 (fresh, self-asserted, reach_ground=true)"

# ==================================================================================
echo "[2] trust-field lock: a supplied verified/corroboration is OVERRIDDEN by the CLI"
cairn add-claim --text "I tried to self-stamp trust." --evidence file:scores.csv \
  --estimand "$EST" --provenance ai_proposed --verification verified --corroboration cross-reviewed >/dev/null \
  || die "add-claim (self-stamp attempt) nonzero exit"
C2="$(ls "$HOST/cairn/claims" | sed -n '2p' | sed 's/\.md$//')"
[ -n "$C2" ] || die "could not resolve self-stamp claim id"
[ "$(fmval "$C2" verification)" = "unverified" ] || die "supplied verified must be overridden to unverified (ai_proposed)"
[ "$(fmval "$C2" corroboration)" = "self-asserted" ] || die "supplied cross-reviewed must be overridden to self-asserted"
pass "self-stamped verified/cross-reviewed discarded → unverified/self-asserted"

# ==================================================================================
echo "[3] validate passes with grounded candidates"
cairn validate >/dev/null 2>&1 || die "validate should pass (grounded candidates, no gate violations)"
pass "validate exit 0"

# ==================================================================================
echo "[4] corroboration rises only on TWO different-asserter reviews"
cairn review "$C1" --by author-A >/dev/null || die "self-review nonzero exit"
[ "$(fmval "$C1" corroboration)" = "self-asserted" ] || die "self-review must NOT raise corroboration"
cairn review "$C1" --by reviewer-B --note "independent" >/dev/null || die "review B nonzero"
[ "$(fmval "$C1" corroboration)" = "self-asserted" ] || die "one distinct reviewer is not enough"
cairn review "$C1" --by reviewer-C >/dev/null || die "review C nonzero"
[ "$(fmval "$C1" corroboration)" = "cross-reviewed" ] || die "two distinct reviewers ≠ author → cross-reviewed"
[ "$(fmval "$C1" verification)" = "unverified" ] || die "corroboration is a separate axis; verification must stay unverified"
pass "self-review ignored; 2 distinct reviewers → cross-reviewed (verification still unverified)"

# ==================================================================================
echo "[5] verification territory-lock gate: experimental+verified OK, ai_proposed+verified FAILS"
VHOST="$(mktemp -d "${TMPDIR:-/tmp}/cairn-vlock-XXXXXX")"
mkdir -p "$VHOST/cairn/claims"
printf 'x\n1\n' > "$VHOST/e.csv"
mkclaim() { # mkclaim <dir> <id> <provenance> <verification>
  cat > "$1/cairn/claims/$2.md" <<EOF
---
type: claim
text: claim $2
evidence_lines:
  - name: evidence
    refs:
      - kind: file
        ref: e.csv
depends_on_fork: []
contradicts: []
inherits_caveat: []
provenance: $3
estimand: est-aaaa00000001
id: $2
asserter:
  who: a
  model: m
  session: s
  time: 2026-06-10T20:00:00-04:00
reviewed_by: []
corroboration: self-asserted
fingerprints: []
freshness: unknown
reach_ground: true
lifecycle: canonical
resolution: open
verification: $4
---
body
EOF
}
mkclaim "$VHOST" clm-eeee00000001 experimental verified
( cd "$VHOST" && bun run "$CLI" validate ) >/dev/null 2>&1 || die "experimental+verified should PASS validate"
mkclaim "$VHOST" clm-ffff00000002 ai_proposed verified
VOUT="$( ( cd "$VHOST" && bun run "$CLI" validate ) 2>&1 )"; VCODE=$?
[ "$VCODE" = "3" ] || die "ai_proposed+verified should FAIL validate (exit 3), got $VCODE"
grep -q "verification-lock" <<<"$VOUT" || die "failure must name the verification-lock gate"
grep -q "clm-ffff00000002" <<<"$VOUT" || die "failure must name the ai_proposed offender"
grep -q "clm-eeee00000001" <<<"$VOUT" && die "the experimental claim must NOT be flagged"
rm -rf "$VHOST"
pass "experimental+verified passes; ai_proposed+verified fails (exit 3, gate + offender named)"

# ==================================================================================
echo "[6] freshness: mutate the grounded artifact → refresh → stale"
printf 'a,b\n1,2\nMUTATED,9\n' > "$HOST/scores.csv"
REFRESH="$(cairn refresh 2>&1)" || die "refresh nonzero exit"
grep "$C1" <<<"$REFRESH" | grep -q stale || die "$C1 should read stale after mutating its evidence:\n$REFRESH"
[ "$(fmval "$C1" freshness)" = "stale" ] || die "claim file must record freshness:stale after refresh"
pass "artifact mutation + refresh → $C1 stale (no false fresh)"

# ==================================================================================
echo "[7] first publish: canonical-only OKF bundle + log.md time spine"
PUB1="$(cairn publish 2>&1)" || die "publish #1 nonzero exit:\n$PUB1"
grep -q "published snapshot" <<<"$PUB1" || die "publish #1 missing 'published snapshot'"
SNAP1="$(sed -n 's/^published snapshot \([0-9a-f]*\).*/\1/p' <<<"$PUB1")"
[ -n "$SNAP1" ] || die "could not parse snapshot id from publish #1"
SNAPDIR="$HOST/cairn/snapshots/$SNAP1"
for sub in claims estimands confounds index.md head.json; do
  [ -e "$SNAPDIR/$sub" ] || die "snapshot bundle missing $sub"
done
# Retired v1 artifacts must NOT appear.
[ ! -d "$SNAPDIR/assets" ] || die "snapshot must not contain a React assets/ dir (v1 retired)"
[ ! -d "$SNAPDIR/data" ] || die "snapshot must not contain a data/ dir (v1 retired)"
[ ! -d "$HOST/cairn/published" ] || die "v2 must not emit published/latest/ (v1 retired)"
# The referenced estimand was carried into the bundle by reference.
[ -f "$SNAPDIR/estimands/$EST.md" ] || die "referenced estimand $EST not carried into the bundle"
# log.md records the publish on the append-only time spine.
grep -q "^- publish $SNAP1" "$HOST/cairn/log.md" || die "log.md missing publish entry for $SNAP1"
pass "publish #1 froze canonical-only OKF bundle $SNAP1 + appended log.md diff entry"

# ==================================================================================
echo "[8] reproducible id + immutability: re-publish reuses; a freshness-only change yields a NEW id"
OLD_BYTES="$(shasum "$SNAPDIR/head.json" | awk '{print $1}')"
PUB1B="$(cairn publish 2>&1)" || die "republish nonzero exit"
SNAP1B="$(sed -n 's/^published snapshot \([0-9a-f]*\).*/\1/p' <<<"$PUB1B")"
[ "$SNAP1B" = "$SNAP1" ] || die "no-change republish must reuse the same id ($SNAP1 vs $SNAP1B)"
grep -q reused <<<"$PUB1B" || die "no-change republish must report 'reused'"
# A genuine freshness STATE transition flips the view → a new id. C1 entered [8] stale (from [6]);
# restoring the artifact to its EXACT original baseline bytes makes C1 fresh again (refresh never
# re-baselines), so the published view changes stale→fresh and the id must differ.
printf 'a,b\n1,2\n' > "$HOST/scores.csv"
cairn refresh >/dev/null || die "refresh #2 nonzero exit"
[ "$(fmval "$C1" freshness)" = "fresh" ] || die "restoring the baseline bytes should make $C1 fresh again"
PUB2="$(cairn publish 2>&1)" || die "publish #2 nonzero exit"
SNAP2="$(sed -n 's/^published snapshot \([0-9a-f]*\).*/\1/p' <<<"$PUB2")"
[ -n "$SNAP2" ] && [ "$SNAP2" != "$SNAP1" ] || die "freshness change must yield a NEW snapshot id (got $SNAP2 vs $SNAP1)"
grep -q reused <<<"$PUB2" && die "publish #2 must NOT hit the reused branch"
NEW_BYTES="$(shasum "$SNAPDIR/head.json" | awk '{print $1}')"
[ "$OLD_BYTES" = "$NEW_BYTES" ] || die "old snapshot $SNAP1 head.json was mutated (immutability violated)"
pass "republish reused $SNAP1; freshness-only change → new $SNAP2; old snapshot byte-identical"

# ==================================================================================
echo "[9] KEYSTONE: NK CLOSED-NEGATIVE — contested-but-canonical, blocked from settled, surfaced"
KS="$(mktemp -d "${TMPDIR:-/tmp}/cairn-keystone-XXXXXX")"
( cd "$KS"
  printf 'x\n1\n' > e.csv
  KEST="$(bun run "$CLI" add-estimand --def "Does T raise O?" | sed -n 's/^\(est-[0-9a-f]*\)$/\1/p' | head -1)"
  bun run "$CLI" add-claim --text "T raises O." --evidence file:e.csv --estimand "$KEST" --provenance ai_proposed >/dev/null
  POS="$(ls cairn/claims | sed -n '1p' | sed 's/\.md$//')"
  bun run "$CLI" add-claim --text "T does not raise O." --evidence file:e.csv --estimand "$KEST" \
    --provenance ai_proposed --contradicts "$POS" >/dev/null
  NEG="$(ls cairn/claims | grep -v "$POS" | sed -n '1p' | sed 's/\.md$//')"
  bun run "$CLI" publish >/dev/null || { echo "KEYSTONE publish failed"; exit 1; }
  echo "$POS $NEG $KEST"
) > "$KS/keystone.out" 2>/dev/null || die "keystone setup failed"
read -r KPOS KNEG KEST2 < "$KS/keystone.out"
[ -n "$KPOS" ] && [ -n "$KNEG" ] || die "could not resolve keystone claim ids"
# Both sides reached canonical (neither dropped; the multiverse is persisted).
grep -q "^lifecycle: canonical" "$KS/cairn/claims/$KPOS.md" || die "positive claim must be canonical"
grep -q "^lifecycle: canonical" "$KS/cairn/claims/$KNEG.md" || die "contesting claim must be canonical"
# (1) Flipping the contesting claim to settled (while the contradiction is live) FAILS validate (c.3).
sed -i.bak 's/^resolution: open$/resolution: settled/' "$KS/cairn/claims/$KNEG.md"
KOUT="$( ( cd "$KS" && bun run "$CLI" validate ) 2>&1 )"; KCODE=$?
[ "$KCODE" = "3" ] || die "settled-while-contested must FAIL validate (exit 3), got $KCODE"
grep -Eq "resolution|trust-field-lock" <<<"$KOUT" || die "failure must name the resolution gate"
grep -q "$KNEG" <<<"$KOUT" || die "failure must name the contested claim $KNEG"
mv "$KS/cairn/claims/$KNEG.md.bak" "$KS/cairn/claims/$KNEG.md"
# (2) The contradiction is SURFACED on the orient surface, above the canonical positives.
( cd "$KS" && bun run "$CLI" head ) | grep -q "unresolved contradictions: 1" || die "head must report 1 unresolved contradiction"
INDEX="$KS/cairn/index.md"
CONTRA_LINE="$(grep -n 'Unresolved contradictions' "$INDEX" | head -1 | cut -d: -f1)"
CANON_LINE="$(grep -n 'Canonical claims' "$INDEX" | head -1 | cut -d: -f1)"
[ -n "$CONTRA_LINE" ] && [ -n "$CANON_LINE" ] || die "index.md missing contradiction/canonical sections"
[ "$CONTRA_LINE" -lt "$CANON_LINE" ] || die "contradictions must be surfaced ABOVE the canonical positives"
grep -q "$KNEG" "$INDEX" || die "index.md must name the contesting claim"
rm -rf "$KS"
pass "NK CLOSED-NEGATIVE reproduced: both canonical, contested blocked from settled, contradiction surfaced"

# ==================================================================================
echo
echo "ACCEPTANCE PASSED — $PASS check(s), 0 failures"
exit 0
