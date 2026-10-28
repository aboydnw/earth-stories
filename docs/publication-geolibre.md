# GeoLibre publication handoff

Earth Stories can add an **Open in GeoLibre** action to a published story. The
action gives GeoLibre the public URL of `explore/story.geolibre.json`. It does
not upload an Earth Stories workspace or grant GeoLibre access to unpublished
local files.

## Hosting contract

Enter the final canonical HTTPS publication URL before building. Upload the
entire publication directory without changing its relative paths. The host
must allow cross-origin `GET` requests from readers and preserve byte-range
responses for PMTiles, COG, and GeoParquet resources. GitHub Pages satisfies
the static-file and cross-origin requirements.

Included layers are copied into the publication and receive publication URLs.
Connected layers remain at their authoritative public URLs; those hosts must
independently allow browser access. The publication report lists every layer
handed to GeoLibre and every referenced layer excluded with its reason.

Authors can disable the continuation in Release settings. Builds without a
canonical URL, a compatible layer, or author consent contain no GeoLibre
companion and make no GeoLibre promise.

## Repository production proof

The `GeoLibre production proof` workflow builds the canonical fixture on pull
requests. After merge, it deploys `production-proof/` through GitHub Pages and
probes the live manifest, companion, CORS behavior, range behavior, and launch
URL. The resulting JSON evidence is attached to the workflow run.

Repository administrators must select **GitHub Actions** as the Pages build and
deployment source before the first merge deployment.
