/**
 * preview.js — Dry-run preview engine.
 *
 * Computes old→new pairs and categorises them so every command
 * can offer --dry-run / --no-execute with zero code duplication.
 */

import { relative } from 'node:path';
import { changeTable, info, warn } from './display.js';

/**
 * @typedef {object} Change
 * @property {string} from   Current absolute path
 * @property {string} to     Target absolute path
 * @property {boolean} [isDir]
 * @property {'rename'|'copy'|'move'|'delete'|'image'} type
 */

/**
 * Preview a set of changes and optionally apply them.
 *
 * @param {Change[]} changes
 * @param {object}   [opts]
 * @param {boolean}  [opts.dryRun=false]     Show only, don't apply
 * @param {boolean}  [opts.quiet=false]      Suppress the table
 * @param {string}   [opts.root]             Base dir for relative display
 * @param {(changes: Change[]) => Promise<{done: number, skipped: number, failed: number}>} applyFn
 * @returns {Promise<{done: number, skipped: number, failed: number}>}
 */
export async function preview(changes, opts, applyFn) {
  const { dryRun = false, quiet = false, root } = opts ?? {};

  if (changes.length === 0) {
    info('No files match the given criteria.');
    return { done: 0, skipped: 0, failed: 0 };
  }

  if (!quiet) {
    const displayChanges = root
      ? changes.map((c) => ({
          ...c,
          from: relative(root, c.from),
          to: relative(root, c.to),
        }))
      : changes;

    changeTable(displayChanges);

    const conflicts = findConflicts(changes);
    if (conflicts.length > 0) {
      warn(`${conflicts.length} target conflict(s) detected — two items would map to the same name.`);
      for (const c of conflicts) {
        warn(`  ${c.from} → ${c.to}`);
      }
    }
  }

  if (dryRun) {
    info(`Dry-run — ${changes.length} change(s) would be applied.`);
    info('Re-run without --dry-run to execute.');
    return { done: 0, skipped: 0, failed: 0 };
  }

  return await applyFn(changes);
}

/**
 * Detect duplicate target paths in a change set.
 */
function findConflicts(changes) {
  const seen = new Map();
  const conflicts = [];
  for (const c of changes) {
    if (c.type === 'delete') continue;
    if (seen.has(c.to)) {
      conflicts.push(c);
    } else {
      seen.set(c.to, c);
    }
  }
  return conflicts;
}
