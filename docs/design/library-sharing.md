# Library sharing: patterns, palettes and collections — design note

Status: implemented · Owner: app · Date: 2026-10-22

How a pattern, a palette or a whole Pattern Collection moves from one Studio
to another without copying files out of the helper's `My Patterns` folder or
going through the community site, and how trust is handled when it arrives.

## The bundle

Everything shares one format, the **library bundle** (`src/state/library/libraryBundle.ts`):

- `kind: 'fastled-library'`, `version: 1`.
- `patterns`: library patterns as they travel — the `SavedPattern` fields
  that mean something on another machine (name, ports, subgraph, shelf, "best
  on" tags, the original id and creation time) plus `groups`, the subgraphs of
  every Group node nested inside the pattern. Nested groups are collected the
  same way the community upload collects them (`reachableGroupRegistry`), so
  a pattern that uses another saved group never arrives with a dangling
  reference.
- `palettes`: `{ name, stops: [{ position, color }] }`, read from a Custom
  Palette node's `colors`/`positions` through the same normaliser the node uses.
- `collections`: `{ name, patterns, profiles }` — a Pattern Collection's
  patterns (each a bundled pattern) and, keyed by index, the show profile the
  node keeps for each one: section tags, weight, energy bands and entry policy.
  Only non-default values are written.

Before anything is written out, each subgraph goes through the same shape
filter a share link applies (`sanitizeWorkspacePayload`) and the legacy
`wifiSsid`/`wifiPassword` properties are removed. Import repeats both, so a
hand-edited file cannot smuggle a credential back in.

`parseLibraryBundle` also accepts a bare `SavedPattern` file (what the helper
writes into `My Patterns`) and a community `patternJson` (`{ name, subgraph,
groups }`); both read as a bundle holding one pattern, so every pattern file
Studio has ever produced still imports.

## Three transports

- **File.** Downloads are named `<name>.fastled-pattern.json`,
  `.fastled-palette.json`, `.fastled-collection.json` or
  `.fastled-library.json`. Import by dropping files onto the Pattern Library,
  through the library's Import… popup, or with File → Import Library Bundle….
  File → Export Library… writes every pattern the user saved (bundled examples
  ship with Studio already) as one file.
- **Clipboard.** "Copy share link" on a library selection, "Copy collection
  link" on a Pattern Collection node and "link" on a Custom Palette node put a
  `#library=` URL on the clipboard, compressed with the same `lz-string`
  encoding as `#share=`. A link past about 30 KB warns, as a graph share link
  does; the remedy is a file. Pasting a link or raw JSON into the library's
  Import… popup imports it in place.
- **Share link.** Opening a `#library=` URL imports its contents into the
  Pattern Library and the open project once the project has loaded, reports
  the result in the status line and clears the hash. Unlike `#share=`, a
  library link never replaces the workspace.

Patterns go to the Pattern Library; palettes land on the active canvas as
Custom Palette nodes named after the palette; a collection's patterns go to
the library and a Pattern Collection node is created with those patterns and
its profiles applied. Every import reports counts for the status line.

## The trust rule

An import is never remembered. `importLibraryBundle` does not call
`rememberContent`, so a Formula, Code or Art-Net node that arrives this way
stays unknown on this machine; trust is decided when its content reaches the
canvas, as for a dropped pattern. The library row shows an "Imported" badge,
and `SavedPattern.origin`/`importedAt` record where it came from.

Nested groups make this slightly more involved. The graph store only clones a
pattern's top-level subgraph, so `withRegisteredGroups` (`patternLibrary.ts`)
installs the pattern's `groups` into the workspace first, under fresh ids
whenever the originals are taken, and lowers `trusted` in that same store
update when any nested content is unknown — the store's trust subscription
would otherwise remember foreign code as the user's own. Every place a
library pattern is dropped (sidebar, canvas drop, collection picker, ratings
popup, collection import) passes the pattern through it before calling the
store. `savedPatternUntrustsWorkspace` and `patternNeedsTrust` both walk a
pattern's own `groups` registry.

## The id-collision rule

A bundled pattern keeps its id when the library does not have it. If the
library already holds a pattern with the same fingerprint (name, ports,
subgraph and nested groups), the import is a no-op and the existing entry is
used — re-importing a file you already have changes nothing. If the id is
taken by *different* content, the import gets a fresh id and the status line
names it, so a shared pattern never overwrites one of your own. A shelf id the
importing library does not have is dropped (the pattern appears in New &
Unsorted) rather than hiding the pattern on a shelf that does not exist here.

## Out of scope

- A palette library of its own: palettes travel inside bundles and live as
  nodes on the canvas.
- Import from the community site: that path still hands patterns over as
  files, which this format reads.
- Cross-device trust: what you trust is remembered per browser, and a bundle
  carries no trust claim of its own.
