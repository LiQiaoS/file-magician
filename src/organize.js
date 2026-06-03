/**
 * organize.js — File organization command.
 *
 * Sort files into subdirectories by:
 *   - type     → Images/, Documents/, Archives/, …
 *   - date     → 2025/01-Jan/, 2025/02-Feb/, …
 *   - size     → small/, medium/, large/, …
 *   - pattern  → Captures from a regex group
 *   - flat     → Flatten nested structure into a single directory
 */

import { resolve, dirname, extname, basename, join } from 'node:path';
import { existsSync, mkdirSync, renameSync, copyFileSync, statSync } from 'node:fs';
import { walk } from './walker.js';
import { buildFilter } from './filter.js';
import { preview } from './preview.js';
import { recordUndo } from './undo.js';
import { info, warn, error as logError, success, summary, progressBar, endProgress } from './display.js';

const ORGANIZE_DEFAULTS = {
  dryRun: false,
  recursive: true,
  'no-hidden': false,
  'copy': false,
};

// ── Category definitions ───────────────────────────────────────────────────

const TYPE_CATEGORIES = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.avif'],
  Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.txt', '.md', '.rst', '.csv', '.tsv'],
  Archives: ['.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.zst'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
  Video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm', '.m4v'],
  Code: ['.js', '.ts', '.py', '.rb', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.hpp', '.cs', '.swift', '.kt', '.scala', '.php', '.sh', '.bash', '.ps1', '.bat', '.cmd', '.yml', '.yaml', '.json', '.xml', '.toml', '.ini', '.cfg', '.conf'],
  Fonts: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
  DiskImages: ['.iso', '.dmg', '.vhd', '.vhdx', '.vmdk'],
};

const SIZE_BUCKETS = [
  { name: 'tiny', max: 1024, label: '< 1 KB' },
  { name: 'small', max: 100 * 1024, label: '1–100 KB' },
  { name: 'medium', max: 1024 * 1024, label: '100 KB–1 MB' },
  { name: 'large', max: 100 * 1024 * 1024, label: '1–100 MB' },
  { name: 'huge', max: Infinity, label: '> 100 MB' },
];

// ── Entry point ────────────────────────────────────────────────────────────

/**
 * Execute the organize command.
 *
 * @param {string[]} targets
 * @param {object}   opts
 */
export async function organize(targets, opts) {
  const o = { ...ORGANIZE_DEFAULTS, ...opts };
  if (!targets || targets.length === 0) targets = ['.'];

  const root = resolve(targets[0]);

  // Pick categoriser
  let categoriser;
  if (o.byType) {
    categoriser = byType;
  } else if (o.byDate) {
    categoriser = byDate;
  } else if (o.bySize) {
    categoriser = bySize;
  } else if (o.byPattern) {
    try {
      categoriser = byPatternFn(new RegExp(o.byPattern));
    } catch {
      logError(`Invalid regex pattern: ${o.byPattern}`);
      return;
    }
  } else if (o.flat) {
    categoriser = flatCategoriser;
  } else {
    info('No organise strategy specified. Use --by-type, --by-date, --by-size, --by-pattern, or --flat.');
    return;
  }

  info(`Scanning ${root} ...`);

  const files = walk(o.recursive ? [root] : root, {
    hidden: !o['no-hidden'],
    directories: false,
  });

  const filterFn = buildFilter({
    hidden: !o['no-hidden'],
  });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No files to organise.');
    return;
  }

  // Generate moves
  const changes = [];

  for (const file of candidates) {
    const category = categoriser(file);
    if (!category) continue;

    const targetDir = resolve(root, sanitise(category));
    const targetFile = resolve(targetDir, basename(file));

    // Avoid self-move
    if (file === targetFile) continue;

    // Deconflict
    let deduped = targetFile;
    let counter = 1;
    while (existsSync(deduped)) {
      const ext = extname(targetFile);
      const base = basename(targetFile, ext);
      deduped = resolve(targetDir, `${base}_${counter}${ext}`);
      counter++;
    }

    changes.push({
      from: file,
      to: deduped,
      isDir: false,
      type: o.copy ? 'copy' : 'move',
    });
  }

  const action = o.copy ? 'Copied' : 'Moved';

  await preview(changes, { dryRun: o.dryRun, root }, async (apply) => {
    const undoEntries = [];
    let done = 0;
    let failed = 0;

    const tick = progressBar(apply.length, action.toLowerCase());

    for (const c of apply) {
      const targetDir = dirname(c.to);
      try {
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        if (o.copy) {
          copyFileSync(c.from, c.to);
        } else {
          renameSync(c.from, c.to);
        }

        undoEntries.push({ type: o.copy ? 'copy' : 'move', from: c.from, to: c.to });
        done++;
      } catch (err) {
        logError(`Failed: ${c.from} → ${err.message}`);
        failed++;
      }
      tick(done);
    }
    endProgress();

    if (undoEntries.length > 0) {
      const undoId = recordUndo(o.copy ? 'copy' : 'move', undoEntries);
      success(`Undo ID: ${undoId}`);
    }

    summary(done, 0, failed);
  });
}

// ── Categorisers ───────────────────────────────────────────────────────────

function byType(file) {
  const e = extname(file).toLowerCase();
  for (const [cat, exts] of Object.entries(TYPE_CATEGORIES)) {
    if (exts.includes(e)) return cat;
  }
  return 'Other';
}

function byDate(file) {
  try {
    const mtime = statSync(file).mtime;
    const year = mtime.getFullYear();
    const month = String(mtime.getMonth() + 1).padStart(2, '0');
    const label = mtime.toLocaleString('en-US', { month: 'short' });
    return `${year}/${month}-${label}`;
  } catch {
    return null;
  }
}

function bySize(file) {
  try {
    const size = statSync(file).size;
    for (const bucket of SIZE_BUCKETS) {
      if (size < bucket.max) return bucket.name;
    }
    return 'huge';
  } catch {
    return null;
  }
}

function byPatternFn(regex) {
  return (file) => {
    const match = basename(file).match(regex);
    return match ? match[1] || match[0] : null;
  };
}

function flatCategoriser(_file) {
  return '';
}

function sanitise(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}
