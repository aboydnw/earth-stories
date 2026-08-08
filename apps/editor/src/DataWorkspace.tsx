import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  CloudArrowDown,
  Database,
  FileArrowUp,
  Link,
  MapTrifold,
  Plus,
} from "@phosphor-icons/react";
import { compileProject } from "@earth-stories/publisher/compile";
import type {
  PublicationAsset,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import { createDefaultSourceProvenance } from "@earth-stories/story-schema";
import {
  BrandSpinner,
  ActionButton,
  DataSourceRow,
  FileInput,
  FormField,
  PanelShell,
  SelectInput,
  StatePanel,
  TextInput,
} from "@earth-stories/ui";
import {
  discoverSource,
  importAsset,
  openProject,
  saveProject,
  type ExampleCatalog,
  type ExampleConnection,
  type ProjectSummary,
} from "./api";
import {
  connectedSource,
  uploadedSource,
  type ConnectableKind,
} from "./workspaceData";

interface DataItem {
  key: string;
  project: StoryProject;
  source: ProjectSource;
  usedBy: number;
  example: boolean;
}

const MapChapter = lazy(async () => ({
  default: (await import("@earth-stories/viewer/map")).MapChapter,
}));

const defaultCamera = {
  center: [0, 20] as [number, number],
  zoom: 1.5,
  bearing: 0,
  pitch: 0,
};

function sourcePath(source: ProjectSource) {
  return source.kind === "local-geojson" ||
    source.kind === "image" ||
    source.kind === "csv"
    ? source.path
    : source.locator;
}

function assetHref(item: DataItem, asset: PublicationAsset) {
  const path = sourcePath(item.source);
  if (item.source.kind === "zarr" || item.source.kind === "xyz") return path;
  if (item.example)
    return `/api/examples/connections/${encodeURIComponent(item.source.id)}/content`;
  if (asset.delivery === "connected")
    return `/api/projects/${encodeURIComponent(item.project.id)}/sources/${encodeURIComponent(item.source.id)}/content`;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/projects/${encodeURIComponent(item.project.id)}/assets/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function DataWorkspace({
  projects,
  examples,
  onOpenStory,
  selectedDatasetId,
  onDatasetChange,
}: {
  projects: ProjectSummary[];
  examples: ExampleCatalog | null;
  onOpenStory: (id: string) => void;
  selectedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}) {
  const [loadedProjects, setLoadedProjects] = useState<StoryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"upload" | "connect">("upload");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [connectedUrl, setConnectedUrl] = useState("");
  const [connectedKind, setConnectedKind] = useState<ConnectableKind>("cog");
  const [connectionDiscovery, setConnectionDiscovery] = useState<Awaited<
    ReturnType<typeof discoverSource>
  > | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setWarning(null);
    Promise.allSettled(
      projects
        .filter((item) => !item.invalidReason)
        .map((item) => openProject(item.id)),
    )
      .then((results) => {
        if (!active) return;
        const loaded = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        setLoadedProjects(loaded);
        const failed = results.length - loaded.length;
        if (failed > 0 && loaded.length > 0)
          setWarning(
            `${failed} project${failed === 1 ? "" : "s"} could not be opened. Available datasets remain usable.`,
          );
        if (results.length > 0 && loaded.length === 0) {
          const failure = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );
          setError(
            failure?.reason instanceof Error
              ? failure.reason.message
              : "Couldn’t load the data library.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projects]);

  const items = useMemo<DataItem[]>(() => {
    const projectItems = loadedProjects.flatMap((project) =>
      project.sources
        .filter((source) => source.kind !== "image" && source.kind !== "csv")
        .map((source) => ({
          key: `${project.id}:${source.id}`,
          project,
          source,
          usedBy: project.chapters.filter(
            (chapter) =>
              ("sourceId" in chapter && chapter.sourceId === source.id) ||
              ("overlaySourceIds" in chapter &&
                chapter.overlaySourceIds?.includes(source.id)),
          ).length,
          example: false,
        })),
    );
    const existingUrls = new Set(
      projectItems.map((item) => sourcePath(item.source)),
    );
    const exampleItems = (examples?.connections ?? [])
      .filter((example) => !existingUrls.has(example.locator))
      .map(exampleDataItem);
    return [...projectItems, ...exampleItems];
  }, [examples, loadedProjects]);
  const selected = items.find((item) => item.key === selectedDatasetId) ?? null;

  const eligibleProjects = projects.filter((item) => !item.invalidReason);
  function openAddPanel(mode: "upload" | "connect") {
    setAddMode(mode);
    setTargetProjectId((current) => current || eligibleProjects[0]?.id || "");
    setAddError(null);
    setAddOpen(true);
  }
  async function inspectConnectedSource() {
    try {
      setAddPending(true);
      setAddError(null);
      const discovery = await discoverSource(connectedUrl.trim());
      setConnectionDiscovery(discovery);
      if (discovery.kind !== "unknown") setConnectedKind(discovery.kind);
    } catch (cause) {
      setAddError(
        cause instanceof Error
          ? cause.message
          : "Could not inspect this source.",
      );
    } finally {
      setAddPending(false);
    }
  }
  async function addWorkspaceData(event: FormEvent) {
    event.preventDefault();
    if (!targetProjectId) return;
    if (addMode === "upload" && !uploadFile) return;
    try {
      setAddPending(true);
      setAddError(null);
      const target = await openProject(targetProjectId);
      let source: ProjectSource;
      if (addMode === "upload") {
        const file = uploadFile;
        if (!file) return;
        source = uploadedSource(file, await importAsset(targetProjectId, file));
      } else {
        source = connectedSource(
          connectedUrl.trim(),
          connectedKind,
          connectionDiscovery,
        );
      }
      const saved = await saveProject({
        ...target,
        metadata: { ...target.metadata, updated: new Date().toISOString() },
        sources: [...target.sources, source],
      });
      setLoadedProjects((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved,
      ]);
      setAddNotice(`${source.label} was added to ${saved.metadata.title}.`);
      setAddOpen(false);
      setUploadFile(null);
      setConnectedUrl("");
      setConnectionDiscovery(null);
    } catch (cause) {
      setAddError(
        cause instanceof Error ? cause.message : "Could not add this dataset.",
      );
    } finally {
      setAddPending(false);
    }
  }

  if (selected)
    return (
      <DataMapViewer
        item={selected}
        onBack={() => onDatasetChange(null)}
        onOpenStory={
          selected.example ? undefined : () => onOpenStory(selected.project.id)
        }
      />
    );

  return (
    <>
      <main className="workspace-main data-workspace" id="main-content">
        <header className="data-workspace__intro">
          <div>
            <p>Your workspace</p>
            <h1>Data</h1>
            <span>
              Open uploaded datasets and connected sources on a map before using
              them in a story.
            </span>
          </div>
          <div className="data-workspace__actions">
            <div className="data-workspace__count">
              <Database size={20} />
              <strong>{items.length}</strong>
              <span>{items.length === 1 ? "source" : "sources"}</span>
            </div>
            <div className="data-workspace__add">
              <ActionButton
                className="button button--primary"
                type="button"
                disabled={!eligibleProjects.length}
                onClick={() => openAddPanel("upload")}
              >
                <Plus size={17} /> Add data
              </ActionButton>
            </div>
          </div>
        </header>
        {addNotice ? (
          <StatePanel
            compact
            tone="success"
            title="Dataset added"
            description={addNotice}
          />
        ) : null}
        {!eligibleProjects.length ? (
          <StatePanel
            compact
            tone="info"
            title="Create a story before adding data"
            description="Datasets are stored in a story’s reusable data library."
          />
        ) : null}
        <section className="workspace-projects" aria-labelledby="data-heading">
          <header>
            <div>
              <p>Datasets and connections</p>
              <h2 id="data-heading">Your data</h2>
            </div>
            <span>Select a source to inspect it on an interactive map.</span>
          </header>
          {loading ? (
            <div className="data-workspace__state">
              <BrandSpinner size="md" label="Loading data library" />
              <span>Loading data library…</span>
            </div>
          ) : error && !items.length ? (
            <StatePanel
              tone="danger"
              title="Couldn’t load your data"
              description={error}
            />
          ) : items.length ? (
            <>
              {error ? (
                <StatePanel
                  compact
                  tone="danger"
                  title="Local project data is unavailable"
                  description={`${error} Example datasets remain usable.`}
                />
              ) : null}
              {warning ? (
                <StatePanel
                  compact
                  tone="warning"
                  title="Some project data is unavailable"
                  description={warning}
                />
              ) : null}
              <div className="data-list">
                <div className="data-list__header" aria-hidden="true">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Source</span>
                  <span>Used in</span>
                  <span />
                </div>
                {items.map((item) => (
                  <DataSourceRow
                    key={item.key}
                    label={item.source.label}
                    kind={item.source.kind}
                    leading={<MapTrifold size={18} />}
                    badge={item.example ? <mark>Example</mark> : undefined}
                    delivery={
                      <>
                        {item.source.delivery === "connected" ? (
                          <CloudArrowDown size={15} />
                        ) : (
                          <Database size={15} />
                        )}
                        {item.source.delivery}
                      </>
                    }
                    usage={`${item.usedBy} ${item.usedBy === 1 ? "chapter" : "chapters"}`}
                    onOpen={() => onDatasetChange(item.key)}
                  />
                ))}
              </div>
            </>
          ) : (
            <StatePanel
              title="Data is optional until a visualization needs it"
              description="Prose and video stories can publish without data. Add a source when you are ready to build a map or chart chapter."
              actionLabel={eligibleProjects.length ? "Add data" : undefined}
              onAction={
                eligibleProjects.length
                  ? () => openAddPanel("upload")
                  : undefined
              }
            />
          )}
        </section>
      </main>
      <PanelShell
        open={addOpen}
        onOpenChange={setAddOpen}
        eyebrow="Data library"
        title={
          addMode === "upload" ? "Upload local data" : "Connect a public source"
        }
      >
        <form className="workspace-data-form" onSubmit={addWorkspaceData}>
          <div
            className="workspace-data-form__modes"
            aria-label="Data source type"
          >
            <button
              type="button"
              className={addMode === "upload" ? "is-active" : ""}
              onClick={() => setAddMode("upload")}
            >
              <FileArrowUp size={16} /> Upload local file
            </button>
            <button
              type="button"
              className={addMode === "connect" ? "is-active" : ""}
              onClick={() => setAddMode("connect")}
            >
              <Link size={16} /> Connect source
            </button>
          </div>
          <FormField label="Destination story" required>
            <SelectInput
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
            >
              {eligibleProjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </SelectInput>
          </FormField>
          {addMode === "upload" ? (
            <FormField
              label="Local dataset"
              hint="GeoTIFF, GeoJSON, PMTiles, or GeoParquet"
              required
            >
              <FileInput
                accept=".tif,.tiff,.geojson,.json,.pmtiles,.parquet"
                onChange={(event) =>
                  setUploadFile(event.target.files?.[0] ?? null)
                }
              />
            </FormField>
          ) : (
            <>
              <FormField label="Public URL" required>
                <TextInput
                  type="url"
                  value={connectedUrl}
                  placeholder="https://example.com/data.pmtiles"
                  onChange={(event) => {
                    setConnectedUrl(event.target.value);
                    setConnectionDiscovery(null);
                  }}
                />
              </FormField>
              <div className="workspace-data-form__connection">
                <FormField label="Format">
                  <SelectInput
                    value={connectedKind}
                    onChange={(event) =>
                      setConnectedKind(event.target.value as ConnectableKind)
                    }
                  >
                    <option value="cog">Cloud-optimized GeoTIFF</option>
                    <option value="pmtiles">PMTiles</option>
                    <option value="geoparquet">GeoParquet</option>
                    <option value="xyz">XYZ tiles</option>
                    <option value="zarr">Zarr</option>
                    <option value="trajectory">Trajectory JSON</option>
                    <option value="copc">COPC point cloud</option>
                  </SelectInput>
                </FormField>
                <button
                  type="button"
                  disabled={addPending || !connectedUrl.trim()}
                  onClick={() => void inspectConnectedSource()}
                >
                  {addPending ? "Inspecting…" : "Inspect connection"}
                </button>
              </div>
              {connectionDiscovery ? (
                <StatePanel
                  compact
                  tone={
                    connectionDiscovery.issues.length ? "warning" : "success"
                  }
                  title={
                    connectionDiscovery.kind === "unknown"
                      ? "Format needs confirmation"
                      : `${connectionDiscovery.kind} detected`
                  }
                  description={
                    connectionDiscovery.issues.join(" ") ||
                    "The source is reachable and ready to add."
                  }
                />
              ) : null}
            </>
          )}
          {addError ? (
            <StatePanel
              compact
              tone="danger"
              title="Couldn’t add data"
              description={addError}
            />
          ) : null}
          <div className="workspace-data-form__submit">
            <button type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <ActionButton
              className="button button--primary"
              type="submit"
              disabled={
                addPending ||
                !targetProjectId ||
                (addMode === "upload" ? !uploadFile : !connectedUrl.trim())
              }
            >
              {addPending ? "Adding…" : "Add to story"}
            </ActionButton>
          </div>
        </form>
      </PanelShell>
    </>
  );
}

function DataMapViewer({
  item,
  onBack,
  onOpenStory,
}: {
  item: DataItem;
  onBack: () => void;
  onOpenStory?: () => void;
}) {
  const sourceChapter = item.project.chapters.find(
    (chapter) =>
      "sourceId" in chapter &&
      chapter.sourceId === item.source.id &&
      (chapter.type === "map" || chapter.type === "scrolly"),
  );
  const camera =
    sourceChapter &&
    (sourceChapter.type === "map" || sourceChapter.type === "scrolly")
      ? sourceChapter.camera
      : defaultCamera;
  const compiled = useMemo(() => {
    try {
      return {
        manifest: compileProject({
          ...item.project,
          chapters: [
            {
              id: `data-view-${item.source.id}`,
              type: "map",
              title: item.source.label,
              narrative: "",
              sourceId: item.source.id,
              camera,
            },
          ],
        }),
        error: null,
      };
    } catch (cause) {
      return {
        manifest: null,
        error:
          cause instanceof Error
            ? cause.message
            : "This source could not be prepared for the map viewer.",
      };
    }
  }, [item, camera]);
  const baseAsset = compiled.manifest?.assets.find(
    (asset) => asset.id === item.source.id,
  );
  const [opacity, setOpacity] = useState(
    baseAsset?.presentation.opacity ?? 0.85,
  );
  const [colormap, setColormap] = useState(
    baseAsset?.presentation.colormap ?? "viridis",
  );
  const asset = baseAsset
    ? {
        ...baseAsset,
        href: assetHref(item, baseAsset),
        presentation: { ...baseAsset.presentation, opacity, colormap },
      }
    : null;
  const chapter = {
    id: `data-view-${item.source.id}`,
    type: "map" as const,
    title: item.source.label,
    narrative: "",
    assetId: item.source.id,
    overlayAssetIds: [],
    transition: "instant" as const,
    camera,
  };

  return (
    <main className="data-map-viewer" id="main-content">
      <header className="data-map-viewer__bar">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={17} /> Back to data
        </button>
        <div>
          <strong>{item.source.label}</strong>
          <span>
            {item.source.kind} · {item.source.delivery}
            {item.source.delivery === "connected"
              ? " · network required"
              : ""}{" "}
            · {item.project.metadata.title}
          </span>
        </div>
        {onOpenStory ? (
          <button type="button" onClick={onOpenStory}>
            Open story
          </button>
        ) : (
          <span className="data-map-viewer__example">Example dataset</span>
        )}
      </header>
      <div className="data-map-viewer__body">
        <aside className="data-map-viewer__panel">
          <p>Map controls</p>
          <h2>{item.source.label}</h2>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>{item.source.kind}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{item.source.delivery}</dd>
            </div>
            <div>
              <dt>Used by</dt>
              <dd>{item.usedBy} chapters</dd>
            </div>
          </dl>
          <label>
            Layer opacity
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
            <small>{Math.round(opacity * 100)}%</small>
          </label>
          {item.source.kind === "cog" ? (
            <FormField label="Color ramp">
              <SelectInput
                value={colormap}
                onChange={(event) =>
                  setColormap(event.target.value as typeof colormap)
                }
              >
                <option value="viridis">Viridis</option>
                <option value="magma">Magma</option>
                <option value="terrain">Terrain</option>
                <option value="grayscale">Grayscale</option>
              </SelectInput>
            </FormField>
          ) : null}
          {item.source.attribution ? (
            <small className="data-map-viewer__attribution">
              {item.source.attribution}
            </small>
          ) : null}
          <dl className="data-map-viewer__provenance">
            <div>
              <dt>Publisher</dt>
              <dd>{item.source.provenance.publisher ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Data updated</dt>
              <dd>{item.source.provenance.dataUpdatedAt ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{item.source.provenance.licenseName ?? "Not provided"}</dd>
            </div>
            {item.source.provenance.spatialCoverage ? (
              <div>
                <dt>Spatial coverage</dt>
                <dd>{item.source.provenance.spatialCoverage}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
        <section className="data-map-viewer__map" aria-label="Dataset map">
          {asset ? (
            <Suspense
              fallback={
                <div className="data-workspace__state">
                  <BrandSpinner size="md" label="Opening map" />
                  <span>Opening map…</span>
                </div>
              }
            >
              <MapChapter
                chapter={chapter}
                asset={asset}
                basemapStyle={item.project.basemap.styleUrl}
                autoFit
              />
            </Suspense>
          ) : (
            <div className="data-workspace__state data-workspace__state--error">
              {compiled.error ??
                "This source could not be prepared for the map viewer."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function exampleDataItem(example: ExampleConnection): DataItem {
  const common = {
    id: example.id,
    label: example.title,
    locator: example.locator,
    attribution: example.attribution,
    sizeBytes: null,
    delivery: "connected" as const,
    provenance: createDefaultSourceProvenance(),
  };
  const source: ProjectSource =
    example.kind === "pmtiles"
      ? {
          ...common,
          kind: "pmtiles",
          tileType: example.tileType ?? "vector",
        }
      : example.kind === "zarr"
        ? {
            ...common,
            kind: "zarr",
            variable: String(example.config?.variable ?? "data"),
            selection:
              (example.config?.selection as Record<string, number>) ?? {},
            timeDimension:
              (example.config?.timeDimension as string | null) ?? null,
            timesteps:
              (example.config?.timesteps as Array<{
                label: string;
                index: number;
              }>) ?? [],
            geozarr:
              (example.config?.geozarr as Extract<
                ProjectSource,
                { kind: "zarr" }
              >["geozarr"]) ?? null,
          }
        : example.kind === "trajectory"
          ? { ...common, kind: "trajectory", trailLength: 600 }
          : example.kind === "copc"
            ? {
                ...common,
                kind: "copc",
                colorMode: "elevation",
                pointSize: 2,
              }
            : { ...common, kind: example.kind };
  const project: StoryProject = {
    schema: "earth-stories/project/v1",
    id: `catalog-${example.id}`,
    metadata: {
      title: example.title,
      description: example.description,
      author: "Development Seed",
      created: "2026-08-06T00:00:00.000Z",
      updated: "2026-08-06T00:00:00.000Z",
    },
    basemap: {
      id: "carto-positron",
      label: "CARTO Positron",
      styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      attribution: "© OpenStreetMap contributors © CARTO",
    },
    publication: { profile: "connected", theme: "cng" },
    sources: [source],
    dataAssets: [],
    chapters: [
      {
        id: `map-${example.id}`,
        type: "map",
        title: example.title,
        narrative: example.description,
        sourceId: source.id,
        camera: example.camera,
      },
    ],
  };
  return {
    key: `catalog:${example.id}`,
    project,
    source,
    usedBy: 0,
    example: true,
  };
}
