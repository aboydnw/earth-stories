import type {
  PublicationAsset,
  PublicationManifest,
} from "@earth-stories/story-schema";

export type GeoLibreExclusionReason =
  "unsupported-format" | "unused-layer" | "unsafe-url";

export interface GeoLibreCompanionResult {
  project: Record<string, unknown> | null;
  launchHref: string | null;
  includedAssetIds: string[];
  excluded: Array<{
    assetId: string;
    reason: GeoLibreExclusionReason;
  }>;
}

const supportedKinds = new Set<PublicationAsset["kind"]>([
  "geojson",
  "pmtiles",
  "cog",
  "geoparquet",
  "xyz",
]);

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  )
    return true;
  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\./u);
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function safePublicUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !isPrivateHostname(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function assetUrl(asset: PublicationAsset, publicationUrl: URL): string | null {
  if (asset.delivery === "included")
    return new URL(asset.href, publicationUrl).href;
  return safePublicUrl(asset.href)?.href ?? null;
}

function usedAssetIds(manifest: PublicationManifest): string[] {
  const ids: string[] = [];
  for (const chapter of manifest.chapters) {
    if ("assetId" in chapter && chapter.assetId) ids.push(chapter.assetId);
    if ("overlayAssetIds" in chapter) ids.push(...chapter.overlayAssetIds);
  }
  return [...new Set(ids)];
}

function descriptiveMetadata(asset: PublicationAsset) {
  const lineage = asset.provenance.transformations.join("; ");
  return {
    ...(asset.provenance.publisher
      ? { contact: { organization: asset.provenance.publisher } }
      : {}),
    ...(asset.provenance.licenseName
      ? { license: asset.provenance.licenseName }
      : {}),
    ...(asset.attribution ? { attribution: asset.attribution } : {}),
    ...(lineage ? { lineage } : {}),
    ...(asset.provenance.sourceUrl
      ? {
          links: [
            {
              href: asset.provenance.sourceUrl,
              rel: "source",
              title: "Original source",
            },
          ],
        }
      : {}),
  };
}

export function buildGeoLibreCompanion(options: {
  manifest: PublicationManifest;
  publicationUrl: string;
}): GeoLibreCompanionResult {
  const publicationUrl = safePublicUrl(options.publicationUrl);
  if (!publicationUrl)
    return {
      project: null,
      launchHref: null,
      includedAssetIds: [],
      excluded: options.manifest.assets.map(({ id }) => ({
        assetId: id,
        reason: "unsafe-url" as const,
      })),
    };

  const assets = new Map(
    options.manifest.assets.map((asset) => [asset.id, asset]),
  );
  const includedAssetIds: string[] = [];
  const excluded: GeoLibreCompanionResult["excluded"] = [];
  const layers: Array<Record<string, unknown>> = [];
  for (const id of usedAssetIds(options.manifest)) {
    const asset = assets.get(id);
    if (!asset) continue;
    if (!supportedKinds.has(asset.kind)) {
      excluded.push({ assetId: id, reason: "unsupported-format" });
      continue;
    }
    const url = assetUrl(asset, publicationUrl);
    if (!url) {
      excluded.push({ assetId: id, reason: "unsafe-url" });
      continue;
    }
    includedAssetIds.push(id);
    layers.push({
      id: asset.id,
      name: asset.label,
      type: asset.kind,
      source: {
        type: asset.kind,
        url,
        ...(asset.presentation.sourceLayer
          ? { sourceLayer: asset.presentation.sourceLayer }
          : {}),
      },
      visible: true,
      opacity: asset.presentation.opacity,
      style: {
        fillColor: asset.presentation.color,
        strokeColor: asset.presentation.strokeColor,
        circleRadius: asset.presentation.radius,
        fillOpacity: asset.presentation.opacity,
      },
      descriptiveMetadata: descriptiveMetadata(asset),
      capabilities: {
        query: true,
        create: false,
        update: false,
        delete: false,
        export: true,
      },
      metadata: {
        earthStoriesAssetId: asset.id,
        delivery: asset.delivery,
      },
    });
  }

  if (!layers.length)
    return { project: null, launchHref: null, includedAssetIds, excluded };

  const firstMap = options.manifest.chapters.find(
    (chapter) =>
      chapter.type === "map" ||
      chapter.type === "scrolly" ||
      chapter.type === "flyover",
  );
  const camera =
    firstMap?.type === "flyover"
      ? firstMap.keyframes[0]
      : firstMap && "camera" in firstMap
        ? firstMap.camera
        : null;
  const projectUrl = new URL("explore/story.geolibre.json", publicationUrl);
  const project = {
    version: "0.2.0",
    name: options.manifest.metadata.title,
    mapView: {
      center: camera?.center ?? [0, 20],
      zoom: camera?.zoom ?? 1.5,
      bearing: camera?.bearing ?? 0,
      pitch: camera?.pitch ?? 0,
    },
    basemapStyleUrl:
      options.manifest.basemap.delivery === "connected"
        ? options.manifest.basemap.styleUrl
        : "",
    basemapVisible: options.manifest.basemap.delivery === "connected",
    basemapOpacity: 1,
    layers,
    styles: Object.fromEntries(
      layers.map((layer) => [String(layer.id), layer.style]),
    ),
    interaction: { identify: includedAssetIds },
    metadata: {
      earthStories: {
        buildId: options.manifest.build.id,
        projectId: options.manifest.build.projectId,
        publicationUrl: publicationUrl.href,
      },
    },
  };

  return {
    project,
    launchHref: `https://web.geolibre.app/?url=${encodeURIComponent(projectUrl.href)}&layout=viewer`,
    includedAssetIds,
    excluded,
  };
}
