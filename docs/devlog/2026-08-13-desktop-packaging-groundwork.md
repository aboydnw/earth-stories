# Desktop packaging groundwork

Date: 2026-08-13

This phase implemented local, unsigned desktop packaging mechanics without
claiming the signed-release outcome in the source packaging plan.

## Implemented

- deterministic electron-builder targets and an explicit packaged-resource
  contract;
- staged editor, viewer, local-service, conversion, schema, and credit
  resources with a content-hash manifest and post-package verification;
- local unsigned Linux x64 AppImage and Debian-package generation;
- deterministic SHA-256 release metadata that refuses unexpected artifacts and
  explicitly marks the manifest and artifacts unsigned and not release ready;
- bounded, allowlisted diagnostics persistence and a local export action that
  does not expose file contents or paths to the renderer;
- install, backup, update, rollback, uninstall, data-location, download, and
  platform-boundary documentation;
- a release-readiness checklist for the remaining operational commitments.

The package build no longer depends on a neighboring source checkout at
runtime: compiled desktop code stays in the application archive, while the
service and other runtime resources are staged outside it in a verified layout.
Mutable tools, caches, logs, credentials, and preferences remain under the
application-data directory.

## Evidence gathered locally

The Linux x64 AppImage and Debian targets were built locally. Their installed
resource tree matched the staged manifest, and generated checksum metadata was
verified against the artifacts. The Debian control metadata was inspected for
package name, version, architecture, maintainer, homepage, and license. The
Electron security smoke test passed in a graphical Linux environment.

This evidence is development evidence, not a supported-platform qualification.
It does not cover a fresh target machine, confinement variants, upgrades,
rollback, uninstall, macOS, or Windows.

## Intentionally deferred

CI remains removed per current project direction, so this phase documents local
commands instead of adding a workflow. Automatic updates also remain out of
scope.

The following acceptance conditions from the source plan are not fulfilled:

- a named release, certificate, vulnerability-response, and supported-version
  owner;
- Apple Developer ID signing, notarization, and stapling;
- HSM-backed Windows Authenticode signing;
- signed release-manifest key custody and hosted release publication;
- macOS, Windows, and Linux installed-artifact validation on target machines;
- fresh-machine, upgrade, rollback, and uninstall project-preservation tests;
- an SBOM and cleared font, conda-package, and codec redistribution terms;
- a product application icon.

Accordingly, the artifacts produced here must remain internal and unsigned.
Local package generation is groundwork for a future owned release process; it
is not acceptance of the proposed signed-release plan. See the
[desktop guide](../desktop-application.md) and
[release-readiness checklist](../release/desktop-release-readiness.md).
