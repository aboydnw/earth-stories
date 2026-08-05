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
