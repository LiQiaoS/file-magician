/**
 * rename.js — Batch rename command.
 *
 * Features:
 *   - Template-based renaming with {n}, {name}, {ext}, {date}, etc.
 *   - Regex search-and-replace (s/pattern/replacement/flags)
 *   - Case conversion (--lower, --upper, --title)
 *   - Extension swapping
 *   - Truncation / character-range extraction
 *   - Dry-run with full change table
 *   - Automatic conflict detection
 *   - Undo support
 */

import { extname, resolve, dirname, basename } from 'node:path';
import { existsSync, renameSync } from 'node:fs';
import { walk } from './walker.js';
import { buildFilter } from './filter.js';
import { compilePattern } from './patterns.js';
import { preview } from './preview.js';
import { recordUndo } from './undo.js';
import { info, success, error as logError, summary, progressBar, endProgress } from './display.js';

const RENAME_DEFAULTS = {
  dryRun: false,
  recursive: true,
  start: 1,
  lower: false,
  upper: false,
  title: false,
  hidden: false,
};

/**
 * Execute the rename command.
 *
 * @param {string}   pattern   Rename pattern
 * @param {string[]} targets   Files / directories
 * @param {object}   opts      CLI flags
 */
export async function rename(pattern, targets, opts) {
  const optsWithDefaults = { ...RENAME_DEFAULTS, ...opts };
  const root = resolve(targets[0] || '.');

  info(`Scanning ${root} ...`);

  // Discover files
  const files = walk(opts.recursive ? [root] : root, {
    hidden: optsWithDefaults.hidden,
    directories: false,
  });

  // Apply filters
  const filterFn = buildFilter({
    ext: optsWithDefaults.ext,
    excludeExt: optsWithDefaults.excludeExt || ['.lnk', '.url'],
    hidden: optsWithDefaults.hidden,
  });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No matching files found.');
    return;
  }

  // Compile pattern
  const compiled = compilePattern(pattern, {
    start: optsWithDefaults.start,
    lower: optsWithDefaults.lower,
    upper: optsWithDefaults.upper,
    title: optsWithDefaults.title,
  });

  // Generate changes
  const changes = [];
  const seen = new Set();

  for (const [i, file] of candidates.entries()) {
    const dir = dirname(file);
    const newName = compiled.generate(file, i);
    const target = resolve(dir, newName);

    // Skip no-ops
    if (file === target) continue;

    // Deduplicate: if target already exists in this batch, append a qualifier
    let deduped = target;
    let counter = 1;
    while (seen.has(deduped) || (existsSync(deduped) && !optsWithDefaults.force)) {
      const parsed = { name: basename(newName, extname(newName)), ext: extname(newName) };
      deduped = resolve(dir, `${parsed.name}_${counter}${parsed.ext}`);
      counter++;
    }
    seen.add(deduped);

    changes.push({ from: file, to: deduped, type: 'rename' });
  }

  // Apply via preview engine
  await preview(changes, { dryRun: optsWithDefaults.dryRun, root }, async (apply) => {
    const undoEntries = [];
    let done = 0;
    let failed = 0;

    const tick = progressBar(apply.length, 'renaming');
    for (const c of apply) {
      try {
        renameSync(c.from, c.to);
        undoEntries.push({ type: 'rename', from: c.from, to: c.to });
        done++;
      } catch (err) {
        logError(`Failed: ${c.from} → ${err.message}`);
        failed++;
      }
      tick(done);
    }
    endProgress();

    if (undoEntries.length > 0) {
      const undoId = recordUndo('rename', undoEntries);
      success(`Undo ID: ${undoId}`);
    }

    summary(done, 0, failed);
  });
}
