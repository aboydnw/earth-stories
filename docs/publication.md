# Publishing

Earth Stories separates authoring from publication. Saving updates the editable
`story.json`; publishing compiles and validates a release in
`<project>/publication/`.

## Preflight

The publication workshop reports blocking contract, reference, path, and
missing-file errors; accessibility and incomplete-narrative warnings; connected
resources; included and connected asset counts; estimated included data size;
and map chapters that the archive will preserve as snapshots. The compiler
remains authoritative, and the interface cannot bypass blocking findings.

Browser guidance and server preflight share stable structural, narrative, and
provenance finding IDs. The server adds filesystem containment, missing-file,
remote reachability, size, dependency, and portability checks. Missing
provenance is a recommendation in this release and never blocks a build.

## Source provenance

Every compiled publication asset contains a normalized provenance object with
publisher, source URL, license name and URL, data update and access dates,
author-supplied freshness window, temporal and spatial coverage, and ordered
plain-language transformations. Existing concise `attribution` remains in the
manifest and on map canvases.

The reader derives active filters from the asset presentation contract,
including property/category filters, raster band and rescale, Zarr variable and
selection, and applicable point styling. Those display choices are not copied
into authored provenance.

Earth Stories reports data as stale only when an author or source supplies both
`dataUpdatedAt` and `staleAfterDays`. It does not fetch or invent update dates,
freshness policies, licenses, or coverage. Interactive manifests, folder/ZIP
outputs, embeds, and archival HTML retain the same authored values; archival
HTML also prints them beside each captured or unavailable visualization.

## Publication profiles

Choose a profile in the publication workshop. Profiles are release defaults,
not project types, so authors can switch without rebuilding their story.

- **Connected** keeps public COG, PMTiles, GeoParquet, and XYZ resources at
  their source. Local project files remain included.
- **Portable** downloads compatible COG, PMTiles, and GeoParquet sources into
  the release. Basemaps and XYZ tile pyramids remain connected.
- **Custom** follows each source's publication data policy.

Every source can override the profile with “always include” or “always
connect.” Preflight reports the effective decision, estimated included size,
unknown sizes, unreachable portable sources, external dependencies, and whether
the eventual host must support HTTP byte ranges. Offline publication remains a
separate future profile.

## Outputs

### Latest folder

The deployable source of truth. Upload the entire `publication/` directory to a
static host. Asset references are relative, so subdirectory deployment works.
COG, PMTiles, and GeoParquet releases require a host with byte-range support.

### Static ZIP

A download of the same latest directory, including the interactive viewer,
assets, manifest, reports, archive, and embed entrypoint.

### Archival HTML

`archival.html` is a single document with inline styles, project images, chart
SVGs, Dublin Core metadata, citations, and available map snapshots. If browser
security prevents reading a map canvas, it displays a visible availability and
camera note rather than silently omitting the chapter.

### Chapter media

The publication workshop can download attributed PNG images for ready map
chapters. It can also record six-second animated captures for temporal Zarr,
trajectories, flyovers, or other moving map views. MP4 is preferred when the
browser exposes an MP4 encoder; otherwise Earth Stories produces WebM and says
which format was used.

### Embed

`embed.html` uses the publication runtime without its masthead and footer. The
iframe remains `100vh` tall and acts as the story scrollport, preserving sticky
scrollytelling. Generate the final snippet after entering the deployed URL.

### Share kit

Every release carries the metadata a social platform reads when someone pastes
its link. `index.html` gains Open Graph and Twitter card tags, `share/card-1.png`
holds the link preview image, and `share/post-text.md` holds ready-to-paste post
text. `embed.html` is copied before the tags are injected, so an embedded story
does not advertise itself as the page being shared.

Platforms require absolute URLs and never run the page's scripts, but the
publication URL is unknown while the story is still local. Builds therefore
default to the same `{{PUBLICATION_URL}}` placeholder the embed snippet uses.
Once the story is deployed, enter the URL in the publication workshop and export
again: the release is rebuilt with real absolute URLs throughout. There is no
in-place rewrite, because each build replaces the whole release folder.

The workshop renders the link preview image from the first ready map chapter
behind a scrim carrying the story title, and stores it beside `story.json` so it
survives the next build. Stories without a usable map still get a card from the
scrim alone. "Check published link" fetches a deployed story and reports missing
metadata, an unresolved placeholder, or a preview image platforms cannot fetch —
the same failures that otherwise only show up after posting publicly.

## Latest-only lifecycle

A build is assembled in a temporary sibling directory. The service moves the
current publication aside, promotes the completed candidate, restores the prior
directory if promotion fails, and deletes the prior directory after success.
Release history and rollback UI are post-MVP work.

Before promotion, Earth Stories verifies the candidate's entrypoints,
publication manifest, archival output, reports, and every included asset. A
failed verification leaves the existing latest publication untouched. A
successful release includes `publication-verification.json` with the build ID,
verification time, and number of checked files.
