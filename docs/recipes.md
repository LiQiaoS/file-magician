# Recipes — Real-World Workflows

Practical, copy-pasteable examples for common file-processing tasks.

---

## 1. Rename Camera Exports with Creation Date

```bash
# Before:  DSC_0001.jpg, DSC_0002.jpg, …
# After:   2026-06-03_01.jpg, 2026-06-03_02.jpg, …

file-magician rename "{created}_{n}" ~/DCIM/100EOS --dry-run
```

Add the camera model prefix:

```bash
file-magician rename "canon_{created}_{n:4}" ~/DCIM/100EOS --dry-run
```

---

## 2. Clean Up a Cluttered Downloads Folder

Preview the mess:

```bash
file-magician organize ~/Downloads --by-type --dry-run
```

Then apply:

```bash
file-magician organize ~/Downloads --by-type
```

Result: `~/Downloads/Images/`, `~/Downloads/Documents/`, `~/Downloads/Archives/`, etc.

---

## 3. Deduplicate a Music Library

Fast pass (by size), then precise (by hash):

```bash
file-magician dedupe ~/Music --min-size 1000000 --dry-run
file-magician dedupe ~/Music --hash --trash --dry-run
file-magician dedupe ~/Music --hash --trash
```

---

## 4. Archive Old Projects by Year

```bash
# Sort into  2024/, 2025/, 2026/  based on last-modified date

file-magician organize ~/Projects --by-date --dry-run
file-magician organize ~/Projects --by-date
```

---

## 5. Batch-Optimise Images for the Web

Requires `sharp`:

```bash
# Resize to 1920px wide, convert to WebP at quality 80, strip EXIF

file-magician image ~/Pictures --resize 1920x1080 --format webp --quality 80 --strip --dry-run
file-magician image ~/Pictures --resize 1920x1080 --format webp --quality 80 --strip
```

Create thumbnails into a separate directory:

```bash
cp -r ~/Pictures ~/Thumbs
file-magician image ~/Thumbs --resize 400x300 --strip
```

---

## 6. Rename Files with Regex

Replace spaces with underscores (recursive):

```bash
file-magician rename "s/ /_/g" ~/Documents --dry-run
```

Strip trailing digits:

```bash
file-magician rename "s/_\d+$//" ~/Downloads --dry-run
```

Normalise phone-number filenames:

```bash
file-magician rename "s/[() -]//g" ~/Contacts --dry-run
```

---

## 7. Flatten a Deeply Nested Directory

```bash
# Move all files from subdirectories into one flat folder

file-magician organize ~/NestedProject --flat --dry-run
file-magician organize ~/NestedProject --flat
```

---

## 8. Bulk Rename with Random Names for Anonymisation

```bash
file-magician rename "{rand:16}{ext}" ~/SensitiveData --dry-run
```

---

## 9. Move Only Source Code Files

```bash
file-magician bulk move ~/Downloads/src ~/Projects --ext .js .ts .jsx .tsx .css --dry-run
file-magician bulk move ~/Downloads/src ~/Projects --ext .js .ts .jsx .tsx .css
```

---

## 10. Weekly Desktop Cleanup (Script)

Save as `~/bin/clean-desktop.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DESKTOP="$HOME/Desktop"
ARCHIVE="$HOME/Archive"

mkdir -p "$ARCHIVE"

echo "=== Organising Desktop ==="
file-magician organize "$DESKTOP" --by-type

echo "=== Moving documents to Archive ==="
file-magician bulk move "$DESKTOP/Documents" "$ARCHIVE" --dry-run

echo "=== Removing duplicates ==="
file-magician dedupe "$DESKTOP" --hash --trash

echo "=== Renaming screenshots ==="
file-magician rename "screenshot_{date}_{n:2}" "$DESKTOP" --ext .png --dry-run

echo "Done."
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No files found | Hidden files not scanned | Add `--no-hidden` |
| Permission error | Locked or system file | Check file ownership, skip with `--exclude-ext` |
| Slow dedupe | Large file set without `--hash` | Works as designed; size-only mode trades precision for speed |
| `sharp` not found | Optional dep not installed | `npm install -g sharp` |
