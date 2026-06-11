import { useEffect, useMemo, useState, useCallback } from "react";
import type { PublishedHead, SnapshotDiff } from "./types";
import { formatAsOf, shortId } from "./lib";
import { DiffBanner } from "./components/DiffBanner";
import { ClaimCard } from "./components/ClaimCard";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; head: PublishedHead; diff: SnapshotDiff | null };

/**
 * Root viewer. Fetches RELATIVE ./data/head.json (required) and ./data/diff.json (optional)
 * at runtime and renders entirely client-side — no server, no absolute paths, works opened
 * from any static file host or from inside an immutable snapshot dir.
 *
 * The published head is CANONICAL ONLY (decision A): there is no draft UI anywhere. Freshness
 * is read verbatim from head.json and never recomputed (decision C).
 */
export function App() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headRes = await fetch("./data/head.json", { cache: "no-cache" });
        if (!headRes.ok) {
          throw new Error(`head.json → HTTP ${headRes.status}`);
        }
        const head = (await headRes.json()) as PublishedHead;

        // diff.json is best-effort: a snapshot always ships one, but tolerate its absence.
        let diff: SnapshotDiff | null = null;
        try {
          const diffRes = await fetch("./data/diff.json", { cache: "no-cache" });
          if (diffRes.ok) diff = (await diffRes.json()) as SnapshotDiff;
        } catch {
          diff = null;
        }

        if (!cancelled) setState({ phase: "ready", head, diff });
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const jumpToDep = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Defer scroll until the target is in the DOM / expanded.
    requestAnimationFrame(() => {
      const el = document.getElementById(`claim-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.animate(
          [
            { boxShadow: "0 0 0 2px var(--accent)" },
            { boxShadow: "0 0 0 0 transparent" },
          ],
          { duration: 1100, easing: "ease-out" },
        );
      }
    });
  }, []);

  if (state.phase === "loading") {
    return (
      <main className="app">
        <div className="state-screen">
          <div className="spinner" aria-hidden="true" />
          <h2>Loading…</h2>
          <code>./data/head.json</code>
        </div>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="app">
        <div className="state-screen">
          <h2>Could not load the published head</h2>
          <p>This viewer expects a sibling <code>./data/head.json</code>.</p>
          <code>{state.message}</code>
        </div>
      </main>
    );
  }

  return <Loaded head={state.head} diff={state.diff} expanded={expanded} onToggle={toggle} onJumpToDep={jumpToDep} />;
}

function Loaded({
  head,
  diff,
  expanded,
  onToggle,
  onJumpToDep,
}: {
  head: PublishedHead;
  diff: SnapshotDiff | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onJumpToDep: (id: string) => void;
}) {
  const claims = useMemo(
    () => [...head.claims].sort((a, b) => a.id.localeCompare(b.id)),
    [head.claims],
  );
  const projectName = head.project ?? "Cairn";
  const publishedAt = formatAsOf(head.published_at);

  return (
    <main className="app">
      <header className="site-header">
        <p className="eyebrow">Published claim head · read-only</p>
        <h1>{projectName}</h1>
        <div className="header-meta">
          <span className="snap-id" title={`snapshot ${head.snapshot.current}`}>
            {shortId(head.snapshot.current)}
          </span>
          <span className="dot">·</span>
          <span>published {publishedAt}</span>
          {head.snapshot.previous && (
            <>
              <span className="dot">·</span>
              <span>
                prev <code className="mono">{shortId(head.snapshot.previous)}</code>
              </span>
            </>
          )}
        </div>
      </header>

      <DiffBanner diff={diff} />

      <div className="claims-head">
        <h2>Canonical claims</h2>
        <span className="count">
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
        </span>
      </div>

      {claims.length === 0 ? (
        <div className="state-screen" style={{ minHeight: "30vh" }}>
          <h2>No canonical claims yet</h2>
          <p>This published head is empty.</p>
        </div>
      ) : (
        <div className="claim-list">
          {claims.map((claim, i) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              index={i}
              expanded={expanded.has(claim.id)}
              onToggle={() => onToggle(claim.id)}
              onJumpToDep={onJumpToDep}
            />
          ))}
        </div>
      )}

      <footer className="site-footer">
        <span className="ro">read-only</span>
        <span>
          Freshness frozen as of {publishedAt} — this view never recomputes. Verification shown
          as stored.
        </span>
      </footer>
    </main>
  );
}
