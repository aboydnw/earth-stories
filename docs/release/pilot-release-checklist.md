# Pilot release checklist (unsigned macOS)

The sequence for cutting an unsigned macOS pilot and handing it to named
testers. This does **not** satisfy the
[desktop release readiness](desktop-release-readiness.md) publication gate; see
the pilot disposition section there for what is deliberately deferred.

Everything here runs on a Mac. electron-builder cannot produce macOS artifacts
on Linux, so the development VM cannot cut this release.

## 1. Build

From a clean checkout on the Mac:

```bash
corepack enable
yarn install
yarn typecheck && yarn test && yarn check:independence && yarn check:ui
yarn build
yarn workspace @earth-stories/desktop package:mac
yarn workspace @earth-stories/desktop verify:resources
```

`package:mac` builds arm64 and x64 into `apps/desktop/build/artifacts`. It sets
`CSC_IDENTITY_AUTO_DISCOVERY=false` so electron-builder does not reach into the
keychain and sign with an unrelated identity.

## 2. Record checksums and notices

```bash
yarn workspace @earth-stories/desktop release:metadata \
  --artifacts apps/desktop/build/artifacts \
  --version 0.1.0-pilot.1 \
  --notices apps/desktop/build/resources/credits/THIRD_PARTY_NOTICES.md

yarn workspace @earth-stories/desktop release:verify \
  --artifacts apps/desktop/build/artifacts \
  --version 0.1.0-pilot.1 \
  --notices apps/desktop/build/resources/credits/THIRD_PARTY_NOTICES.md
```

The generated manifest records `signed: false`, `manifestSigned: false`, and
`releaseReady: false`. Those values are correct for a pilot. Nothing in this
checklist should change them.

## 3. Install it yourself first

Mount the built `.dmg`, install it, and work through the exercise list in
[the tester guide](../pilot-macos.md) on your own machine. A pilot the author
has not installed from the distributed artifact is not a pilot — the build
directory works long before the shipped `.dmg` does.

Confirm specifically that:

- the Gatekeeper steps in the tester guide actually match what macOS does on
  your version, and
- the app icon appears in the dock and in the installer, rather than the
  default Electron logo.

If either is wrong, fix the guide before publishing, not after.

## 4. Settle what the artifact redistributes

The bundled fonts are clear: Plus Jakarta Sans and DM Mono are both SIL OFL
1.1, ship from npm packages carrying their license text, and are recorded in
the third-party notices.

What is **not** settled is the offline DuckDB runtime. It is roughly 120 MB of
the artifact, and its spatial extension bundles GDAL and transitive native
libraries. `apps/viewer/public/THIRD_PARTY_NOTICES.md` states plainly that a
component SBOM and notice review are required before public redistribution, and
warns against reading the extension's own MIT license as clearing everything
inside it.

A public pre-release redistributes that runtime to anyone who downloads it.
Before publishing publicly, either:

- complete the SBOM and notice review that file describes, or
- distribute the pilot privately instead, which keeps the review where it
  already is — a public-release gate rather than a pilot one.

Do not publish publicly while that notice still records the review as
outstanding.

## 5. Publish as a pre-release

```bash
gh release create v0.1.0-pilot.1 \
  --repo aboydnw/earth-stories \
  --prerelease \
  --title "Earth Stories 0.1.0-pilot.1 (unsigned macOS pilot)" \
  --notes-file docs/release/pilot-release-notes.md \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-mac-arm64.dmg \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-mac-x64.dmg \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-mac-arm64.zip \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-mac-x64.zip \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-SHA256SUMS.txt \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-release-manifest.json \
  apps/desktop/build/artifacts/earth-stories-0.1.0-pilot.1-THIRD_PARTY_NOTICES.md
```

The macOS target builds a `.dmg` and a `.zip` for each architecture, and the
metadata command records all four. Upload all four or the checksum file will
reference artifacts nobody can download. Testers want the `.dmg`; the `.zip`
exists so the manifest stays honest.

The repository is public, so the artifact is publicly downloadable even as a
pre-release. The release notes must therefore say plainly, above the fold, that
the build is unsigned and intended for named testers.

## 6. Withdrawal

Decided before publishing, not after something goes wrong:

```bash
gh release delete v0.1.0-pilot.1 --repo aboydnw/earth-stories --yes
git push --delete origin v0.1.0-pilot.1
```

Tell every tester directly when a build is withdrawn. There is no update
mechanism in the pilot, so a withdrawn build keeps running until each person
deletes it themselves.

## Regenerating the icon

The product mark is generated, not hand-drawn:

```bash
python3 apps/desktop/scripts/make-icon.py apps/desktop/build
```

It needs Python with Pillow. The output is committed, so this is only necessary
when the mark itself changes.
