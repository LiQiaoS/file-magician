# File Magician

> **Batch file processing at scale.** Rename, organise, deduplicate, copy, move,
> and process images — all from the command line, with dry-run previews and full
> undo support.

[![CI](https://github.com/liqs/file-magician/actions/workflows/ci.yml/badge.svg)](https://github.com/liqs/file-magician/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![npm](https://img.shields.io/npm/v/file-magician)](https://www.npmjs.com/package/file-magician)

---

## Features

| Command | What it does |
|---------|-------------|
| `rename` | Batch rename files with templates, regex, or case conversion |
| `organize` | Sort files into folders by type, date, size, or pattern |
| `dedupe` | Find duplicates by size or content hash, then delete or trash |
| `bulk copy / move / delete / touch / chmod` | Mass file operations with filters |
| `image` | Resize, convert, strip metadata, grayscale (requires `sharp`) |
| `undo` | Roll back any previous operation |

Every mutating command supports **`--dry-run`** — see what changes before committing.

---

## Installation

### Via npm (recommended)

```bash
npm install -g file-magician
```

### Via npx (no install)

```bash
npx file-magician --help
```

### From source

```bash
git clone https://github.com/liqs/file-magician.git
cd file-magician
npm install
npm link
```

> **Image processing** requires the optional `sharp` package:
> ```bash
> npm install -g sharp
> # or: npm install sharp  in the project
> ```

---

## Quick Start

### Rename photos with numbered sequence

```bash
file-magician rename "vacation_{n:3}" ~/Photos --start 1 --dry-run
# Preview the result first, then remove --dry-run to apply
```

### Organise downloads folder by file type

```bash
file-magician organize ~/Downloads --by-type
# Images/ Documents/ Archives/ Audio/ Video/ Code/ Other/
```

### Find and remove duplicate files

```bash
file-magician dedupe ~/Documents --hash --trash
# Uses SHA-256 content hashing, sends duplicates to recycle bin
```

### Bulk copy only images

```bash
file-magician bulk copy ~/Camera ~/ backup --ext .jpg .png --dry-run
```

### Roll back a mistake

```bash
file-magician undo last
```

---

## Command Reference

### `rename <pattern> [path]`

Batch rename files in the target directory.

**Pattern tokens:**

| Token | Description | Example |
|-------|-------------|---------|
| `{n}` | Auto-number (1-based, zero-padded) | `img_01.jpg` |
| `{n:4}` | Auto-number, width 4 | `img_0001.jpg` |
| `{idx}` | Zero-based index | `file_0.txt` |
| `{name}` | Original filename (no extension) | `vacation` |
| `{ext}` | Extension (lowercase) | `.jpg` |
| `{ext.upper}` | Extension (uppercase) | `.JPG` |
| `{date}` | Today's date | `2026-06-03` |
| `{date:YYYYMMDD}` | Custom date format | `20260603` |
| `{created}` | File creation date | `2026-06-03` |
| `{modified}` | File modification date | `2026-06-03` |
| `{rand}` | Random hex string (8 chars) | `a1b2c3d4` |
| `{rand:12}` | Random hex, custom length | `a1b2c3d4e5f6` |
| `{parent}` | Parent directory name | `photos` |
| `{hash:6}` | SHA-256 prefix of original name | `a1b2c3` |

**Regex substitution** — use `s/pattern/replacement/flags`:

```bash
file-magician rename "s/IMG_/photo_/" ./camera
file-magician rename "s/\s+/_/g" ./files          # Replace spaces globally
```

**Options:** `--dry-run`, `--start N`, `--lower`, `--upper`, `--title`,
`--ext <exts...>`, `--exclude-ext <exts...>`, `--no-hidden`, `--force`

---

### `organize [path]`

Sort files into subdirectories based on properties.

**Strategies:**

| Flag | Behaviour | Example output |
|------|-----------|----------------|
| `--by-type` | File extension → category | `Images/photo.jpg` |
| `--by-date` | mtime → year/month | `2026/06-Jun/report.pdf` |
| `--by-size` | Size buckets | `small/resume.txt` |
| `--by-pattern <regex>` | First capture group | `project1/` |
| `--flat` | Flatten all into one dir | `photo.jpg` |

**Options:** `--dry-run`, `--copy` (instead of move), `--no-hidden`

---

### `dedupe [path]`

Two-phase duplicate detection: first by file size (fast), then optionally by
content hash (precise).

```bash
file-magician dedupe . --hash           # SHA-256 exact match
file-magician dedupe . --algo md5       # MD5 (faster, less collision-resistant)
file-magician dedupe . --trash          # Move to recycle bin
file-magician dedupe . --delete         # Permanently remove
```

Both `--delete` and `--trash` **keep one copy** per duplicate group.

**Options:** `--dry-run`, `--hash`, `--algo <name>`, `--min-size <bytes>`,
`--delete`, `--trash`

---

### `bulk <subcommand> [args]`

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `copy` | `bulk copy <source> <dest>` | Copy files preserving structure |
| `move` | `bulk move <source> <dest>` | Move files preserving structure |
| `delete` | `bulk delete [target]` | Send to trash (falls back to delete) |
| `touch` | `bulk touch [target]` | Update mtime/atime to now |
| `chmod` | `bulk chmod <target> <mode>` | Change permissions (octal) |

```bash
file-magician bulk copy ./src ./dist --ext .js .ts
file-magician bulk chmod ./scripts 755
file-magician bulk delete ./temp --ext .log
```

**Options:** `--dry-run`, `--ext <exts...>`, `--no-hidden`

---

### `image [path]`

Batch image processing via the optional `sharp` library.

```bash
file-magician image ./photos --resize 1920x1080 --quality 80 --strip
file-magician image ./art --format webp --grayscale
```

**Options:** `--dry-run`, `--resize <WxH>`, `--format <ext>`, `--quality <N>`,
`--strip`, `--grayscale`

---

### `undo [id]`

Without an argument, lists recent operations:

```bash
$ file-magician undo
  ℹ 20260603-120000-rename  (6/3/2026, 12:00:00 PM)  rename
  ℹ 20260603-113000-dedupe  (6/3/2026, 11:30:00 AM)  dedupe
```

To roll back an operation:

```bash
file-magician undo 20260603-120000-rename
file-magician undo last                    # Shortcut for most recent
```

---

### `config`

View or change persistent defaults:

```bash
file-magician config get           # Show all
file-magician config get dry-run   # Show single key
file-magician config set dry-run true   # Always preview by default
file-magician config set algo md5       # Use MD5 for dedupe
file-magician config reset              # Back to factory defaults
```

Default configuration:

```json
{
  "dry-run": true,
  "no-hidden": false,
  "backup": true,
  "algo": "sha256",
  "quality": 85
}
```

---

## Safety

- **Dry-run mode** — every command supports `--dry-run` to preview changes
- **Undo** — every mutation is logged to `~/.file-magician/undo/` for rollback
- **Trash-aware delete** — files go to the OS recycle bin where possible
- **Conflict detection** — duplicate target names are automatically prefixed
- **Backup before overwrite** — originals are backed up before destructive ops

---

## Tips & Recipes

See the [recipes guide](docs/recipes.md) for real-world workflows:

- Rename camera exports with EXIF date
- Clean up a cluttered desktop
- Deduplicate a music library
- Archive old projects by year
- Batch-optimise images for the web

---

## Requirements

- **Node.js** ≥ 18 (LTS recommended)
- **sharp** (optional) — for image processing
- Works on **Windows, macOS, and Linux**

---

## Project Structure

```
file-magician/
├── bin/           # CLI entry point
├── src/           # Source modules
│   ├── index.js   # Commander CLI definition
│   ├── rename.js  # Batch rename logic
│   ├── organize.js
│   ├── duplicate.js
│   ├── bulk.js
│   ├── image.js
│   ├── patterns.js  # Pattern compiler
│   ├── numbering.js # Number sequencer
│   ├── hashing.js   # Content hashing
│   ├── preview.js   # Dry-run engine
│   ├── walker.js    # File discovery
│   ├── filter.js    # File filtering
│   ├── display.js   # Terminal output
│   ├── trash.js     # Safe deletion
│   ├── undo.js      # Undo log
│   └── config.js    # Persisted config
├── tests/         # Jest test suites
└── docs/          # Usage guides
```

---

## Contributing

PRs are welcome! Please:

1. Run `npm test` before submitting
2. Follow the existing code style (checked via `npm run lint`)
3. Add tests for new features

---

## License

MIT — see [LICENSE](LICENSE).
