import { useEffect, useMemo, useState } from "react";
import type { Layer as DeckLayer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table } from "apache-arrow";
import { useControl } from "react-map-gl/maplibre";
import type { PublicationAsset } from "@earth-stories/story-schema";

const FEATURE_CAP = 100_000;
let databasePromise: Promise<{
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}> | null = null;

async function database() {
  if (databasePromise) return databasePromise;
  databasePromise = (async () => {
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
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
    await connection.query("INSTALL spatial; LOAD spatial;");
    return { db, connection };
  })().catch((cause) => {
    databasePromise = null;
    throw cause;
  });
  return databasePromise;
}

function Overlay({ layers }: { layers: DeckLayer[] }) {
  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: false, layers }),
  );
  overlay.setProps({ layers });
  return null;
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
}: {
  asset: PublicationAsset;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<ReturnType<typeof rowsToGeoJson> | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void database()
      .then(async ({ connection }) => {
        const safeUrl = asset.href.replaceAll("'", "''");
        const count = await connection.query(
          `SELECT COUNT(*) AS count FROM read_parquet('${safeUrl}')`,
        );
        const featureCount = Number(count.get(0)?.count ?? 0);
        if (featureCount > FEATURE_CAP)
          throw new Error(
            `${featureCount.toLocaleString()} features exceeds the ${FEATURE_CAP.toLocaleString()}-feature browser limit. Convert this source to PMTiles.`,
          );
        const description = await connection.query(
          `DESCRIBE SELECT * FROM read_parquet('${safeUrl}') LIMIT 0`,
        );
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
        const table = (await connection.query(
          `SELECT * EXCLUDE ("${quoted}"), ST_AsGeoJSON("${quoted}") AS __geojson FROM read_parquet('${safeUrl}') LIMIT ${FEATURE_CAP}`,
        )) as unknown as Table;
        if (active) setData(rowsToGeoJson(table));
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
  }, [asset.href, onError]);
  const layers = useMemo<DeckLayer[]>(
    () =>
      data
        ? [
            new GeoJsonLayer({
              id: `${asset.id}-geoparquet`,
              data,
              opacity: asset.presentation.opacity,
              filled: true,
              stroked: true,
              pointRadiusMinPixels: asset.presentation.radius,
              getFillColor: hexColor(asset.presentation.color),
              getLineColor: hexColor(asset.presentation.strokeColor),
              getLineWidth: 2,
              lineWidthMinPixels: 1,
            }),
          ]
        : [],
    [asset, data],
  );
  return <Overlay layers={layers} />;
}
