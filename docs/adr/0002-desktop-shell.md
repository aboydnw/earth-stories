# ADR 0002: Desktop shell and packaged conversion runtime

- Status: Provisional — gates open
- Date: 2026-08-11

## Context

Earth Stories needs a desktop shell that can start the local service and run the
pinned Pixi/conda-forge conversion runtime from an installed application. The
packaged application resources must remain immutable, while Pixi's manifest,
lock, environments, and caches live in a writable per-user location.

The desktop packaging spike must answer this on Linux x64, Windows x64, and
macOS, including a notarized hardened-runtime macOS build. It must also measure
the service bundle, installer, runtime behavior, and redistribution licenses.
Only the executable Linux x64 Pixi-layout probe has been completed so far. The
full command transcript and output are in the
[Linux Pixi evidence report](../../.superpowers/sdd/desktop-00-packaging-spike/task-1-report.md).

## Evidence collected

On 2026-08-11, an 8-vCPU AMD EPYC-Rome Linux x64 VM provisioned fresh, isolated
Pixi caches from the committed lock with Pixi 0.76.1. The packaged
`resources/conversion` directory had mode `0555`, its manifest and lock had mode
`0444`, and their digests and directory contents were unchanged after
provisioning and conversion.

| Environment | Provisioning wall time | Environment apparent size | Measured disk use | Existing download estimate |
| ----------- | ---------------------: | ------------------------: | ----------------: | -------------------------: |
| `core`      |                 1.40 s |             240,122,747 B | 245 MiB (rounded) |               45,000,000 B |
| `raster`    |                 1.81 s |             517,467,894 B |     548,515,840 B |              360,000,000 B |

The apparent environment sizes are respectively 5.34× and 1.44× the current
`CAPABILITY_DOWNLOAD_ESTIMATES`. This is not a direct network-byte comparison:
Pixi removed its downloaded archives, and the measurements include extracted
environment files. The unexpectedly short cold-cache times may also reflect an
unobserved upstream or host cache, so they must not be presented as typical
end-user download times. See the report's
[measurement details](../../.superpowers/sdd/desktop-00-packaging-spike/task-1-report.md#measurements-and-estimate-comparison).

The lock digest selected the writable directory
`tools/0.1.0-f722ba4a...f703b2/`. The copied manifest and lock matched their
read-only masters before use. Replacing the manifest copy produced a different
digest; recopying both masters restored byte equality. A locked `core` run
imported Python 3.12.13 and Pydantic 2.13.4. The repository worker then converted
a generated 622-byte GeoTIFF to a 1,304-byte cloud-optimized GeoTIFF using
rio-cogeo 5.4.2, and an independent validation passed.

Pixi 0.76.1 did not obtain a writable cache from `PIXI_HOME` alone in this
sandbox. Setting `PIXI_CACHE_DIR` explicitly beneath the same scratch tools tree
was also required. The future desktop runtime must redirect and test both
locations rather than assuming `PIXI_HOME` contains every write.

## Provisional decision

Keep the desktop-shell decision open. The Linux evidence supports continuing
with the copied-manifest Pixi design: exact-version, checksum-verified Pixi can
install locked environments and run the real conversion worker without
modifying packaged resources. It does not decide Electron versus Tauri and does
not satisfy the desktop spike's acceptance criteria.

Any implementation that advances from this spike must copy and digest-verify
both `pixi.toml` and `pixi.lock`, restore mismatched copies before execution, use
`--manifest-path` and `--locked`, and explicitly place Pixi home and cache data
under the per-user tools directory.

## Gates still open

- A notarized, hardened-runtime macOS build has not been tested. Entitlements,
  quarantine behavior, code-signature integrity, and execution of downloaded
  conda binaries remain unknown.
- macOS arm64, macOS x64, and Windows x64 packaged-layout provisioning and
  conversion have not been tested.
- Windows signing and macOS notarization have not been tested or evidenced.
- Service bundling inside the candidate desktop shell, installer size, cold
  start, idle memory, shutdown cleanup, and viewer performance remain unmeasured.
- The redistribution-license inventory remains incomplete.
- The current capability disclosure numbers need either a clearly named network
  download measurement or revised semantics; extracted environment size is
  materially larger, especially for `core`.

## Consequences

No shell technology is accepted by this ADR yet, and no later desktop plan may
claim the packaging spike passed on the strength of the Linux probe alone. The
probe provides a reproducible Linux baseline and exposes an additional cache
redirection requirement. This ADR should be completed or superseded only after
the remaining platform, signing, bundling, measurement, and license gates have
evidence.
