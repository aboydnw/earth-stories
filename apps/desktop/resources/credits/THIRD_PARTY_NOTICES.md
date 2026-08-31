# Third-party notices

Earth Stories includes Electron and its Chromium runtime. The packaged Electron
distribution carries its own `LICENSE` and `LICENSES.chromium.html` files; those
files remain the authoritative notice payload for that runtime.

Pixi and conda environments are downloaded only after the author approves a
capability installation. They are not redistributed in the installer. Their
license and redistribution review remains tracked in
`docs/adr/0002-desktop-shell.md` and must be completed before producing an
offline-tools installer.

Plus Jakarta Sans and DM Mono are the bundled typefaces, sourced from
`@fontsource-variable/plus-jakarta-sans` and `@fontsource/dm-mono`. Their web
font files are compiled into the editor and viewer bundles, so the installer
redistributes the font software itself. Both are licensed under the SIL Open
Font License 1.1, which permits that redistribution but requires the copyright
notice and license to travel with the fonts. Each license is therefore staged
alongside this file as `credits/PLUS_JAKARTA_SANS_LICENSE` and
`credits/DM_MONO_LICENSE`.

The bundled offline DuckDB runtime is a separate matter. Its spatial extension
carries GDAL and transitive native libraries, and
`apps/viewer/public/THIRD_PARTY_NOTICES.md` records that a component SBOM and
notice review are still required before public redistribution.
