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

## Outputs

### Latest folder

The deployable source of truth. Upload the entire `publication/` directory to a
static host. Asset references are relative, so subdirectory deployment works.

### Static ZIP

A download of the same latest directory, including the interactive viewer,
assets, manifest, reports, archive, and embed entrypoint.

### Archival HTML

`archival.html` is a single document with inline styles, project images, chart
SVGs, Dublin Core metadata, citations, and available map snapshots. If browser
security prevents reading a map canvas, it displays a visible availability and
camera note rather than silently omitting the chapter.

### Embed

`embed.html` uses the publication runtime without its masthead and footer. The
iframe remains `100vh` tall and acts as the story scrollport, preserving sticky
scrollytelling. Generate the final snippet after entering the deployed URL.

## Latest-only lifecycle

A build is assembled in a temporary sibling directory. The service moves the
current publication aside, promotes the completed candidate, restores the prior
directory if promotion fails, and deletes the prior directory after success.
Release history and rollback UI are post-MVP work.
