# Example stories and data

Earth Stories ships a small, versioned example catalog so a fresh local
workspace is useful before an author has prepared data. The catalog is part of
the application code and requires no hosted Earth Stories account or database.

## Example stories

The workspace lists complete stories built only from capabilities the shared
viewer currently supports alongside the author's own stories, with an
**Example** tag. Choosing one creates its project folder and `story.json` the
first time; later selections reopen that same editable local copy instead of
creating duplicates. Edits, publication settings, and exports never modify the
bundled template.

The initial catalog contains:

- **Antakya from above**, a connected public COG story using OpenAerialMap
  imagery;
- **Lines on a shared planet**, a vector PMTiles story using geoBoundaries CGAZ
  administrative boundaries;
- **Anatomy of a point cloud**, a COPC flyover at Autzen Stadium;
- **Fields through time**, a temporal Fields of The World Zarr story;
- **A story beyond the map**, demonstrating video and ordered map overlays.

## Example connections

The editor's **Story data** inspector adds a curated connection and a map
chapter to the current story. The initial catalog includes Antakya aerial
imagery, global country and state/province PMTiles, Fields of The World Zarr,
and Autzen Stadium COPC. These URLs and their
attribution are explicit, reviewed source data—not silent dependencies on CNG
Sandbox.

Examples default to connected delivery. Authors can switch the publication
profile or override the individual asset when they want Earth Stories to copy a
compatible remote file into a portable release.

## Catalog rules

- Add only public HTTPS sources with stable attribution.
- Add a story only after every chapter and source renders in the shared viewer.
- Keep templates small enough to understand and edit.
- Give every template a stable ID in the reserved `example-*` namespace.
  Ordinary project creation cannot occupy that namespace. Example selection
  materializes one editable local copy per template and reopens it thereafter;
  it never references mutable catalog state.
- Recheck remote availability during pilot reviews; the publication preflight
  remains authoritative at export time.
