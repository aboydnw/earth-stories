# Example stories and data

Earth Stories ships a small, versioned example catalog so a fresh local
workspace is useful before an author has prepared data. The catalog is part of
the application code and requires no hosted Earth Stories account or database.

## Example stories

The first-run screen offers complete stories built only from capabilities the
shared viewer currently supports. Choosing one creates a new project folder
with its own `story.json`. The copy is ordinary author-owned content: edits,
publication settings, and exports never modify the bundled template.

The initial catalog contains:

- **Antakya from above**, a connected public COG story using OpenAerialMap
  imagery;
- **Lines on a shared planet**, a vector PMTiles story using geoBoundaries CGAZ
  administrative boundaries.

## Example connections

The editor's **Example data** section adds a curated connection and a map
chapter to the current story. The initial catalog includes Antakya aerial
imagery plus global country and state/province PMTiles. These URLs and their
attribution are explicit, reviewed source data—not silent dependencies on CNG
Sandbox.

Examples default to connected delivery. Authors can switch the publication
profile or override the individual asset when they want Earth Stories to copy a
compatible remote file into a portable release.

## Catalog rules

- Add only public HTTPS sources with stable attribution.
- Add a story only after every chapter and source renders in the shared viewer.
- Keep templates small enough to understand and edit.
- Treat example selection as a copy operation, never a reference to mutable
  authoring state.
- Recheck remote availability during pilot reviews; the publication preflight
  remains authoritative at export time.
