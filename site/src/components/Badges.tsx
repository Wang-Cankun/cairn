import type { Freshness, Verification } from "../types";
import {
  FRESHNESS_LABEL,
  TIER_LABEL,
  VERIFICATION_LABEL,
  formatAsOf,
} from "../lib";

/**
 * Freshness badge. Decision C: every badge carries an "as of <published_at>" qualifier so a
 * frozen `fresh` is never read as live. The tier ALWAYS travels with the state — `unknown` is
 * shown as `unknown`, never collapsed into `fresh`.
 */
export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  const { state, tier, as_of } = freshness;
  return (
    <span
      className={`badge ${state}`}
      title={`Freshness ${state} (tier: ${TIER_LABEL[tier]}) — frozen as of ${formatAsOf(as_of)}; the site never recomputes`}
    >
      <span className="glyph" aria-hidden="true" />
      {FRESHNESS_LABEL[state]}
      <span className="tier">· {TIER_LABEL[tier]}</span>
      <span className="asof">· as of {formatAsOf(as_of)}</span>
    </span>
  );
}

/**
 * Verification badge. Shown plainly and honestly — `unverified` (the v1 default) is NOT styled
 * to look settled; it uses the neutral `verif` style identical to every other value.
 */
export function VerificationBadge({ verification }: { verification: Verification }) {
  return (
    <span
      className="badge verif"
      title={`Verification: ${verification} (v1 stores the honest default; verify machinery is v2)`}
    >
      <span className="glyph" aria-hidden="true" />
      {VERIFICATION_LABEL[verification]}
    </span>
  );
}
