# Earth Stories

Earth Stories is an experimental local-first visual editor for geospatial
stories. Authors work in local project folders and export static publications
that do not depend on a DevSeed-hosted application.

This repository is a new, independent project. It reuses selected MIT-licensed
ideas and code from the CNG Sandbox prototype, but it has no git, package,
runtime, API, or deployment dependency on that repository.

## MVP capability

The repository now implements the complete first MVP workflow:

- separate authoring-project and publication-manifest contracts;
- stable IDs and deterministic compilation;
- one viewer shared by editor preview and static publication;
- a representative story fixture;
- a loopback-only project service with atomic saves and backups;
- a local editor that creates, opens, edits, saves, and previews projects;
- prose, map, scrollytelling, image, and basic CSV chart chapters;
- local GeoJSON, PMTiles, GeoParquet, image, and CSV imports;
- connected COG, PMTiles, GeoParquet, and XYZ source records;
- per-source included/connected publication policies;
- publication preflight with blocking errors, portability warnings, and size estimates;
- latest-release folder and ZIP outputs with a dependency report;
- self-contained archival HTML and fixed-scrollport iframe/embed outputs.

This is still a pilot release rather than a supported end-user product. Direct publishing, offline
guarantees, collaboration, AI features, and full CNG feature parity are outside
the MVP.

## Develop

Prerequisites: Node.js 22+ and Corepack.

```bash
corepack enable
yarn install
yarn dev
```

The editor opens at `http://localhost:5173`. `yarn dev` also starts a small
local service at `127.0.0.1:4317`; it is not exposed to the network.

From the editor:

1. Create or open a local story.
2. Add text, import a supported local file, or connect a public data URL.
3. Edit chapter copy and presentation settings while checking the live preview.
4. Open **Publish**, review preflight findings, and choose a release output.
5. Deploy the latest folder or ZIP, preserve the archival HTML, or copy the iframe after supplying the deployed URL.

Every successful build replaces `<project>/publication/`; the MVP intentionally
keeps only the latest release. See [Publishing](docs/publication.md).

Projects are ordinary folders under `earth-stories-projects/` by default. Set
`EARTH_STORIES_PROJECTS_DIR` before starting the app to choose another parent
folder. Every save writes atomically and preserves the previous story file in
the project's `.earth-stories/backups/` folder.

## Build and test

```bash
yarn typecheck
yarn test
yarn build
yarn build:publication
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
fixtures/field-notes/    Representative MVP project
docs/                    Architecture and compatibility decisions
```

Implementation notes are recorded in the [MVP completion devlog](docs/devlog/2026-08-04-complete-mvp.md)
and [publication-hardening devlog](docs/devlog/2026-08-04-publication-hardening.md).

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
