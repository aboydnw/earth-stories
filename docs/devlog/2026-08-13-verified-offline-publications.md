# Verified offline publications

Earth Stories now treats offline delivery as a verified build fact rather than
an optimistic profile label. Offline publication candidates contain a bundled
neutral basemap, compatible story assets, projection definitions, and the exact
browser runtime needed by GeoParquet. Unsupported unbounded or connected
features block preflight with source- or chapter-specific guidance.

The publisher materializes remote files into persistent content-addressed
storage, verifies expected digests, compiles against local locators, and keeps a
previous successful release when materialization or verification fails. A
fresh Chrome profile serves the candidate over loopback HTTP with byte ranges,
cache and service workers bypassed, and every request outside the exact origin
denied. Only a candidate that passes manifest integrity, chapter readiness,
WebGL, runtime-error, and artifact checks is promoted and marked **Verified
offline**.

The editor separates internet needed to assemble a release from internet needed
after publishing. The offline badge appears only after the export endpoint has
completed verification. Connected, portable, and custom profiles retain their
existing behavior.

Offline authoring remains a narrower follow-up capability. Desktop workspace
settings now show all pinned Pixi environments, their installed state and
apparent footprint, and allow selected missing environments to be prepared
before disconnecting. Example rows explicitly identify network-dependent
authoring. A smoke test opens an all-local project with browser fetches disabled.

No CI workflow was added in this phase. Runtime and font redistribution review,
signed installers, and macOS/Windows target-machine validation remain release
gates rather than weakened guarantees.
