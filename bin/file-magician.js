#!/usr/bin/env node

/**
 * file-magician — Batch file processing at scale.
 *
 * Entry-point that loads the CLI and dispatches commands.
 * Sensible defaults, dry-run everywhere, and a full undo trail.
 *
 * https://github.com/liqs/file-magician
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Bootstrap ──────────────────────────────────────────────────────────────
// Use a shim to let the ESM main import our package.json for version info.
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')
);

process.title = 'file-magician';

async function main() {
  const { run } = await import('../src/index.js');
  await run(pkg.version);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
