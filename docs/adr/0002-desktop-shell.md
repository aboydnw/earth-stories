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
durable evidence needed to interpret that probe is retained below; temporary
spike files and raw logs are not dependencies of this ADR.

## Provisional decision

Keep the desktop-shell decision open. The Linux evidence supports continuing
with the copied-manifest Pixi design: exact-version, checksum-verified Pixi can
install locked environments and run the real conversion worker without observed
modification of the modeled packaged resources. It does not decide Electron
versus Tauri and does not satisfy the desktop spike's acceptance criteria.

Any implementation that advances from this spike must copy and digest-verify
both `pixi.toml` and `pixi.lock`, restore mismatched copies before execution, use
`--manifest-path` and `--locked`, and explicitly place Pixi home and cache data
under the per-user tools directory.

## Linux evidence appendix

### Host, bootstrap, and layout

The probe ran on 2026-08-11 UTC on Linux x86_64, kernel
`6.8.0-136-generic`, in a KVM VM with 8 AMD EPYC-Rome vCPUs and 15 GiB RAM.
Repository `scripts/install-pixi.mjs` installed Pixi 0.76.1 after verifying the
Linux x64 release archive against SHA-256
`8e2ab7630f5bc1e8aa38d236842e20f565f7aa0834687e53670b7c86ba54c90f`.
The installed binary reported `pixi 0.76.1` and had SHA-256
`d14b161c84692dd201848754b4adac5a6f2c8d873e5d7626070f6e8c5176133d`.
The bootstrap pattern was:

```sh
node scripts/install-pixi.mjs ./scratch-userData/tools/pixi-0.76.1
./scratch-userData/tools/pixi-0.76.1 --version
```

The packaged model used `0555` on `packaged-app`, `resources`, and
`resources/conversion`, and `0444` on the two master files. Their SHA-256 values
were:

```text
6041f95c2b745d520d9ee0015cf6f71114013d78a2ebc3a198ba3b1d712a92c7  pixi.toml
f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2  pixi.lock
```

The full lock digest selected the writable copy directory
`scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/`.
The copied files were `0644`; the writable copy directory was observed as
`0700` after the run. Digest and byte checks used:

```sh
sha256sum packaged-app/resources/conversion/{pixi.toml,pixi.lock}
sha256sum scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/{pixi.toml,pixi.lock}
cmp packaged-app/resources/conversion/pixi.toml scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/pixi.toml
cmp packaged-app/resources/conversion/pixi.lock scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/pixi.lock
```

Replacing the copied manifest with `/bin/true` changed its digest to
`4b5a5694e3c0e8b1d58fc52ac6ef076e55e72c2f53195243ac86d5ff517cc2f6`;
`cmp` exited 1. Recopying both masters restored the expected digests, and both
`cmp` checks returned 0 before use. The same master digests, modes, sizes, and
file set were observed after provisioning and conversion. A final search found
no `.pixi`, temporary lock variant, or temporary file under the packaged
resource directory.

This was a permission-bit model, not a kernel-enforced read-only mount. An
owning process could change `0555`/`0444` with `chmod`. The observed non-mutation
therefore shows Pixi did not write to the packaged directory during this probe;
it does not prove the resource directory was protected from a determined or
faulty owning process.

### Provisioning command patterns

The following patterns preserve the flags and environment differences used in
the probe; paths are shown relative to the temporary spike root:

```sh
PIXI=./scratch-userData/tools/pixi-0.76.1
MANIFEST=./scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/pixi.toml

env PIXI_HOME=./scratch-userData/tools/pixi-home \
  /usr/bin/time -f 'CORE wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" install --manifest-path "$MANIFEST" --locked -e core

env PIXI_HOME=./scratch-userData/tools/pixi-home \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache \
  /usr/bin/time -f 'CORE wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" install --manifest-path "$MANIFEST" --locked -e core

env PIXI_HOME=./scratch-userData/tools/pixi-home-raster \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache-raster \
  /usr/bin/time -f 'RASTER wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" install --manifest-path "$MANIFEST" --locked -e raster
```

