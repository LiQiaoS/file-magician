/**
 * filter.js — File-level predicate chains.
 *
 * Compose include/exclude rules from CLI flags into a single
 * predicate that walks through the candidate file list.
 */

import { statSync } from 'node:fs';
import { extname } from 'node:path';

/**
 * Build a predicate function from user-provided filter options.
 *
 * @param {object} opts
 * @param {string[]}  [opts.ext]       Allowed extensions (e.g. [".jpg",".png"])
 * @param {string[]}  [opts.excludeExt] Excluded extensions
 * @param {number}    [opts.minSize]   Minimum bytes
 * @param {number}    [opts.maxSize]   Maximum bytes
 * @param {string}    [opts.name]      Glob-style name filter (matches basename)
 * @param {boolean}   [opts.hidden]    Include dot-files (default true)
 * @returns {(filePath: string) => boolean}
 */
export function buildFilter(opts = {}) {
  const rules = [];

  // Extension filters
  if (opts.ext && opts.ext.length > 0) {
    const allowed = new Set(opts.ext.map(normaliseExt));
    rules.push((f) => allowed.has(normaliseExt(extname(f))));
  }
  if (opts.excludeExt && opts.excludeExt.length > 0) {
    const blocked = new Set(opts.excludeExt.map(normaliseExt));
    rules.push((f) => !blocked.has(normaliseExt(extname(f))));
  }

  // Size filters
  if (typeof opts.minSize === 'number') {
    rules.push((f) => {
      try {
        return statSync(f).size >= opts.minSize;
      } catch {
        return false;
      }
    });
  }
  if (typeof opts.maxSize === 'number') {
    rules.push((f) => {
      try {
        return statSync(f).size <= opts.maxSize;
      } catch {
        return false;
      }
    });
  }

  // Name glob filter
  if (opts.name) {
    const re = globToRegex(opts.name);
    rules.push((f) => re.test(f));
  }

  // Default: exclude hidden files unless told otherwise
  if (opts.hidden === false) {
    rules.push((f) => {
      const base = f.split(/[/\\]/).pop();
      return !base.startsWith('.');
    });
  }

  return (filePath) => rules.every((rule) => rule(filePath));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normaliseExt(ext) {
  return ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
}

/**
 * Very naive glob → regex conversion for simple name patterns.
 */
function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(escaped, 'i');
}
