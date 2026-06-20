/**
 * claimbody.ts — the single source of truth for the claim BODY template (ADR-0007).
 *
 * A leaf module (only a `type` import from types.ts). It owns:
 *   - the placeholder CUE strings the `add-claim` skeleton emits, and
 *   - `skeletonBody`, the writer that emits them.
 *
 * The SAME cue constants are read by the `body-movements` gate (gate.ts) to decide whether a
 * candidate-canonical claim still carries an unfilled skeleton. Because both the writer (here) and the
 * reader (the gate) reference these constants, the two can never drift (ADR-0007 §Decision, lines 75-76).
 *
 * PURE TEMPLATE / LITERAL STRINGS ONLY: no filesystem, no interpretation. The gate's use of these is a
 * literal substring presence check (ADR-0004 ceiling: presence, never quality).
 */

import type { ClaimFrontmatter } from "./types.ts";

// ── The three narrative-movement section headers (ADR-0007 §Decision) ─────────────
export const BODY_HEADER_CONCLUSION = "## Conclusion, with its conditions";
export const BODY_HEADER_CONTRADICTION = "## The contradiction and the caveat";
export const BODY_HEADER_DEFLATION = "## What would change it";

// ── The placeholder CUE strings — shared by the skeleton writer AND the gate ───────

/** Movement 1 (conclusion) cue — ALWAYS required gone at the canonical boundary. */
export const CUE_CONCLUSION = "<state the claim and the fork(s) it is conditional on, in prose>";

/**
 * Movement 2 (contradiction/caveat) cue — required gone ONLY when the claim declares ≥1 `contradicts`
 * or `inherits_caveat` edge. With no such edge the skeleton emits `CUE_NONE_DECLARED` instead, which is
 * a legitimately complete "nothing to explain" state and PASSES.
 */
export const CUE_CONTRADICTION = "<for each contradicts / inherited caveat, explain why it matters>";

/**
 * The "no edge declared" body line. NOT a cue: it is a complete state, never matched by the gate, so a
 * no-edge claim legitimately passes the contradiction movement.
 */
export const CUE_NONE_DECLARED = "<none declared>";

/** Movement 3 (deflation) cue — required gone, i.e. `deflation_route` is set (axiom 5). */
export const CUE_DEFLATION = "<the deflation route: what would shrink the residual uncertainty>";

/**
 * A skeleton claim body cueing the three required movements (Skill fills the prose). The deflation
 * movement is auto-filled VERBATIM from the agent-supplied `deflation_route` field when present (ADR-0007
 * §Decision: a verbatim echo, not interpretation); otherwise it carries the deflation cue.
 *
 * The contradiction movement carries its cue only when the claim declares ≥1 contradicts/inherits_caveat
 * edge; with none it carries `CUE_NONE_DECLARED` (a complete state, never gated).
 */
export function skeletonBody(fm: ClaimFrontmatter): string {
  return [
    BODY_HEADER_CONCLUSION,
    "",
    CUE_CONCLUSION,
    "",
    BODY_HEADER_CONTRADICTION,
    "",
    fm.contradicts.length > 0 || fm.inherits_caveat.length > 0
      ? CUE_CONTRADICTION
      : CUE_NONE_DECLARED,
    "",
    BODY_HEADER_DEFLATION,
    "",
    fm.deflation_route ?? CUE_DEFLATION,
  ].join("\n");
}
