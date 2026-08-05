# Feature-parity wave

Earth Stories now carries the next seven CNG storytelling capabilities into
the independent local-first architecture: ordered overlays, video, richer CSV
charts, globe/terrain/buildings/flyovers, trajectory controls, temporal Zarr,
and COPC point-cloud streaming. The schema, compiler, shared preview/runtime,
portable publisher, preflight, editor, and example catalog evolve together so
published output does not diverge from authoring preview.

Zarr is deliberately connected-only because a store is a directory of many
objects; Earth Stories does not yet have a safe packaging contract for it.
Single-file COPC and trajectory sidecars can be included. Heavy optional map
renderers are loaded only for chapters that use them.

The catalog adds public examples for overlays, rich media, Fields of The World,
and Autzen Stadium. Automated browser testing remains deferred as agreed; the
existing schema, compiler, publisher, service, and production-build checks
remain the release gate.
