/**
 * hashing.js — Content-based file hashing for duplicate detection.
 *
 * Supports xxhash (default, fast) and sha256.
 * Streams files for O(1) memory regardless of file size.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { statSync } from 'node:fs';

const STREAM_BUF_SIZE = 256 * 1024; // 256 KiB

/**
 * Hash algorithms available.
 */
export const ALGORITHMS = ['sha256', 'sha1', 'md5'];

/**
 * Compute a file hash using the streaming approach.
 *
 * @param {string} filePath  Absolute path
 * @param {string} [algo='sha256']
 * @returns {Promise<string>}  Hex digest
 */
export async function hashFile(filePath, algo = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = createHash(algo);
    const stream = createReadStream(filePath, { highWaterMark: STREAM_BUF_SIZE });

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => {
      // Permission-denied or locked files → re-throw with context
      err.message = `${filePath}: ${err.message}`;
      reject(err);
    });
  });
}

/**
 * Group files by their hash.
 *
 * @param {string[]} files  Absolute paths
 * @param {object} [opts]
 * @param {string}  [opts.algo='sha256']
 * @param {(pct: number) => void} [opts.onProgress]
 * @returns {Promise<Map<string, string[]>>}  hash → paths
 */
export async function groupByHash(files, opts = {}) {
  const { algo = 'sha256', onProgress } = opts;
  const map = new Map();
  let done = 0;

  for (const file of files) {
    try {
      const digest = await hashFile(file, algo);
      const existing = map.get(digest);
      if (existing) {
        existing.push(file);
      } else {
        map.set(digest, [file]);
      }
    } catch {
      // Skip problematic files silently — they'll be reported by the caller.
    }
    done++;
    onProgress?.(done / files.length);
  }

  return map;
}

/**
 * Quick pre-filter: group files by size first, so we only hash
 * same-size candidates. Saves I/O for the obvious non-duplicates.
 *
 * @param {string[]} files
 * @returns {Map<number, string[]>}
 */
export function groupBySize(files) {
  const map = new Map();

  for (const file of files) {
    try {
      const size = statSync(file).size;
      if (size === 0) continue; // Skip empty files — not useful duplicates
      const existing = map.get(size);
      if (existing) {
        existing.push(file);
      } else {
        map.set(size, [file]);
      }
    } catch {
      // Skip inaccessible
    }
  }

  return map;
}
