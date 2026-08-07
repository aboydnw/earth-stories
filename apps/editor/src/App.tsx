import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Database,
  Export,
  FileArrowUp,
  FloppyDisk,
  Link,
  MapTrifold,
  GearSix,
  House,
  Plus,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { compileProject } from "@earth-stories/publisher/compile";
import type {
  ConversionCapability,
  ProjectDataAsset,
  ProjectChapter,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import { StoryViewer } from "@earth-stories/viewer";
import { ActionButton, BrandSpinner, SaveStatus } from "@earth-stories/ui";
import { reorderChapters } from "./chapterOrder";
import {
  createProject,
  createExampleStory,
  discoverSource,
  getExamples,
  getConversionJob,
  importAsset,
  listProjects,
  openProject,
  saveProject,
  startConversion,
  deleteProject,
  type ProjectSummary,
  type ExampleCatalog,
  type ExampleConnection,
  type ConversionJobSnapshot,
  type RemoteSourceDiscovery,
} from "./api";
import { PublishPanel } from "./PublishPanel";
import { WorkspaceScreen } from "./WorkspaceScreen";
import { ChapterAddMenu } from "./ChapterAddMenu";

type SaveState = "saved" | "changed" | "saving" | "save-error" | "exporting";
type InspectorMode = "chapter" | "story" | "data";
interface MultidimChoice {
  variable: string;
  selection: Record<string, number>;
}
const camera = {
  center: [0, 20] as [number, number],
  zoom: 1.5,
  bearing: 0,
  pitch: 0,
};
const presentation = {
  opacity: 0.85,
  color: "#cf3f02",
  strokeColor: "#443f3f",
  radius: 6,
  sourceLayer: null,
  rasterBand: 1,
  rescale: null,
  colormap: "viridis" as const,
  legendTitle: "",
  legendVisible: true,
  symbolProperty: null,
  categoryColors: {},
  filterProperty: null,
  filterValue: null,
};
const sourcePath = (source: ProjectSource) =>
  source.kind === "local-geojson" ||
  source.kind === "image" ||
  source.kind === "csv"
    ? source.path
    : source.kind === "pmtiles" ||
        source.kind === "geoparquet" ||
        source.kind === "cog" ||
        source.kind === "trajectory" ||
        source.kind === "copc"
      ? source.locator
      : null;

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"stories" | "data">(() =>
    window.location.hash === "#data" ? "data" : "stories",
  );
  const [activeChapter, setActiveChapter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [connectedUrl, setConnectedUrl] = useState("");
  const [basemapStyleDraft, setBasemapStyleDraft] = useState("");
  const [connectedKind, setConnectedKind] = useState<
    "cog" | "pmtiles" | "geoparquet" | "xyz" | "zarr" | "trajectory" | "copc"
  >("cog");
  const [connectionDiscovery, setConnectionDiscovery] =
    useState<RemoteSourceDiscovery | null>(null);
  const [discoveringConnection, setDiscoveringConnection] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [examples, setExamples] = useState<ExampleCatalog | null>(null);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("chapter");
  const [addChapterOpen, setAddChapterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conversionJobs, setConversionJobs] = useState<
    Record<string, ConversionJobSnapshot>
  >({});
  const [multidimChoices, setMultidimChoices] = useState<
    Record<string, MultidimChoice>
  >({});
  const [categoryColorsDraft, setCategoryColorsDraft] = useState<string | null>(
    null,
  );
  const chapterAddRef = useRef<HTMLDivElement>(null);

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => {
    getExamples()
      .then(setExamples)
      .catch(() => undefined);
    listProjects()
      .then(setProjects)
      .catch(showError)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!addChapterOpen) return;
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setAddChapterOpen(false);
        return;
      }
      if (!chapterAddRef.current?.contains(event.target as Node))
        setAddChapterOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [addChapterOpen]);
  useEffect(() => {
    if (saveState !== "changed" && saveState !== "save-error") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [saveState]);
  function showError(cause: unknown) {
    setError(
      cause instanceof Error
        ? cause.message
        : "Earth Stories could not complete that action",
    );
  }
  function activate(next: StoryProject) {
    setProject(next);
    setBasemapStyleDraft(next.basemap.styleUrl);
    setActiveChapter(next.chapters[0]?.id ?? "");
    setInspectorMode("chapter");
    setAddChapterOpen(false);
    setSaveState("saved");
  }
  function changeProject(update: (current: StoryProject) => StoryProject) {
    setProject((current) => (current ? update(current) : current));
    setSaveState("changed");
    setError(null);
  }

  const publicationResult = useMemo(() => {
    if (!project || !project.metadata.title.trim())
      return { manifest: null, error: null };
    let compiled;
    try {
      compiled = compileProject(project);
    } catch (cause) {
      return {
        manifest: null,
        error:
          cause instanceof Error
            ? cause.message
            : "The story cannot be compiled.",
      };
    }
    const sources = new Map(
      project.sources.map((source) => [source.id, source]),
    );
    return {
      error: null,
      manifest: {
        ...compiled,
        assets: compiled.assets.map((asset) => {
          const source = sources.get(asset.id);
          const path = source ? sourcePath(source) : null;
          if (
            asset.delivery === "connected" &&
            source &&
            source.kind !== "zarr" &&
            source.kind !== "xyz"
          )
            return {
              ...asset,
              href: `/api/projects/${encodeURIComponent(project.id)}/sources/${encodeURIComponent(source.id)}/content`,
            };
          return asset.delivery === "included" && path
            ? {
                ...asset,
                href: /^https?:\/\//i.test(path)
                  ? path
                  : `/api/projects/${encodeURIComponent(project.id)}/assets/${path.split("/").map(encodeURIComponent).join("/")}`,
              }
            : asset;
        }),
      },
    };
  }, [project]);
  const publication = publicationResult.manifest;
  const selectedChapter = project?.chapters.find(
    (chapter) => chapter.id === activeChapter,
  );
  const selectedSource =
    selectedChapter && "sourceId" in selectedChapter && selectedChapter.sourceId
      ? project?.sources.find(
          (source) => source.id === selectedChapter.sourceId,
        )
      : null;
  useEffect(() => setCategoryColorsDraft(null), [selectedSource?.id]);
  const selectedPresentation = {
    ...presentation,
    ...selectedSource?.presentation,
  };
  function updateSelectedSource(
    update: (source: ProjectSource) => ProjectSource,
  ) {
    if (!selectedSource) return;
    changeProject((current) => ({
      ...current,
      sources: current.sources.map((source) =>
        source.id === selectedSource.id ? update(source) : source,
      ),
    }));
  }
  function assignSourceToChapter(chapterId: string, sourceId: string) {
    changeProject((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId &&
        (chapter.type === "map" || chapter.type === "scrolly")
          ? {
              ...chapter,
              sourceId,
              overlaySourceIds: (chapter.overlaySourceIds ?? []).filter(
                (id) => id !== sourceId,
              ),
            }
          : chapter,
      ),
    }));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      activate(await createProject(newTitle.trim() || "Untitled story"));
      setNewTitle("");
      await refreshProjects();
    } catch (cause) {
      showError(cause);
    }
  }
  async function handleOpen(id: string) {
    try {
      activate(await openProject(id));
    } catch (cause) {
      showError(cause);
    }
  }
  async function handleRename(item: ProjectSummary) {
    const title = window.prompt("Story title", item.title)?.trim();
    if (!title || title === item.title) return;
    try {
      const current = await openProject(item.id);
      await saveProject({
        ...current,
        metadata: { ...current.metadata, title },
      });
      await refreshProjects();
    } catch (cause) {
      showError(cause);
    }
  }
  function handleDelete(item: ProjectSummary) {
    setDeleteTarget(item);
    setDeleteError(null);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await refreshProjects();
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "Could not remove the story.",
      );
    } finally {
      setDeletePending(false);
    }
  }
  async function handleExampleStory(id: string) {
    try {
      setLoading(true);
      activate(await createExampleStory(id));
      await refreshProjects();
    } catch (cause) {
      showError(cause);
    } finally {
      setLoading(false);
    }
  }
  async function persist(): Promise<StoryProject | null> {
    if (!project) return null;
    try {
      setSaveState("saving");
      const saved = await saveProject(project);
      setProject(saved);
      setSaveState("saved");
      await refreshProjects();
      return saved;
    } catch (cause) {
      setSaveState("save-error");
      showError(cause);
      return null;
    }
  }

  function addChapter(chapter: ProjectChapter) {
    changeProject((current) => ({
      ...current,
      chapters: [...current.chapters, chapter],
    }));
    setActiveChapter(chapter.id);
    setInspectorMode("chapter");
    setAddChapterOpen(false);
  }
  function addChapterFromSource(source: ProjectSource) {
    const id = crypto.randomUUID();
    const title = source.label.replace(/\.[^.]+$/, "") || "New chapter";
    const chapter: ProjectChapter =
      source.kind === "image"
        ? {
            id,
            type: "image",
            title,
            narrative: "",
            sourceId: source.id,
            alt: "",
            caption: "",
          }
        : source.kind === "csv"
          ? {
              id,
              type: "chart",
              title,
              narrative: "",
              sourceId: source.id,
              chartType: "bar",
              xColumn: "label",
              yColumn: "value",
            }
          : {
              id,
              type: "map",
              title,
              narrative: "",
              sourceId: source.id,
              camera,
            };
    addChapter(chapter);
  }
  function removeSource(source: ProjectSource) {
    if (!project) return;
    const usedBy = project.chapters.filter(
      (chapter) =>
        ("sourceId" in chapter && chapter.sourceId === source.id) ||
        ("overlaySourceIds" in chapter &&
          chapter.overlaySourceIds?.includes(source.id)),
    );
    if (usedBy.length) {
      showError(
        `“${source.label}” is used by ${usedBy.length} chapter${usedBy.length === 1 ? "" : "s"}. Remove it from those chapters first.`,
      );
      return;
    }
    changeProject((current) => ({
      ...current,
      dataAssets: current.dataAssets.map((item) =>
        item.preparedSourceId === source.id
          ? { ...item, preparedSourceId: null }
          : item,
      ),
      sources: current.sources.filter((item) => item.id !== source.id),
    }));
  }
  function addProse() {
    addChapter({
      id: crypto.randomUUID(),
      type: "prose",
      title: "New chapter",
      narrative: "",
    });
  }
  function addMapChapter(type: "map" | "scrolly") {
    if (!project) return;
    const source = project.sources.find(
      (item) => item.kind !== "image" && item.kind !== "csv",
    );
    if (!source) {
      showError("Add or connect map data before creating a map chapter.");
      return;
    }
    addChapter({
      id: crypto.randomUUID(),
      type,
      title: type === "scrolly" ? "Guided tour" : "Map",
      narrative: "",
      sourceId: source.id,
      overlaySourceIds: [],
      camera,
      ...(type === "scrolly"
        ? { transition: "fly-to" as const, overlayPosition: "left" as const }
        : {}),
    });
  }
  function addImage() {
    if (!project) return;
    const source = project.sources.find((item) => item.kind === "image");
    if (!source) {
      showError("Import an image before creating an image chapter.");
      return;
    }
    addChapterFromSource(source);
  }
  function addChart() {
    if (!project) return;
    const source = project.sources.find((item) => item.kind === "csv");
    if (!source) {
      showError("Import a CSV before creating a chart chapter.");
      return;
    }
    addChapterFromSource(source);
  }
  function addVideo() {
    addChapter({
      id: crypto.randomUUID(),
      type: "video",
      title: "Video",
      narrative: "",
      provider: "youtube",
      videoId: "VIDEO_ID",
      originalUrl: "https://www.youtube.com/",
    });
  }
  function addFlyover() {
    const start =
      selectedChapter && "camera" in selectedChapter
        ? selectedChapter.camera
        : camera;
    addChapter({
      id: crypto.randomUUID(),
      type: "flyover",
      title: "Flyover",
      narrative: "",
      sourceId:
        selectedSource &&
        selectedSource.kind !== "image" &&
        selectedSource.kind !== "csv"
          ? selectedSource.id
          : null,
      overlaySourceIds: [],
      scrollLength: 1,
      keyframes: [
        start,
        {
          ...start,
          center: [start.center[0] + 8, start.center[1] + 4],
          zoom: start.zoom + 2,
          pitch: 55,
        },
      ],
    });
  }
  function moveChapter(chapterId: string, offset: number) {
    changeProject((current) => {
      const chapters = reorderChapters(current.chapters, chapterId, offset);
      if (chapters === current.chapters) return current;
      return { ...current, chapters };
    });
  }
  function duplicateChapter() {
    if (!selectedChapter) return;
    const duplicate = {
      ...structuredClone(selectedChapter),
      id: crypto.randomUUID(),
      title: `${selectedChapter.title} copy`,
    } as ProjectChapter;
    changeProject((current) => {
      const index = current.chapters.findIndex(
        (chapter) => chapter.id === selectedChapter.id,
      );
      const chapters = [...current.chapters];
      chapters.splice(index + 1, 0, duplicate);
      return { ...current, chapters };
    });
    setActiveChapter(duplicate.id);
  }
  function deleteChapter() {
    if (!selectedChapter || !project || project.chapters.length === 1) return;
    const index = project.chapters.findIndex(
      (chapter) => chapter.id === selectedChapter.id,
    );
    const next = project.chapters[index + 1] ?? project.chapters[index - 1];
    changeProject((current) => {
      const chapters = current.chapters.filter(
        (chapter) => chapter.id !== selectedChapter.id,
      );
      const sourceId =
        "sourceId" in selectedChapter ? selectedChapter.sourceId : undefined;
      const sourceStillUsed =
        sourceId !== undefined &&
        chapters.some(
          (chapter) => "sourceId" in chapter && chapter.sourceId === sourceId,
        );
      return {
        ...current,
        chapters,
        sources:
          sourceId !== undefined && !sourceStillUsed
            ? current.sources.filter((source) => source.id !== sourceId)
            : current.sources,
      };
    });
    setActiveChapter(next?.id ?? "");
  }
  async function handleFile(file: File, targetChapterId?: string) {
    if (!project) return;
    try {
      const uploaded = await importAsset(project.id, file);
      const id = crypto.randomUUID();
      const extension = uploaded.filename.split(".").pop()?.toLowerCase();
      const rawFormat: ProjectDataAsset["format"] | null =
        extension === "tif" || extension === "tiff"
          ? "geotiff"
          : extension === "zip"
            ? "shapefile-zip"
            : extension === "nc" || extension === "netcdf"
              ? "netcdf"
              : extension === "h5" || extension === "hdf5"
                ? "hdf5"
                : extension === "las"
                  ? "las"
                  : extension === "laz"
                    ? "laz"
                    : extension === "gpx"
                      ? "gpx"
                      : null;
      if (rawFormat) {
        const dataAsset: ProjectDataAsset = {
          id,
          label: file.name,
          path: uploaded.path,
          format: rawFormat,
          sizeBytes: uploaded.sizeBytes,
          createdAt: new Date().toISOString(),
          preparedSourceId: null,
        };
        changeProject((current) => ({
          ...current,
          dataAssets: [...current.dataAssets, dataAsset],
        }));
        return;
      }
      let source: ProjectSource;
      let chapter: ProjectChapter;
      if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension ?? "")) {
        source = {
          id,
          kind: "image",
          label: file.name,
          path: uploaded.path,
          attribution: null,
          sizeBytes: uploaded.sizeBytes,
          delivery: "included",
        };
        chapter = {
          id: crypto.randomUUID(),
          type: "image",
          title: file.name.replace(/\.[^.]+$/, ""),
          narrative: "",
          sourceId: id,
          alt: "",
          caption: "",
        };
      } else if (extension === "csv") {
        source = {
          id,
          kind: "csv",
          label: file.name,
          path: uploaded.path,
          attribution: null,
          sizeBytes: uploaded.sizeBytes,
          delivery: "included",
        };
        chapter = {
          id: crypto.randomUUID(),
          type: "chart",
          title: file.name.replace(/\.[^.]+$/, ""),
          narrative: "",
          sourceId: id,
          chartType: "bar",
          xColumn: "label",
          yColumn: "value",
        };
      } else if (uploaded.filename.toLowerCase().endsWith("trips.json")) {
        source = {
          id,
          kind: "trajectory",
          label: file.name,
          locator: uploaded.path,
          trailLength: 600,
          attribution: null,
          sizeBytes: uploaded.sizeBytes,
          delivery: "included",
        };
        chapter = {
          id: crypto.randomUUID(),
          type: "map",
          title: file.name.replace(/\.[^.]+$/, ""),
          narrative: "",
          sourceId: id,
          camera,
        };
      } else if (extension === "geojson" || extension === "json") {
        source = {
          id,
          kind: "local-geojson",
          label: file.name,
          path: uploaded.path,
          attribution: null,
          sizeBytes: uploaded.sizeBytes,
          delivery: "included",
        };
        chapter = {
          id: crypto.randomUUID(),
          type: "map",
          title: file.name.replace(/\.[^.]+$/, ""),
          narrative: "",
          sourceId: id,
          camera,
        };
      } else if (extension === "pmtiles") {
        source = {
          id,
          kind: "pmtiles",
          label: file.name,
          locator: uploaded.path,
          tileType: "vector",
          attribution: null,
          sizeBytes: uploaded.sizeBytes,
          delivery: "included",
        };
        chapter = {
          id: crypto.randomUUID(),
          type: "map",
          title: file.name.replace(/\.[^.]+$/, ""),
          narrative: "",
          sourceId: id,
          camera,
        };
      } else if (extension === "parquet") {
        source = {
          id,
          kind: "geoparquet",
          label: file.name,
          locator: uploaded.path,
          attribution: null,
          sizeBytes: uploaded.sizeBytes,
          delivery: "included",
        };
        chapter = {
          id: crypto.randomUUID(),
          type: "map",
          title: file.name.replace(/\.[^.]+$/, ""),
          narrative: "",
          sourceId: id,
          camera,
        };
      } else
        throw new Error(
          "Use GeoTIFF, zipped Shapefile, NetCDF, HDF5, LAS/LAZ, GPX, GeoJSON, PMTiles, GeoParquet, CSV, PNG, JPEG, WebP, or GIF files.",
        );
      changeProject((current) => ({
        ...current,
        sources: [...current.sources, source],
        dataAssets:
          source.kind === "csv" || source.kind === "local-geojson"
            ? [
                ...current.dataAssets,
                {
                  id: crypto.randomUUID(),
                  label: file.name,
                  path: uploaded.path,
                  format: source.kind === "csv" ? "csv" : "geojson",
                  sizeBytes: uploaded.sizeBytes,
                  createdAt: new Date().toISOString(),
                  preparedSourceId: null,
                },
              ]
            : current.dataAssets,
        chapters: targetChapterId
          ? current.chapters.map((item) =>
              item.id === targetChapterId &&
              (item.type === "map" || item.type === "scrolly") &&
              source.kind !== "image" &&
              source.kind !== "csv"
                ? { ...item, sourceId: source.id }
                : item,
            )
          : [...current.chapters, chapter],
      }));
      if (!targetChapterId) setActiveChapter(chapter.id);
    } catch (cause) {
      showError(cause);
    }
  }
  async function runDataAssetJob(
    asset: ProjectDataAsset,
    operation: "inspect" | "prepare",
    targetChapterId?: string,
  ) {
    if (!project) return;
    const capability: ConversionCapability =
      asset.format === "geotiff"
        ? "raster"
        : asset.format === "netcdf" || asset.format === "hdf5"
          ? "multidim"
          : asset.format === "las" || asset.format === "laz"
            ? "pointcloud"
            : "vector";
    try {
      const inspection = conversionJobs[asset.id]?.events
        .slice()
        .reverse()
        .find((event) => event.type === "result");
      const longitudeColumn =
        inspection?.type === "result" &&
        typeof inspection.output.suggestedLongitudeColumn === "string"
          ? inspection.output.suggestedLongitudeColumn
          : undefined;
      const latitudeColumn =
        inspection?.type === "result" &&
        typeof inspection.output.suggestedLatitudeColumn === "string"
          ? inspection.output.suggestedLatitudeColumn
          : undefined;
      if (
        operation === "prepare" &&
        asset.format === "csv" &&
        (!longitudeColumn || !latitudeColumn)
      ) {
        throw new Error(
          "Inspect this CSV first. Earth Stories will detect common longitude and latitude column names before preparing it.",
        );
      }
      if (
        operation === "prepare" &&
        capability === "multidim" &&
        !multidimChoices[asset.id]?.variable
      )
        throw new Error(
          "Inspect this file first, then choose the variable and dimension slice to prepare.",
        );
      const started = await startConversion(project.id, {
        operation,
        capability,
        assetPath: asset.path,
        options:
          capability === "vector"
            ? {
                target: asset.format === "gpx" ? "trajectory" : "geoparquet",
                ...(longitudeColumn && latitudeColumn
                  ? { longitudeColumn, latitudeColumn, crs: "EPSG:4326" }
                  : {}),
              }
            : capability === "multidim"
              ? {
                  variable: multidimChoices[asset.id]?.variable,
                  selection: multidimChoices[asset.id]?.selection ?? {},
                }
              : undefined,
      });
      setConversionJobs((current) => ({ ...current, [asset.id]: started }));
      let job = started;
      const deadline = Date.now() + 30 * 60 * 1_000;
      try {
        while (job.status === "queued" || job.status === "running") {
          if (Date.now() >= deadline)
            throw new Error(
              "The conversion is still running. Try preparing this source again later.",
            );
          await new Promise((resolveWait) => setTimeout(resolveWait, 750));
          job = await getConversionJob(job.id);
          setConversionJobs((current) => ({ ...current, [asset.id]: job }));
        }
      } catch (cause) {
        setConversionJobs((current) => {
          const next = { ...current };
          delete next[asset.id];
          return next;
        });
        throw cause;
      }
      const failure = [...job.events]
        .reverse()
        .find((event) => event.type === "failure");
      if (failure?.type === "failure") throw new Error(failure.message);
      if (operation !== "prepare") {
        if (capability === "multidim") {
          const result = [...job.events]
            .reverse()
            .find((event) => event.type === "result");
          const variables =
            result?.type === "result" && Array.isArray(result.output.variables)
              ? result.output.variables
              : [];
          const firstVariable = variables.find(
            (variable) =>
              variable &&
              typeof variable === "object" &&
              typeof (variable as { name?: unknown }).name === "string" &&
              Array.isArray((variable as { dimensions?: unknown }).dimensions),
          ) as { name: string } | undefined;
          if (firstVariable)
            setMultidimChoices((current) => ({
              ...current,
              [asset.id]: current[asset.id] ?? {
                variable: firstVariable.name,
                selection: {},
              },
            }));
        }
        return;
      }
      const result = [...job.events]
        .reverse()
        .find((event) => event.type === "result");
      if (result?.type !== "result" || typeof result.output.path !== "string")
        throw new Error("The prepared data path was not returned");
      const path = result.output.path;
      const sourceId = crypto.randomUUID();
      const common = {
        id: sourceId,
        label: asset.label.replace(/\.[^.]+$/, ""),
        locator: path,
        attribution: null,
        sizeBytes:
          typeof result.output.sizeBytes === "number"
            ? result.output.sizeBytes
            : null,
        delivery: "included" as const,
      };
      const source: ProjectSource =
        capability === "raster" || capability === "multidim"
          ? { ...common, kind: "cog" }
          : capability === "pointcloud"
            ? {
                ...common,
                kind: "copc",
                colorMode: "elevation",
                pointSize: 2,
              }
            : asset.format === "gpx"
              ? { ...common, kind: "trajectory", trailLength: 600 }
              : { ...common, kind: "geoparquet" };
      changeProject((current) => ({
        ...current,
        dataAssets: current.dataAssets.map((item) =>
          item.id === asset.id ? { ...item, preparedSourceId: sourceId } : item,
        ),
        sources: [...current.sources, source],
        chapters: targetChapterId
          ? current.chapters.map((chapter) =>
              chapter.id === targetChapterId &&
              (chapter.type === "map" || chapter.type === "scrolly")
                ? { ...chapter, sourceId }
                : chapter,
            )
          : current.chapters,
      }));
    } catch (cause) {
      showError(cause);
    }
  }
  function addConnected(event: React.FormEvent, targetChapterId?: string) {
    event.preventDefault();
    if (!project || !connectedUrl.trim()) return;
    let url: URL;
    try {
      url = new URL(connectedUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error();
    } catch {
      showError("Connected sources must use an HTTP or HTTPS URL.");
      return;
    }
    const id = crypto.randomUUID();
    const common = {
      id,
      label: url.hostname,
      locator: url.href,
      attribution: null,
      sizeBytes: null,
      delivery: "connected" as const,
    };
    const resolvedKind = connectedKind;
    const discoveredVariable = connectionDiscovery?.details.variables?.[0];
    const discoveredTimeDimension = discoveredVariable?.dimensions.find(
      (dimension) => dimension.toLowerCase() === "time",
    );
    const source: ProjectSource =
      resolvedKind === "pmtiles"
        ? {
            ...common,
            kind: "pmtiles",
            tileType: "vector",
            presentation: {
              ...presentation,
              sourceLayer:
                connectionDiscovery?.details.sourceLayers?.length === 1
                  ? connectionDiscovery.details.sourceLayers[0]
                  : null,
            },
          }
        : resolvedKind === "zarr"
          ? {
              ...common,
              kind: "zarr",
              variable: discoveredVariable?.name ?? "data",
              selection: {},
              timeDimension: discoveredTimeDimension ?? null,
              timesteps: [],
              geozarr: null,
            }
          : resolvedKind === "trajectory"
            ? { ...common, kind: "trajectory", trailLength: 600 }
            : resolvedKind === "copc"
              ? {
                  ...common,
                  kind: "copc",
                  colorMode: "elevation",
                  pointSize: 2,
                }
              : { ...common, kind: resolvedKind };
    const chapter: ProjectChapter = {
      id: crypto.randomUUID(),
      type: "map",
      title: source.label,
      narrative: "",
      sourceId: id,
      camera,
    };
    changeProject((current) => ({
      ...current,
      sources: [...current.sources, source],
      chapters: targetChapterId
        ? current.chapters.map((item) =>
            item.id === targetChapterId &&
            (item.type === "map" || item.type === "scrolly")
              ? { ...item, sourceId: source.id }
              : item,
          )
        : [...current.chapters, chapter],
    }));
    if (!targetChapterId) setActiveChapter(chapter.id);
    setConnectedUrl("");
    setConnectionDiscovery(null);
  }

  async function inspectConnection() {
    if (!connectedUrl.trim()) return;
    try {
      setDiscoveringConnection(true);
      const discovery = await discoverSource(connectedUrl.trim());
      setConnectionDiscovery(discovery);
      if (discovery.kind !== "unknown") setConnectedKind(discovery.kind);
    } catch (cause) {
      showError(cause);
    } finally {
      setDiscoveringConnection(false);
    }
  }

  function leaveProject() {
    void (async () => {
      if (
        (saveState === "changed" || saveState === "save-error") &&
        !(await persist())
      )
        return;
      setProject(null);
      setError(null);
      setAddChapterOpen(false);
    })();
  }

  function addExampleConnection(example: ExampleConnection) {
    if (!project) return;
    const id = crypto.randomUUID();
    const common = {
      id,
      label: example.title,
      locator: example.locator,
      attribution: example.attribution,
      sizeBytes: null,
      delivery: "connected" as const,
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
            ? {
                ...common,
                kind: "trajectory",
                trailLength: Number(example.config?.trailLength ?? 600),
              }
            : example.kind === "copc"
              ? {
                  ...common,
                  kind: "copc",
                  colorMode:
                    (example.config?.colorMode as
                      "elevation" | "intensity" | "classification" | "rgb") ??
                    "elevation",
                  pointSize: Number(example.config?.pointSize ?? 2),
                }
              : { ...common, kind: example.kind };
    const chapter: ProjectChapter = {
      id: crypto.randomUUID(),
      type: "map",
      title: example.title,
      narrative: example.description,
      sourceId: id,
      camera: example.camera,
    };
    changeProject((current) => ({
      ...current,
      sources: [...current.sources, source],
      chapters: [...current.chapters, chapter],
    }));
    setActiveChapter(chapter.id);
  }

  if (loading)
    return (
      <main className="workspace-screen workspace-screen--loading">
        <BrandSpinner size="lg" label="Opening your local workspace" />
        <p>Opening your local workspace…</p>
      </main>
    );
  if (!project)
    return (
      <WorkspaceScreen
        projects={projects}
        examples={examples}
        newTitle={newTitle}
        error={error}
        deleteTarget={deleteTarget}
        deletePending={deletePending}
        deleteError={deleteError}
        onNewTitleChange={setNewTitle}
        onCreate={handleCreate}
        onOpen={(id) => void handleOpen(id)}
        onRename={(item) => void handleRename(item)}
        onRequestDelete={handleDelete}
        onConfirmDelete={() => void confirmDelete()}
        onDismissDelete={() => setDeleteTarget(null)}
        onOpenExample={(id) => void handleExampleStory(id)}
        view={workspaceView}
        onViewChange={(view) => {
          setWorkspaceView(view);
          window.history.replaceState(
            null,
            "",
            view === "data"
              ? "#data"
              : `${window.location.pathname}${window.location.search}`,
          );
        }}
      />
    );

  return (
    <div className="editor-shell">
      <a className="skip-link" href="#top">
        Skip to story editor
      </a>
      <header className="editor-topbar">
        <button
          className="editor-brand"
          type="button"
          onClick={leaveProject}
          aria-label="Return to your workspace"
        >
          <MapTrifold size={22} weight="duotone" />
          <span>Earth Stories</span>
          <small>local</small>
        </button>
        <div className="editor-status">
          <SaveStatus
            state={
              saveState === "changed"
                ? "dirty"
                : saveState === "save-error"
                  ? "service-error"
                  : saveState === "exporting"
                    ? "exporting"
                    : saveState
            }
          />
        </div>
        <ActionButton
          variant="surface"
          className="button button--save"
          disabled={saveState !== "changed" && saveState !== "save-error"}
          onClick={() => void persist()}
        >
          <FloppyDisk size={17} /> Save
        </ActionButton>
        <ActionButton
          className="button button--primary"
          disabled={!publication || saveState === "exporting"}
          onClick={() => {
            void (async () => {
              const saved = saveState === "saved" ? project : await persist();
              if (saved) setPublishOpen(true);
            })();
          }}
        >
          <Export size={17} /> Publish
        </ActionButton>
      </header>
      <aside className="editor-rail">
        <div className="project-label">
          <button type="button" onClick={leaveProject}>
            <House size={15} /> Workspace
          </button>
          <span>Editing</span>
          <strong>{project.metadata.title || "Untitled story"}</strong>
        </div>
        <button
          className={
            inspectorMode === "story" ? "rail-mode is-active" : "rail-mode"
          }
          type="button"
          onClick={() => setInspectorMode("story")}
        >
          <GearSix size={16} />
          <span>
            <strong>Story settings</strong>
            <small>Title, theme, basemap and credits</small>
          </span>
        </button>
        <nav aria-label="Story chapters">
          <div className="rail-section-heading">
            <p>Chapters</p>
            <span>{project.chapters.length}</span>
          </div>
          {project.chapters.map((chapter, index) => (
            <div
              className={
                chapter.id === activeChapter && inspectorMode === "chapter"
                  ? "chapter-item is-active"
                  : "chapter-item"
              }
              key={chapter.id}
            >
              <button
                className="chapter-link"
                aria-current={
                  chapter.id === activeChapter && inspectorMode === "chapter"
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  setActiveChapter(chapter.id);
                  setInspectorMode("chapter");
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{chapter.title || "Untitled"}</strong>
                <small>{chapter.type}</small>
              </button>
              {chapter.id === activeChapter && inspectorMode === "chapter" ? (
                <div
                  className="chapter-item__actions"
                  role="group"
                  aria-label={`Actions for ${chapter.title}`}
                >
                  <button
                    type="button"
                    onClick={() => moveChapter(chapter.id, -1)}
                    disabled={index === 0}
                    aria-label="Move chapter up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveChapter(chapter.id, 1)}
                    disabled={index === project.chapters.length - 1}
                    aria-label="Move chapter down"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={duplicateChapter}
                    aria-label="Duplicate chapter"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={deleteChapter}
                    disabled={project.chapters.length === 1}
                    aria-label="Delete chapter"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="chapter-add" ref={chapterAddRef}>
          <ChapterAddMenu
            open={addChapterOpen}
            canAddImage={project.sources.some(
              (source) => source.kind === "image",
            )}
            canAddChart={project.sources.some(
              (source) => source.kind === "csv",
            )}
            onToggle={() => setAddChapterOpen((open) => !open)}
            onAddProse={addProse}
            onAddScrolly={() => addMapChapter("scrolly")}
            onAddMap={() => addMapChapter("map")}
            onAddImage={addImage}
            onAddVideo={addVideo}
            onAddChart={addChart}
            onAddFlyover={addFlyover}
          />
        </div>
        <button
          className={
            inspectorMode === "data"
              ? "rail-mode rail-mode--data is-active"
              : "rail-mode rail-mode--data"
          }
          type="button"
          onClick={() => setInspectorMode("data")}
        >
          <Database size={16} />
          <span>
            <strong>Story data</strong>
            <small>Import or connect a source</small>
          </span>
        </button>
      </aside>
      <section className="editor-workspace" id="top">
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <div className="author-panel">
          <header className="inspector-heading">
            <p>
              {inspectorMode === "story"
                ? "Story settings"
                : inspectorMode === "data"
                  ? "Story data"
                  : `Chapter ${String(project.chapters.findIndex((chapter) => chapter.id === activeChapter) + 1).padStart(2, "0")}`}
            </p>
            <h2>
              {inspectorMode === "story"
                ? "Story details"
                : inspectorMode === "data"
                  ? "Add data"
                  : selectedChapter?.title || "Untitled chapter"}
            </h2>
            <span>
              {inspectorMode === "story"
                ? "Settings shared by the whole publication."
                : inspectorMode === "data"
                  ? "Import a local file or connect a public source."
                  : `Edit this ${selectedChapter?.type ?? "story"} chapter while watching the preview.`}
            </span>
          </header>
          {inspectorMode === "data" ? (
            <div className="data-panel">
              <section>
                <h3>Project data library</h3>
                <p>
                  Prepare or connect data once, then reuse it across chapters in
                  this story project.
                </p>
                {project.dataAssets.length ? (
                  <div className="project-data-list project-data-list--raw">
                    {project.dataAssets.map((asset) => {
                      const job = conversionJobs[asset.id];
                      const progress = job
                        ? [...job.events]
                            .reverse()
                            .find((event) => event.type === "progress")
                        : undefined;
                      const inspection = job
                        ? [...job.events]
                            .reverse()
                            .find((event) => event.type === "result")
                        : undefined;
                      const detectedColumns =
                        inspection?.type === "result" &&
                        Array.isArray(inspection.output.columns)
                          ? inspection.output.columns
                              .filter(
                                (column): column is string =>
                                  typeof column === "string",
                              )
                              .join(", ")
                          : "";
                      const multidimVariables =
                        inspection?.type === "result" &&
                        Array.isArray(inspection.output.variables)
                          ? inspection.output.variables.flatMap((variable) => {
                              if (!variable || typeof variable !== "object")
                                return [];
                              const candidate = variable as {
                                name?: unknown;
                                dimensions?: unknown;
                                shape?: unknown;
                              };
                              return typeof candidate.name === "string" &&
                                Array.isArray(candidate.dimensions) &&
                                candidate.dimensions.every(
                                  (dimension) => typeof dimension === "string",
                                ) &&
                                Array.isArray(candidate.shape) &&
                                candidate.shape.every(
                                  (size) => typeof size === "number",
                                )
                                ? [
                                    {
                                      name: candidate.name,
                                      dimensions:
                                        candidate.dimensions as string[],
                                      shape: candidate.shape as number[],
                                    },
                                  ]
                                : [];
                            })
                          : [];
                      const multidimChoice = multidimChoices[asset.id];
                      const selectedVariable =
                        multidimVariables.find(
                          (variable) =>
                            variable.name === multidimChoice?.variable,
                        ) ?? multidimVariables[0];
                      const spatialDimensions = selectedVariable
                        ? selectedVariable.dimensions.filter((dimension) =>
                            [
                              "x",
                              "y",
                              "lon",
                              "lat",
                              "longitude",
                              "latitude",
                              "easting",
                              "northing",
                            ].includes(dimension.toLowerCase()),
                          )
                        : [];
                      const sliceDimensions = selectedVariable
                        ? selectedVariable.dimensions.filter(
                            (dimension, index) =>
                              spatialDimensions.length >= 2
                                ? !spatialDimensions.includes(dimension)
                                : index <
                                  selectedVariable.dimensions.length - 2,
                          )
                        : [];
                      const isMultidim =
                        asset.format === "netcdf" || asset.format === "hdf5";
                      return (
                        <article
                          key={asset.id}
                          className={
                            isMultidim && multidimVariables.length
                              ? "project-data-item project-data-item--configurable"
                              : "project-data-item"
                          }
                        >
                          <div>
                            <span>{asset.format} · source file</span>
                            <strong>{asset.label}</strong>
                            <small>
                              {asset.preparedSourceId
                                ? "Prepared and ready to use"
                                : progress?.type === "progress"
                                  ? progress.message
                                  : detectedColumns
                                    ? `Columns: ${detectedColumns}`
                                    : "Stored in this project"}
                            </small>
                          </div>
                          <div className="project-data-item__actions">
                            <button
                              type="button"
                              disabled={
                                job?.status === "queued" ||
                                job?.status === "running"
                              }
                              onClick={() =>
                                void runDataAssetJob(asset, "inspect")
                              }
                            >
                              Inspect
                            </button>
                            {!asset.preparedSourceId ? (
                              <button
                                type="button"
                                disabled={
                                  job?.status === "queued" ||
                                  job?.status === "running"
                                }
                                onClick={() =>
                                  void runDataAssetJob(asset, "prepare")
                                }
                              >
                                Prepare
                              </button>
                            ) : null}
                          </div>
                          {isMultidim && multidimVariables.length ? (
                            <div className="multidim-controls">
                              <label>
                                Variable
                                <select
                                  value={selectedVariable?.name ?? ""}
                                  onChange={(event) =>
                                    setMultidimChoices((current) => ({
                                      ...current,
                                      [asset.id]: {
                                        variable: event.target.value,
                                        selection: {},
                                      },
                                    }))
                                  }
                                >
                                  {multidimVariables.map((variable) => (
                                    <option
                                      key={variable.name}
                                      value={variable.name}
                                    >
                                      {variable.name} (
                                      {variable.dimensions.join(" × ")})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {sliceDimensions.map((dimension) => {
                                const dimensionIndex =
                                  selectedVariable.dimensions.indexOf(
                                    dimension,
                                  );
                                const maximum =
                                  selectedVariable.shape[dimensionIndex] - 1;
                                return (
                                  <label key={dimension}>
                                    {dimension} index
                                    <input
                                      type="number"
                                      min={0}
                                      max={maximum}
                                      value={
                                        multidimChoice?.selection[dimension] ??
                                        0
                                      }
                                      onChange={(event) =>
                                        setMultidimChoices((current) => ({
                                          ...current,
                                          [asset.id]: {
                                            variable: selectedVariable.name,
                                            selection: {
                                              ...(current[asset.id]
                                                ?.selection ?? {}),
                                              [dimension]: Math.max(
                                                0,
                                                Math.min(
                                                  maximum,
                                                  Number(event.target.value),
                                                ),
                                              ),
                                            },
                                          },
                                        }))
                                      }
                                    />
                                    <small>0–{maximum}</small>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
                {project.sources.length ? (
                  <div className="project-data-list">
                    {project.sources.map((source) => {
                      const chapterCount = project.chapters.filter(
                        (chapter) =>
                          ("sourceId" in chapter &&
                            chapter.sourceId === source.id) ||
                          ("overlaySourceIds" in chapter &&
                            chapter.overlaySourceIds?.includes(source.id)),
                      ).length;
                      return (
                        <article key={source.id} className="project-data-item">
                          <div>
                            <span>{source.kind}</span>
                            <strong>{source.label}</strong>
                            <small>
                              {source.delivery} · used by {chapterCount} chapter
                              {chapterCount === 1 ? "" : "s"}
                            </small>
                          </div>
                          <div className="project-data-item__actions">
                            <button
                              type="button"
                              onClick={() => addChapterFromSource(source)}
                            >
                              <Plus size={14} /> Add to story
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSource(source)}
                              disabled={chapterCount > 0}
                              aria-label={`Remove ${source.label} from the project data library`}
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : project.dataAssets.length === 0 ? (
                  <p className="data-library-empty">
                    No project data yet. Import a file or add a connection
                    below.
                  </p>
                ) : null}
              </section>
              <section>
                <h3>Import from this computer</h3>
                <p>
                  The file becomes an included project asset and is also added
                  to the current story.
                </p>
                <label className="file-import">
                  <FileArrowUp size={18} /> Choose a file
                  <input
                    type="file"
                    accept=".tif,.tiff,.zip,.nc,.netcdf,.h5,.hdf5,.las,.laz,.gpx,.geojson,.json,.pmtiles,.parquet,.csv,.png,.jpg,.jpeg,.webp,.gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                <small>
                  GeoTIFF, zipped Shapefile, NetCDF, HDF5, LAS/LAZ, GPX,
                  GeoJSON, PMTiles, GeoParquet, CSV, images, or browser-ready{" "}
                  <code>*.trips.json</code>.
                </small>
              </section>
              <section>
                <h3>Connect a public source</h3>
                <p>Keep larger datasets where they already live.</p>
                <form className="data-connect" onSubmit={addConnected}>
                  <label>
                    Data format
                    <select
                      value={connectedKind}
                      onChange={(event) =>
                        setConnectedKind(
                          event.target.value as typeof connectedKind,
                        )
                      }
                    >
                      <option value="cog">COG</option>
                      <option value="pmtiles">PMTiles</option>
                      <option value="geoparquet">GeoParquet</option>
                      <option value="xyz">XYZ tiles</option>
                      <option value="zarr">Zarr</option>
                      <option value="trajectory">Trajectory JSON</option>
                      <option value="copc">COPC point cloud</option>
                    </select>
                  </label>
                  <label>
                    Public URL
                    <input
                      type="url"
                      required
                      value={connectedUrl}
                      onChange={(event) => {
                        setConnectedUrl(event.target.value);
                        setConnectionDiscovery(null);
                      }}
                      placeholder="https://…"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={discoveringConnection || !connectedUrl.trim()}
                    onClick={() => void inspectConnection()}
                  >
                    {discoveringConnection
                      ? "Inspecting connection…"
                      : "Inspect connection"}
                  </button>
                  {connectionDiscovery ? (
                    <div
                      className={
                        connectionDiscovery.issues.length
                          ? "connection-report connection-report--warning"
                          : "connection-report"
                      }
                    >
                      <strong>
                        {connectionDiscovery.kind === "unknown"
                          ? "Format not identified"
                          : `${connectionDiscovery.kind} detected`}
                      </strong>
                      <span>
                        {connectionDiscovery.sizeBytes !== null
                          ? `${(connectionDiscovery.sizeBytes / 1_000_000).toFixed(1)} MB · `
                          : ""}
                        {connectionDiscovery.cors
                          ? "browser access confirmed"
                          : "browser access unconfirmed"}
                        {connectionDiscovery.byteRanges
                          ? " · byte ranges confirmed"
                          : ""}
                      </span>
                      {connectionDiscovery.issues.map((issue) => (
                        <small key={issue}>{issue}</small>
                      ))}
                      {connectionDiscovery.details.sourceLayers?.length ? (
                        <small>
                          Layers:{" "}
                          {connectionDiscovery.details.sourceLayers.join(", ")}
                        </small>
                      ) : null}
                      {connectionDiscovery.details.variables?.length ? (
                        <small>
                          Variables:{" "}
                          {connectionDiscovery.details.variables
                            .map(
                              (variable) =>
                                `${variable.name} (${variable.dimensions.join(" × ") || variable.shape.join(" × ")})`,
                            )
                            .join(", ")}
                        </small>
                      ) : null}
                      {connectionDiscovery.details.minZoom !== undefined ? (
                        <small>
                          Zooms {connectionDiscovery.details.minZoom}–
                          {connectionDiscovery.details.maxZoom}
                        </small>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={
                      connectionDiscovery?.reachable === false ||
                      connectionDiscovery?.issues.some((issue) =>
                        issue.startsWith("The server returned"),
                      )
                    }
                  >
                    <Link size={16} /> Connect and add chapter
                  </button>
                </form>
              </section>
              {examples?.connections.length ? (
                <section>
                  <h3>Example data</h3>
                  <p>Add a ready-to-use public connection and map chapter.</p>
                  <div className="example-data-list">
                    {examples.connections.map((example) => (
                      <button
                        key={example.id}
                        type="button"
                        onClick={() => addExampleConnection(example)}
                      >
                        <span>{example.kind}</span>
                        <strong>{example.title}</strong>
                        <small>{example.description}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
          {inspectorMode === "story" ? (
            <div className="story-settings">
              <label>
                Story title
                <input
                  value={project.metadata.title}
                  onChange={(event) =>
                    changeProject((current) => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        title: event.target.value,
                      },
                    }))
                  }
                />
              </label>
              <div className="field-row">
                <label>
                  Story description
                  <textarea
                    rows={2}
                    value={project.metadata.description}
                    onChange={(event) =>
                      changeProject((current) => ({
                        ...current,
                        metadata: {
                          ...current.metadata,
                          description: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Author or organization
                  <input
                    value={project.metadata.author ?? ""}
                    onChange={(event) =>
                      changeProject((current) => ({
                        ...current,
                        metadata: {
                          ...current.metadata,
                          author: event.target.value || null,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Story theme
                  <select
                    value={project.publication.theme}
                    onChange={(event) =>
                      changeProject((current) => ({
                        ...current,
                        publication: {
                          ...current.publication,
                          theme: event.target.value as "cng" | "editorial",
                        },
                      }))
                    }
                  >
                    <option value="cng">Earth Stories</option>
                    <option value="editorial">Field Journal</option>
                  </select>
                  <small>
                    Changes the visual treatment, not how the story is
                    published.
                  </small>
                </label>
              </div>
              <details className="basemap-settings">
                <summary>Basemap and credits</summary>
                <div className="field-row">
                  <label>
                    Map style URL
                    <input
                      type="url"
                      value={basemapStyleDraft}
                      onChange={(event) =>
                        setBasemapStyleDraft(event.target.value)
                      }
                      onBlur={() => {
                        try {
                          const parsed = new URL(basemapStyleDraft);
                          if (
                            parsed.protocol !== "http:" &&
                            parsed.protocol !== "https:"
                          )
                            throw new Error();
                          changeProject((current) => ({
                            ...current,
                            basemap: {
                              ...current.basemap,
                              styleUrl: basemapStyleDraft,
                            },
                          }));
                        } catch {
                          setBasemapStyleDraft(project.basemap.styleUrl);
                          setError(
                            "Map style URL must be a valid HTTP or HTTPS URL.",
                          );
                        }
                      }}
                    />
                  </label>
                  <label>
                    Basemap attribution
                    <input
                      value={project.basemap.attribution ?? ""}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          basemap: {
                            ...current.basemap,
                            attribution: event.target.value || null,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </details>
            </div>
          ) : null}
          {inspectorMode === "chapter" && selectedChapter ? (
            <>
              <label>
                Chapter title
                <input
                  value={selectedChapter.title}
                  onChange={(event) =>
                    changeProject((current) => ({
                      ...current,
                      chapters: current.chapters.map((chapter) =>
                        chapter.id === selectedChapter.id
                          ? { ...chapter, title: event.target.value }
                          : chapter,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Narrative
                <textarea
                  rows={5}
                  value={selectedChapter.narrative}
                  onChange={(event) =>
                    changeProject((current) => ({
                      ...current,
                      chapters: current.chapters.map((chapter) =>
                        chapter.id === selectedChapter.id
                          ? { ...chapter, narrative: event.target.value }
                          : chapter,
                      ),
                    }))
                  }
                />
              </label>
              {selectedChapter.type === "video" ? (
                <div className="field-row">
                  <label>
                    Provider
                    <select
                      value={selectedChapter.provider}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "video"
                              ? {
                                  ...chapter,
                                  provider: event.target.value as
                                    "youtube" | "vimeo",
                                }
                              : chapter,
                          ),
                        }))
                      }
                    >
                      <option value="youtube">YouTube</option>
                      <option value="vimeo">Vimeo</option>
                    </select>
                  </label>
                  <label>
                    Video ID
                    <input
                      value={selectedChapter.videoId}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "video"
                              ? { ...chapter, videoId: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Original URL
                    <input
                      type="url"
                      value={selectedChapter.originalUrl}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "video"
                              ? { ...chapter, originalUrl: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {selectedChapter.type === "image" ? (
                <div className="field-row">
                  <label>
                    Alternative text
                    <input
                      value={selectedChapter.alt}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "image"
                              ? { ...chapter, alt: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Caption
                    <input
                      value={selectedChapter.caption}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "image"
                              ? { ...chapter, caption: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {selectedChapter.type === "chart" ? (
                <div className="field-row">
                  <label>
                    Chart style
                    <select
                      value={selectedChapter.chartType}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? {
                                  ...chapter,
                                  chartType: event.target.value as
                                    "bar" | "line",
                                }
                              : chapter,
                          ),
                        }))
                      }
                    >
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                    </select>
                  </label>
                  <label>
                    X column
                    <input
                      value={selectedChapter.xColumn}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? { ...chapter, xColumn: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Y column
                    <input
                      value={selectedChapter.yColumn}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? { ...chapter, yColumn: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Additional Y columns
                    <input
                      placeholder="temperature, rainfall"
                      value={(selectedChapter.yColumns ?? []).join(", ")}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? {
                                  ...chapter,
                                  yColumns: event.target.value
                                    .split(",")
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Y scale
                    <select
                      value={selectedChapter.yScale ?? "linear"}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? {
                                  ...chapter,
                                  yScale: event.target.value as
                                    "linear" | "log",
                                }
                              : chapter,
                          ),
                        }))
                      }
                    >
                      <option value="linear">Linear</option>
                      <option value="log">Logarithmic</option>
                    </select>
                  </label>
                  <label>
                    X-axis label
                    <input
                      value={selectedChapter.xLabel ?? ""}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? { ...chapter, xLabel: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Y-axis label
                    <input
                      value={selectedChapter.yLabel ?? ""}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "chart"
                              ? { ...chapter, yLabel: event.target.value }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {selectedChapter.type === "flyover" ? (
                <div className="field-row">
                  <label>
                    Primary map source
                    <select
                      value={selectedChapter.sourceId ?? ""}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "flyover"
                              ? {
                                  ...chapter,
                                  sourceId: event.target.value || null,
                                }
                              : chapter,
                          ),
                        }))
                      }
                    >
                      <option value="">Basemap only</option>
                      {project.sources
                        .filter(
                          (source) =>
                            source.kind !== "image" && source.kind !== "csv",
                        )
                        .map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Scroll length
                    <input
                      type="number"
                      min=".5"
                      max="5"
                      step=".25"
                      value={selectedChapter.scrollLength}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            chapter.type === "flyover"
                              ? {
                                  ...chapter,
                                  scrollLength: Math.min(
                                    5,
                                    Math.max(
                                      0.5,
                                      Number(event.target.value) || 0.5,
                                    ),
                                  ),
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  {selectedChapter.keyframes.map((keyframe, index) => (
                    <fieldset key={index}>
                      <legend>Keyframe {index + 1}</legend>
                      <label>
                        Longitude
                        <input
                          type="number"
                          value={keyframe.center[0]}
                          onChange={(event) =>
                            changeProject((current) => ({
                              ...current,
                              chapters: current.chapters.map((chapter) =>
                                chapter.id === selectedChapter.id &&
                                chapter.type === "flyover"
                                  ? {
                                      ...chapter,
                                      keyframes: chapter.keyframes.map(
                                        (frame, frameIndex) =>
                                          frameIndex === index
                                            ? {
                                                ...frame,
                                                center: [
                                                  Number(event.target.value),
                                                  frame.center[1],
                                                ],
                                              }
                                            : frame,
                                      ),
                                    }
                                  : chapter,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Latitude
                        <input
                          type="number"
                          value={keyframe.center[1]}
                          onChange={(event) =>
                            changeProject((current) => ({
                              ...current,
                              chapters: current.chapters.map((chapter) =>
                                chapter.id === selectedChapter.id &&
                                chapter.type === "flyover"
                                  ? {
                                      ...chapter,
                                      keyframes: chapter.keyframes.map(
                                        (frame, frameIndex) =>
                                          frameIndex === index
                                            ? {
                                                ...frame,
                                                center: [
                                                  frame.center[0],
                                                  Number(event.target.value),
                                                ],
                                              }
                                            : frame,
                                      ),
                                    }
                                  : chapter,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Zoom
                        <input
                          type="number"
                          value={keyframe.zoom}
                          onChange={(event) =>
                            changeProject((current) => ({
                              ...current,
                              chapters: current.chapters.map((chapter) =>
                                chapter.id === selectedChapter.id &&
                                chapter.type === "flyover"
                                  ? {
                                      ...chapter,
                                      keyframes: chapter.keyframes.map(
                                        (frame, frameIndex) =>
                                          frameIndex === index
                                            ? {
                                                ...frame,
                                                zoom: Number(
                                                  event.target.value,
                                                ),
                                              }
                                            : frame,
                                      ),
                                    }
                                  : chapter,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Pitch
                        <input
                          type="number"
                          value={keyframe.pitch}
                          onChange={(event) =>
                            changeProject((current) => ({
                              ...current,
                              chapters: current.chapters.map((chapter) =>
                                chapter.id === selectedChapter.id &&
                                chapter.type === "flyover"
                                  ? {
                                      ...chapter,
                                      keyframes: chapter.keyframes.map(
                                        (frame, frameIndex) =>
                                          frameIndex === index
                                            ? {
                                                ...frame,
                                                pitch: Number(
                                                  event.target.value,
                                                ),
                                              }
                                            : frame,
                                      ),
                                    }
                                  : chapter,
                              ),
                            }))
                          }
                        />
                      </label>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      changeProject((current) => ({
                        ...current,
                        chapters: current.chapters.map((chapter) =>
                          chapter.id === selectedChapter.id &&
                          chapter.type === "flyover"
                            ? {
                                ...chapter,
                                keyframes: [
                                  ...chapter.keyframes,
                                  structuredClone(chapter.keyframes.at(-1)!),
                                ],
                              }
                            : chapter,
                        ),
                      }))
                    }
                  >
                    Add keyframe
                  </button>
                </div>
              ) : null}
              {selectedChapter.type === "map" ||
              selectedChapter.type === "scrolly" ? (
                <div className="field-row">
                  <section className="chapter-data-config">
                    <div className="chapter-data-config__heading">
                      <div>
                        <strong>Dataset</strong>
                        <small>
                          Choose, import, or connect data for this map.
                        </small>
                      </div>
                    </div>
                    <label>
                      Active dataset
                      <select
                        value={selectedChapter.sourceId}
                        onChange={(event) =>
                          assignSourceToChapter(
                            selectedChapter.id,
                            event.target.value,
                          )
                        }
                      >
                        {!project.sources.some(
                          (source) =>
                            source.id === selectedChapter.sourceId &&
                            source.kind !== "image" &&
                            source.kind !== "csv",
                        ) ? (
                          <option value={selectedChapter.sourceId} disabled>
                            Dataset unavailable
                          </option>
                        ) : null}
                        {project.sources
                          .filter(
                            (source) =>
                              source.kind !== "image" && source.kind !== "csv",
                          )
                          .map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.label} · {source.kind}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="file-import">
                      <FileArrowUp size={16} /> Import map data
                      <input
                        type="file"
                        accept=".tif,.tiff,.zip,.nc,.netcdf,.h5,.hdf5,.las,.laz,.gpx,.geojson,.json,.pmtiles,.parquet"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleFile(file, selectedChapter.id);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {project.dataAssets.some(
                      (asset) => !asset.preparedSourceId,
                    ) ? (
                      <div className="chapter-data-assets">
                        <small>Files that need preparation</small>
                        {project.dataAssets
                          .filter((asset) => !asset.preparedSourceId)
                          .map((asset) => {
                            const job = conversionJobs[asset.id];
                            const jobRunning =
                              job?.status === "queued" ||
                              job?.status === "running";
                            return (
                              <div key={asset.id}>
                                <span>{asset.label}</span>
                                <button
                                  type="button"
                                  disabled={jobRunning}
                                  onClick={() =>
                                    void runDataAssetJob(asset, "inspect")
                                  }
                                >
                                  Inspect
                                </button>
                                <button
                                  type="button"
                                  disabled={jobRunning}
                                  onClick={() =>
                                    void runDataAssetJob(
                                      asset,
                                      "prepare",
                                      selectedChapter.id,
                                    )
                                  }
                                >
                                  Prepare &amp; use
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    ) : null}
                    <details className="chapter-data-connect">
                      <summary>Connect a public dataset</summary>
                      <form
                        className="data-connect"
                        onSubmit={(event) =>
                          addConnected(event, selectedChapter.id)
                        }
                      >
                        <label>
                          Data format
                          <select
                            value={connectedKind}
                            onChange={(event) =>
                              setConnectedKind(
                                event.target.value as typeof connectedKind,
                              )
                            }
                          >
                            <option value="cog">COG</option>
                            <option value="pmtiles">PMTiles</option>
                            <option value="geoparquet">GeoParquet</option>
                            <option value="xyz">XYZ tiles</option>
                            <option value="zarr">Zarr</option>
                            <option value="trajectory">Trajectory JSON</option>
                            <option value="copc">COPC point cloud</option>
                          </select>
                        </label>
                        <label>
                          Public data URL
                          <input
                            type="url"
                            required
                            value={connectedUrl}
                            onChange={(event) => {
                              setConnectedUrl(event.target.value);
                              setConnectionDiscovery(null);
                            }}
                            placeholder="https://…/data.tif"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={
                            discoveringConnection || !connectedUrl.trim()
                          }
                          onClick={() => void inspectConnection()}
                        >
                          {discoveringConnection
                            ? "Inspecting…"
                            : "Inspect connection"}
                        </button>
                        {connectionDiscovery ? (
                          <div
                            className={
                              connectionDiscovery.issues.length
                                ? "connection-report connection-report--warning"
                                : "connection-report"
                            }
                          >
                            <strong>
                              {connectionDiscovery.kind === "unknown"
                                ? "Format not identified"
                                : `${connectionDiscovery.kind} detected`}
                            </strong>
                            {connectionDiscovery.issues.map((issue) => (
                              <small key={issue}>{issue}</small>
                            ))}
                          </div>
                        ) : null}
                        <button
                          type="submit"
                          disabled={
                            connectionDiscovery?.reachable === false ||
                            connectionDiscovery?.issues.some((issue) =>
                              issue.startsWith("The server returned"),
                            )
                          }
                        >
                          <Link size={16} /> Connect &amp; use dataset
                        </button>
                      </form>
                    </details>
                  </section>
                  <label>
                    Presentation
                    <select
                      value={selectedChapter.type}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  type: event.target.value as "map" | "scrolly",
                                }
                              : chapter,
                          ),
                        }))
                      }
                    >
                      <option value="map">Standard map</option>
                      <option value="scrolly">Sticky scrollytelling</option>
                    </select>
                  </label>
                  <label>
                    Zoom
                    <input
                      type="number"
                      min="0"
                      max="22"
                      step="0.25"
                      value={selectedChapter.camera.zoom}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    zoom: Number(event.target.value),
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      step="0.0001"
                      value={selectedChapter.camera.center[0]}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    center: [
                                      Number(event.target.value),
                                      chapter.camera.center[1],
                                    ],
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Latitude
                    <input
                      type="number"
                      min="-85"
                      max="85"
                      step="0.0001"
                      value={selectedChapter.camera.center[1]}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    center: [
                                      chapter.camera.center[0],
                                      Number(event.target.value),
                                    ],
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Bearing
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      value={selectedChapter.camera.bearing}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    bearing: Number(event.target.value),
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Pitch
                    <input
                      type="number"
                      min="0"
                      max="85"
                      value={selectedChapter.camera.pitch}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    pitch: Number(event.target.value),
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedChapter.camera.globe ?? false}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    globe: event.target.checked,
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />{" "}
                    Globe projection
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedChapter.camera.terrain?.enabled ?? false}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    terrain: {
                                      enabled: event.target.checked,
                                      exaggeration:
                                        chapter.camera.terrain?.exaggeration ??
                                        1,
                                    },
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />{" "}
                    Terrain
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedChapter.camera.buildings ?? false}
                      onChange={(event) =>
                        changeProject((current) => ({
                          ...current,
                          chapters: current.chapters.map((chapter) =>
                            chapter.id === selectedChapter.id &&
                            (chapter.type === "map" ||
                              chapter.type === "scrolly")
                              ? {
                                  ...chapter,
                                  camera: {
                                    ...chapter.camera,
                                    buildings: event.target.checked,
                                  },
                                }
                              : chapter,
                          ),
                        }))
                      }
                    />{" "}
                    3D buildings
                  </label>
                  <fieldset>
                    <legend>Overlays</legend>
                    {project.sources
                      .filter(
                        (source) =>
                          source.id !== selectedChapter.sourceId &&
                          source.kind !== "image" &&
                          source.kind !== "csv",
                      )
                      .map((source) => (
                        <label key={source.id}>
                          <input
                            type="checkbox"
                            checked={(
                              selectedChapter.overlaySourceIds ?? []
                            ).includes(source.id)}
                            onChange={(event) =>
                              changeProject((current) => ({
                                ...current,
                                chapters: current.chapters.map((chapter) =>
                                  chapter.id === selectedChapter.id &&
                                  (chapter.type === "map" ||
                                    chapter.type === "scrolly")
                                    ? {
                                        ...chapter,
                                        overlaySourceIds: event.target.checked
                                          ? [
                                              ...(chapter.overlaySourceIds ??
                                                []),
                                              source.id,
                                            ]
                                          : (
                                              chapter.overlaySourceIds ?? []
                                            ).filter((id) => id !== source.id),
                                      }
                                    : chapter,
                                ),
                              }))
                            }
                          />{" "}
                          {source.label}
                        </label>
                      ))}
                  </fieldset>
                </div>
              ) : null}
              {selectedSource ? (
                <fieldset className="source-presentation">
                  <legend>Data and map presentation</legend>
                  <div className="field-row">
                    <label>
                      Source label
                      <input
                        value={selectedSource.label}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            label: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Attribution
                      <input
                        value={selectedSource.attribution ?? ""}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            attribution: event.target.value || null,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Publication data policy
                      <select
                        value={selectedSource.delivery}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            delivery: event.target.value as
                              "auto" | "included" | "connected",
                          }))
                        }
                      >
                        <option value="auto">Follow publication profile</option>
                        {selectedSource.kind !== "zarr" ? (
                          <option value="included">Always include</option>
                        ) : null}
                        {selectedSource.kind !== "local-geojson" &&
                        selectedSource.kind !== "image" &&
                        selectedSource.kind !== "csv" ? (
                          <option value="connected">Always connect</option>
                        ) : null}
                      </select>
                    </label>
                    {selectedSource.kind === "zarr" ? (
                      <>
                        <label>
                          Variable
                          <input
                            value={selectedSource.variable}
                            onChange={(event) =>
                              updateSelectedSource((source) =>
                                source.kind === "zarr"
                                  ? { ...source, variable: event.target.value }
                                  : source,
                              )
                            }
                          />
                        </label>
                        <label>
                          Time dimension
                          <input
                            value={selectedSource.timeDimension ?? ""}
                            onChange={(event) =>
                              updateSelectedSource((source) =>
                                source.kind === "zarr"
                                  ? {
                                      ...source,
                                      timeDimension: event.target.value || null,
                                    }
                                  : source,
                              )
                            }
                          />
                        </label>
                        <label>
                          Fixed slices
                          <input
                            placeholder="band=1, level=0"
                            value={Object.entries(selectedSource.selection)
                              .map(([key, value]) => `${key}=${value}`)
                              .join(", ")}
                            onChange={(event) =>
                              updateSelectedSource((source) =>
                                source.kind === "zarr"
                                  ? {
                                      ...source,
                                      selection: Object.fromEntries(
                                        event.target.value
                                          .split(",")
                                          .flatMap((part) => {
                                            const [key, raw] = part
                                              .split("=")
                                              .map((value) => value.trim());
                                            const value = Number(raw);
                                            return key &&
                                              Number.isInteger(value) &&
                                              value >= 0
                                              ? [[key, value]]
                                              : [];
                                          }),
                                      ),
                                    }
                                  : source,
                              )
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {selectedSource.kind === "copc" ? (
                      <>
                        <label>
                          Point color
                          <select
                            value={selectedSource.colorMode}
                            onChange={(event) =>
                              updateSelectedSource((source) =>
                                source.kind === "copc"
                                  ? {
                                      ...source,
                                      colorMode: event.target.value as
                                        | "elevation"
                                        | "intensity"
                                        | "classification"
                                        | "rgb",
                                    }
                                  : source,
                              )
                            }
                          >
                            <option value="elevation">Elevation</option>
                            <option value="intensity">Intensity</option>
                            <option value="classification">
                              Classification
                            </option>
                            <option value="rgb">RGB</option>
                          </select>
                        </label>
                        <label>
                          Point size
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step=".5"
                            value={selectedSource.pointSize}
                            onChange={(event) =>
                              updateSelectedSource((source) =>
                                source.kind === "copc"
                                  ? {
                                      ...source,
                                      pointSize: Number(event.target.value),
                                    }
                                  : source,
                              )
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {selectedSource.kind === "trajectory" ? (
                      <label>
                        Trail length
                        <input
                          type="number"
                          min="1"
                          value={selectedSource.trailLength}
                          onChange={(event) =>
                            updateSelectedSource((source) =>
                              source.kind === "trajectory"
                                ? {
                                    ...source,
                                    trailLength: Number(event.target.value),
                                  }
                                : source,
                            )
                          }
                        />
                      </label>
                    ) : null}
                    <label>
                      Layer opacity
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedPresentation.opacity}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            presentation: {
                              ...selectedPresentation,
                              opacity: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Fill color
                      <input
                        type="color"
                        value={selectedPresentation.color}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            presentation: {
                              ...selectedPresentation,
                              color: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Outline color
                      <input
                        type="color"
                        value={selectedPresentation.strokeColor}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            presentation: {
                              ...selectedPresentation,
                              strokeColor: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    {(selectedSource.kind === "local-geojson" ||
                      selectedSource.kind === "geoparquet" ||
                      (selectedSource.kind === "pmtiles" &&
                        selectedSource.tileType === "vector")) && (
                      <>
                        <label>
                          Color by property
                          <input
                            value={selectedPresentation.symbolProperty ?? ""}
                            placeholder="e.g. category"
                            onChange={(event) =>
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  symbolProperty: event.target.value || null,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Category colors
                          <input
                            value={
                              categoryColorsDraft ??
                              Object.entries(
                                selectedPresentation.categoryColors,
                              )
                                .map(([value, color]) => `${value}=${color}`)
                                .join(", ")
                            }
                            placeholder="forest=#2f7d32, water=#2878b5"
                            onBlur={() => setCategoryColorsDraft(null)}
                            onChange={(event) => {
                              setCategoryColorsDraft(event.target.value);
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  categoryColors: Object.fromEntries(
                                    event.target.value
                                      .split(",")
                                      .flatMap((part) => {
                                        const separator = part.lastIndexOf("=");
                                        if (separator < 1) return [];
                                        const value = part
                                          .slice(0, separator)
                                          .trim();
                                        const color = part
                                          .slice(separator + 1)
                                          .trim();
                                        return value &&
                                          /^#[0-9a-f]{6}$/i.test(color)
                                          ? [[value, color]]
                                          : [];
                                      }),
                                  ),
                                },
                              }));
                            }}
                          />
                          <small>
                            Use value=#rrggbb pairs separated by commas.
                          </small>
                        </label>
                        <label>
                          Filter property
                          <input
                            value={selectedPresentation.filterProperty ?? ""}
                            placeholder="e.g. status"
                            onChange={(event) =>
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  filterProperty: event.target.value || null,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Filter value
                          <input
                            value={selectedPresentation.filterValue ?? ""}
                            placeholder="Exact value"
                            onChange={(event) =>
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  filterValue: event.target.value || null,
                                },
                              }))
                            }
                          />
                        </label>
                      </>
                    )}
                    {selectedSource.kind === "cog" ? (
                      <>
                        <label>
                          Raster band
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={selectedPresentation.rasterBand}
                            onChange={(event) =>
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  rasterBand: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Color ramp
                          <select
                            value={selectedPresentation.colormap}
                            onChange={(event) =>
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  colormap: event.target.value as
                                    | "viridis"
                                    | "magma"
                                    | "terrain"
                                    | "grayscale",
                                },
                              }))
                            }
                          >
                            <option value="viridis">Viridis</option>
                            <option value="magma">Magma</option>
                            <option value="terrain">Terrain</option>
                            <option value="grayscale">Grayscale</option>
                          </select>
                        </label>
                        <label>
                          Rescale minimum
                          <input
                            type="number"
                            value={selectedPresentation.rescale?.[0] ?? ""}
                            placeholder="Use source values"
                            onChange={(event) => {
                              const value = event.target.value;
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  rescale: value
                                    ? [
                                        Number(value),
                                        selectedPresentation.rescale?.[1] ?? 1,
                                      ]
                                    : null,
                                },
                              }));
                            }}
                          />
                        </label>
                        <label>
                          Rescale maximum
                          <input
                            type="number"
                            value={selectedPresentation.rescale?.[1] ?? ""}
                            placeholder="Use source values"
                            onChange={(event) => {
                              const value = event.target.value;
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  rescale: value
                                    ? [
                                        selectedPresentation.rescale?.[0] ?? 0,
                                        Number(value),
                                      ]
                                    : null,
                                },
                              }));
                            }}
                          />
                        </label>
                        <label>
                          Raster category colors
                          <input
                            value={
                              categoryColorsDraft ??
                              Object.entries(
                                selectedPresentation.categoryColors,
                              )
                                .map(([value, color]) => `${value}=${color}`)
                                .join(", ")
                            }
                            placeholder="0=#2878b5, 1=#2f7d32"
                            onBlur={() => setCategoryColorsDraft(null)}
                            onChange={(event) => {
                              setCategoryColorsDraft(event.target.value);
                              updateSelectedSource((source) => ({
                                ...source,
                                presentation: {
                                  ...selectedPresentation,
                                  categoryColors: Object.fromEntries(
                                    event.target.value
                                      .split(",")
                                      .flatMap((part) => {
                                        const separator = part.lastIndexOf("=");
                                        const value = part
                                          .slice(0, separator)
                                          .trim();
                                        const color = part
                                          .slice(separator + 1)
                                          .trim();
                                        return separator > 0 &&
                                          Number.isFinite(Number(value)) &&
                                          /^#[0-9a-f]{6}$/i.test(color)
                                          ? [[value, color]]
                                          : [];
                                      }),
                                  ),
                                },
                              }));
                            }}
                          />
                          <small>
                            Requires a rescale range. Use value=#rrggbb pairs.
                          </small>
                        </label>
                      </>
                    ) : null}
                    <label>
                      Legend title
                      <input
                        value={selectedPresentation.legendTitle}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            presentation: {
                              ...selectedPresentation,
                              legendTitle: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={selectedPresentation.legendVisible}
                        onChange={(event) =>
                          updateSelectedSource((source) => ({
                            ...source,
                            presentation: {
                              ...selectedPresentation,
                              legendVisible: event.target.checked,
                            },
                          }))
                        }
                      />
                      Show legend
                    </label>
                    {selectedSource.kind === "pmtiles" &&
                    selectedSource.tileType === "vector" ? (
                      <label>
                        Source layer (optional)
                        <input
                          value={selectedPresentation.sourceLayer ?? ""}
                          onChange={(event) =>
                            updateSelectedSource((source) => ({
                              ...source,
                              presentation: {
                                ...selectedPresentation,
                                sourceLayer: event.target.value || null,
                              },
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    {selectedSource.kind === "pmtiles" ? (
                      <label>
                        PMTiles content
                        <select
                          value={selectedSource.tileType}
                          onChange={(event) =>
                            updateSelectedSource((source) =>
                              source.kind === "pmtiles"
                                ? {
                                    ...source,
                                    tileType: event.target.value as
                                      "vector" | "raster",
                                  }
                                : source,
                            )
                          }
                        >
                          <option value="vector">Vector tiles</option>
                          <option value="raster">Raster tiles</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                </fieldset>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="workspace-heading">
          <div>
            <p>Live story</p>
            <h1>Publication preview</h1>
          </div>
          <span>What you see here is what you export.</span>
        </div>
        {publication ? (
          <div className="preview-frame">
            <StoryViewer manifest={publication} />
          </div>
        ) : (
          <p className="error-message">
            {publicationResult.error ??
              "Give the story a title to generate its publication preview."}
          </p>
        )}
      </section>
      <PublishPanel
        open={publishOpen}
        project={project}
        onClose={() => setPublishOpen(false)}
        onBeforeExport={() =>
          saveState === "saved" ? Promise.resolve(project) : persist()
        }
        onProfileChange={async (profile) => {
          const next = {
            ...project,
            publication: { ...project.publication, profile },
          };
          try {
            setSaveState("saving");
            const saved = await saveProject(next);
            setProject(saved);
            setSaveState("saved");
            await refreshProjects();
            return saved;
          } catch (cause) {
            setSaveState("save-error");
            showError(cause);
            return null;
          }
        }}
      />
    </div>
  );
}
