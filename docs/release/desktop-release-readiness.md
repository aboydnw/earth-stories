# Desktop release readiness

The desktop package is not ready for public release. This checklist separates
working local packaging mechanics from the ownership, signing, validation, and
support commitments required by the desktop distribution plan.

## Pilot disposition (0.1.0-pilot.1)

An unsigned macOS pilot for named testers is being distributed ahead of these
gates. This section records that decision explicitly, as the publication gate
below requires. **Nothing here satisfies that gate.** It describes a pilot, and
a public release still needs every applicable checkbox owned and evidenced.

Deferred for the pilot:

- **Signing, notarization, Authenticode, and the signed release manifest.** The
  artifact is unsigned; testers bypass Gatekeeper by hand and are told exactly
  why in [the pilot guide](../pilot-macos.md). Blocking for public release.
- **SBOM, redistribution clearance, supported-version policy, vulnerability
  response owner, and the credential renewal calendar.** Not required to hand a
  build to a named tester who knows what they have. All blocking for public
  release.
- **The target-machine matrix**, reduced to the author's own Mac plus named
  testers reporting their macOS version and chip. Windows and Linux are out of
  scope for this pilot; their gates are untouched.
- **CI.** There is no protected release workflow, so the pilot is cut by hand
  from a clean checkout following
  [the pilot release checklist](pilot-release-checklist.md).

Accepted for the pilot:

- **The product icon** is a generated placeholder mark, not cleared artwork.
  It removes the default Electron logo, which is the pilot-relevant part.
  Cleared artwork remains required for public release.

Author obligations that are **not** deferred: installing the distributed `.dmg`
personally before publishing, publishing as a pre-release with the unsigned
warning above the fold, and having the withdrawal procedure written down first.

## Ownership and policy gates

- [ ] Name the release owner.
- [ ] Name the vulnerability-response owner and publish the reporting and
      escalation path.
- [ ] Define the supported-version policy, including how long an older desktop
      version receives fixes.
- [ ] Set a maximum lag behind Electron security releases and assign the person
      who monitors and applies them.
- [ ] Create a certificate and credential renewal calendar with backup owners.
- [ ] Choose the hosted release location and document publication, withdrawal,
      and rollback access.

## Signing and supply-chain gates

- [ ] Provision the Apple Developer ID identity, Apple account ownership,
      protected notarization credentials, notarization, and stapling.
- [ ] Choose and provision an HSM-backed Windows Authenticode signing service;
      keep its credentials unavailable to untrusted pull-request code.
- [ ] Create a signed release-manifest key, document key custody, rotation,
      revocation, and recovery, and keep the private key out of the repository.
- [ ] Generate and review an SBOM for the artifact that is actually shipped.
- [ ] Clear redistribution for the Satoshi font payload, Pixi/conda packages,
      native codecs, and any future bundled conversion executable. Update the
      third-party notices with the result.
- [ ] Replace the default Electron application icon with cleared product
      artwork in every required platform format.

The current metadata command deliberately records `manifestSigned: false`,
`releaseReady: false`, and `signed: false` for every artifact. There is no flag
that turns those values into a release claim.

## Target-machine validation gates

- [ ] macOS arm64: install from the distributed artifact, verify Developer ID,
      notarization, stapling, quarantine behavior, conversion, restart, upgrade,
      rollback, and uninstall with projects unchanged.
- [ ] macOS x64: run the same matrix on x64 hardware or an explicitly accepted
      representative environment.
- [ ] Windows x64: verify interactive installation, signing, SmartScreen
      expectations, conversion, restart, upgrade, rollback, and uninstall with
      projects unchanged.
- [ ] Linux x64: choose the primary portable and package targets using pilot
      evidence; test two distributions and record FUSE, executable-mount,
      sandbox, and confinement behavior.
- [ ] On every supported platform, run the installed application on a fresh
      machine without Node.js, Yarn, git, GDAL, or PDAL and exercise create,
      save, prepare, preview, publish, restart, and reopen.
- [ ] Verify the selected workspace is byte-identical after upgrade and
      uninstall on every supported platform.
- [ ] Complete keyboard and accessibility checks for first run and native file
      dialogs.
- [ ] Define the supported and unsupported behavior for synchronized folders,
      network shares, removable storage, and offline use.

## Local executable gates

No GitHub Actions workflow was added in this phase, per current project
direction. CI remains intentionally removed. Until an owned protected release
workflow exists, run these checks locally from a clean checkout and preserve
their logs with the internal release candidate:

```bash
yarn typecheck
yarn test
yarn check:independence
yarn check:ui
yarn build
yarn test:publishing:no-git
yarn workspace @earth-stories/desktop package:dir
yarn workspace @earth-stories/desktop verify:resources
yarn workspace @earth-stories/desktop smoke:electron
```

Build the provisional Linux artifacts, then create and verify their unsigned
metadata using an explicit version, artifact directory, and notices file:

```bash
yarn workspace @earth-stories/desktop package:linux
yarn workspace @earth-stories/desktop release:metadata --artifacts build/artifacts --version 0.1.0 --notices build/resources/credits/THIRD_PARTY_NOTICES.md
yarn workspace @earth-stories/desktop release:verify --artifacts build/artifacts --version 0.1.0 --notices build/resources/credits/THIRD_PARTY_NOTICES.md
```

The Electron smoke check needs a graphical environment; the repository command
uses Xvfb on Linux. Resource and checksum verification prove that local outputs
match the staged inputs. They do not replace signing, notarization,
target-machine installation, credential isolation in a protected workflow, or
release ownership.

## Publication gate

Do not publish a desktop release until every applicable checkbox above has an
owner, evidence, and an explicit disposition. Publish the versioned installers,
release notes, checksums, third-party notices, SBOM, and signed manifest
together. Record the rollback artifact and withdrawal procedure before making
the release visible to pilot authors.
