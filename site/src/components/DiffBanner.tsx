import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SnapshotDiff } from "../types";
import { shortId } from "../lib";

/**
 * Diff banner at the top: "Since <prev>: N changed", expandable to the categorized diff
 * (added / removed / text / freshness / verification). Read-only. Data comes from diff.json;
 * the site never recomputes it.
 */
export function DiffBanner({ diff }: { diff: SnapshotDiff | null }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  if (!diff) return null;

  const c = diff.counts;
  const total =
    c.added + c.removed + c.text_changed + c.freshness_changed + c.verification_changed;
  const firstPublish = diff.against === null;
  const canExpand = total > 0;

  return (
    <section className="diff-banner">
      <button
        type="button"
        className="diff-summary"
        aria-expanded={open}
        disabled={!canExpand}
        onClick={() => canExpand && setOpen((v) => !v)}
      >
        {canExpand && (
          <span className="chev" aria-hidden="true">
            <Chevron />
          </span>
        )}
        <span className="lead">
          {firstPublish ? (
            <>First publish · {c.added} {c.added === 1 ? "claim" : "claims"}</>
          ) : total === 0 ? (
            <>No changes since last snapshot</>
          ) : (
            <>{total} {total === 1 ? "change" : "changes"}</>
          )}
        </span>
        {!firstPublish && (
          <span className="since">
            since <code>{shortId(diff.against)}</code>
          </span>
        )}
        <span className="spacer" />
        <span className="diff-pills">
          {c.added > 0 && <span className="diff-pill added">+{c.added} added</span>}
          {c.removed > 0 && <span className="diff-pill removed">−{c.removed} removed</span>}
          {c.text_changed > 0 && <span className="diff-pill">{c.text_changed} text</span>}
          {c.freshness_changed > 0 && (
            <span className="diff-pill">{c.freshness_changed} freshness</span>
          )}
          {c.verification_changed > 0 && (
            <span className="diff-pill">{c.verification_changed} verification</span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && canExpand && (
          <motion.div
            className="diff-body"
            initial={reduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            {diff.added.length > 0 && (
              <div className="diff-group">
                <h3>Added</h3>
                <ul className="diff-list">
                  {diff.added.map((claim) => (
                    <li className="diff-row" key={claim.id}>
                      <span className="cid">{claim.id}</span>
                      <span>{claim.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.removed.length > 0 && (
              <div className="diff-group">
                <h3>Removed</h3>
                <ul className="diff-list">
                  {diff.removed.map((id) => (
                    <li className="diff-row" key={id}>
                      <span className="cid">{id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.text_changed.length > 0 && (
              <div className="diff-group">
                <h3>Text changed</h3>
                <ul className="diff-list">
                  {diff.text_changed.map((t) => (
                    <li className="diff-row" key={t.id}>
                      <span className="cid">{t.id}</span>
                      <span className="change-from">{t.before}</span>
                      <span className="arrow">→</span>
                      <span>{t.after}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.freshness_changed.length > 0 && (
              <div className="diff-group">
                <h3>Freshness changed</h3>
                <ul className="diff-list">
                  {diff.freshness_changed.map((f) => (
                    <li className="diff-row" key={f.id}>
                      <span className="cid">{f.id}</span>
                      <span className="change-from">{f.before}</span>
                      <span className="arrow">→</span>
                      <span>{f.after}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.verification_changed.length > 0 && (
              <div className="diff-group">
                <h3>Verification changed</h3>
                <ul className="diff-list">
                  {diff.verification_changed.map((v) => (
                    <li className="diff-row" key={v.id}>
                      <span className="cid">{v.id}</span>
                      <span className="change-from">{v.before}</span>
                      <span className="arrow">→</span>
                      <span>{v.after}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
