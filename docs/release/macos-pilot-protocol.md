# macOS desktop pilot protocol

Run this protocol separately on arm64 and x64. Use a fresh macOS account or
machine without Node.js, Yarn, Git, GDAL, or PDAL. Copy the evidence example,
replace every example value, and retain the named attachments beside it.

## Before testing

1. Record the artifact filename, version, commit, and SHA-256. Reject a hash
   mismatch.
2. Preserve the installer used for rollback.
3. Back up the test workspace and compute a deterministic SHA-256 inventory of
   every relative path and file.
4. Attach the automated packaged-app and hosted-publication evidence files.

## Platform trust

Run `codesign --verify --deep --strict --verbose=2 <app>` and attach its output.
Run `spctl --assess --type execute --verbose=4 <app>` and
`xcrun stapler validate <app>` and attach their output. Download the artifact
through a browser so quarantine is present, then record the first launch. A
signed candidate must open without instructions to bypass Gatekeeper.

Any signature, notarization, stapling, or unexpected security warning failure
blocks distribution.

## Authoring journey

1. Install and launch Earth Stories. Confirm no developer-tool prompt appears.
2. Choose a visible local workspace and record its location without including
   a personal home-directory path in shared evidence.
3. Create a story. Import local GeoJSON and GeoTIFF files plus a GeoJSON or
   GeoPackage exported from QGIS. Confirm the application does not upload the
   working files.
4. If a conversion tool is needed, verify the download and disk disclosure is
   shown before provisioning. Record cancel and retry behavior.
5. Save, close, restart, and reopen the story. Confirm chapters, source
   metadata, styling, and publication settings persist.
6. Build a publication with a canonical HTTPS URL. Confirm the privacy summary
   correctly lists included copies, connected URLs, and GeoLibre access.
7. Deploy the complete folder, open the story, and follow **Open in GeoLibre**.
   Confirm the expected layers appear and the unsupported layer is named in the
   publication report.
8. Disconnect networking. Record which already-local editing and publication
   actions work and which connected data, basemaps, GeoLibre, or first-time tool
   actions fail with an honest explanation.

Failures that lose work, expose a private path, publish an undeclared asset, or
misstate the offline boundary block distribution.

## Accessibility

Complete first run, workspace choice, publication review, and native dialogs
with the keyboard. Confirm focus is visible, Escape behavior is predictable,
labels are announced, and reduced-motion preferences are respected. Attach a
short result note and screenshots for any defect.

## Upgrade, rollback, and uninstall

1. Compute the workspace inventory before upgrading.
2. Install the next candidate over the existing version. Reopen, edit, publish,
   restart, and recompute the inventory. Expected application-created changes
   must be explained; unrelated project bytes must match.
3. Reinstall the retained prior artifact and open a copied project first.
   Record any schema or behavior incompatibility.
4. Uninstall Earth Stories without deleting its workspace. Recompute the
   workspace inventory and require it to match the post-upgrade inventory.
5. Record retained application data, tools, caches, and credentials separately;
   removing them must be an explicit cleanup action.

Any unexplained workspace change or uninstall data loss blocks distribution.

## Result disposition

Set each manual row to `passed`, `failed`, or `not-applicable`, attach at least
one evidence reference, and explain every non-pass. A release owner reviews the
record; completing this document does not itself authorize public release.