In this sandbox, the first command failed at cache acquisition with `no writable
layers to cache package to`. Adding `PIXI_CACHE_DIR` beneath the same scratch
tools tree was the sole configuration change in the second pattern; it moved the
run past cache acquisition to package fetching. Restricted network access then
failed, and the identical command succeeded with approved network access. This
is sandbox-specific evidence, not a general claim that `PIXI_HOME` is ignored by
Pixi on every host.

The successful core install reported 1.40 s wall time, 1.80 s user time, 1.31 s
system time, and 153,508 KiB maximum RSS. Raster used a distinct, initially
absent cache so it did not reuse the measured core cache; it reported 1.81 s
wall time, 3.31 s user time, 2.31 s system time, and 239,412 KiB maximum RSS.

### Size measurement semantics and results

GNU `du -sb ENV CACHE` measured apparent file bytes. `du -sh ENV CACHE` measured
allocated blocks but rounded the display to human-readable units. GNU
`du -sB1 ENV CACHE` measured allocated blocks in one-byte output units. Core's
immediate post-install snapshot used the first two forms; an exact allocated
snapshot was taken only after the import smoke. Raster's immediate post-install
snapshot used `du -sb` and `du -sB1` before fixture generation or conversion.

| Capability and measurement point    | Environment apparent bytes |          Environment allocated | Cache apparent bytes |                Cache allocated |
| ----------------------------------- | -------------------------: | -----------------------------: | -------------------: | -----------------------------: |
| `core`, immediately after install   |                240,122,747 |   245 MiB, rounded by `du -sh` |           81,689,281 |    83 MiB, rounded by `du -sh` |
| `core`, after import smoke          |                240,424,464 | 256,417,792 B, exact `du -sB1` |           81,995,167 |  87,101,440 B, exact `du -sB1` |
| `raster`, immediately after install |                517,467,894 | 548,515,840 B, exact `du -sB1` |          151,494,617 | 167,133,184 B, exact `du -sB1` |

The repository's `CAPABILITY_DOWNLOAD_ESTIMATES` were 45,000,000 B for `core`
and 360,000,000 B for `raster`. Comparing those download-named estimates to the
immediate apparent environment sizes gives 5.34× for core and 1.44× for raster.
That is deliberately not an apples-to-apples transfer comparison: Pixi removed
download archives, network bytes were not captured, and extracted environment
and cache footprints have different semantics. The result supports correcting
installed-disk disclosure, but does not by itself disprove the network-download
estimates.

The unusually short timings must not be generalized to end users. The measured
cache directories were initially absent, but an upstream proxy, VM-image cache,
host filesystem cache, or page cache was not observable or controlled.

### Execution evidence

The locked core smoke used the same manifest and cache variables:

```sh
env PIXI_HOME=./scratch-userData/tools/pixi-home \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache \
  "$PIXI" run --manifest-path "$MANIFEST" --locked -e core \
  python -c 'import json,platform,pydantic; print(json.dumps({"python":platform.python_version(),"pydantic":pydantic.__version__},sort_keys=True))'
```

It returned Python 3.12.13 and Pydantic 2.13.4. In the raster environment, the
probe generated a 16×16, 622-byte GeoTIFF and ran the repository worker with a
`prepare` request and a scratch output path:

```sh
env PIXI_HOME=./scratch-userData/tools/pixi-home-raster \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache-raster \
  /usr/bin/time -f 'CONVERSION wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" run --manifest-path "$MANIFEST" --locked -e raster \
  python conversion/worker/worker.py

env PIXI_HOME=./scratch-userData/tools/pixi-home-raster \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache-raster \
  "$PIXI" run --manifest-path "$MANIFEST" --locked -e raster \
  rio cogeo validate ./output/tiny-output.cog.tif
```

The worker returned `status: succeeded`, rio-cogeo 5.4.2, no warnings, and a
1,304-byte output in 8.44 s wall time. The independent command reported
`tiny-output.cog.tif is a valid cloud optimized GeoTIFF`.

The worker source was executed from the repository rather than from a bundled
desktop resource. This proves the locked Linux raster toolchain and worker
pipeline, not service bundling or worker-resource packaging.

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
redirection requirement in the tested sandbox. This ADR should be completed or
superseded only after the remaining platform, signing, bundling, measurement,
and license gates have evidence.
