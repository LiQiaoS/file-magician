/**
 * config.js — Persistent user configuration.
 *
 * Stores defaults in ~/.file-magician/config.json.
 * Supports key/value get/set and reset-to-defaults.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = resolve(homedir(), '.file-magician');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  'dry-run': true,
  'no-hidden': false,
  'backup': true,
  'algo': 'sha256',
  'quality': 85,
};

/**
 * Load the current configuration, merging with defaults for missing keys.
 *
 * @returns {object}
 */
export function loadConfig() {
  ensureConfigDir();
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const user = JSON.parse(raw);
    return { ...DEFAULTS, ...user };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Set a config key to a value.
 */
export function setConfig(key, value) {
  ensureConfigDir();
  const current = loadConfig();
  current[key] = value;
  writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2) + '\n', 'utf-8');
}

/**
 * Get a single config value.
 */
export function getConfig(key) {
  return loadConfig()[key];
}

/**
 * Reset config to factory defaults.
 */
export function resetConfig() {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + '\n', 'utf-8');
}

/**
 * Show all configuration as a formatted list.
 */
export function listConfig() {
  const cfg = loadConfig();
  return Object.entries(cfg)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
}

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
