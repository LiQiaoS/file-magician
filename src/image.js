/**
 * image.js — Batch image processing command.
 *
 * Requires the optional `sharp` package.
 * If sharp is not installed, shows a helpful install message.
 *
 * Operations:
 *   --resize WxH    Resize to fit dimensions (maintains aspect ratio)
 *   --format ext    Convert to jpg, png, webp, avif, tiff
 *   --quality N     Output quality (1-100, default 85)
 *   --strip         Remove all EXIF/metadata
 *   --grayscale     Convert to grayscale
 */

import { extname, resolve, dirname, basename } from 'node:path';
import { walk } from './walker.js';
import { buildFilter } from './filter.js';
import { preview } from './preview.js';
import { recordUndo, backupFile } from './undo.js';
import { info, warn, error as logError, success, summary,
         progressBar, endProgress } from './display.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.avif'];

let sharpCache = null;

async function getSharp() {
  if (sharpCache !== null) return sharpCache;
  try {
    const mod = await import('sharp');
    sharpCache = mod.default;
    return sharpCache;
  } catch {
    return null;
  }
}

/**
 * Execute the image command.
 *
 * @param {string[]} targets
 * @param {object}   opts
 * @param {string}   [opts.resize]
 * @param {string}   [opts.format]
 * @param {number}   [opts.quality=85]
 * @param {boolean}  [opts.strip]
 * @param {boolean}  [opts.grayscale]
 * @param {boolean}  [opts.dryRun]
 */
export async function processImages(targets, opts) {
  const sharp = await getSharp();
  if (!sharp) {
    logError(
      'sharp is not installed.\n' +
      '  Install it with:  npm install sharp\n' +
      '  Or globally:      npm install -g sharp\n' +
      '\n' +
      '  On Windows you may need: npm install --build-from-source sharp'
    );
    return;
  }

  const root = resolve(targets?.[0] || '.');

  const files = walk([root], {
    hidden: false,
    directories: false,
  });

  const filterFn = buildFilter({ ext: IMAGE_EXTENSIONS });
  const candidates = files.filter(filterFn);

  if (candidates.length === 0) {
    info('No image files found in the specified path.');
    return;
  }

  // Determine output extension
  let targetExt = null;
  if (opts.format) {
    targetExt = opts.format.startsWith('.') ? opts.format.toLowerCase() : `.${opts.format.toLowerCase()}`;
    if (!IMAGE_EXTENSIONS.includes(targetExt) && targetExt !== '.gif') {
      warn(`Unsupported output format: ${opts.format}. Supported: jpg, png, webp, avif, tiff.`);
      return;
    }
  }

  // Parse resize
  let resizeW, resizeH;
  if (opts.resize) {
    const match = opts.resize.match(/^(\d+)x(\d+)$/);
    if (!match) {
      logError('Invalid resize format. Use WxH (e.g., 800x600).');
      return;
    }
    resizeW = parseInt(match[1], 10);
    resizeH = parseInt(match[2], 10);
  }

  const quality = opts.quality ?? 85;

  // Build changes
  const changes = candidates.map((file) => {
    const ext = targetExt || extname(file);
    const outFile = resolve(dirname(file), `${basename(file, extname(file))}${ext}`);
    return { from: file, to: outFile, type: 'image' };
  }).filter((c) => c.from !== c.to);

  if (changes.length === 0) {
    info('No images to process (all would be overwritten in place).');
    return;
  }

  await preview(changes, { dryRun: opts.dryRun, root }, async (apply) => {
    let done = 0;
    let failed = 0;

    const tick = progressBar(apply.length, 'processing');
    const undoEntries = [];

    for (const c of apply) {
      try {
        // Backup original
        const backup = backupFile(c.from);

        let pipeline = sharp(c.from);

        if (opts.strip) pipeline = pipeline.withMetadata({ icc: false, exif: false, xmp: false });
        if (opts.grayscale) pipeline = pipeline.grayscale();
        if (resizeW && resizeH) {
          pipeline = pipeline.resize({
            width: resizeW,
            height: resizeH,
            fit: 'inside',
            withoutEnlargement: true,
          });
        }

        // Determine output format
        const outExt = extname(c.to).toLowerCase().replace('.', '');
        const formatMap = {
          jpg: 'jpeg', jpeg: 'jpeg',
          png: 'png', webp: 'webp',
          avif: 'avif', tiff: 'tiff',
        };
        const fmt = formatMap[outExt] || 'jpeg';

        let toFormat = pipeline.toFormat(fmt);
        if (['jpeg', 'webp', 'avif', 'tiff'].includes(fmt)) {
          toFormat = toFormat.jpeg({ quality });
        }

        await toFormat.toFile(c.to);

        undoEntries.push({ type: 'image', from: c.from, to: c.to, backup });
        done++;
      } catch (err) {
        logError(`Failed: ${c.from} → ${err.message}`);
        failed++;
      }
      tick(done);
    }
    endProgress();

    if (undoEntries.length > 0) {
      const undoId = recordUndo('image', undoEntries);
      success(`Undo ID: ${undoId}`);
    }

    summary(done, 0, failed);
  });
}
