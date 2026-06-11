#!/usr/bin/env bun
/**
 * Cairn CLI — the SOLE writer to the store.
 *
 * Scaffold stub: the verb implementations are built by the CLI/core builder against the pinned
 * contracts in `./types.ts` and `../docs/CONTRACTS.md`. This entrypoint only routes verbs so the
 * `bin` target resolves; it intentionally does no work yet.
 */

const VERBS = [
  "head",
  "add-claim",
  "ground",
  "refresh",
  "validate",
  "publish",
  "drafts",
  "status",
] as const;

const verb = process.argv[2];

if (!verb || verb === "--help" || verb === "-h") {
  console.log(`cairn — local claim-graph store (CLI is the sole writer)\n`);
  console.log(`usage: cairn <verb> [...args]\n`);
  console.log(`verbs: ${VERBS.join(", ")}`);
  process.exit(verb ? 0 : 1);
}

if (!(VERBS as readonly string[]).includes(verb)) {
  console.error(`cairn: unknown verb "${verb}". known: ${VERBS.join(", ")}`);
  process.exit(2);
}

console.error(`cairn: "${verb}" not implemented yet (scaffold). See docs/CONTRACTS.md.`);
process.exit(3);
