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

The bundled offline DuckDB runtime carries GDAL and its transitive native
libraries. Those are now inventoried component by component in
`docs/release/offline-runtime-sbom.md`, and every component's notice payload
ships beside the runtime in `viewer/credits/runtime/`.

One embedded component is not permissive: GEOS 3.13.0 is LGPL-2.1-only and is
statically linked into the spatial extension. Its full license text ships as
`viewer/credits/runtime/GEOS_LICENSE`. The remaining open item before public
release is the LGPL-2.1 analysis recorded in that SBOM, not the inventory
itself.
