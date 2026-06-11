import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { PublishedClaim } from "../types";
import { METHOD_LABEL, TIER_LABEL, METHOD_TIER, shortFingerprint } from "../lib";
import { FreshnessBadge, VerificationBadge } from "./Badges";

const KIND_LABEL: Record<string, string> = {
  target: "target",
  file: "file",
  data: "data",
  external: "external",
};

/**
 * One claim card. Read-only everywhere — no edit affordances. Click the card body to expand
 * the detail (full grounding edges with fingerprint method + location, and the dependency
 * chain). Drafts never reach here: the published head is canonical-only (decision A).
 */
export function ClaimCard({
  claim,
  index,
  expanded,
  onToggle,
  onJumpToDep,
}: {
  claim: PublishedClaim;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onJumpToDep: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const panelId = useId();

  return (
    <motion.article
      className="claim-card"
      id={`claim-${claim.id}`}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.045, 0.4),
        ease: [0.2, 0.7, 0.3, 1],
      }}
      whileHover={reduce ? undefined : { y: -2, boxShadow: "var(--shadow-hover)" }}
    >
      <button
        type="button"
        className="claim-main"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <p className="claim-text">{claim.text}</p>
        <div className="claim-badges">
          <FreshnessBadge freshness={claim.freshness} />
          <VerificationBadge verification={claim.verification} />
        </div>

        {(claim.grounding.length > 0 || claim.depends_on.length > 0) && (
          <div className="claim-refs">
            {claim.grounding.map((g, i) => (
              <span
                className="ref-chip"
                key={`g-${i}`}
                title={`${g.kind} · ${g.method} · ${g.location}`}
              >
                <span className="k">{KIND_LABEL[g.kind] ?? g.kind}:</span> {g.ref}
              </span>
            ))}
            {claim.depends_on.map((d) => (
              <span className="ref-chip dep-chip" key={`d-${d}`} title={`depends on ${d}`}>
                ↳ {d}
              </span>
            ))}
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            className="claim-detail"
            initial={reduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <ClaimDetail claim={claim} onJumpToDep={onJumpToDep} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function ClaimDetail({
  claim,
  onJumpToDep,
}: {
  claim: PublishedClaim;
  onJumpToDep: (id: string) => void;
}) {
  return (
    <>
      <div className="detail-section">
        <h4>Grounding ({claim.grounding.length})</h4>
        {claim.grounding.length === 0 ? (
          <p className="diff-empty">No grounding edges.</p>
        ) : (
          claim.grounding.map((g, i) => {
            const tier = METHOD_TIER[g.method];
            return (
              <div className="edge" key={i}>
                <div className="edge-head">
                  <span className="edge-kind">{KIND_LABEL[g.kind] ?? g.kind}</span>
                  <span className="edge-tier">tier · {TIER_LABEL[tier]}</span>
                </div>
                <div className="edge-ref">{g.ref}</div>
                <dl className="edge-grid">
                  <dt>method</dt>
                  <dd>{METHOD_LABEL[g.method]}</dd>
                  <dt>fingerprint</dt>
                  <dd title={g.fingerprint}>{shortFingerprint(g.fingerprint)}</dd>
                  <dt>location</dt>
                  <dd>{g.location}</dd>
                </dl>
              </div>
            );
          })
        )}
      </div>

      <div className="detail-section">
        <h4>Dependency chain ({claim.depends_on.length})</h4>
        {claim.depends_on.length === 0 ? (
          <p className="diff-empty">Grounds directly on evidence — no claim dependencies.</p>
        ) : (
          <div className="dep-chain">
            {claim.depends_on.map((d) => (
              <button
                type="button"
                className="dep-link"
                key={d}
                onClick={() => onJumpToDep(d)}
              >
                ↳ {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="detail-meta">{claim.id}</div>
    </>
  );
}
