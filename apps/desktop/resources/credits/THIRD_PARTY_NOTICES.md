# Third-party notices

Earth Stories includes Electron and its Chromium runtime. The packaged Electron
distribution carries its own `LICENSE` and `LICENSES.chromium.html` files; those
files remain the authoritative notice payload for that runtime.

Pixi and conda environments are downloaded only after the author approves a
capability installation. They are not redistributed in the installer. Their
license and redistribution review remains tracked in
`docs/adr/0002-desktop-shell.md` and must be completed before producing an
offline-tools installer.

Plus Jakarta Sans and DM Mono are the bundled typefaces. Both are licensed
under the SIL Open Font License 1.1, which permits redistribution inside an
application, and both ship from npm packages that carry their license text
(`@fontsource-variable/plus-jakarta-sans`, `@fontsource/dm-mono`). The font
redistribution question is resolved.

The bundled offline DuckDB runtime is a separate matter. Its spatial extension
carries GDAL and transitive native libraries, and
`apps/viewer/public/THIRD_PARTY_NOTICES.md` records that a component SBOM and
notice review are still required before public redistribution.
