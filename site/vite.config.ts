import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// HARD CONTRACT: emit a fully static bundle (index.html + js/css) that fetches RELATIVE
// paths ./data/head.json + ./data/diff.json at runtime and renders entirely client-side.
// base: "./" makes every asset reference relative, so the bundle works opened from any
// static file host (including file://) and from inside an immutable snapshot dir.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // Inline nothing that would break relative resolution; keep js/css as separate assets.
    assetsInlineLimit: 0,
    target: "es2020",
  },
});
