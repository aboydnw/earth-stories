# Private Katrina review previews (experimental)

This opt-in build renders the checked-out `example-storm-track` story with the
shared publication viewer, including the atlas/scene changes in PR #27. It does
not build the editor or the field-notes fixture. It creates no Cloudflare
resources, uploads nothing, and changes neither the normal publishing flow nor
the production GitHub authentication broker.

## Local build and revision identity

Use Node.js 22+ and the repository-pinned Yarn 4.13.0 through Corepack:

```sh
corepack yarn install --immutable
corepack yarn review:build
```

Build from a clean checkout of the desired PR head. The command rebuilds the
viewer and materializes the canonical example and bundled assets from that
checkout. It refuses dirty tracked/untracked source files rather than labeling
uncommitted content with a misleading SHA. `dist/private-review/review-build.json`
records the exact Git commit, example ID and compiler build ID. Serve
`dist/private-review` over local HTTP to review the actual story. Build identity
is reproducible from the pinned source/dependencies; this is not a promise of
bit-identical timestamps or availability of external map services.

The script uses the existing compiler and publication verifier, then checks every
output file against Cloudflare's **25 MiB per-file** limit. This narrow build
omits only `runtime/duckdb` after asserting there are no manifest runtime assets
or runtime dependencies and all source kinds are known non-DuckDB formats.
Credits remain. It rejects GeoParquet and unexpected formats even if an inventory
is incomplete. It also rejects included PMTiles, local byte-range dependencies
and byte-range hosting requirements. It does not rewrite the manifest, remove
story content, or turn ordinary exports into generally Cloudflare-compatible
publications. Both Pages and Workers Static Assets have file-size constraints;
this integration does not provide a range-serving implementation for either.

Katrina's PMTiles and basemap remain remote and must permit CORS and required
range requests from the review origin. Included PNG, trajectory JSON and CSV
remain bundled. The review needs internet; protecting the review does not make
those already-public upstream datasets private.

## Access first, deployment second

**Do not enable Git deployments until Cloudflare Access has been configured and
verified.** A separate review project is required. Protect its root
`<project>.pages.dev` as well as all preview/deployment/branch URLs under
`*.<project>.pages.dev`, and any custom domain. A preview-only Access toggle does
not protect the project root. Before uploading story content, test the intended
policies against a harmless placeholder: signed-out requests to the root,
branch aliases, immutable deployment URLs, `publication.json`, assets and embed
must be challenged/denied; an intended reviewer must be able to sign in. Do not
use an allow-everyone or bypass policy. Keep automatic deployments disabled
until these checks succeed. If the dashboard needs an initial deployment, use
only a harmless placeholder, not this story.

The build gate is a fail-closed **operator acknowledgement**, not authentication,
not an Access configuration API, and not automated verification of live policy.
Only set it after the checks above. Repository code and environment flags cannot
prevent a Cloudflare administrator from publishing a folder another way.

## Separate Pages Git build configuration

After Access is verified, connect only this repository to the separate private
review project. Use framework preset **None**, repository root as build root,
Node 22+, and output directory `dist/private-review`. Disable the platform's
automatic dependency installation (`SKIP_DEPENDENCY_INSTALL=true`) and set:

```sh
corepack yarn install --immutable && corepack yarn review:build:pages
```

In that review project's preview build environment only, set:

- `EARTH_STORIES_PRIVATE_REVIEW_ACCESS_VERIFIED=true`
- `EARTH_STORIES_REVIEW_BRANCH=<the one reviewed, trusted branch>`

Cloudflare supplies `CF_PAGES_BRANCH` and `CF_PAGES_COMMIT_SHA`. The gate requires
both to match the explicit branch and the actual Git HEAD. Do not spoof these
variables to enable deployment. Leave production deployment disabled and leave
the acknowledgement unset in production. Allow only the selected trusted branch
in Pages branch controls. PR #27 itself is unchanged by this integration: test a
separate branch containing its head plus these scripts, or integrate the scripts
through a separately reviewed change. Do not enable all-branch or fork builds.

No Cloudflare API token, GitHub Actions deployment workflow, production secret,
or authentication-broker setting is needed. Build code executes with the build
environment's permissions: do not expose secrets to fork/unreviewed branches.
Review and restrict the Git integration's repository access during setup. The
branch gate is an additional accident-prevention measure, not a sandbox against
malicious branch code.

After a deployment, repeat signed-out and reviewer access checks for the exact
URL, compare `review-build.json` with the PR head, and test every story chapter,
map, animation, chart, embed, narrow view and reduced-motion mode. The local
publication verifier is structural for this connected story; it does not prove
remote data health, browser rendering, Access coverage, or a hosted deployment.
Keep this work in draft until those checks are recorded. No hosted compatibility
or private-access success is claimed by a successful build alone.
