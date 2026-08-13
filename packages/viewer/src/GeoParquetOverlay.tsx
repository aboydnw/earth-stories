import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layer as DeckLayer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table } from "apache-arrow";
import type {
  PublicationAsset,
  PublicationManifest,
} from "@earth-stories/story-schema";
import { DeckOverlay } from "./DeckOverlay.js";
import { geoJsonBounds, type GeographicBounds } from "./geoBounds.js";
import {
  duckDbSpatialSetupSql,
  publicationDuckDbRuntime,
} from "./duckdbRuntime.js";

const FEATURE_CAP = 100_000;
const databasePromises = new Map<
  string,
  Promise<{
    db: duckdb.AsyncDuckDB;
    connection: duckdb.AsyncDuckDBConnection;
  }>
>();

async function database(
  runtimeAssets: PublicationManifest["runtimeAssets"],
  offline: boolean,
) {
  const key = JSON.stringify([offline, runtimeAssets]);
  const existing = databasePromises.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const runtime = publicationDuckDbRuntime(
      new URL(window.location.href),
      runtimeAssets,
      offline,
    );
    const bundle = await duckdb.selectBundle(runtime.bundles);
    if (!bundle.mainModule || !bundle.mainWorker)
      throw new Error("No compatible in-browser GeoParquet runtime was found.");
    const workerResponse = await fetch(bundle.mainWorker);
    if (!workerResponse.ok)
      throw new Error("The GeoParquet worker could not be downloaded.");
    const workerUrl = URL.createObjectURL(
      new Blob([await workerResponse.text()], {
        type: "application/javascript",
      }),
    );
    const db = new duckdb.AsyncDuckDB(
      new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
      new Worker(workerUrl),
    );
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const connection = await db.connect();
    await connection.query(duckDbSpatialSetupSql(runtime.extensionRepository));
    return { db, connection };
  })().catch((cause) => {
    databasePromises.delete(key);
    throw cause;
  });
  databasePromises.set(key, promise);
  return promise;
}

function rowsToGeoJson(table: Table) {
  const features: Array<{
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown>;
  }> = [];
  for (let index = 0; index < table.numRows; index += 1) {
    const row = table.get(index) as Record<string, unknown> | null;
    if (!row || typeof row.__geojson !== "string") continue;
    const properties = { ...row };
    delete properties.__geojson;
    features.push({
      type: "Feature",
      geometry: JSON.parse(row.__geojson) as GeoJSON.Geometry,
      properties,
    });
  }
  return { type: "FeatureCollection" as const, features };
}

function hexColor(value: string): [number, number, number, number] {
  const normalized = value.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
}

export function GeoParquetOverlay({
  asset,
  onError,
  onBounds,
  onReady,
  runtimeAssets = [],
  offline = false,
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
  onBounds?: (bounds: GeographicBounds) => void;
  onReady?: () => void;
  runtimeAssets?: PublicationManifest["runtimeAssets"];
  offline?: boolean;
}) {
  const [data, setData] = useState<ReturnType<typeof rowsToGeoJson> | null>(
    null,
  );
  const renderedData = useRef<ReturnType<typeof rowsToGeoJson> | null>(null);
  useEffect(() => {
    let active = true;
    void database(runtimeAssets, offline)
      .then(async ({ connection }) => {
        const countStatement = await connection.prepare(
          "SELECT COUNT(*) AS count FROM read_parquet(?)",
        );
        const count = await countStatement.query(asset.href);
        await countStatement.close();
        const featureCount = Number(count.get(0)?.count ?? 0);
        if (featureCount > FEATURE_CAP)
          throw new Error(
            `${featureCount.toLocaleString()} features exceeds the ${FEATURE_CAP.toLocaleString()}-feature browser limit. Convert this source to PMTiles.`,
          );
        const descriptionStatement = await connection.prepare(
          "DESCRIBE SELECT * FROM read_parquet(?) LIMIT 0",
        );
        const description = await descriptionStatement.query(asset.href);
        await descriptionStatement.close();
        let geometryColumn: string | null = null;
        for (let index = 0; index < description.numRows; index += 1) {
          const row = description.get(index);
          const name = String(row?.column_name ?? "");
          const type = String(row?.column_type ?? "");
          if (
            type.includes("GEOMETRY") ||
            (type === "BLOB" &&
              ["geometry", "geom", "wkb_geometry"].includes(name.toLowerCase()))
          ) {
            geometryColumn = name;
            break;
          }
        }
        if (!geometryColumn)
          throw new Error("No GeoParquet geometry column was found.");
        const quoted = geometryColumn.replaceAll('"', '""');
        const featuresStatement = await connection.prepare(
          `SELECT * EXCLUDE ("${quoted}"), ST_AsGeoJSON("${quoted}") AS __geojson FROM read_parquet(?) LIMIT ${FEATURE_CAP}`,
        );
        const table = (await featuresStatement.query(
          asset.href,
        )) as unknown as Table;
        await featuresStatement.close();
        if (active) {
          const next = rowsToGeoJson(table);
          setData(next);
          const bounds = geoJsonBounds(next);
          if (bounds) onBounds?.(bounds);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          onError(
            cause instanceof Error
              ? cause.message
              : "The GeoParquet source could not be rendered.",
          );
      });
    return () => {
      active = false;
    };
  }, [asset.href, offline, onBounds, onError, runtimeAssets]);
  const layers = useMemo<DeckLayer[]>(() => {
    if (!data) return [];
    const presentation = asset.presentation;
    const filtered =
      presentation.filterProperty && presentation.filterValue !== null
        ? {
            ...data,
            features: data.features.filter(
              (feature) =>
                String(feature.properties[presentation.filterProperty!]) ===
                presentation.filterValue,
            ),
          }
        : data;
    const featureColor = (feature: (typeof data.features)[number]) => {
      const property = presentation.symbolProperty;
      const category = property
        ? String(feature.properties[property] ?? "")
        : "";
      return hexColor(
        presentation.categoryColors[category] ?? presentation.color,
      );
    };
    return [
      new GeoJsonLayer({
        id: `${asset.id}-geoparquet`,
        data: filtered,
        opacity: presentation.opacity,
        filled: true,
        stroked: true,
        pointRadiusMinPixels: presentation.radius,
        getFillColor: featureColor,
        getLineColor: featureColor,
        getLineWidth: 2,
        lineWidthMinPixels: 1,
      }),
    ];
  }, [asset, data]);
  const reportRendered = useCallback(() => {
    if (!data || renderedData.current === data) return;
    renderedData.current = data;
    onReady?.();
  }, [data, onReady]);
  return <DeckOverlay layers={layers} onAfterRender={reportRendered} />;
}
