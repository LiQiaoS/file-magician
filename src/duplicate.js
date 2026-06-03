/**
 * duplicate.js — Duplicate file detection and cleanup.
 *
 * Two-phase approach:
 *   1. Group by file size (fast, cheap)
 *   2. Hash same-size candidates for exact match (precise)
 *
 * Options:
 *   --hash      Use content hashing (slower but exact)
 *   --algo      sha256 (default), sha1, md5
 *   --min-size  Ignore files below N bytes
 *   --delete    Remove duplicates (keeps one copy per group)
 *   --trash     Move to recycle bin instead of permanent delete
 */

import { resolve } from 'node:path';
import { statSync, unlinkSync } from 'node:fs';
import { walk } from './walker.js';
import { buildFilter } from './filter.js';
import { groupBySize, groupByHash } from './hashing.js';
import { recordUndo, backupFile } from './undo.js';
import { trash, permanentDelete } from './trash.js';
import { info, warn, error as logError, success, summary,
         duplicateTable, progressBar, endProgress, dim } from './display.js';

const DUPE_DEFAULTS = {
  dryRun: false,
  hash: false,
  algo: 'sha256',
  'min-size': 1,
  delete: false,
  trash: false,
};

/**
 * Execute the dedupe command.
 *
 * @param {string[]} targets
 * @param {object}   opts
 */
export async function dedupe(targets, opts) {
  const o = { ...DUPE_DEFAULTS, ...opts };
  const root = resolve(targets?.[0] || '.');

  info(`Scanning ${root} ...`);

  const files = walk([root], {
    hidden: false,
    directories: false,
    recursive: o.recursive !== false,
  });

  const filterFn = buildFilter({
    minSize: o['min-size'],
  });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No files found.');
    return;
  }

  info(`${candidates.length} files found. Grouping by size ...`);

  // Phase 1: group by size
  const sizeGroups = groupBySize(candidates);
  const sameSizeGroups = [...sizeGroups.values()].filter((g) => g.length > 1);

  if (sameSizeGroups.length === 0) {
    info('No potential duplicates found by size.');
    return;
  }

  info(`${sameSizeGroups.length} size group(s) with potential duplicates.`);

  // Phase 2: hash same-size files (if requested)
  let duplicates;

  if (!o.hash) {
    // Size-only mode (fast, less accurate)
    duplicates = sameSizeGroups.map((group) => ({
      size: getSize(group[0]),
      files: group,
    }));
  } else {
    info(`Hashing with ${o.algo} ...`);
    const tick = progressBar(sameSizeGroups.length, 'hashing');

    const allDupes = [];
    let done = 0;

    for (const group of sameSizeGroups) {
      const hashMap = await groupByHash(group, { algo: o.algo });
      for (const [, hashGroup] of hashMap) {
        if (hashGroup.length > 1) {
          allDupes.push({
            size: getSize(group[0]),
            files: hashGroup,
          });
        }
      }
      tick(++done);
    }
    endProgress();

    duplicates = allDupes;
  }

  if (duplicates.length === 0) {
    info('No exact duplicates found.');
    return;
  }

  // Show results
  duplicateTable(duplicates);

  if (o.delete || o.trash) {
    await deleteDuplicates(duplicates, o);
  }
}

async function deleteDuplicates(duplicates, o) {
  const toDelete = [];
  const undoEntries = [];

  for (const group of duplicates) {
    // Keep the first file, delete the rest
    for (let i = 1; i < group.files.length; i++) {
      const f = group.files[i];

      if (o.trash) {
        const backed = backupFile(f);
        undoEntries.push({ type: 'delete', from: f, to: f, backup: backed });
        toDelete.push(f);
      } else {
        const backed = backupFile(f);
        undoEntries.push({ type: 'delete', from: f, to: f, backup: backed });
        toDelete.push(f);
      }
    }
  }

  if (o.dryRun) {
    const total = toDelete.length;
    info(`Dry-run — ${total} file(s) would be deleted.`);
    info('Run without --dry-run to execute.');
    return;
  }

  info(`Deleting ${toDelete.length} duplicate(s) ...`);
  const tick = progressBar(toDelete.length, 'deleting');
  let done = 0;
  let failed = 0;

  for (const file of toDelete) {
    try {
      if (o.trash) {
        if (!trash(file)) {
          permanentDelete(file);
        }
      } else {
        permanentDelete(file);
      }
      done++;
    } catch {
      failed++;
    }
    tick(done);
  }
  endProgress();

  if (undoEntries.length > 0) {
    const undoId = recordUndo('dedupe', undoEntries);
    success(`Undo ID: ${undoId}`);
  }

  summary(done, 0, failed);
}

function getSize(file) {
  try { return statSync(file).size; } catch { return 0; }
}
