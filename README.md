# DevSeed Stories

DevSeed Stories is an experimental local-first visual editor for geospatial
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
- an initial local editor shell;
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

The editor opens at `http://localhost:5173`.

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
apps/viewer/             Static publication entry point
packages/story-schema/   Authoring and publication contracts
packages/viewer/         Authoritative story renderer
packages/publisher/      Deterministic project-to-publication compiler
fixtures/field-notes/    Representative MVP project
docs/                    Architecture and compatibility decisions
```

## Support posture

The current phase is an engineering prototype for Development Seed contributors
and technically confident pilot users. Clone-and-run is the intended initial
distribution. Easier launchers or native installers may follow only after the
local project and publication architecture are validated.

## Contributor troubleshooting

- [GitHub authentication from sandboxed agents](docs/github-auth-troubleshooting.md)
  explains why a restricted `gh auth status` can incorrectly look like an
  expired token and the checks required before asking someone to re-authenticate.
