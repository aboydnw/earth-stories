# Desktop application

Earth Stories now has local packaging groundwork, but it does not yet have a
supported public desktop release. The generated artifacts are unsigned and are
for internal evaluation only. Do not ask pilot authors to bypass operating
system security warnings.

## Platform status

| Platform                        | Current status                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux x64                       | Provisional AppImage and Debian package targets. Both can be built locally, but neither has completed target-machine, upgrade, uninstall, confinement, or fresh-machine validation. |
| macOS arm64 and x64             | Packaging is configured, but Developer ID signing, notarization, installation, quarantine, conversion, upgrade, and uninstall validation remain release gates.                      |
| Windows x64                     | Packaging is configured, but HSM-backed Authenticode signing, SmartScreen expectations, installation, conversion, upgrade, and uninstall validation remain release gates.           |
| Windows ARM and other platforms | Not targeted.                                                                                                                                                                       |

Source development remains available on macOS, Linux, and Windows x64 with the
prerequisites in the repository README. That is separate from support for an
installed desktop application.

## Files on your computer

The default workspace is an `Earth Stories` folder in the operating system's
Documents folder. Authors can choose another workspace. A workspace contains
ordinary project folders and should be the primary backup target.

Electron chooses the application-data root. These are its conventional default
locations; an operating system policy or environment setting can relocate
them.

| Data                   | macOS                                          | Windows                                  | Linux                                                            |
| ---------------------- | ---------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Projects               | `~/Documents/Earth Stories/`                   | `%USERPROFILE%\Documents\Earth Stories\` | `~/Documents/Earth Stories/`                                     |
| Application data       | `~/Library/Application Support/Earth Stories/` | `%APPDATA%\Earth Stories\`               | `$XDG_CONFIG_HOME/Earth Stories/`, or `~/.config/Earth Stories/` |
| Tools and environments | `<application data>/tools/`                    | `<application data>\tools\`              | `<application data>/tools/`                                      |
| Pixi package cache     | `<application data>/tools/pixi-cache/`         | `<application data>\tools\pixi-cache\`   | `<application data>/tools/pixi-cache/`                           |
| Logs and diagnostics   | `<application data>/logs/`                     | `<application data>\logs\`               | `<application data>/logs/`                                       |
| Stored credential      | `<application data>/credentials.json`          | `<application data>\credentials.json`    | `<application data>/credentials.json`                            |

The application-data root also contains the selected-workspace pointer and
window preferences. Stored credentials use the operating system protection
available through Electron when supported. Diagnostics are bounded and contain
allowlisted codes and coarse state, not story content, paths, URLs, or tokens.

## First-use downloads

The installer contains the editor, viewer, local service, conversion worker,
and pinned environment definitions. It does not contain every geospatial tool.
When an author approves a conversion capability for the first time, Earth
Stories downloads Pixi if needed and provisions the pinned environment. Later
jobs reuse the tools and package cache.

The interface discloses these approximate apparent installed footprints before
provisioning:

| Capability                   | Approximate disk footprint |
| ---------------------------- | -------------------------: |
| Core data inspection         |                     322 MB |
| Vector preparation           |                     430 MB |
| Raster preparation           |                     669 MB |
| Multidimensional preparation |                     410 MB |
| Point-cloud preparation      |                     310 MB |

These are disk-footprint estimates, not download-size promises. Network
transfer, temporary space, shared cache use, and the final installed size vary
by platform and package availability. Tool redistribution clearance is still a
release gate, so the pilot currently provisions tools from their package
sources rather than claiming they are bundled.

Connected data sources, remote basemaps, GitHub publishing, and first-time tool
provisioning require network access. Editing already-local content and building
a publication can work without those services, but a complete offline workflow
has not been validated or promised.

Prefer a local filesystem for the workspace. Cloud-synchronized folders,
network shares, removable drives, and filesystems with unusual locking or
rename behavior have not been qualified. If evaluating one, keep a separate
backup and avoid editing the same project on multiple computers at once.

## Install and evaluate

There is no supported public installer yet. Internal evaluators should obtain
an artifact and its checksum material from the same controlled release handoff.
The current release manifest is explicitly unsigned and marked not release
ready, so its checksum can detect accidental or local corruption but does not
prove who published the file.

The provisional Linux outputs are a versioned x64 AppImage and Debian package.
Executable-mount, FUSE, sandbox, and confinement behavior must be recorded on
the target machines before either becomes the primary Linux format. macOS and
Windows artifacts must not be distributed before their signing and platform
validation gates are complete.

## Back up projects

1. Finish or cancel active conversions and publication builds.
2. Close Earth Stories so no save is in progress.
3. Copy the entire selected workspace, or the individual project folders, to a
   separate destination.
4. Keep each project's hidden `.earth-stories/` directory; it contains local
   recovery material.
5. Confirm the copy can be read before changing or removing an installation.

Tool caches and application settings can be recreated and are not a substitute
for the project backup. Copy application data separately only if the evaluation
requires preserving those local settings.

## Manual update and rollback

Automatic updates are deliberately absent. Earth Stories does not silently
download or install a new version. If a **Check for updates** action is added,
it will only open the project's release page until hosted updates, rollback,
and privacy behavior have explicit owners.

For an internal manual update:

1. Back up the workspace and retain the current installer or portable artifact.
2. Close Earth Stories.
3. Verify the new artifact using the checksum material supplied with it.
4. Install or replace the application without deleting the workspace or
   application-data folders.
5. Open a copy of a representative project and verify save, preview,
   conversion, publication, restart, and reopen behavior.

Cross-version upgrade and project-format compatibility have not yet completed
the release matrix. To roll back, close the application, reinstall or restore
the retained earlier artifact, and open a copied project first. If an updated
project no longer behaves correctly, restore its pre-update backup rather than
trying to edit its files by hand.

## Uninstall

Uninstalling the application must not remove an author's workspace, but this
property still needs installer-level validation on every target platform.
Until then, back up projects before uninstalling.

- For a provisional AppImage, close Earth Stories and remove only the AppImage
  file.
- For a provisional Debian package, remove the `earth-stories` package without
  purging user configuration.
- Do not delete the selected workspace when removing application files.
- Tools, caches, logs, settings, and the stored credential live under the
  separate application-data root and may remain after uninstall. Remove that
  root only as a deliberate cleanup after backing up projects and deciding that
  the stored credential and diagnostics are no longer needed.

A supported release still needs a platform-appropriate, explicit way to clear
retained credentials and caches. Project preservation must be verified by
comparing the workspace before and after upgrade and uninstall.
