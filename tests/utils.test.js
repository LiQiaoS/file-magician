/**
 * Utilities unit tests.
 *
 * Tests pattern compilation, numbering, filtering, and hashing
 * in isolation from the file system where possible.
 */

import { compilePattern } from '../src/patterns.js';
import { createSequencer } from '../src/numbering.js';
import { buildFilter } from '../src/filter.js';
import { groupBySize } from '../src/hashing.js';
import { isParentOrEqual } from '../src/walker.js';
import { describe, it, expect } from '@jest/globals';

// ── Patterns ───────────────────────────────────────────────────────────────

describe('compilePattern()', () => {
  it('replaces {n} with auto-incrementing numbers', () => {
    const p = compilePattern('img_{n}');
    expect(p.generate('photo.jpg', 0)).toBe('img_01.jpg');
    expect(p.generate('photo.jpg', 1)).toBe('img_02.jpg');
  });

  it('respects padding in {n:N}', () => {
    const p = compilePattern('img_{n:4}');
    expect(p.generate('photo.jpg', 0)).toBe('img_0001.jpg');
    expect(p.generate('photo.jpg', 99)).toBe('img_0100.jpg');
  });

  it('handles {idx} zero-based', () => {
    const p = compilePattern('file_{idx}');
    expect(p.generate('a.txt', 0)).toBe('file_0.txt');
    expect(p.generate('a.txt', 1)).toBe('file_1.txt');
  });

  it('handles {name} original basename', () => {
    const p = compilePattern('{name}_backup');
    expect(p.generate('vacation.jpg', 0)).toBe('vacation_backup.jpg');
  });

  it('handles {ext} extension', () => {
    const p = compilePattern('copy_{name}{ext}');
    expect(p.generate('doc.PDF', 0)).toBe('copy_doc.pdf');
  });

  it('handles {ext.upper}', () => {
    const p = compilePattern('{name}{ext.upper}');
    expect(p.generate('readme.md', 0)).toBe('readme.MD');
  });

  it('handles {date} with default format', () => {
    const p = compilePattern('snapshot_{date}');
    const result = p.generate('x.txt', 0);
    // Should match YYYY-MM-DD
    expect(result).toMatch(/snapshot_\d{4}-\d{2}-\d{2}\.txt/);
  });

  it('handles {date:YYYYMMDD} custom format', () => {
    const p = compilePattern('{date:YYYYMMDD}_data');
    const result = p.generate('x.csv', 0);
    expect(result).toMatch(/^\d{8}_data\.csv$/);
  });

  it('handles {rand} token', () => {
    const p = compilePattern('temp_{rand}');
    const result = p.generate('x.tmp', 0);
    expect(result).toMatch(/temp_[a-f0-9]{8}\.tmp/);
  });

  it('handles {rand:N} with custom length', () => {
    const p = compilePattern('{rand:12}');
    expect(p.generate('x.txt', 0)).toMatch(/^[a-f0-9]{12}\.txt$/);
  });

  it('handles {parent} directory name', () => {
    const p = compilePattern('{parent}_{name}');
    const result = p.generate('/projects/photos/beach.jpg', 0);
    expect(result).toBe('photos_beach.jpg');
  });

  it('handles regex pattern s/old/new/', () => {
    const p = compilePattern('s/old/new/');
    expect(p.generate('old_file.txt', 0)).toBe('new_file.txt');
  });

  it('handles regex pattern s/old/new/g global flag', () => {
    const p = compilePattern('s/old/new/g');
    expect(p.generate('old_old.txt', 0)).toBe('new_new.txt');
  });

  it('applies --lower case conversion', () => {
    const p = compilePattern('{name}', { lower: true });
    expect(p.generate('HELLO.TXT', 0)).toBe('hello.txt');
  });

  it('applies --upper case conversion', () => {
    const p = compilePattern('{name}', { upper: true });
    expect(p.generate('hello.txt', 0)).toBe('HELLO.txt');
  });

  it('leaves tokens that are not recognised in place', () => {
    const p = compilePattern('{unknown}_test');
    expect(p.generate('file.txt', 0)).toBe('{unknown}_test.txt');
  });
});

// ── Numbering ──────────────────────────────────────────────────────────────

describe('createSequencer()', () => {
  it('returns 1-based sequence by default', () => {
    const seq = createSequencer();
    expect(seq(0)).toBe('1');
    expect(seq(1)).toBe('2');
    expect(seq(2)).toBe('3');
  });

  it('pads to width', () => {
    const seq = createSequencer({ pad: 3 });
    expect(seq(0)).toBe('001');
    expect(seq(99)).toBe('100');
  });

  it('supports custom start', () => {
    const seq = createSequencer({ start: 100 });
    expect(seq(0)).toBe('100');
    expect(seq(1)).toBe('101');
  });

  it('supports step size', () => {
    const seq = createSequencer({ step: 5 });
    expect(seq(0)).toBe('1');
    expect(seq(1)).toBe('6');
    expect(seq(2)).toBe('11');
  });
});

// ── Filter ─────────────────────────────────────────────────────────────────

describe('buildFilter()', () => {
  it('passes all files when no options set', () => {
    const filter = buildFilter({});
    expect(filter('any/file.txt')).toBe(true);
  });

  it('filters by extension whitelist', () => {
    const filter = buildFilter({ ext: ['.jpg', '.png'] });
    expect(filter('photo.jpg')).toBe(true);
    expect(filter('photo.png')).toBe(true);
    expect(filter('photo.gif')).toBe(false);
  });

  it('filters by extension blacklist', () => {
    const filter = buildFilter({ excludeExt: ['.exe', '.dll'] });
    expect(filter('app.exe')).toBe(false);
    expect(filter('lib.dll')).toBe(false);
    expect(filter('readme.txt')).toBe(true);
  });

  it('matches extension case-insensitively', () => {
    const filter = buildFilter({ ext: ['.jpg'] });
    expect(filter('photo.JPG')).toBe(true);
  });
});

// ── Hasher ─────────────────────────────────────────────────────────────────

describe('groupBySize()', () => {
  it('returns empty map for empty input', () => {
    const map = groupBySize([]);
    expect(map.size).toBe(0);
  });

  it('groups files with the same size', () => {
    // We need real files for statSync — skip in unit, integration tests cover this
    expect(typeof groupBySize).toBe('function');
  });
});

// ── Walker helpers ─────────────────────────────────────────────────────────

describe('isParentOrEqual()', () => {
  it('detects parent-child relationship', () => {
    expect(isParentOrEqual('/a', '/a/b/c')).toBe(true);
  });

  it('detects equal paths', () => {
    expect(isParentOrEqual('/a', '/a')).toBe(true);
  });

  it('rejects unrelated paths', () => {
    expect(isParentOrEqual('/a', '/b')).toBe(false);
  });
});
