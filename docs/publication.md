# Publishing

Earth Stories separates authoring from publication. Saving updates the editable
`story.json`; publishing compiles and validates a release in
`<project>/publication/`.

## Preflight

Opening the publication workshop automatically runs current checks. The
workshop reports blocking contract, reference, path, and
missing-file errors; accessibility and incomplete-narrative warnings; connected
resources; included and connected asset counts; estimated included data size;
and map chapters that the archive will preserve as snapshots. The compiler
remains authoritative, and the interface cannot bypass blocking findings.
Errors remain visible next to the primary build action. Non-blocking warnings
are collapsed for review so they do not compete with the recommended path.

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

Profiles live under **Release settings** in the publication workshop. They are
release defaults, not project types, so authors can switch without rebuilding
their story.

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

The workshop presents one recommended action: **Build publication**. It creates
the deployable folder and, when needed, creates and stores the link preview
image before the build. In the desktop app, the completed result shows its
saved location and **Show publication in Finder** (or **Show publication folder**
on other systems). In the browser, the primary action builds and requests a ZIP
download. The result includes a **Download ZIP again** link that reuses the
completed download without rebuilding. Progress, errors, and the result appear
immediately below the build action, before the GitHub publishing controls.

Building does not upload anything. Closing the workshop does not cancel a
server build already underway, but late results cannot trigger a download or
replace the status of a later session. Reopening starts a fresh workshop view.
ZIP, archival HTML, and embed code remain available under **More output options**. Chapter captures and post-deployment link checks
have their own collapsed sections, keeping the normal release path short.

### Latest folder

The deployable source of truth. Upload the entire `publication/` directory to a
static host. Asset references are relative, so subdirectory deployment works.
COG, PMTiles, and GeoParquet releases require a host with byte-range support.

### Static ZIP

A download of the same latest directory, including the interactive viewer,
assets, manifest, reports, archive, and embed entrypoint.

### What to do after building

The result includes a short hosting checklist. The same guidance travels in
`README.txt` inside every folder and ZIP:

1. Review included data, images, source credits, and license notices. Share only
   content you have permission to publish. Upload the publication, not the
   editable project and its backups.
2. Use the integrated GitHub publishing flow below, or open
   [Netlify Drop](https://app.netlify.com/drop) or
   [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).
   Both accept a ZIP or folder. Netlify uploads may need claiming and visibility
   changes before a public share link works. Cloudflare dashboard upload limits
   are 1,000 files and 25 MiB per file; Direct Upload projects cannot later switch
   to Git integration. Provider links open a page; Earth Stories does not send
   files, create an account, or accept terms on the author's behalf.
3. Keep `index.html` at the site root and preserve relative asset paths. Check
   provider file limits, HTTP byte-range support for large map files, and CORS
   for connected resources. The interactive publication requires HTTP serving;
   opening it through `file://` is not a reliable preview.
4. Test the hosted story, enter its URL under **Verify and share after deployment**,
   rebuild and replace the hosted files to update share metadata, then run
   **Check published link**. Integrated GitHub publishing already knows its URL.

Every publication includes `.nojekyll` for manual GitHub Pages uploads.
Manual Pages setup requires extracted files rather than the ZIP itself; the
integrated GitHub flow remains the easiest Pages route.

Provider instructions checked against the official
[Netlify Drop guide](https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/)
and [Cloudflare Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/).
No hosting-provider account or upload is needed to build locally.

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
in-place rewrite, because each build replaces the whole release folder. The URL
can be pasted with or without `https://`; query strings, fragments, and
trailing slashes are dropped from the canonical share URL.

The workshop renders the link preview image from the first ready map chapter
behind a scrim carrying the story title and visible map attribution, and stores
it beside `story.json` so it survives future workshop sessions and builds. The
recommended build creates a missing image automatically. Stories without a
usable map still get a card from the scrim alone. "Check published link" fetches
a deployed story and reports missing
metadata, an unresolved placeholder, or a preview image platforms cannot fetch —
the same failures that otherwise only show up after posting publicly. Localhost
URLs work, so a release served on this computer can be rehearsed before it is
deployed; other private-network addresses cannot be checked and say so.

## Publish to GitHub Pages

The publication workshop can put a story on GitHub Pages, free hosting the
author owns. Publishing needs no git binary or GitHub CLI knowledge. Earth
Stories first reuses a token stored in `~/.earth-stories/credentials.json`, then
checks the GitHub CLI's existing sign-in, and only then starts GitHub's device
flow, where the panel shows a code to enter at `github.com/login/device`. A
token obtained through device flow is stored in that credentials file with mode
`0600`, deliberately
outside every project directory, because project directories get exported,
zipped, and published to a public repository. An existing GitHub CLI token is
read fresh and is not copied there. Windows does not apply POSIX modes, so there
the file is protected by the account's own profile permissions rather than by
`0600`.

After the first successful device-flow sign-in, later publishes reuse the
stored token without showing another sign-in prompt unless the credential is
missing, invalid, or revoked.

The published address is `https://<account>.github.io/<repo>/`. It is known
before the first upload, so the release is built with that URL already in its
share metadata — on this path there is no paste-your-URL-and-export-again
rebake. Re-publishing reuses the recorded repository, so the address stays
stable and links already shared keep working. The location is recorded in
`.earth-stories/publish.json` beside the project.

Only the built `publication/` folder is uploaded, never the project directory
with its `story.json` and backups. Each publish force-replaces the `gh-pages`
branch with a single orphan commit, matching the latest-only lifecycle below:
the repository does not accumulate history for map data that is replaced
wholesale each build. A `.nojekyll` marker is added so Pages serves the release
as-is.

GitHub Pages caps a site at 1 GB and rejects any file over 100 MB. Earth
Stories checks the preflight estimate before building and measures the built
release before uploading, naming the file that is too large. Stories that
exceed the ceiling are usually on the `portable` profile, which copies COG,
PMTiles, and GeoParquet data into the release; the `connected` profile keeps
that data at its source.

The first Pages build takes a minute or two. Earth Stories waits, reports each
stage, and then runs the same published-link check described above. If GitHub
is still building when the wait ends, the publish still succeeds and says the
link will start working shortly.

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
