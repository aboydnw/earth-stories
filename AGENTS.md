# Contributor and agent guide

Earth Stories is a local-first geospatial story editor with static reader
publications. Start with [the product guide](docs/product.md),
[README](README.md), and [architecture](docs/architecture.md). This file is a
short entry point; it does not replace the detailed guides or approve roadmap
proposals.

## Read the relevant source

- Product UI, reader themes, or authored colors: [design system](docs/design/README.md).
  Preserve its source-of-truth order and four visual domains.
- Project lifecycle or filesystem work: [local projects](docs/local-projects.md)
  and `packages/project-store/`.
- Compilation, exports, or deployment: [publishing](docs/publication.md),
  [offline implementation](docs/plans/offline-publication.md), and
  `packages/publisher/`.
- Raw data or conversion tools: [data preparation](docs/data-preparation.md)
  and [conversion ADR](docs/adr/0001-conversion-runtime.md).
- Desktop work: [desktop application](docs/desktop-application.md),
  [desktop ADR](docs/adr/0002-desktop-shell.md), and
  [release gates](docs/release/desktop-release-readiness.md).
- Agent-driven authoring: [MCP](docs/mcp.md), with the packaged-app limitation
  in [the pilot guide](docs/pilot-macos.md).

Plans marked **proposed**, open PRs, and backlog ideas are not shipped behavior.
Devlogs record implementation history. Some MVP summaries predate later work;
see the reconciliation notes in `docs/product.md` before repeating them.

## Preserve the boundaries

- Keep editable `StoryProject` and compiled `PublicationManifest` separate.
  Update shared schemas, migration/compatibility coverage, compiler, and viewer
  together when a contract changes. Preserve stable IDs and deterministic
  compilation.
- `packages/viewer/` is the single interactive renderer for preview and
  publication. A story feature must work in both paths.
- Keep local filesystem authority in the service/store. Preserve loopback
  binding, path containment, validation, per-project locks, atomic saves, and
  backups. Browser code must not receive filesystem authority or credentials.
- The compiler owns publication policy. Keep preflight and post-build
  verification authoritative; failed candidates must preserve the previous
  successful publication. Only verified builds may claim offline delivery.
- Preserve explicit unsupported states, source attribution, and authored
  provenance. Do not invent licenses, dates, freshness policies, or coverage.
- Keep Earth Stories independent of CNG Sandbox: no upstream runtime, API,
  package, deployment, submodule, or checkout dependency. Retain license and
  provenance notices for copied code.
- Reuse `@earth-stories/ui` tokens and established component contracts for
  product chrome. Keep reader themes, authored data colors, and rendering
  exceptions in their documented domains; the viewer must not depend on Chakra.
- Do not turn packaging success into a supported-release claim. Signing,
  licensing, platform validation, and release ownership remain separate gates.

## Develop and verify

Use Node.js 22+ and Corepack with the repository-pinned Yarn version
(`package.json`). Run `corepack enable`, `yarn install`, then `yarn dev`.
Development uses the editor at `localhost:5173` and the loopback service at
`127.0.0.1:4317`. Never use real author projects as disposable test fixtures.

The baseline checks from the README and PR template are:

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

Add `yarn test:publishing:no-git` for publishing work and
`yarn test:offline-runtime` for offline/runtime changes. Desktop changes also
need the applicable packaging, resource, smoke, and target-machine checks in
the release guide. A local build is not a replacement for those checks.

For shared UI changes, cover relevant loading, empty, partial, error, disabled,
focus, narrow, and reduced-motion states; update stable Storybook fixtures and
durable design decisions. Use the [PR template](.github/pull_request_template.md)
and report checks as passed, failed, or not run with the reason. Do not infer a
CI pass from an absent workflow.

Keep changes focused, preserve existing guidance, and flag unresolved product
decisions rather than silently selecting a new audience, platform commitment,
or roadmap priority.
