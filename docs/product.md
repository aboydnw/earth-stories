# Product guide

This is a concise orientation to Earth Stories, not a new roadmap. The baseline
below reflects `main` at `27403cb` (reviewed 2026-11-04). Current implementation,
maintained domain guides, explicit plan status, and release evidence must be
read together; older MVP summaries and unmerged PRs are not a reliable feature
inventory on their own.

## Purpose and audience

Earth Stories lets authors turn geospatial evidence into stories in ordinary
local project folders, preview the reader experience, and publish static
artifacts they own. Reader publications do not depend on a DevSeed-hosted
application. It is an independent product extracted from selected MIT-licensed
CNG Sandbox concepts, with no continuing upstream runtime dependency.

The documented audience is Development Seed contributors and technically
confident pilot authors. This remains an engineering prototype/pilot, not a
supported end-user release. Source development and a named-tester macOS pilot
are distinct from a supported public installer.

Sources: [README](../README.md), [architecture](architecture.md),
[provenance](provenance.md), and [release readiness](release/desktop-release-readiness.md).

## Near-term priority

The product owner confirmed on 2026-11-04 that the priority is making Earth
Stories a macOS desktop application and integrating GeoLibre. This prioritizes
the direction of [PR #23](https://github.com/aboydnw/earth-stories/pull/23)
without treating it as merged or its release gates as satisfied. It does not
establish a public-release date, support policy, or completed platform validation.

## Core journey

1. Create or reopen a local project, or copy an example into an editable story.
2. Build chapters around a narrative, import/prepare local data or connect public
   sources, and reuse them through the project data library.
3. Edit with the shared reader preview; inspect chapter and publication readiness.
4. Resolve blocking preflight findings, choose a delivery profile, and build a
   verified latest publication.
5. Deploy the folder/ZIP or use GitHub Pages publishing; share an embed or retain
   the archive. Reopen the editable project for the next change.

Save, preview, preparation, publishing, restart, and reopen form the documented
pilot evaluation loop. Sources: [local projects](local-projects.md),
[publishing](publication.md), [examples](examples.md), and [pilot guide](pilot-macos.md).

## Implemented baseline

- Prose, maps, scrollytelling, images, video, rich charts, and flyovers use one
  shared viewer. Data presentation and provenance travel with the story.
- Projects use schema-validated saves, atomic replacement, safety backups,
  contained asset access, and recoverable workspace removal. Backups are not a
  user-facing version-history product.
- Local data preparation uses lazily provisioned, pinned Pixi capabilities.
  Supported formats and limits belong in [data preparation](data-preparation.md),
  rather than a second exhaustive list here.
- Connected, portable, custom, and offline publication profiles have different
  guarantees. Portable can retain network dependencies. **Verified offline**
  requires a dependency-complete build and isolated browser verification before
  promotion; it does not promise first-install or arbitrary offline authoring.
  Unbounded XYZ/Zarr, hosted video, and remote terrain/buildings block the
  current offline path rather than silently disappearing.
- Outputs include the latest static folder/ZIP, archival HTML, embed, chapter
  images, animated captures, and a share kit. Failed builds preserve the last
  successful release. Publication history remains deferred.
- GitHub Pages publishing uploads the built publication, not the editable
  project or its backups. The local MCP server supports agent-driven authoring;
  the pilot guide explicitly excludes connecting it to the packaged app.

Evidence: [publisher](../packages/publisher/src/build.ts),
[publication contract](../packages/story-schema/src/publication.ts),
[offline plan: implemented](plans/offline-publication.md),
[offline devlog](devlog/2026-08-13-verified-offline-publications.md),
[publishing](publication.md), and [MCP](mcp.md).

## Product boundaries

- Author-owned source projects and compiled reader artifacts remain separate.
  The local service is an implementation detail, not a hosted multi-user API.
- Hosted accounts, collaboration, managed storage, and reader-facing AI remain
  outside the current scope. Local MCP authoring does not change that boundary.
- Preserve explicit dependency, download, unsupported-content, and recovery
  information. Provenance gaps are recommendations in this release, not grounds
  for fabricating facts or blocking an otherwise valid build.
- Automatic desktop updates and a supported cross-platform public release are
  not available commitments. The unsigned macOS pilot has an explicit limited
  disposition; public release still requires the applicable signing, legal,
  ownership, and target-machine evidence.

See [architecture](architecture.md), [design patterns](design/patterns.md),
[publishing](publication.md), and [release readiness](release/desktop-release-readiness.md).

## Historical guidance and open direction

- [MVP compatibility](mvp-compatibility.md), [MVP roadmap](mvp-roadmap.md), and
  parts of [local projects](local-projects.md) predate implemented offline and
  direct-publishing work. The publication guide's “future” offline wording is
  also stale. Use the implementation evidence above for those capabilities.
- [Desktop application](desktop-application.md) describes general packaging
  limits; the release-readiness document records the later named-tester pilot
  exception. Neither establishes a supported public release or waives remaining
  redistribution gates. The MCP guide's desktop-start suggestion conflicts
  with the pilot guide's packaged-MCP limitation; do not promise that integration.
- [Project handoff](plans/project-handoff.md) and
  [history/recovery](plans/version-history-recovery.md) are **proposed**.
  The [UX backlog](ux-improvement-backlog.md) mixes explicitly shipped items with
  opportunities, not commitments.
- At this baseline, [PR #23](https://github.com/aboydnw/earth-stories/pull/23)
  proposes the desktop/browser boundary, GeoLibre continuation, production
  proof, and expanded pilot evidence. [PR #21](https://github.com/aboydnw/earth-stories/pull/21)
  proposes pilot-version alignment. Neither is included in the baseline above.
