# Guidance, readiness, and provenance

Earth Stories now derives a five-stage authoring guide from the project instead
of persisting wizard state. The editor shows one next action, treats data as
optional for prose/media-only stories, records preview review per saved revision
in the browser session, and loads server publication checks only when publish UI
opens. Cached checks are keyed by project, saved update timestamp, and profile;
stale results remain visible but never appear current.

Browser guidance and server preflight now share the publisher's pure readiness
contract. The compiler remains the authority for manifest validity, and server
preflight still owns final filesystem, remote-resource, size, portability, and
build authorization checks.

Project sources and publication assets gained backward-compatible structured
provenance. Authors can record publisher, source and license links, update and
access dates, an explicit freshness window, temporal/spatial coverage, and
ordered transformations. Missing values warn without blocking. The standalone
viewer renders provenance beside each applicable visualization using its own
editorial CSS, while archival HTML preserves the same details even when a map
snapshot is unavailable.

The reusable product contracts—`WorkflowGuide`, `GuidancePrompt`, and
`ReadinessSummary`—live in `@earth-stories/ui`. Reader-facing
`VisualizationProvenance` remains in `@earth-stories/viewer`, maintaining the
documented separation between product chrome and published stories.
