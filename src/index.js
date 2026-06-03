/**
 * file-magician — CLI entry point.
 *
 * Registers all commands and subcommands on the Commander program.
 * Every mutating command exposes --dry-run and respects the undo trail.
 */

import { Command } from 'commander';
import { rename } from './rename.js';
import { organize } from './organize.js';
import { dedupe } from './duplicate.js';
import { bulk } from './bulk.js';
import { processImages } from './image.js';
import { listUndo, rollback } from './undo.js';
import { loadConfig, setConfig, getConfig, resetConfig, listConfig } from './config.js';
import { info, error as logError } from './display.js';

/**
 * Boot the CLI program.
 *
 * @param {string} version  From package.json
 */
export async function run(version) {
  const cfg = loadConfig();

  const program = new Command();

  program
    .name('file-magician')
    .description(
      'Batch file processing: rename, organise, deduplicate, bulk ops, and image processing.\n' +
      '  Docs:  https://github.com/liqs/file-magician#readme'
    )
    .version(version, '-v, --version', 'Show version')
    .helpOption('-h, --help', 'Show help')
    .hook('preSubcommand', (thisCmd, subCmd) => {
      // Merge config defaults into argv for the subcommand
      if (subCmd) {
        const opts = program.opts();
        for (const [key, val] of Object.entries(cfg)) {
          // Only apply if not explicitly set via CLI
          const flagKey = camelCase(key);
          if (opts[flagKey] === undefined) {
            opts[flagKey] = val;
          }
        }
      }
    });

  // ── rename ───────────────────────────────────────────────────────────────
  program
    .command('rename')
    .description('Batch rename files using patterns or regex')
    .argument('<pattern>', 'Rename pattern (e.g., "img_{n:3}" or "s/old/new/")')
    .argument('[path]', 'Target directory or file (default: current dir)')
    .option('--dry-run', 'Preview changes without applying them')
    .option('-r, --recursive', 'Process subdirectories', true)
    .option('--start <n>', 'Starting number for {n}', Number, 1)
    .option('--lower', 'Convert names to lowercase')
    .option('--upper', 'Convert names to uppercase')
    .option('--title', 'Convert names to Title Case')
    .option('--ext <exts...>', 'Only process these extensions')
    .option('--exclude-ext <exts...>', 'Exclude these extensions')
    .option('--no-hidden', 'Exclude dot-files')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (pattern, path, opts) => {
      await rename(pattern, path ? [path] : ['.'], opts);
    });

  // ── organize ─────────────────────────────────────────────────────────────
  program
    .command('organize')
    .description('Sort files into categorized directories')
    .argument('[path]', 'Target directory (default: current dir)')
    .option('--dry-run', 'Preview changes without applying them')
    .option('-r, --recursive', 'Process subdirectories', true)
    .option('--by-type', 'Organize by file type (Images, Documents, etc.)')
    .option('--by-date', 'Organize by modification date (year/month)')
    .option('--by-size', 'Organize by file size buckets')
    .option('--by-pattern <regex>', 'Organize by regex capture group')
    .option('--flat', 'Flatten nested structure into one directory')
    .option('--copy', 'Copy instead of move')
    .option('--no-hidden', 'Exclude dot-files')
    .action(async (path, opts) => {
      await organize(path ? [path] : ['.'], opts);
    });

  // ── dedupe ───────────────────────────────────────────────────────────────
  program
    .command('dedupe')
    .description('Find and optionally remove duplicate files')
    .argument('[path]', 'Target directory (default: current dir)')
    .option('--dry-run', 'Scan only, do not delete')
    .option('-r, --recursive', 'Process subdirectories', true)
    .option('--hash', 'Use content hashing for exact matches (slower)')
    .option('--algo <algo>', 'Hash algorithm: sha256, sha1, md5', 'sha256')
    .option('--min-size <bytes>', 'Minimum file size', Number, 1)
    .option('--delete', 'Delete duplicates permanently')
    .option('--trash', 'Move duplicates to recycle bin')
    .action(async (path, opts) => {
      await dedupe(path ? [path] : ['.'], opts);
    });

  // ── bulk ─────────────────────────────────────────────────────────────────
  const bulkCmd = program
    .command('bulk')
    .description('Bulk copy, move, delete, touch, or chmod files')
    .option('--dry-run', 'Preview changes without applying them')
    .option('-r, --recursive', 'Process subdirectories', true)
    .option('--ext <exts...>', 'Only process these extensions')
    .option('--no-hidden', 'Exclude dot-files');

  bulkCmd
    .command('copy <source> <dest>')
    .description('Copy files matching filters')
    .action(async (source, dest, opts) => {
      await bulk('copy', [source, dest], opts);
    });

  bulkCmd
    .command('move <source> <dest>')
    .description('Move files matching filters')
    .action(async (source, dest, opts) => {
      await bulk('move', [source, dest], opts);
    });

  bulkCmd
    .command('delete [target]')
    .description('Delete files (to trash if possible)')
    .action(async (target, opts) => {
      await bulk('delete', [target || '.'], opts);
    });

  bulkCmd
    .command('touch [target]')
    .description('Update file timestamps')
    .action(async (target, opts) => {
      await bulk('touch', [target || '.'], opts);
    });

  bulkCmd
    .command('chmod <target> <mode>')
    .description('Change file permissions (octal mode)')
    .action(async (target, mode, opts) => {
      await bulk('chmod', [target, mode], opts);
    });

  // ── image ────────────────────────────────────────────────────────────────
  program
    .command('image')
    .description('Batch image processing (requires sharp)')
    .argument('[path]', 'Target directory (default: current dir)')
    .option('--dry-run', 'Preview changes without applying them')
    .option('--resize <WxH>', 'Resize to fit dimensions (e.g., 800x600)')
    .option('--format <ext>', 'Output format: jpg, png, webp, avif, tiff')
    .option('--quality <n>', 'Output quality 1-100', Number, 85)
    .option('--strip', 'Remove EXIF/metadata')
    .option('--grayscale', 'Convert to grayscale')
    .action(async (path, opts) => {
      await processImages(path ? [path] : ['.'], opts);
    });

  // ── undo ─────────────────────────────────────────────────────────────────
  program
    .command('undo')
    .description('List or roll back previous operations')
    .argument('[id]', 'Operation ID to roll back (omit to list)')
    .action((id) => {
      if (id) {
        rollback(id);
      } else {
        const entries = listUndo();
        if (entries.length === 0) {
          info('No undo history found.');
          return;
        }
        info('Recent operations (use `file-magician undo <id>` to roll back):');
        for (const e of entries) {
          const time = new Date(e.timestamp).toLocaleString();
          info(`  ${e.id}  (${time})  ${e.command}`);
        }
      }
    });

  // ── config ───────────────────────────────────────────────────────────────
  const configCmd = program
    .command('config')
    .description('View or modify configuration');

  configCmd
    .command('get [key]')
    .description('Show configuration (or a single key)')
    .action((key) => {
      if (key) {
        info(`${key}: ${JSON.stringify(getConfig(key))}`);
      } else {
        console.log(listConfig());
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key, value) => {
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      setConfig(key, parsed);
      info(`${key} set to ${JSON.stringify(parsed)}`);
    });

  configCmd
    .command('reset')
    .description('Reset configuration to defaults')
    .action(() => {
      resetConfig();
      info('Configuration reset to defaults.');
    });

  // ── Parse ────────────────────────────────────────────────────────────────
  await program.parseAsync(process.argv);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function camelCase(str) {
  return str.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}
