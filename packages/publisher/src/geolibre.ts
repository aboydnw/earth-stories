import type {
  PublicationAsset,
  PublicationManifest,
} from "@earth-stories/story-schema";
import { normalizePublicationUrl } from "./publication-url.js";
import { isPrivateNetworkHost } from "./remote-url.js";

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

/**
 * Parses a URL that GeoLibre may fetch from a reader's browser: HTTPS only,
 * credential-free, and never a private or local network host.
 */
export function safePublicUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !isPrivateNetworkHost(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function publicationBase(value: string): URL | null {
  try {
    return safePublicUrl(`${normalizePublicationUrl(value)}/`);
  } catch {
    return null;
  }
}

function restoreTileTemplate(href: string): string {
  return href.replace(/%7B([a-z]+)%7D/giu, "{$1}");
}

function assetUrl(asset: PublicationAsset, publicationUrl: URL): string | null {
  const url =
    asset.delivery === "included"
      ? new URL(asset.href, publicationUrl)
      : safePublicUrl(asset.href);
  if (!url) return null;
  return asset.kind === "xyz" ? restoreTileTemplate(url.href) : url.href;
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
  const publicationUrl = publicationBase(options.publicationUrl);
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

const PROBE_PUBLICATION_URL = "https://publication.example/";

export type GeoLibreContinuationStatus = "ready" | "needs-url" | "unavailable";

/**
 * Predicts whether a build with this publication URL will emit an
 * "Open in GeoLibre" continuation, using the same rules as the build itself.
 * "needs-url" means the layers qualify but the URL is not yet a usable
 * public HTTPS address.
 */
export function geolibreContinuationStatus(
  manifest: PublicationManifest,
  publicationUrl: string,
): GeoLibreContinuationStatus {
  if (buildGeoLibreCompanion({ manifest, publicationUrl }).project)
    return "ready";
  return buildGeoLibreCompanion({
    manifest,
    publicationUrl: PROBE_PUBLICATION_URL,
  }).project
    ? "needs-url"
    : "unavailable";
}
