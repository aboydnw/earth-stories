# Production Proof and Desktop Pilot Design

## Outcome

Earth Stories will carry a repository-owned publication through the real static
build and GitHub Pages hosting path, prove its continuation into GeoLibre, and
produce explicit evidence when that contract breaks. The desktop application
will also have a repeatable packaged-app verification path and a macOS-first
pilot protocol that makes its privacy and offline boundaries testable rather
than aspirational.

## Product boundaries

- Authoring remains local to the desktop application. Hosted HTTPS builds do
  not expose authoring APIs.
- Only assets listed in the publication manifest may be copied or linked from
  the GeoLibre companion.
- GeoLibre fetches already-published resources. It never receives a workspace,
  unpublished local path, credential, or private-network URL.
- The GeoLibre continuation remains optional and is omitted when no supported
  layer or canonical HTTPS publication URL exists.
- The production proof targets GitHub Pages. The desktop pilot targets macOS
  arm64 and x64 first; Windows and Linux remain provisional.
- Automation may build and inspect artifacts. It must not call an artifact
  signed, notarized, supported, or release-ready without the corresponding
  external evidence.

## Production fixture and deployment

Create a small `fixtures/geolibre-production-proof` story that uses the normal
compiler and publisher. It contains one included GeoJSON layer, one connected
XYZ layer with `{z}/{x}/{y}` placeholders, and one referenced unsupported layer
so the report proves both inclusion and exclusion. Every source carries a
license, attribution, source URL, and transformation lineage.

A deterministic build script accepts the final HTTPS base URL and writes the
static publication to a caller-selected output directory. A GitHub Pages
workflow runs only from `main` or by manual dispatch, builds the fixture with
the repository's Pages URL, uploads it as a Pages artifact, and deploys it. Pull
requests build and verify the fixture locally but never deploy it.

## GeoLibre report and verification contract

The publication report receives a structured GeoLibre result: whether a
companion was written, its public launch URL, included layers with resolved
public URLs, excluded layers with stable reason codes, and the hosting
requirements introduced by the handoff. The human-readable report renders the
same information.

Local publication verification parses the companion and proves that its build
ID matches, every layer maps to a declared manifest asset, included files exist
inside the publication, connected URLs are safe public HTTPS URLs, XYZ
templates remain templates, and the opt-out path leaves no companion artifact.

A hosted probe performs real HTTP requests against the deployed publication.
It validates the manifest, companion, included resources, CORS response, and a
representative byte-range request. It emits a JSON evidence file with sanitized
URLs and actionable failures. The probe never follows URLs to private hosts or
logs credentials.

The browser end-to-end contract opens the story, finds the accessible “Open in
GeoLibre” action, verifies that its encoded project URL points to the deployed
companion, follows the link, and confirms that GeoLibre requests the companion
and displays the supported layer names. Earth Stories contract failures are
blocking. External GeoLibre unavailability or UI drift is reported separately
with the requested URLs and captured browser evidence.

## Offline smoke fix

The current smoke failure is a readiness race: a deck overlay may ask a
MapLibre adapter for its projection after the component exists but before the
map is available, or while teardown is in progress. A regression test will
reproduce that lifecycle. Overlay initialization and prop updates will wait for
the map readiness boundary and tolerate teardown. The smoke verifier will
retain a bounded timeout and include chapter readiness, runtime errors, and
requested paths in failures.

## Installed-app verification

Add a platform-neutral verifier that consumes an unpacked application or an
explicit installed-app path. It checks packaged resources and launches the real
application with an isolated temporary workspace and application-data root.
Through the embedded service and renderer it creates, saves, reopens, and
publishes a local story, then verifies that the output has no private source
paths and that GeoLibre navigation uses the shell's external-link policy. The
verifier closes the app and requires the embedded service to drain cleanly.

The script produces a versioned JSON evidence document recording artifact
identity, platform, architecture, checks performed, sanitized failures, and
timestamps. It does not claim signature, notarization, quarantine, upgrade, or
uninstall evidence; those remain human platform checks.

## Author privacy disclosure

The publication panel summarizes four distinct outcomes before export:

1. local working files remain in the selected workspace;
2. included assets are copied into the publication;
3. connected assets remain at their public source URLs;
4. GeoLibre receives only public publication URLs and can be disabled.

The disclosure derives counts and eligibility from the publisher preflight so
it cannot promise a continuation that the build later omits. It does not claim
that a connected third-party host is private or controlled by Earth Stories.

## Pilot protocol

Add a macOS arm64/x64 protocol and a machine-readable evidence template. The
protocol covers artifact checksum, signature/notarization/quarantine, fresh
installation without developer tools, first launch, workspace choice, local
QGIS-exported inputs, optional tool provisioning, save/restart/reopen,
publication and GeoLibre continuation, offline boundaries, accessibility,
upgrade, rollback, uninstall, and byte-identical project preservation.

Every row identifies whether evidence is automated or manual, the expected
result, and the attachment or checksum required. A release-readiness row may be
checked only when its evidence file and human attachments exist.

## Error handling

- Missing final URLs, unsafe hosts, CORS failures, absent range behavior, and
  GeoLibre exclusions produce named findings with remediation.
- External-service outages do not get mislabeled as publication corruption.
- Installed-app verification fails closed on missing resources, unexpected
  network access, private paths in output, or a residual service process.
- Logs and evidence sanitize query strings, credentials, workspace paths, and
  tokens.

## Testing and release discipline

Every behavioral change starts with a failing test. Required verification is:
focused unit tests, publication hardening tests, hosted-probe tests against a
local controlled server, the offline runtime smoke, desktop unit tests,
packaged-directory verification, typecheck, UI and independence contracts,
production builds, and the full repository suite. Pages deployment and real
macOS installation are intentionally post-merge manual/environment steps.
