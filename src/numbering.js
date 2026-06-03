/**
 * numbering.js — Number-sequence generator with padding, offset, and skip.
 *
 * Used by the rename command to fill {n} / {idx} tokens.
 */

/**
 * Create a number-sequence iterator.
 *
 * @param {object} [opts]
 * @param {number} [opts.start=1]     First value
 * @param {number} [opts.pad=0]       Zero-pad to width
 * @param {number} [opts.step=1]      Increment
 * @param {number} [opts.skip]        Values to skip (treated as a Set)
 * @returns {(i: number) => string}
 */
export function createSequencer(opts = {}) {
  const { start = 1, pad = 0, step = 1, skip } = opts;
  const skipSet = skip ? new Set(skip) : null;

  return (i) => {
    let value = start + i * step;
    // Skip over forbidden values
    if (skipSet) {
      while (skipSet.has(value)) {
        i++;
        value = start + i * step;
      }
    }
    return pad > 0 ? String(value).padStart(pad, '0') : String(value);
  };
}
