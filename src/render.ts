/**
 * render.ts — render the OKF orient surface (OrientSurface) into the `index.md` markdown emitted by
 * `head` and frozen into each snapshot bundle.
 *
 * The orient surface MUST surface unresolved contradictions and staleness PROMINENTLY (PRD stories
 * 10-11; ADR-0004) — never bury them under the canonical positives. So the layout leads with the
 * warning sections (contradictions, then stale) and lists the canonical claims after, each annotated
 * with its freshness / verification / resolution / corroboration badges.
 */

import type { OrientSurface, PublishedClaim } from "./types.ts";

function badge(c: PublishedClaim): string {
  const bits = [
    `freshness:${c.freshness}`,
    `verification:${c.verification}`,
    `resolution:${c.resolution}`,
    `corroboration:${c.corroboration}`,
  ];
  if (c.resolution === "open" && c.contradicts.length > 0) bits.push("CONTESTED");
  return bits.join(" · ");
}

/**
 * Render an OrientSurface to markdown. `generatedAt` (when given) is stamped in a small footer; it is
 * informational only and never part of any content-addressed id, so the frozen snapshot index.md is
 * emitted WITHOUT it (pass undefined) to keep the bundle byte-stable.
 */
export function renderIndexMd(surface: OrientSurface, generatedAt: string | undefined): string {
  const out: string[] = [];
  out.push("# Cairn orient surface");
  out.push("");

  // ── Unresolved contradictions (surfaced first; never buried) ──
  out.push(`## Unresolved contradictions (${surface.contradictions.length})`);
  out.push("");
  if (surface.contradictions.length === 0) {
    out.push("_None._");
  } else {
    out.push("These canonical claims remain OPEN against a live contradicting claim. A contested");
    out.push("claim may be canonical but is never settled (the NK CLOSED-NEGATIVE block).");
    out.push("");
    for (const x of surface.contradictions) {
      const est = x.estimand ? ` (estimand ${x.estimand})` : "";
      out.push(`- \`${x.claim}\` contradicts \`${x.contradicts}\`${est}`);
    }
  }
  out.push("");

  // ── Staleness (surfaced second; never buried) ──
  out.push(`## Stale / unknown-freshness canonical claims (${surface.stale.length})`);
  out.push("");
  if (surface.stale.length === 0) {
    out.push("_None._");
  } else {
    out.push("A false `fresh` is the enemy; these claims rest on evidence that moved or is unreachable.");
    out.push("");
    for (const id of surface.stale) out.push(`- \`${id}\``);
  }
  out.push("");

  // ── Canonical claims (after the warnings) ──
  out.push(`## Canonical claims (${surface.canonical.length})`);
  out.push("");
  if (surface.canonical.length === 0) {
    out.push("_None._");
  } else {
    for (const c of surface.canonical) {
      out.push(`### \`${c.id}\``);
      out.push("");
      out.push(c.text);
      out.push("");
      if (c.estimand) out.push(`- estimand: \`${c.estimand}\``);
      out.push(`- provenance: ${c.provenance}`);
      out.push(`- ${badge(c)}`);
      if (c.depends_on_fork.length > 0) {
        out.push(`- forks: ${c.depends_on_fork.map((f) => `${f.axis}=${f.choice}`).join(", ")}`);
      }
      if (c.contradicts.length > 0) {
        out.push(`- contradicts: ${c.contradicts.map((x) => `\`${x}\``).join(", ")}`);
      }
      if (c.inherits_caveat.length > 0) {
        out.push(`- inherits caveat: ${c.inherits_caveat.map((x) => `\`${x}\``).join(", ")}`);
      }
      out.push("");
    }
  }

  if (generatedAt !== undefined) {
    out.push("---");
    out.push(`_generated ${generatedAt}_`);
  }
  return out.join("\n").replace(/\n+$/, "") + "\n";
}
