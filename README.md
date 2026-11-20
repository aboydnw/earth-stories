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
- fourteen colormaps with an optional reversed ramp, and automatic class colours
  for categorical rasters;
- chart chapters from a CSV table, a raster's value distribution, or one point
  of a time-aware Zarr;
- per-source included/connected publication policies;
- publication preflight with blocking errors, portability warnings, and size estimates;
- latest-release folder and ZIP outputs with a dependency report;
- self-contained archival HTML, fixed-scrollport iframe/embed outputs, attributed
  PNG chapter images, and MP4/WebM animated map captures;
- editable example stories and curated public example connections;
- a local stdio MCP server for agent-driven authoring ([docs/mcp.md](docs/mcp.md));
- an unsigned macOS pilot build for named testers
  ([docs/pilot-macos.md](docs/pilot-macos.md));
- post-build publication verification before the latest release is promoted.

This is still a pilot release rather than a supported end-user product. The
local storytelling and data-preparation workflow is the parity target; hosted
accounts, collaboration, managed storage, and reader-facing AI features remain
intentionally outside scope.

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
and technically confident pilot users. Clone-and-run remains the intended
initial distribution. Local unsigned desktop packaging groundwork now exists,
including provisional Linux x64 outputs, but no platform has a supported public
installer. Signing, notarization, target-machine testing, release ownership, and
the other public-release gates remain open. See the
[desktop application guide](docs/desktop-application.md), the
[release-readiness checklist](docs/release/desktop-release-readiness.md), and
the [packaging groundwork devlog](docs/devlog/2026-08-13-desktop-packaging-groundwork.md).

## Contributor troubleshooting

- [GitHub authentication from sandboxed agents](docs/github-auth-troubleshooting.md)
  explains why a restricted `gh auth status` can incorrectly look like an
  expired token and the checks required before asking someone to re-authenticate.

### Create a story with AI (local pilot)

Choose **Create with AI** in the workspace. Enter an audience, takeaway, context,
and visual direction, optionally attach references, then choose **Generate story**.
Review the palette, chapter outline, composed vector scenes, and **View as reader**
preview. **Create this story** imports that exact candidate into the ordinary
editor. It does not publish anything. Existing stories are not modified by AI.

Choose **Continue with ChatGPT**, finish authorization in your system browser,
and select an available story model. Generation uses your ChatGPT plan allowance;
**Manage usage** opens ChatGPT's app limits. API-key authentication and generated
image requests have been removed; there is no automatic billing fallback.

AI composes editable vector scenes from landscape, flow, reveal, and diagram
templates, with coordinated reader palettes and scroll motion. These are
illustrations, not measured data. Uploaded reference images can inform the story,
but this flow does not generate raster artwork. Previously created image stories
and ready candidates remain readable.

Sign-in credentials stay outside story projects in protected local storage.
Standalone development uses owner-only files under `~/.earth-stories/`; desktop
uses its dedicated OS-protected credential store when available. The separate
loopback callback opens only during sign-in. Account registrations survive local
sign-out for reconnection, while tokens are cleared and revocation is attempted.
Only one service may own a stored ChatGPT session at a time.

For a browser connected to a remote development server, the ChatGPT sign-in
listener also needs an SSH forward. Set a fixed callback port when starting the
service on the server:

```bash
EARTH_STORIES_CHATGPT_CALLBACK_PORT=4319 yarn dev
```

On your computer, keep this tunnel running alongside your existing editor tunnel
(replace the SSH destination with your own):

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:4319:127.0.0.1:4319 anthony@dev-server
```

Then choose **Continue with ChatGPT** again. Both sides must use the same callback
port because the browser returns to that address after authorization. Keep any
existing service-port or project-directory settings in your launch command. If
4319 is occupied, choose another unused port on both machines and update both
commands. The listener stays bound to loopback; do not expose it publicly.
Without this setting, local development and the desktop app keep automatically
choosing an available port. Old sign-in links expire; start a fresh attempt
rather than reopening the earlier link.

The brief and selected reference contents are sent to OpenAI. Supported references
are UTF-8 TXT/Markdown, PDFs with extractable text, and PNG/JPEG/WebP images. Public
HTTPS links must point directly to those formats. Scanned PDFs require a text
version; SVG and general webpage scraping are unsupported. Limits: 20 references,
20 MiB each, 200,000 extracted text characters, and 100 MiB combined input files.
Images are decoded, bounded to 16 million pixels and 8192 pixels per edge, and re-encoded as PNG.

Only one generation runs at a time. A job can produce up to 12 chapters with
curated vector scenes. Invalid structured output gets one repair attempt; usage
limits and incomplete streams stop the job. Cancel stops further work. Retry
reuses the validated plan when available. An unfinished legacy image-generation
job must be replaced with a new vector story; it is not silently reinterpreted.
Candidate URLs survive restart. Discarding a candidate preserves accepted stories.

Run `yarn smoke:generation --mock` for disposable integration verification. This
is not evidence of live account/model access. For a live test, sign in through the
running editor and generate a story, inspect its reader preview, create it, edit
it, and reopen it. No credential is read or printed by the smoke script.
The integration follows the official [local sign-in flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
and [plan-usage limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
