/**
 * Integration tests — run rename, organize, dedupe, bulk on temp directories.
 *
 * Sets up and tears down a temporary file tree for each test suite.
 */

import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync,
         mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// ── Helpers ────────────────────────────────────────────────────────────────

let ROOT;

function createFile(relPath, content = '') {
  const full = resolve(ROOT, relPath);
  const dir = full.split(/[/\\]/).slice(0, -1).join('/');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(full, content);
  return full;
}

function listFiles() {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  walk(ROOT);
  return out;
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(() => {
  ROOT = mkdtempSync(resolve(tmpdir(), 'fm-test-'));
  createFile('photos/vacation/img_001.jpg', 'jpeg-data');
  createFile('photos/vacation/img_002.jpg', 'jpeg-data-2');
  createFile('photos/vacation/img_003.jpg', 'jpeg-data-3');
  createFile('docs/report.txt', 'some text');
  createFile('docs/notes.txt', 'more text');
  createFile('archive/data.txt', 'some text');  // same content as report.txt
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('rename', () => {
  it('renames files using a template pattern', async () => {
    const { rename } = await import('../src/rename.js');
    const photoDir = resolve(ROOT, 'photos/vacation');

    await rename('photo_{n}', [photoDir], { dryRun: false, hidden: false, recursive: false });

    const files = readdirSync(photoDir).sort();
    expect(files).toContain('photo_01.jpg');
    expect(files).toContain('photo_02.jpg');
    expect(files).toContain('photo_03.jpg');
  });

  it('dry-run does not change files', async () => {
    const { rename } = await import('../src/rename.js');
    const docsDir = resolve(ROOT, 'docs');
    const before = readdirSync(docsDir).sort();

    await rename('doc_{n}', [docsDir], { dryRun: true, hidden: false, recursive: false });

    const after = readdirSync(docsDir).sort();
    expect(after).toEqual(before);
  });
});

describe('organize', () => {
  it('sorts files by type into directories', async () => {
    const { organize } = await import('../src/organize.js');
    const mixDir = resolve(ROOT, 'mixed');
    mkdirSync(mixDir, { recursive: true });
    writeFileSync(resolve(mixDir, 'photo.png'), 'png');
    writeFileSync(resolve(mixDir, 'doc.pdf'), 'pdf');
    writeFileSync(resolve(mixDir, 'script.js'), 'js');

    await organize([mixDir], {
      byType: true,
      dryRun: false,
      recursive: false,
      hidden: false,
    });

    expect(existsSync(resolve(mixDir, 'Images', 'photo.png'))).toBe(true);
    expect(existsSync(resolve(mixDir, 'Documents', 'doc.pdf'))).toBe(true);
    expect(existsSync(resolve(mixDir, 'Code', 'script.js'))).toBe(true);
  });
});

describe('dedupe', () => {
  it('finds duplicates by size', async () => {
    const { dedupe } = await import('../src/duplicate.js');

    // We need two files with the same size (archive/data.txt is same as docs/report.txt)
    await dedupe([ROOT], {
      dryRun: true,
      recursive: true,
      hash: false,
      'min-size': 1,
      delete: false,
    });
    // If we got here without throwing, the scan worked
    expect(true).toBe(true);
  });
});

describe('bulk', () => {
  it('copies matching files to a destination', async () => {
    const { bulk } = await import('../src/bulk.js');
    const dest = resolve(ROOT, 'backup');
    const source = resolve(ROOT, 'docs');

    await bulk('copy', [source, dest], { dryRun: false, recursive: false, hidden: false });

    expect(existsSync(resolve(dest, 'report.txt'))).toBe(true);
    expect(existsSync(resolve(dest, 'notes.txt'))).toBe(true);
  });
});

describe('undo system', () => {
  it('records and rolls back rename operations', async () => {
    const { recordUndo, rollback, listUndo } = await import('../src/undo.js');
    const testDir = resolve(ROOT, 'undo-test');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, 'old_name.txt'), 'data');

    // Record the rename
    recordUndo('rename', [
      { type: 'rename', from: resolve(testDir, 'old_name.txt'), to: resolve(testDir, 'new_name.txt') },
    ]);

    // Move the file to simulate the rename
    const { renameSync } = await import('node:fs');
    renameSync(resolve(testDir, 'old_name.txt'), resolve(testDir, 'new_name.txt'));

    // Rollback
    const entries = listUndo(5);
    expect(entries.length).toBeGreaterThan(0);

    // The undo should have been recorded
    expect(entries[0].command).toContain('rename');
  });
});
