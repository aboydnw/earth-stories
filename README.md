# Earth Stories

Earth Stories is an experimental local-first visual editor for geospatial
stories. Authors work in local project folders and export static publications
that do not depend on a DevSeed-hosted application.

This repository is a new, independent project. It reuses selected MIT-licensed
ideas and code from the CNG Sandbox prototype, but it has no git, package,
runtime, API, or deployment dependency on that repository.

## Current capability

The repository now implements the complete first MVP workflow:

- separate authoring-project and publication-manifest contracts;
- stable IDs and deterministic compilation;
- one viewer shared by editor preview and static publication;
- a representative story fixture;
- a loopback-only project service with atomic saves and backups;
- a local editor that creates, opens, edits, saves, and previews projects;
- prose, map, scrollytelling, image, video, rich chart, and flyover chapters;
- a reusable, project-local data library plus immutable example data;
- raw GeoTIFF, Shapefile, GeoJSON, CSV, NetCDF, HDF5, LAS/LAZ, and GPX preparation;
- lazy, per-format Pixi environments with progress and retryable jobs;
- local COG import and direct range-request preview;
- connected COG, PMTiles, GeoParquet, XYZ, Zarr, trajectory, and COPC sources;
- URL inspection for access requirements, PMTiles layers, and Zarr variables;
- property styling/filtering, raster controls, Zarr slices, COPC styling, and animation controls;
- per-source included/connected publication policies;
- publication preflight with blocking errors, portability warnings, and size estimates;
- latest-release folder and ZIP outputs with a dependency report;
- self-contained archival HTML, fixed-scrollport iframe/embed outputs, attributed
  PNG chapter images, and MP4/WebM animated map captures;
- editable example stories and curated public example connections;
- post-build publication verification before the latest release is promoted.

This is still a pilot release rather than a supported end-user product. The
local storytelling and data-preparation workflow is the parity target; hosted
accounts, collaboration, managed storage, direct publishing, offline guarantees,
and AI features remain intentionally outside scope.

## Develop

Prerequisites: Node.js 22+ and Corepack on macOS, Linux, or Windows x64. Data
preparation bootstraps pinned Pixi environments on first use, so authors do not
install GDAL or PDAL separately.

```bash
corepack enable
yarn install
yarn dev
```

The editor opens at `http://localhost:5173`. `yarn dev` also starts a small
local service at `127.0.0.1:4317`; it is not exposed to the network.

Application builds use TypeScript build mode, so a fresh checkout creates the
referenced package declarations automatically. Running `yarn typecheck` first
is not required.

### Record video feedback

Development builds include a **Record feedback** control. Use it to capture the
Earth Stories tab, optional microphone narration, clicks, network activity, and
console errors while reproducing an issue. Stop the recording to download a
`riffrec-*.zip` session, then share that ZIP with the person investigating the
feedback. Typed values and network request or response contents are not captured.

The recorder is loaded only during local development and is excluded from
production builds. Screen recording requires `localhost` or HTTPS. When Earth
Stories is running on a remote development server, open it through an SSH tunnel
from your laptop, for example:

```bash
ssh -N -L 5173:localhost:5173 anthony@dev-server
```

Then visit `http://localhost:5173`. Local `.feedback/` analysis artifacts are
ignored by Git.

From the editor:

1. Choose a recent story from the workspace, create one, or make an editable copy of an example.
2. Organize chapters in the left outline and use **Add chapter** to choose a chapter type deliberately.
3. Edit the selected chapter in the right inspector while the publication preview remains visible in the center.
4. Open **Story data** to import a supported local file, connect a public URL, or add a curated example connection.
5. Use **Story settings** for the title, theme, basemap, attribution, and other publication-wide details.
6. Open **Publish**, review preflight findings, and choose a release output.
7. Deploy the latest folder or ZIP, preserve the archival HTML, or copy the iframe after supplying the deployed URL.

Every successful build replaces `<project>/publication/`; the MVP intentionally
keeps only the latest release. See [Publishing](docs/publication.md).

The workspace includes example stories that exercise supported COG and PMTiles
workflows. The editor's **Story data** inspector exposes curated example
connections that can be added to any project. See [Examples](docs/examples.md).

The publication workshop offers connected, portable, and custom profiles.
Earth Stories now renders COG, vector/raster PMTiles, GeoParquet, GeoJSON, XYZ,
images, and CSV charts through the same preview and publication runtime.
See [Data preparation](docs/data-preparation.md) for format-specific behavior
and first-use downloads.

Projects are ordinary folders under `earth-stories-projects/` by default. Set
`EARTH_STORIES_PROJECTS_DIR` before starting the app to choose another parent
folder. Every save writes atomically and preserves the previous story file in
the project's `.earth-stories/backups/` folder.

## Build and test

```bash
yarn typecheck
yarn test
yarn check:independence
yarn check:ui
yarn format:check
yarn build
yarn build:publication
yarn storybook:build
```

The fixture publication is written to `dist/publications/field-notes/`.

## Repository map

```text
apps/editor/             Local authoring shell
apps/local-service/      Loopback project API and local asset server
apps/viewer/             Static publication entry point
packages/story-schema/   Authoring and publication contracts
packages/project-store/  Validated local project storage and safe writes
packages/viewer/         Authoritative story renderer
packages/publisher/      Deterministic project-to-publication compiler
packages/ui/             Shared design tokens, recipes, and product components
fixtures/field-notes/    Representative MVP project
docs/                    Architecture and compatibility decisions
```

Implementation notes are recorded in the [MVP completion devlog](docs/devlog/2026-08-04-complete-mvp.md)
and [publication-hardening devlog](docs/devlog/2026-08-04-publication-hardening.md).
Design-system conventions live in [the design-system guide](docs/design-system.md).
The renderer and profile milestone is recorded in the
[storytelling and publication depth devlog](docs/devlog/2026-08-04-storytelling-publication-depth.md).
The pilot starting-point work is recorded in the
[pilot examples devlog](docs/devlog/2026-08-05-pilot-examples.md).
The feature-parity renderer wave is recorded in the
[feature-parity devlog](docs/devlog/2026-08-05-feature-parity-wave.md).
The workspace and editor redesign is recorded in the
[workspace and editor redesign devlog](docs/devlog/2026-08-05-workspace-editor-redesign.md).
Like the other private workspace packages, `@earth-stories/ui` exports its
TypeScript source directly for Vite and project-reference consumption; it is not
published as a precompiled package. Its stylesheet remains a separate explicit
export so consumers control when global design tokens are loaded.

## Support posture

The current phase is an engineering prototype for Development Seed contributors
and technically confident pilot users. Clone-and-run is the intended initial
distribution. The product boundary is already desktop-like—the browser UI talks
only to a process on the same computer—but native packaging is intentionally
deferred until this workflow is validated.

## Contributor troubleshooting

- [GitHub authentication from sandboxed agents](docs/github-auth-troubleshooting.md)
  explains why a restricted `gh auth status` can incorrectly look like an
  expired token and the checks required before asking someone to re-authenticate.
