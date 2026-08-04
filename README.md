# Earth Stories

Earth Stories is an experimental local-first visual editor for geospatial
stories. Authors work in local project folders and export static publications
that do not depend on a DevSeed-hosted application.

This repository is a new, independent project. It reuses selected MIT-licensed
ideas and code from the CNG Sandbox prototype, but it has no git, package,
runtime, API, or deployment dependency on that repository.

## Current milestone

The repository is implementing the first MVP slice:

- separate authoring-project and publication-manifest contracts;
- stable IDs and deterministic compilation;
- one viewer shared by editor preview and static publication;
- a representative story fixture;
- a loopback-only project service with atomic saves and backups;
- a local editor that creates, opens, edits, saves, and previews projects;
- static publication output with an external-dependency report.

This is not yet a supported end-user release. Direct publishing, offline
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
