# Changelog

All notable changes to **file-magician** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-06-03

### Added
- **rename** — batch rename with templates (`{n}`, `{name}`, `{date}`, `{rand}`, …),
  regex substitution (`s/old/new/`), case conversion, and extension swapping
- **organize** — sort files by type, date, size, regex capture group, or flat structure
- **dedupe** — duplicate file detection by size (fast) or content hash (precise),
  with optional delete/trash
- **bulk copy / move / delete / touch / chmod** — batch operations with filter support
- **image** — batch resize, format conversion, metadata stripping, grayscale
  (requires optional `sharp` package)
- **undo** — every mutating command records an undo manifest; roll back any
  operation with a single command
- **config** — persistent user preferences (`~/.file-magician/config.json`)
- **dry-run** — preview changes before applying them, on every command
- **ESM native** — requires Node ≥ 18; no CommonJS baggage
- **CI** — GitHub Actions across Linux, macOS, Windows, Node 18/20/22

[0.6.0]: https://github.com/liqs/file-magician/releases/tag/v0.6.0
