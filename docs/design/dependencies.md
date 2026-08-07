# Local and network dependency policy

## Must be bundled

- Product and default reader fonts: Satoshi Variable and DM Mono
- Earth Stories UI, viewer runtime, icons, and publication shell
- Included project assets and generated archival fallbacks

The editor and an exported publication shell must render predictably without
Fontshare, Google Fonts, or another font CDN.

## May require networking

- Sources explicitly stored as `connected`
- Remote XYZ/Zarr/COG/PMTiles/GeoParquet/COPC/trajectory data
- Remote basemap styles, tiles, glyphs, and sprites
- Video providers and a deployed URL used by embed code

The product labels these dependencies before publishing. The connected profile
keeps them remote. Portable/custom profiles include compatible assets according
to policy but do not promise that every external basemap or provider is offline.

## Testable policy

`yarn check:ui` rejects external font imports. Publication preflight reports
connected assets and networking requirements. Storybook fixtures do not require
the local service, a live map, or external data.
