# Prepare a signed macOS candidate

Earth Stories already has an Electron desktop application and arm64/x64 DMG and
ZIP packaging. The configured `mac.executableName` produces `earth-stories.app` in
`build/artifacts/mac-arm64/` and `build/artifacts/mac/`. This procedure advances
those existing targets to a verifiable
Developer ID candidate. It does not authorize distribution or satisfy the legal,
clean-machine, conversion, upgrade, rollback, and ownership gates in
[release readiness](desktop-release-readiness.md).

## Account and signing inputs

Apple Developer membership and Xcode are prerequisites, not evidence that a
Developer ID Application identity or notarization credential exists. A release
owner must separately authorize credential creation, export, and CI storage.
Do not commit a certificate, its password, an Apple account password, or an
app-specific password; do not paste them into issue or build logs.

The current signed command deliberately supports the existing CI credential
route only:

| Local environment variable    | Existing GitHub Actions secret  |
| ----------------------------- | ------------------------------- |
| `CSC_LINK`                    | `DESKTOP_MAC_CSC_LINK`          |
| `CSC_KEY_PASSWORD`            | `DESKTOP_MAC_CSC_KEY_PASSWORD`  |
| `APPLE_ID`                    | `DESKTOP_APPLE_ID`              |
| `APPLE_APP_SPECIFIC_PASSWORD` | `DESKTOP_APP_SPECIFIC_PASSWORD` |
| `APPLE_TEAM_ID`               | `DESKTOP_APPLE_TEAM_ID`         |

`CSC_LINK` supplies an authorized Developer ID Application certificate with its
private key through electron-builder's supported certificate import flow. It
must not be an Apple Development, Mac App Store, or ad-hoc identity. Use the
same expected team for signing and notarization. Protect credential access from
untrusted code. This command does not create or configure any credential.
Alternative keychain/API-key flows need an explicit, tested extension to the
preflight rather than bypassing it.

## Local preflight and packaging

Use Node 22+ and the repository-pinned Yarn 4.13.0. On a Mac with Xcode installed
but Command Line Tools selected, set `DEVELOPER_DIR` for this shell or command;
there is no need to change the system-wide selection:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -version
xcrun --find notarytool
xcrun --find stapler
yarn install --immutable
yarn workspace @earth-stories/desktop smoke:electron:mac
yarn workspace @earth-stories/desktop release:mac:preflight
```

The native smoke command checks the real Electron renderer/preload boundary with
the sandbox enabled. It is separate from an installed-app journey.

The preflight checks macOS, presence of every configured signing input, the
team-ID shape, and that identity discovery has not been disabled. It reports
variable names, never their values. Passing this step does not verify the
certificate, account, password, or Apple authorization.

Once the release owner has authorized use of the provisioned signing inputs:

```bash
yarn workspace @earth-stories/desktop package:mac:signed
```

This runs the preflight before building, requires electron-builder code signing
with `forceCodeSigning`, and uses its configured Apple environment variables for
notarization. It then checks **both unpacked application bundles**:

- `codesign --verify --deep --strict` must succeed.
- The displayed signature must identify `org.earthstories.desktop`, the expected
  Apple team, a Developer ID Application authority, and hardened runtime.
- `lipo -archs` must match the arm64 or x64 target.
- Gatekeeper execution assessment and `xcrun stapler validate` must succeed.

Any missing input or failed check exits nonzero. Both signed and unsigned
macOS packaging commands invalidate the previous trust report before starting,
including when preflight or the build subsequently fails. A successful check writes
`apps/desktop/build/artifacts/evidence/macos-trust-evidence.v1.json`, recording each
bundle's CodeDirectory hash and the exact scope. The report remains
`releaseReady: false`. Re-run the check without packaging with:

```bash
yarn workspace @earth-stories/desktop release:mac:verify
```

That check needs macOS and the expected `APPLE_TEAM_ID`, but not the certificate
or Apple password. It removes its previous evidence file before validating inputs or inspecting
the candidate, so a failing check does not retain a previous passing report.

The existing Desktop artifacts workflow uses the same signed command. Missing
repository secrets now block the macOS job instead of silently producing an
unsigned substitute. It still does not publish a GitHub release. The explicit
`package:mac` command remains available for **unsigned internal engineering
builds**, with certificate discovery disabled; it does not run or pass these
trust checks.

## Validate the exact distribution files

The automated report covers unpacked `.app` bundles, not the contents of the
DMG or ZIP, nor a browser download. Do not treat it as installer verification.
Preserve and hash the exact candidate files. On each target architecture:

1. Independently extract the candidate ZIP and mount the candidate DMG read-only.
   Run the same signature, expected-identity, architecture, Gatekeeper, and
   stapled-ticket checks on each contained app. Retain results linked to the
   archive or disk-image SHA-256.
2. Check the DMG's signature, notarization, and stapled ticket where applicable.
3. Obtain the exact candidate through the intended download route. Verify its
   checksum and quarantine presence, then install and launch without disabling
   Gatekeeper or removing quarantine attributes.
4. Complete the [macOS pilot protocol](macos-pilot-protocol.md), especially the
   signed hardened-runtime Pixi/conda conversion probe, local data preservation,
   restart, accessibility, upgrade, rollback, and uninstall tests.
5. Obtain the release owner's explicit review and disposition of all remaining
   gates, including the GEOS LGPL question and third-party redistribution review.

The general release metadata command still reports unsigned/not-release-ready
metadata. The new bundle evidence is separate; it does not create a signed
release manifest, change the release version, or permit public distribution.

## Checksum inventory

The existing `release:metadata` and `release:verify` commands accept the actual
builder output directory. Installer/archive blockmaps are included in the
manifest and checksums only when their matching, same-version artifact exists;
orphan, empty, unsupported, and malformed sidecars fail closed. Tampering with a
blockmap fails verification just like tampering with an installer. This does not
enable automatic updates.

Trust-check reports live under `build/artifacts/evidence/`, separate from the
release metadata's top-level installer/archive inventory. Keep that evidence
with the reviewed candidate, but do not mistake it for an authenticated release
manifest or a checksum of the installer contents.

```bash
yarn workspace @earth-stories/desktop release:metadata --artifacts build/artifacts --version 0.1.0-pilot.1 --notices build/resources/credits/THIRD_PARTY_NOTICES.md
yarn workspace @earth-stories/desktop release:verify --artifacts build/artifacts --version 0.1.0-pilot.1 --notices build/resources/credits/THIRD_PARTY_NOTICES.md
```
