/**
 * display.js — Terminal output utilities.
 *
 * Consistent styling: colors, spinners, tables, progress bars.
 * Everything goes through here so we can add a --json flag later trivially.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { format as prettyBytes } from 'node:util';

// ── Colour palette ─────────────────────────────────────────────────────────
const theme = {
  info: chalk.blue,
  success: chalk.green,
  warning: chalk.yellowBright,
  error: chalk.red,
  dim: chalk.gray,
  highlight: chalk.cyan,
  bold: chalk.bold,
  path: chalk.underline.cyan,
  added: chalk.green,
  removed: chalk.red,
  changed: chalk.yellow,
};

// ── Public API ─────────────────────────────────────────────────────────────

export function info(msg) {
  console.error(`${theme.info('ℹ')} ${msg}`);
}

export function success(msg) {
  console.error(`${theme.success('✔')} ${msg}`);
}

export function warn(msg) {
  console.error(`${theme.warning('⚠')} ${msg}`);
}

export function error(msg) {
  console.error(`${theme.error('✘')} ${msg}`);
}

export function highlight(msg) {
  return theme.highlight(msg);
}

export function dim(msg) {
  return theme.dim(msg);
}

export function pathStyle(p) {
  return theme.path(p);
}

/**
 * Render a two-column change-set table (old → new).
 */
export function changeTable(changes) {
  if (changes.length === 0) {
    info('No changes to display.');
    return;
  }

  const table = new Table({
    head: ['#', theme.dim('Current'), '', theme.dim('New')],
    style: { head: ['gray'], border: ['gray'] },
    colWidths: [4, 40, 4, 40],
    wordWrap: true,
  });

  changes.forEach((c, i) => {
    const num = String(i + 1);
    const from = c.from.length > 40 ? c.from.slice(0, 37) + '...' : c.from;
    const to = c.to.length > 40 ? c.to.slice(0, 37) + '...' : c.to;

    const arrow = c.isDir ? theme.dim(' → ') : ' → ';

    table.push([
      theme.dim(num),
      c.isDir ? theme.dim(from) : from,
      arrow,
      c.isDir ? theme.dim(to) : theme.added(to),
    ]);
  });

  console.error(table.toString());
}

/**
 * Render a file-size comparison table for duplicate scans.
 */
export function duplicateTable(groups) {
  if (groups.length === 0) {
    info('No duplicates found.');
    return;
  }

  const table = new Table({
    head: [
      theme.dim('Size'),
      theme.dim('Count'),
      theme.dim('Files'),
    ],
    style: { head: ['gray'], border: ['gray'] },
    colWidths: [14, 8, 76],
    wordWrap: false,
  });

  for (const group of groups) {
    table.push([
      prettyBytes(group.size),
      String(group.files.length),
      group.files.map((f) => theme.path(f)).join('\n'),
    ]);
  }

  console.error(table.toString());
  const total = groups.reduce((s, g) => s + g.files.length, 0);
  const wasted = groups.reduce((s, g) => s + g.size * (g.files.length - 1), 0);
  success(
    `Found ${chalk.bold(String(total))} duplicate files ` +
    `(${theme.warning(prettyBytes(wasted))} recoverable).`
  );
}

/**
 * Render a summary bar at the end of an operation.
 */
export function summary(done, skipped, failed) {
  const parts = [theme.success(`${done} done`)];
  if (skipped > 0) parts.push(theme.dim(`${skipped} skipped`));
  if (failed > 0) parts.push(theme.error(`${failed} failed`));
  console.error(`\n${parts.join(', ')}`);
}

/**
 * Create a labelled progress bar.
 * Returns a function that updates the bar on each tick.
 *
 * @param {number} total
 * @param {string} label
 * @returns {(n: number) => void}
 */
export function progressBar(total, label) {
  if (total === 0) return () => {};

  const width = 30;
  let last = '';

  return (done) => {
    const pct = Math.min(1, done / total);
    const filled = Math.round(pct * width);
    const empty = width - filled;

    const bar =
      theme.highlight('█'.repeat(filled)) +
      theme.dim('█'.repeat(empty));

    const line = `  ${bar} ${theme.bold(String(Math.round(pct * 100)))}% ` +
      theme.dim(`(${done}/${total}) ${label}`);

    // Clear previous line
    if (last) {
      process.stderr.write('\r\x1b[K');
    }
    process.stderr.write(line);
    last = line;
  };
}

export function endProgress() {
  process.stderr.write('\n');
}
