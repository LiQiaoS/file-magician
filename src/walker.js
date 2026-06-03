/**
 * walker.js — Recursive file discovery with glob support.
 *
 * Wraps fast-glob with sensible defaults: hidden-file exclusion,
 * follow-symlinks opt-in, and error-tolerant traversal.
 */

import fg from 'fast-glob';
import { resolve, relative } from 'node:path';

/**
 * Options for file discovery.
 *
 * @typedef {object} WalkOptions
 * @property {boolean} [hidden=false]       Include dot-files
 * @property {boolean} [followSymlinks=false]
 * @property {boolean} [directories=false]  Include directories in output
 * @property {boolean} [absolute=true]      Return absolute paths
 * @property {number}  [maxDepth=Infinity]  Directory recursion limit
 * @property {boolean} [recursive=true]     Recurse into subdirectories
 * @property {string[]} [patterns]          Glob overrides
 */

/**
 * Walk a directory and return matching files.
 *
 * @param {string|string[]} paths    One or more root directories
 * @param {WalkOptions} [opts]
 * @returns {string[]}  Absolute file paths
 */
export function walk(paths, opts = {}) {
  const {
    hidden = false,
    followSymlinks = false,
    directories = false,
    absolute = true,
    maxDepth = Infinity,
    recursive = true,
    patterns,
  } = opts;

  const entries = Array.isArray(paths) ? paths : [paths];
  const results = [];

  for (const entry of entries) {
    const cwd = resolve(entry);

    let sourcePatterns = patterns;
    if (!sourcePatterns || sourcePatterns.length === 0) {
      sourcePatterns = directories ? ['**'] : ['**/*'];
    }

    // When non-recursive, stay at the root directory only.
    // fast-glob deep: 0 = current dir, 1 = one sub-level, etc.
    const effectiveDepth = recursive
      ? (maxDepth === Infinity ? undefined : maxDepth)
      : 0;

    const found = fg.sync(sourcePatterns, {
      cwd,
      absolute,
      dot: hidden,
      followSymbolicLinks: followSymlinks,
      onlyDirectories: directories,
      onlyFiles: !directories,
      deep: effectiveDepth,
      suppressErrors: true,
    });

    results.push(...found);
  }

  return results;
}

/**
 * Check whether `parentPath` contains a child (safety guard against
 * organising a folder into itself).
 */
export function isParentOrEqual(parentPath, childPath) {
  const rel = relative(parentPath, childPath);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('.\\') && !rel.startsWith('../'));
}
