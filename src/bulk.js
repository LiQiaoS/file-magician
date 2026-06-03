/**
 * bulk.js — Bulk file operations.
 *
 * Commands:
 *   bulk copy <source> <dest>     Copy files matching filters
 *   bulk move <source> <dest>     Move files matching filters
 *   bulk delete <target>          Delete files (to trash if possible)
 *   bulk touch <target>           Update timestamps
 *   bulk chmod <target> <mode>    Change permissions (Unix/macOS)
 */

import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, renameSync, unlinkSync,
         utimesSync, chmodSync } from 'node:fs';
import { walk, isParentOrEqual } from './walker.js';
import { buildFilter } from './filter.js';
import { preview } from './preview.js';
import { recordUndo, backupFile } from './undo.js';
import { trash, permanentDelete } from './trash.js';
import { info, success, error as logError, warn, summary,
         progressBar, endProgress } from './display.js';

const BULK_DEFAULTS = {
  dryRun: false,
  recursive: true,
  ext: [],
  'no-hidden': false,
};

/**
 * Execute a bulk subcommand.
 *
 * @param {'copy'|'move'|'delete'|'touch'|'chmod'} action
 * @param {string[]} args    Positional args
 * @param {object}   opts
 */
export async function bulk(action, args, opts) {
  const o = { ...BULK_DEFAULTS, ...opts };

  switch (action) {
    case 'copy':
    case 'move':
      if (args.length < 2) {
        info(`Usage: file-magician bulk ${action} <source> <dest>`);
        return;
      }
      await copyOrMove(action, args[0], args[1], o);
      break;

    case 'delete':
      await deleteFiles(args[0] || '.', o);
      break;

    case 'touch':
      await touchFiles(args[0] || '.', o);
      break;

    case 'chmod':
      if (!args[1]) {
        info('Usage: file-magician bulk chmod <target> <mode>');
        return;
      }
      await chmodFiles(args[0], args[1], o);
      break;

    default:
      warn(`Unknown bulk subcommand: ${action}`);
  }
}

// ── Copy / Move ────────────────────────────────────────────────────────────

async function copyOrMove(action, source, dest, opts) {
  const srcRoot = resolve(source);
  const dstRoot = resolve(dest);

  if (isParentOrEqual(srcRoot, dstRoot)) {
    logError('Destination cannot be the same as or inside the source.');
    return;
  }

  const files = walk([srcRoot], {
    hidden: !opts['no-hidden'],
    directories: false,
    recursive: opts.recursive !== false,
  });

  const filterFn = buildFilter({ ext: opts.ext, hidden: !opts['no-hidden'] });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No files to process.');
    return;
  }

  // Build target paths preserving directory structure
  const changes = candidates.map((file) => ({
    from: file,
    to: resolve(dstRoot, file.replace(srcRoot, '').replace(/^[/\\]/, '')),
    type: action,
  }));

  await preview(changes, { dryRun: opts.dryRun }, async (apply) => {
    const undoEntries = [];
    let done = 0;
    let failed = 0;

    const tick = progressBar(apply.length, `${action}ing`);

    for (const c of apply) {
      const targetDir = dirname(c.to);
      try {
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        if (action === 'copy') {
          copyFileSync(c.from, c.to);
          undoEntries.push({ type: 'copy', from: c.from, to: c.to });
        } else {
          renameSync(c.from, c.to);
          undoEntries.push({ type: 'move', from: c.from, to: c.to });
        }
        done++;
      } catch (err) {
        logError(`Failed: ${c.from} → ${err.message}`);
        failed++;
      }
      tick(done);
    }
    endProgress();

    if (undoEntries.length > 0) {
      const undoId = recordUndo(action, undoEntries);
      success(`Undo ID: ${undoId}`);
    }

    summary(done, 0, failed);
  });
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function deleteFiles(target, opts) {
  const root = resolve(target);

  const files = walk([root], {
    hidden: !opts['no-hidden'],
    directories: false,
    recursive: opts.recursive !== false,
  });

  const filterFn = buildFilter({ ext: opts.ext, hidden: !opts['no-hidden'] });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No files to delete.');
    return;
  }

  // Show what would be deleted
  const changes = candidates.map((file) => ({
    from: file,
    to: '/dev/null',
    type: 'delete',
  }));

  await preview(changes, { dryRun: opts.dryRun, quiet: true }, async (apply) => {
    let done = 0;
    let failed = 0;
    const undoEntries = [];

    const tick = progressBar(apply.length, 'deleting');

    for (const c of apply) {
      try {
        const backed = backupFile(c.from);
        undoEntries.push({ type: 'delete', from: c.from, to: c.from, backup: backed });
        if (!trash(c.from)) {
          permanentDelete(c.from);
        }
        done++;
      } catch {
        failed++;
      }
      tick(done);
    }
    endProgress();

    if (undoEntries.length > 0) {
      const undoId = recordUndo('delete', undoEntries);
      success(`Undo ID: ${undoId}`);
    }

    summary(done, 0, failed);
  });
}

// ── Touch ──────────────────────────────────────────────────────────────────

async function touchFiles(target, opts) {
  const root = resolve(target);
  const now = new Date();

  const files = walk([root], {
    hidden: !opts['no-hidden'],
    directories: false,
    recursive: opts.recursive !== false,
  });

  const filterFn = buildFilter({ ext: opts.ext, hidden: !opts['no-hidden'] });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No files to touch.');
    return;
  }

  let done = 0;
  let failed = 0;
  const tick = progressBar(candidates.length, 'touching');

  for (const file of candidates) {
    try {
      utimesSync(file, now, now);
      done++;
    } catch {
      failed++;
    }
    tick(done);
  }
  endProgress();

  summary(done, 0, failed);
}

// ── Chmod ──────────────────────────────────────────────────────────────────

async function chmodFiles(target, mode, opts) {
  const root = resolve(target);

  const files = walk([root], {
    hidden: !opts['no-hidden'],
    directories: false,
    recursive: opts.recursive !== false,
  });

  const filterFn = buildFilter({ ext: opts.ext, hidden: !opts['no-hidden'] });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No files to chmod.');
    return;
  }

  // Parse mode
  const modeNum = parseInt(mode, 8);
  if (isNaN(modeNum)) {
    logError(`Invalid mode: "${mode}". Use octal notation (e.g., 644).`);
    return;
  }

  let done = 0;
  let failed = 0;
  const tick = progressBar(candidates.length, 'chmod');

  for (const file of candidates) {
    try {
      chmodSync(file, modeNum);
      done++;
    } catch {
      failed++;
    }
    tick(done);
  }
  endProgress();

  summary(done, 0, failed);
}
