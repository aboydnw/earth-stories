# Product patterns

## Workspace collections — Established

Represent loading, ready, empty, partial success, and failure distinctly.
Previously loaded content stays usable during refresh. A project that fails to
open does not hide successful projects. Removal is recoverable and names the
local trash behavior.

## Save lifecycle — Established

Use `clean`, `dirty`, `saving`, `saved`, `validation-error`, and
`service-error`. Saving is quiet and persistent; failure remains visible and
must not imply work is stored. Publishing or leaving with unsaved work needs a
clear decision.

## Data preparation — Established

The user-facing stages are inspecting, waiting for input, downloading tools,
converting, verifying, ready, retryable failure, and unsupported format. State
what is happening and whether the user can leave. Keep source files and choices
after recoverable failure, prevent duplicate jobs, and lead success to the map.

## Data library — Established

Distinguish empty, immutable example, local source, connected source, missing
source, partial project failure, and source usage. Connected means the source
requires networking. Never display a fallback dataset as though it were the
stored selection.

## Editor chapters — Provisional

Adding, duplicating, reordering, and deleting preserve the selected chapter and
preview whenever possible. Disabled actions explain unavailable prerequisites.
Destructive removal names dependent data effects and remains recoverable where
the product supports it.

## Publishing — Established

Preflight separates blocking errors, portability/network warnings, and
information. Build progress uses real stages. A failed build preserves the
previous publication. Success identifies the local path or downloaded result.

## Map and reader controls — Established principles

Map loading, unavailable sources, attribution, network dependency, animation,
and reduced-motion behavior remain explicit. Map controls carry their own
legible surface over changing basemaps and stay at the map-control layer. Story
prose becomes readable without waiting for map code.

## Content

Use “on this computer,” “project folder,” “local service,” and “connected
source.” Prefer outcomes over implementation names. Errors say what failed,
what remains intact, and the next action. Avoid account, cloud, and workspace
server terminology unless the product actually introduces those concepts.
