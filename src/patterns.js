/**
 * patterns.js — Rename pattern compiler.
 *
 * Translates a user-friendly pattern string into a name-generator function.
 *
 * Syntax:
 *   {n}          Auto-number starting at 1 (zero-padded to match digit count)
 *   {n:4}        Auto-number zero-padded to width 4
 *   {name}       Original filename without extension
 *   {ext}        Original extension (lowercase, with dot)
 *   {ext.upper}  Original extension (uppercase)
 *   {date}       Current date (YYYY-MM-DD)
 *   {date:fmt}   Current date formatted via strftime-style tokens
 *   {created}    File creation date (YYYY-MM-DD)
 *   {modified}   File mtime (YYYY-MM-DD)
 *   {idx}        Zero-based index
 *   {rand}       8-character random hex string
 *   {rand:12}    Random hex string of given length
 *   {parent}     Parent directory name
 *   {hash:4}     First N chars of sha256 of original name
 */

import { randomBytes, createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { basename, dirname, extname, parse } from 'node:path';

// ── Token registry ─────────────────────────────────────────────────────────

const TOKENS = {
  n: numberingToken,
  idx: idxToken,
  name: nameToken,
  ext: extToken,
  date: dateToken,
  created: fileDateToken('birthtime'),
  modified: fileDateToken('mtime'),
  rand: randToken,
  parent: parentToken,
  hash: hashToken,
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a pattern and return a generator function.
 *
 * @param {string}  pattern         e.g. "photo_{n:3}" or "s/old/new/"
 * @param {object}  [opts]
 * @param {number}  [opts.start=1]  Starting number for {n}
 * @param {boolean} [opts.lowerExt=false]
 * @param {boolean} [opts.upperExt=false]
 * @param {boolean} [opts.lower=false]
 * @param {boolean} [opts.upper=false]
 * @param {boolean} [opts.title=false]
 * @returns {{ generate: (file: string, index: number) => string, isRegex: boolean, regex?: RegExp, replacement?: string }}
 */
export function compilePattern(pattern, opts = {}) {
  // Case 1: regex replace pattern s/from/to/flags
  const regexMatch = pattern.match(/^s\/([^/]*)\/([^/]*)\/(\w*)$/);
  if (regexMatch) {
    const [, src, repl, flags] = regexMatch;
    const re = new RegExp(src, flags.includes('g') ? 'g' : '');
    return {
      generate: (file) => {
        const parsed = parse(file);
        const newName = parsed.name.replace(re, repl) + parsed.ext;
        return applyCase(newName, opts);
      },
      isRegex: true,
      regex: re,
      replacement: repl,
    };
  }

  // Case 2: template pattern
  return {
    generate: (file, index) => {
      const parsed = parse(file);
      const ctx = {
        file,
        dir: dirname(file),
        name: parsed.name,
        ext: parsed.ext,
        index,
        parsed,
      };
      const result = pattern.replace(/\{(\w+)(?::([^}]*))?\}/g, (_, token, arg) => {
        const fn = TOKENS[token];
        if (!fn) return _;
        return fn(ctx, arg, opts);
      });
      return applyCase(result, opts);
    },
    isRegex: false,
  };
}

// ── Token implementations ──────────────────────────────────────────────────

function numberingToken(ctx, arg, opts) {
  const width = arg ? parseInt(arg, 10) : 0;
  const start = (opts && opts.start != null) ? opts.start : 1;
  const num = ctx.index + start;
  if (width > 0) return String(num).padStart(width, '0');
  // Auto-detect width from total (we don't know total here, use 2 as minimum)
  return String(num).padStart(2, '0');
}

function idxToken(ctx, arg) {
  const width = arg ? parseInt(arg, 10) : 0;
  if (width > 0) return String(ctx.index).padStart(width, '0');
  return String(ctx.index);
}

function nameToken(ctx) {
  return ctx.name;
}

function extToken(ctx, arg) {
  if (!ctx.ext) return '';
  if (arg === 'upper') return ctx.ext.toUpperCase();
  return ctx.ext.toLowerCase();
}

function dateToken(_ctx, arg) {
  const now = new Date();
  return formatDate(now, arg || 'YYYY-MM-DD');
}

function fileDateToken(prop) {
  return (ctx, arg, opts) => {
    if (!opts._statCache) opts._statCache = new Map();
    let stats = opts._statCache.get(ctx.file);
    if (!stats) {
      try {
        stats = statSync(ctx.file);
        opts._statCache.set(ctx.file, stats);
      } catch {
        return formatDate(new Date(), arg || 'YYYY-MM-DD');
      }
    }
    const date = prop === 'mtime' ? stats.mtime : stats.birthtime;
    return formatDate(date, arg || 'YYYY-MM-DD');
  };
}

function randToken(_ctx, arg) {
  const len = arg ? parseInt(arg, 10) : 8;
  return randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function parentToken(ctx) {
  return basename(dirname(ctx.file));
}

function hashToken(ctx, arg) {
  const len = arg ? parseInt(arg, 10) : 8;
  const full = createHash('sha256').update(ctx.name).digest('hex');
  return full.slice(0, len);
}

// ── Case conversion ────────────────────────────────────────────────────────

function applyCase(str, opts) {
  if (opts.lower) return str.toLowerCase();
  if (opts.upper) return str.toUpperCase();
  if (opts.title) {
    return str.replace(/(?<=\b)\w/g, (c) => c.toUpperCase());
  }
  return str;
}

// ── Date formatting (subset of strftime) ───────────────────────────────────

function formatDate(date, fmt) {
  const map = {
    YYYY: date.getFullYear(),
    YY: String(date.getFullYear()).slice(2),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    hh: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  };

  let result = fmt;
  for (const [key, val] of Object.entries(map)) {
    result = result.replace(key, String(val));
  }
  return result;
}
