import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  BookOpen,
  FileArrowUp,
  FloppyDisk,
  Link,
  MapTrifold,
  Plus,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { deriveAuthoringReadiness } from "@earth-stories/publisher/readiness";
import { compileFocusedChapter } from "@earth-stories/publisher/focused-preview";
import type {
  Camera,
  ConversionCapability,
  ProjectDataAsset,
  ProjectChapter,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import { createDefaultSourceProvenance } from "@earth-stories/story-schema";
import { StoryViewer } from "@earth-stories/viewer";
import {
  ActionButton,
  BrandSpinner,
  GuidancePrompt,
  SaveStatus,
  StatePanel,
} from "@earth-stories/ui";
import { reorderChapters } from "./chapterOrder";
import {
  createProject,
  actOnConversionJob,
  createExampleStory,
  discoverSource,
  getExamples,
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
import { ChapterRail } from "./ChapterRail";
import type { EditorRegion } from "./EditorViewTabs";
import { ChapterCanvas, type CanvasMode } from "./ChapterCanvas";
import { ChapterInspector } from "./ChapterInspector";
import { SourceDetailsEditor } from "./SourceDetailsEditor";
import { deriveChapterReadiness, referencedSources } from "./chapterReadiness";
import { EditorShell } from "./EditorShell";
import { parseRoute, routePath, type AppRoute } from "./routing";
import { PublishMenu } from "./PublishMenu";
import { nextGuidanceAction, workflowStages } from "./editorReadiness";
import type { GuidanceDestination } from "./editorReadiness";
import { previewMatchesRevision, recordPreviewReceipt } from "./previewReceipt";
import { usePublicationReadiness } from "./usePublicationReadiness";
import { WorkflowStatusMenu } from "./WorkflowStatusMenu";
import { detectDesktopBridge } from "./desktop";
import { DesktopToolsPanel } from "./DesktopToolsPanel";
import { ProvisioningDialog } from "./ProvisioningDialog";
import { resolvePreviewManifest } from "./resolvePreviewManifest";
import { captureKeyframe } from "./flyoverPath";
import { pollConversionJob } from "./conversionPolling";

type SaveState = "saved" | "changed" | "saving" | "save-error" | "exporting";
type InspectorMode = "chapter" | "story" | "data";
type PendingChapterType = "map" | "scrolly" | "image" | "chart";
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
export function App() {
  const [desktop] = useState(detectDesktopBridge);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(
    () =>
      desktop !== null &&
      (sessionStorage.getItem("earth-stories:workspace-settings") === "open" ||
        new URLSearchParams(window.location.search).get("workspace") ===
          "settings"),
  );
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const persistedProjectRef = useRef<StoryProject | null>(null);
  const prePublishViewRef = useRef<{
    canvasMode: CanvasMode;
    editorRegion: EditorRegion;
  } | null>(null);
  const routeLoadRef = useRef(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [route, setRoute] = useState<AppRoute>(() =>
    parseRoute(window.location.pathname),
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
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [examples, setExamples] = useState<ExampleCatalog | null>(null);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("chapter");
  const [editorRegion, setEditorRegion] = useState<EditorRegion>("edit");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("chapter");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [pendingChapterType, setPendingChapterType] =
    useState<PendingChapterType | null>(null);
  const [initialFitScopes, setInitialFitScopes] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentCanvasCamera, setCurrentCanvasCamera] = useState<Camera | null>(
    null,
  );
  const [flyoverPreviewCamera, setFlyoverPreviewCamera] =
    useState<Camera | null>(null);
  const [addChapterOpen, setAddChapterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conversionJobs, setConversionJobs] = useState<
    Record<string, ConversionJobSnapshot>
  >({});
  const conversionIntents = useRef<
    Record<
      string,
      {
        operation: "inspect" | "prepare";
        capability: ConversionCapability;
        targetChapterId?: string;
        pendingChapterType: PendingChapterType | null;
      }
    >
  >({});
  const [multidimChoices, setMultidimChoices] = useState<
    Record<string, MultidimChoice>
  >({});
  const [previewReceiptVersion, setPreviewReceiptVersion] = useState(0);
  const chapterAddRef = useRef<HTMLDivElement>(null);
  const publicationReadiness = usePublicationReadiness(project);
  const pendingProvisioning = Object.entries(conversionJobs).find(
    ([, job]) =>
      job.status === "awaiting-approval" &&
      job.events.some((event) => event.type === "provisioning-disclosure"),
  );

  useEffect(() => {
    if (!desktop || !workspaceSettingsOpen || workspacePath !== null) return;
    let current = true;
    void desktop.workspacePath().then((path) => {
      if (current) setWorkspacePath(path);
    });
    return () => {
      current = false;
    };
  }, [desktop, workspacePath, workspaceSettingsOpen]);

  function navigate(next: AppRoute, replace = false) {
    window.history[replace ? "replaceState" : "pushState"](
      null,
      "",
      routePath(next),
    );
    setRoute(next);
  }

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => {
    getExamples()
      .then(setExamples)
      .catch(() => undefined);
    listProjects()
      .then(async (items) => {
        setProjects(items);
        const initialRoute = parseRoute(window.location.pathname);
        if (initialRoute.page === "story") {
          const token = ++routeLoadRef.current;
          const opened = await openProject(initialRoute.storyId);
          if (routeLoadRef.current === token) activate(opened);
        }
      })
      .catch(showError)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const syncRoute = () => {
      const token = ++routeLoadRef.current;
      const next = parseRoute(window.location.pathname);
      setRoute(next);
      setPublishMenuOpen(false);
      setPublishOpen(false);
      void (async () => {
        if (
          project &&
          (next.page !== "story" || next.storyId !== project.id) &&
          (saveState === "changed" || saveState === "save-error") &&
          !(await persist()) &&
          !window.confirm(
            "Earth Stories could not save your changes. Leave without saving?",
          )
        ) {
          if (routeLoadRef.current !== token) return;
          navigate({ page: "story", storyId: project.id, preview: false });
          return;
        }
        if (routeLoadRef.current !== token) return;
        if (next.page === "story" && project?.id !== next.storyId) {
          const opened = await openProject(next.storyId);
          if (routeLoadRef.current === token) activate(opened);
        } else if (next.page !== "story" && routeLoadRef.current === token)
          setProject(null);
      })().catch(showError);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [project, saveState]);
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
  useEffect(() => {
    if (publishOpen && saveState === "saved") void publicationReadiness.load();
  }, [
    publishOpen,
    project?.id,
    project?.metadata.updated,
    project?.publication.profile,
    publicationReadiness.load,
    saveState,
  ]);
  function showError(cause: unknown) {
    setError(
      cause instanceof Error
        ? cause.message
        : "Earth Stories could not complete that action",
    );
  }
  function activate(next: StoryProject) {
    setProject(next);
    persistedProjectRef.current = structuredClone(next);
    setBasemapStyleDraft(next.basemap.styleUrl);
    setActiveChapter(next.chapters[0]?.id ?? "");
    setInspectorMode("chapter");
    setEditorRegion("edit");
    setCanvasMode("chapter");
    setPendingChapterType(null);
    setAddChapterOpen(false);
    setSaveState("saved");
  }
  function changeProject(update: (current: StoryProject) => StoryProject) {
    setProject((current) => (current ? update(current) : current));
    setSaveState("changed");
    setError(null);
  }

  const localReadiness = useMemo(
    () => (project ? deriveAuthoringReadiness(project) : null),
    [project],
  );
  const chapterReadiness = useMemo(
    () =>
      project && localReadiness
        ? deriveChapterReadiness(project, localReadiness.findings)
        : {},
    [localReadiness, project],
  );
  const publicationResult = useMemo(() => {
    if (!project || !localReadiness?.manifest)
      return {
        manifest: null,
        error:
          localReadiness?.findings.find(({ id }) => id === "compile")
            ?.message ?? null,
      };
    return {
      error: null,
      manifest: resolvePreviewManifest(project, localReadiness.manifest),
    };
  }, [localReadiness, project]);
  const publication = publicationResult.manifest;
  useEffect(() => {
    if (project && route.page === "story" && route.preview && publication)
      recordPreviewReceipt(project.id, project.metadata.updated);
  }, [
    project?.id,
    project?.metadata.updated,
    publication,
    route.page,
    route.page === "story" ? route.preview : false,
  ]);
  const selectedChapter = project?.chapters.find(
    (chapter) => chapter.id === activeChapter,
  );
  useEffect(() => {
    setCurrentCanvasCamera(null);
    setFlyoverPreviewCamera(null);
  }, [selectedChapter?.id]);
  const focusedPublicationResult = useMemo(() => {
    if (!project || !selectedChapter)
      return { manifest: null, error: "Choose a chapter to start editing." };
    if (publication) return { manifest: publication, error: null };
    const result = compileFocusedChapter(project, selectedChapter.id);
    return result.status === "ready"
      ? {
          manifest: resolvePreviewManifest(project, result.manifest),
          error: null,
        }
      : { manifest: null, error: result.message };
  }, [project, publication, selectedChapter]);
  const savedChapter = persistedProjectRef.current?.chapters.find(
    (chapter) => chapter.id === selectedChapter?.id,
  );
  const savedChapterCamera =
    savedChapter && "camera" in savedChapter ? savedChapter.camera : null;
  const selectedSource =
    selectedChapter && "sourceId" in selectedChapter && selectedChapter.sourceId
      ? project?.sources.find(
          (source) => source.id === selectedChapter.sourceId,
        )
      : null;
  const selectedSourceDetails =
    project?.sources.find(({ id }) => id === selectedSourceId) ?? null;
  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = await createProject(newTitle.trim() || "Untitled story");
      activate(created);
      navigate({ page: "story", storyId: created.id, preview: false });
      setNewTitle("");
      await refreshProjects();
    } catch (cause) {
      showError(cause);
    }
  }
  async function handleOpen(id: string) {
    try {
      activate(await openProject(id));
      navigate({ page: "story", storyId: id, preview: false });
    } catch (cause) {
      showError(cause);
    }
  }
  async function handleShowProjectFolder(id: string) {
    if (!desktop) return;
    try {
      await desktop.showProjectFolder(id);
    } catch (cause) {
      showError(cause);
    }
  }
  async function openWorkspaceSettings() {
    if (!desktop) return;
    sessionStorage.setItem("earth-stories:workspace-settings", "open");
    setWorkspaceSettingsOpen(true);
    try {
      setWorkspacePath(await desktop.workspacePath());
    } catch (cause) {
      showError(cause);
    }
  }
  function closeWorkspaceSettings() {
    sessionStorage.removeItem("earth-stories:workspace-settings");
    if (new URLSearchParams(window.location.search).has("workspace"))
      window.history.replaceState(null, "", window.location.pathname);
    setWorkspaceSettingsOpen(false);
  }
  async function chooseWorkspace() {
    if (!desktop) return;
    setWorkspaceBusy(true);
    try {
      if (
        project &&
        (saveState === "changed" || saveState === "save-error") &&
        !(await persist())
      ) {
        setWorkspaceBusy(false);
        return;
      }
      const selected = await desktop.chooseWorkspace();
      if (!selected) setWorkspaceBusy(false);
    } catch (cause) {
      setWorkspaceBusy(false);
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
      const created = await createExampleStory(id);
      activate(created);
      navigate({ page: "story", storyId: created.id, preview: false });
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
      persistedProjectRef.current = structuredClone(saved);
      setSaveState("saved");
      publicationReadiness.invalidate();
      await refreshProjects();
      return saved;
    } catch (cause) {
      setSaveState("save-error");
      showError(cause);
      return null;
    }
  }

  const loadPublicationReadiness = useCallback(() => {
    if (saveState === "saved") void publicationReadiness.load();
  }, [publicationReadiness.load, saveState]);

  function addChapter(chapter: ProjectChapter) {
    changeProject((current) => ({
      ...current,
      chapters: [...current.chapters, chapter],
    }));
    setActiveChapter(chapter.id);
    setInspectorMode("chapter");
    setAddChapterOpen(false);
    if (
      (chapter.type === "map" || chapter.type === "scrolly") &&
      chapter.camera.center[0] === camera.center[0] &&
      chapter.camera.center[1] === camera.center[1] &&
      chapter.camera.zoom === camera.zoom
    )
      requestInitialFit(chapter.id, chapter.sourceId);
  }
  function requestInitialFit(chapterId: string, sourceId: string) {
    const scope = `${chapterId}:${sourceId}`;
    setInitialFitScopes((current) => {
      const next = new Set(current);
      next.add(scope);
      return next;
    });
  }
  function consumeInitialFit(chapterId: string, sourceId: string) {
    const scope = `${chapterId}:${sourceId}`;
    setInitialFitScopes((current) => {
      if (!current.has(scope)) return current;
      const next = new Set(current);
      next.delete(scope);
      return next;
    });
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
      originalUrl: "https://www.youtube.com/watch?v=VIDEO_ID",
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
        captureKeyframe(start),
        captureKeyframe({
          ...start,
          center: [start.center[0] + 8, start.center[1] + 4],
          zoom: start.zoom + 2,
          pitch: 55,
        }),
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
          provenance: createDefaultSourceProvenance(),
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
          provenance: createDefaultSourceProvenance(),
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
          provenance: createDefaultSourceProvenance(),
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
          provenance: createDefaultSourceProvenance(),
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
          provenance: createDefaultSourceProvenance(),
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
          provenance: createDefaultSourceProvenance(),
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
      const fulfillsCreationIntent =
        !pendingChapterType ||
        (pendingChapterType === "image" && source.kind === "image") ||
        (pendingChapterType === "chart" && source.kind === "csv") ||
        ((pendingChapterType === "map" || pendingChapterType === "scrolly") &&
          source.kind !== "image" &&
          source.kind !== "csv");
      const intendedChapter: ProjectChapter =
        pendingChapterType === "scrolly" && chapter.type === "map"
          ? {
              ...chapter,
              type: "scrolly",
              overlaySourceIds: [],
              transition: "fly-to",
              overlayPosition: "left",
            }
          : chapter;
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
          : fulfillsCreationIntent
            ? [...current.chapters, intendedChapter]
            : current.chapters,
      }));
      if (!targetChapterId && fulfillsCreationIntent) {
        setActiveChapter(intendedChapter.id);
        setInspectorMode("chapter");
        setPendingChapterType(null);
        if (
          intendedChapter.type === "map" ||
          intendedChapter.type === "scrolly"
        )
          requestInitialFit(intendedChapter.id, intendedChapter.sourceId);
      }
    } catch (cause) {
      showError(cause);
    }
  }
  function applyPreparedConversion(
    asset: ProjectDataAsset,
    job: ConversionJobSnapshot,
    intent: (typeof conversionIntents.current)[string],
  ) {
    if (intent.operation !== "prepare") return;
    const result = [...job.events]
      .reverse()
      .find((event) => event.type === "result");
    if (result?.type !== "result" || typeof result.output.path !== "string")
      throw new Error("The prepared data path was not returned");
    const sourceId = `prepared-${job.id}`;
    const common = {
      id: sourceId,
      label: asset.label.replace(/\.[^.]+$/, ""),
      locator: result.output.path,
      attribution: null,
      sizeBytes:
        typeof result.output.sizeBytes === "number"
          ? result.output.sizeBytes
          : null,
      delivery: "included" as const,
      provenance: createDefaultSourceProvenance(),
    };
    const source: ProjectSource =
      intent.capability === "raster" || intent.capability === "multidim"
        ? { ...common, kind: "cog" }
        : intent.capability === "pointcloud"
          ? { ...common, kind: "copc", colorMode: "elevation", pointSize: 2 }
          : asset.format === "gpx"
            ? { ...common, kind: "trajectory", trailLength: 600 }
            : { ...common, kind: "geoparquet" };
    const intendedChapter: ProjectChapter | null =
      !intent.targetChapterId &&
      (intent.pendingChapterType === "map" ||
        intent.pendingChapterType === "scrolly")
        ? {
            id: `${sourceId}-chapter`,
            type: intent.pendingChapterType,
            title: source.label,
            narrative: "",
            sourceId,
            overlaySourceIds: [],
            camera,
            ...(intent.pendingChapterType === "scrolly"
              ? {
                  transition: "fly-to" as const,
                  overlayPosition: "left" as const,
                }
              : {}),
          }
        : null;
    changeProject((current) => ({
      ...current,
      dataAssets: current.dataAssets.map((item) =>
        item.id === asset.id ? { ...item, preparedSourceId: sourceId } : item,
      ),
      sources: current.sources.some(({ id }) => id === sourceId)
        ? current.sources
        : [...current.sources, source],
      chapters: intent.targetChapterId
        ? current.chapters.map((chapter) =>
            chapter.id === intent.targetChapterId &&
            (chapter.type === "map" || chapter.type === "scrolly")
              ? { ...chapter, sourceId }
              : chapter,
          )
        : intendedChapter &&
            !current.chapters.some(({ id }) => id === intendedChapter.id)
          ? [...current.chapters, intendedChapter]
          : current.chapters,
    }));
    if (intendedChapter) {
      setActiveChapter(intendedChapter.id);
      setInspectorMode("chapter");
      setPendingChapterType(null);
      requestInitialFit(intendedChapter.id, sourceId);
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
      conversionIntents.current[asset.id] = {
        operation,
        capability,
        targetChapterId,
        pendingChapterType,
      };
      setConversionJobs((current) => ({ ...current, [asset.id]: started }));
      let job: ConversionJobSnapshot;
      try {
        const result = await pollConversionJob(started, {
          onUpdate: (job) =>
            setConversionJobs((current) => ({
              ...current,
              [asset.id]: job,
            })),
        });
        if (result.kind === "workspace-changed") {
          setConversionJobs((current) => {
            const next = { ...current };
            delete next[asset.id];
            return next;
          });
          setError(result.message);
          return;
        }
        job = result.job;
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
      applyPreparedConversion(asset, job, conversionIntents.current[asset.id]);
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
      provenance: createDefaultSourceProvenance(),
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
      type: pendingChapterType === "scrolly" ? "scrolly" : "map",
      title: source.label,
      narrative: "",
      sourceId: id,
      camera,
      ...(pendingChapterType === "scrolly"
        ? { transition: "fly-to" as const, overlayPosition: "left" as const }
        : {}),
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
    if (!targetChapterId) {
      setActiveChapter(chapter.id);
      setInspectorMode("chapter");
      if (pendingChapterType === "map" || pendingChapterType === "scrolly")
        setPendingChapterType(null);
      requestInitialFit(chapter.id, source.id);
    }
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
        !(await persist()) &&
        !window.confirm(
          "Earth Stories could not save your changes. Leave without saving?",
        )
      )
        return;
      setProject(null);
      navigate({ page: "stories" });
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
    const requestedType = pendingChapterType === "scrolly" ? "scrolly" : "map";
    const chapter: ProjectChapter = {
      id: crypto.randomUUID(),
      type: requestedType,
      title: example.title,
      narrative: example.description,
      sourceId: id,
      camera: example.camera,
      ...(requestedType === "scrolly"
        ? { transition: "fly-to" as const, overlayPosition: "left" as const }
        : {}),
    };
    changeProject((current) => ({
      ...current,
      sources: [...current.sources, source],
      chapters: [...current.chapters, chapter],
    }));
    setActiveChapter(chapter.id);
    setInspectorMode("chapter");
    if (pendingChapterType === "map" || pendingChapterType === "scrolly")
      setPendingChapterType(null);
  }

  const previewReviewed = Boolean(
    project &&
    saveState === "saved" &&
    previewMatchesRevision(project.id, project.metadata.updated),
  );
  void previewReceiptVersion;
  const guidance =
    project && localReadiness
      ? nextGuidanceAction({
          readiness: localReadiness,
          activeChapterId: activeChapter || null,
          activeChapterSourceIds: selectedChapter
            ? referencedSources(selectedChapter)
            : [],
          saveState,
          previewReviewed,
          preflight: publicationReadiness.state,
        })
      : null;
  const workflow =
    project && localReadiness
      ? workflowStages(localReadiness, {
          previewReviewed,
          preflight: publicationReadiness.state,
        })
      : [];
  const readinessFindings =
    saveState === "saved" && publicationReadiness.state.status === "ready"
      ? (publicationReadiness.state.result?.issues ??
        localReadiness?.findings ??
        [])
      : (localReadiness?.findings ?? []);
  const readinessErrors = readinessFindings.filter(
    ({ severity }) => severity === "error",
  ).length;
  const readinessWarnings = readinessFindings.filter(
    ({ severity }) => severity === "warning",
  ).length;
  const blockingGuidance = guidance?.tone === "danger" ? guidance : null;
  function openReaderPreview() {
    if (!project || !publication) return;
    recordPreviewReceipt(project.id, project.metadata.updated);
    setPreviewReceiptVersion((version) => version + 1);
    navigate({ page: "story", storyId: project.id, preview: true });
  }

  function openPublicationWorkshop() {
    if (!project) return;
    const open = () => {
      prePublishViewRef.current ??= { canvasMode, editorRegion };
      setCanvasMode("story");
      setEditorRegion("canvas");
      setPublishOpen(true);
    };
    if (localReadiness?.findings.some(({ severity }) => severity === "error")) {
      open();
      return;
    }
    void (async () => {
      const saved = saveState === "saved" ? project : await persist();
      if (saved) open();
    })();
  }

  function closePublicationWorkshop() {
    setPublishOpen(false);
    const previous = prePublishViewRef.current;
    prePublishViewRef.current = null;
    if (!previous) return;
    setCanvasMode(previous.canvasMode);
    setEditorRegion(previous.editorRegion);
  }

  function followGuidance(
    destination: GuidanceDestination,
    resourceId?: string,
  ) {
    if (destination === "save") {
      void persist();
      return;
    }
    if (destination === "story") setInspectorMode("story");
    if (destination === "chapters") setInspectorMode("chapter");
    if (destination === "data") {
      setSelectedSourceId(
        resourceId && project?.sources.some(({ id }) => id === resourceId)
          ? resourceId
          : null,
      );
      setInspectorMode("data");
      setEditorRegion("edit");
    }
    if (destination === "preview") openReaderPreview();
    if (destination === "publish" || destination === "sharing")
      openPublicationWorkshop();
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
        onShowProjectFolder={
          desktop ? (id) => void handleShowProjectFolder(id) : undefined
        }
        onRequestDelete={handleDelete}
        onConfirmDelete={() => void confirmDelete()}
        onDismissDelete={() => setDeleteTarget(null)}
        onOpenExample={(id) => void handleExampleStory(id)}
        view={route.page === "data" ? "data" : "stories"}
        selectedDatasetId={route.page === "data" ? route.datasetId : null}
        onDatasetChange={(datasetId) =>
          navigate({ page: "data", datasetId }, datasetId === null)
        }
        onViewChange={(view) => {
          navigate(
            view === "data"
              ? { page: "data", datasetId: null }
              : { page: "stories" },
          );
        }}
        applicationVersion={desktop?.version ?? null}
        workspacePath={workspacePath}
        workspaceSettingsOpen={workspaceSettingsOpen}
        workspaceBusy={workspaceBusy}
        onOpenWorkspaceSettings={
          desktop ? () => void openWorkspaceSettings() : undefined
        }
        onCloseWorkspaceSettings={closeWorkspaceSettings}
        onChooseWorkspace={() => void chooseWorkspace()}
        onShowWorkspaceFolder={
          desktop
            ? () => void desktop.showWorkspaceFolder().catch(showError)
            : undefined
        }
        toolsPanel={
          desktop ? <DesktopToolsPanel desktop={desktop} /> : undefined
        }
      />
    );

  if (route.page === "story" && route.preview)
    return (
      <div className="story-preview-shell">
        <header className="story-preview-bar">
          <button
            type="button"
            onClick={() =>
              navigate(
                { page: "story", storyId: project.id, preview: false },
                true,
              )
            }
          >
            <ArrowDown className="story-preview-bar__back" size={17} /> Back to
            editor
          </button>
          <div>
            <strong>Preview</strong>
            <span>Draft · not published</span>
          </div>
          <span>{project.metadata.title}</span>
        </header>
        {publication ? (
          <StoryViewer manifest={publication} />
        ) : (
          <p className="error-message">
            {publicationResult.error ?? "Give the story a title to preview it."}
          </p>
        )}
      </div>
    );

  const editorCanvas = (
    <ChapterCanvas
      mode={canvasMode}
      onModeChange={setCanvasMode}
      selectedChapter={selectedChapter ?? null}
      focusedManifest={focusedPublicationResult.manifest}
      fullManifest={publication}
      focusedError={focusedPublicationResult.error}
      savedCamera={savedChapterCamera}
      snapshotMode={publishOpen}
      previewCamera={flyoverPreviewCamera}
      commitInitialFit={Boolean(
        selectedChapter &&
        (selectedChapter.type === "map" ||
          selectedChapter.type === "scrolly") &&
        initialFitScopes.has(
          `${selectedChapter.id}:${selectedChapter.sourceId}`,
        ),
      )}
      onLiveCameraChange={(chapterId, nextCamera) => {
        if (chapterId === selectedChapter?.id)
          setCurrentCanvasCamera(nextCamera);
      }}
      onCameraCommit={(nextCamera) => {
        if (!selectedChapter || !("camera" in selectedChapter)) return;
        if (
          selectedChapter.type === "map" ||
          selectedChapter.type === "scrolly"
        )
          consumeInitialFit(selectedChapter.id, selectedChapter.sourceId);
        changeProject((current) => ({
          ...current,
          chapters: current.chapters.map((chapter) =>
            chapter.id === selectedChapter.id && "camera" in chapter
              ? {
                  ...chapter,
                  camera: { ...chapter.camera, ...nextCamera },
                }
              : chapter,
          ),
        }));
      }}
    />
  );

  return (
    <div
      className={
        blockingGuidance ? "editor-shell has-blocking-guidance" : "editor-shell"
      }
    >
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
        <WorkflowStatusMenu
          stages={workflow}
          guidance={guidance}
          errors={readinessErrors}
          warnings={readinessWarnings}
          onStageSelect={(stage) =>
            followGuidance(stage as GuidanceDestination)
          }
          onGuidance={(action) =>
            followGuidance(action.destination, action.resourceId)
          }
        />
        <ActionButton
          variant="surface"
          className="button button--save"
          disabled={saveState !== "changed" && saveState !== "save-error"}
          onClick={() => void persist()}
        >
          <FloppyDisk size={17} /> Save
        </ActionButton>
        <PublishMenu
          open={publishMenuOpen}
          onOpenChange={setPublishMenuOpen}
          localReadiness={localReadiness!}
          serverReadiness={publicationReadiness.state}
          chapterCount={project.chapters.length}
          sourceCount={project.sources.length}
          previewReviewed={previewReviewed}
          disabled={saveState === "exporting"}
          unsaved={saveState === "changed" || saveState === "save-error"}
          onLoadReadiness={loadPublicationReadiness}
          onPreview={openReaderPreview}
          onPublish={openPublicationWorkshop}
        />
      </header>
      {blockingGuidance ? (
        <div className="editor-blocking-guidance">
          <GuidancePrompt
            tone={blockingGuidance.tone}
            actionLabel={blockingGuidance.label}
            onAction={() =>
              followGuidance(
                blockingGuidance.destination,
                blockingGuidance.resourceId,
              )
            }
          >
            {blockingGuidance.message}
          </GuidancePrompt>
        </div>
      ) : null}
      <EditorShell
        region={editorRegion}
        onRegionChange={setEditorRegion}
        guidance={null}
        error={
          error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null
        }
        chapters={
          <ChapterRail
            projectTitle={project.metadata.title}
            chapters={project.chapters}
            activeChapterId={activeChapter}
            mode={inspectorMode}
            readiness={chapterReadiness}
            onWorkspace={leaveProject}
            onStory={() => {
              setInspectorMode("story");
              setEditorRegion("edit");
            }}
            onStoryData={() => {
              setSelectedSourceId(null);
              setPendingChapterType(null);
              setInspectorMode("data");
              setEditorRegion("edit");
            }}
            onSelectChapter={(chapterId) => {
              setActiveChapter(chapterId);
              setInspectorMode("chapter");
            }}
            onRequestRegion={setEditorRegion}
            onMove={moveChapter}
            onDuplicate={duplicateChapter}
            onDelete={deleteChapter}
            addChapter={
              <ChapterAddMenu
                open={addChapterOpen}
                canAddMap={project.sources.some(
                  (source) => source.kind !== "image" && source.kind !== "csv",
                )}
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
                onAddDataForType={(type) => {
                  setPendingChapterType(type);
                  setSelectedSourceId(null);
                  setInspectorMode("data");
                  setEditorRegion("edit");
                  setAddChapterOpen(false);
                }}
              />
            }
            addChapterRef={chapterAddRef}
          />
        }
        canvas={editorCanvas}
        inspector={
          <div className="author-panel" id="top">
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
                    ? selectedSourceDetails
                      ? "Source settings"
                      : "Add data"
                    : selectedChapter?.title || "Untitled chapter"}
              </h2>
              <span>
                {inspectorMode === "story"
                  ? "Settings shared by the whole publication."
                  : inspectorMode === "data"
                    ? selectedSourceDetails
                      ? "Shared settings apply everywhere this source is used."
                      : "Import a local file or connect a public source."
                    : `Edit this ${selectedChapter?.type ?? "story"} chapter while watching the preview.`}
              </span>
            </header>
            {inspectorMode === "data" && selectedSourceDetails ? (
              <SourceDetailsEditor
                source={selectedSourceDetails}
                chapterTitles={project.chapters.flatMap((chapter) =>
                  ("sourceId" in chapter &&
                    chapter.sourceId === selectedSourceDetails.id) ||
                  ("overlaySourceIds" in chapter &&
                    chapter.overlaySourceIds?.includes(
                      selectedSourceDetails.id,
                    ))
                    ? [chapter.title || "Untitled chapter"]
                    : [],
                )}
                onChange={(nextSource) =>
                  changeProject((current) => ({
                    ...current,
                    sources: current.sources.map((source) =>
                      source.id === nextSource.id ? nextSource : source,
                    ),
                  }))
                }
                onClose={() => setSelectedSourceId(null)}
              />
            ) : null}
            {inspectorMode === "data" && !selectedSourceDetails ? (
              <div className="data-panel">
                {pendingChapterType ? (
                  <div className="chapter-creation-intent" role="status">
                    <strong>
                      Add{" "}
                      {pendingChapterType === "image"
                        ? "an image"
                        : pendingChapterType === "chart"
                          ? "a CSV"
                          : "map data"}{" "}
                      for this chapter
                    </strong>
                    <span>
                      The chapter will be created as soon as a compatible file
                      is imported.
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingChapterType(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                <section>
                  <h3>Project data library</h3>
                  <p>
                    Prepare or connect data once, then reuse it across chapters
                    in this story project.
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
                            ? inspection.output.variables.flatMap(
                                (variable) => {
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
                                      (dimension) =>
                                        typeof dimension === "string",
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
                                },
                              )
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
                                  job?.status === "running" ||
                                  job?.status === "awaiting-approval"
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
                                    job?.status === "running" ||
                                    job?.status === "awaiting-approval"
                                  }
                                  onClick={() =>
                                    void runDataAssetJob(asset, "prepare")
                                  }
                                >
                                  Prepare
                                </button>
                              ) : null}
                              {job?.status === "failed" ||
                              job?.status === "cancelled" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void actOnConversionJob(job.id, "retry")
                                      .then(async (retried) => {
                                        setConversionJobs((current) => ({
                                          ...current,
                                          [asset.id]: retried,
                                        }));
                                        const result = await pollConversionJob(
                                          retried,
                                          {
                                            onUpdate: (next) =>
                                              setConversionJobs((current) => ({
                                                ...current,
                                                [asset.id]: next,
                                              })),
                                          },
                                        );
                                        if (result.kind === "completed") {
                                          setConversionJobs((current) => ({
                                            ...current,
                                            [asset.id]: result.job,
                                          }));
                                          const failure =
                                            result.job.events.find(
                                              (event) =>
                                                event.type === "failure",
                                            );
                                          if (!failure)
                                            applyPreparedConversion(
                                              asset,
                                              result.job,
                                              conversionIntents.current[
                                                asset.id
                                              ],
                                            );
                                        }
                                      })
                                      .catch(showError);
                                  }}
                                >
                                  Retry tool installation
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
                                          multidimChoice?.selection[
                                            dimension
                                          ] ?? 0
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
                          <article
                            key={source.id}
                            className="project-data-item"
                          >
                            <div>
                              <span>{source.kind}</span>
                              <strong>{source.label}</strong>
                              <small>
                                {source.delivery} · used by {chapterCount}{" "}
                                chapter
                                {chapterCount === 1 ? "" : "s"}
                              </small>
                            </div>
                            <div className="project-data-item__actions">
                              <button
                                type="button"
                                onClick={() => setSelectedSourceId(source.id)}
                              >
                                Edit details
                              </button>
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
                    <StatePanel
                      compact
                      title="Data is optional until a visualization needs it"
                      description="Prose and video stories can publish without data. Add a source when you create a map, chart, or image chapter."
                      actionLabel="Add data"
                      onAction={() =>
                        document
                          .getElementById("story-data-import")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          })
                      }
                    />
                  ) : null}
                </section>
                <section id="story-data-import">
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
                            {connectionDiscovery.details.sourceLayers.join(
                              ", ",
                            )}
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
            {inspectorMode === "chapter" ? (
              <ChapterInspector
                chapter={selectedChapter ?? null}
                projectId={project.id}
                chapterIndex={project.chapters.findIndex(
                  ({ id }) => id === selectedChapter?.id,
                )}
                sources={project.sources}
                sourceUsage={Object.fromEntries(
                  project.sources.map((source) => [
                    source.id,
                    project.chapters.filter(
                      (chapter) =>
                        ("sourceId" in chapter &&
                          chapter.sourceId === source.id) ||
                        ("overlaySourceIds" in chapter &&
                          chapter.overlaySourceIds?.includes(source.id)),
                    ).length,
                  ]),
                )}
                readiness={
                  (selectedChapter && chapterReadiness[selectedChapter.id]) || {
                    tone: "ready",
                    label: "Ready",
                  }
                }
                currentCamera={currentCanvasCamera}
                onUpdateChapter={(nextChapter) => {
                  changeProject((current) => ({
                    ...current,
                    chapters: current.chapters.map((chapter) =>
                      chapter.id === nextChapter.id ? nextChapter : chapter,
                    ),
                  }));
                }}
                onEditSource={(sourceId) => {
                  setSelectedSourceId(sourceId);
                  setInspectorMode("data");
                  setEditorRegion("edit");
                }}
                onAddData={() => {
                  setSelectedSourceId(null);
                  setInspectorMode("data");
                  setEditorRegion("edit");
                }}
                onPreviewCamera={(camera) => {
                  setFlyoverPreviewCamera(camera);
                  setCurrentCanvasCamera(camera);
                  setEditorRegion("canvas");
                }}
              />
            ) : null}
          </div>
        }
      />
      <PublishPanel
        open={publishOpen}
        project={project}
        onClose={closePublicationWorkshop}
        onBeforeExport={() =>
          saveState === "saved" ? Promise.resolve(project) : persist()
        }
        preflightState={publicationReadiness.state}
        onRefreshPreflight={() => void publicationReadiness.load(true)}
        localReadiness={localReadiness!}
        unsaved={saveState !== "saved"}
        onProfileChange={async (profile) => {
          const next = {
            ...project,
            publication: { ...project.publication, profile },
          };
          try {
            setSaveState("saving");
            const saved = await saveProject(next);
            setProject(saved);
            persistedProjectRef.current = structuredClone(saved);
            setSaveState("saved");
            publicationReadiness.invalidate();
            await refreshProjects();
            return saved;
          } catch (cause) {
            setSaveState("save-error");
            showError(cause);
            return null;
          }
        }}
      />
      {pendingProvisioning
        ? (() => {
            const [assetId, job] = pendingProvisioning;
            const disclosure = job.events.find(
              (event) => event.type === "provisioning-disclosure",
            );
            return disclosure?.type === "provisioning-disclosure" ? (
              <ProvisioningDialog
                disclosure={disclosure}
                onAcknowledge={() => {
                  void actOnConversionJob(job.id, "acknowledge")
                    .then((next) =>
                      setConversionJobs((current) => ({
                        ...current,
                        [assetId]: next,
                      })),
                    )
                    .catch(showError);
                }}
                onCancel={() => {
                  void actOnConversionJob(job.id, "cancel")
                    .then((next) =>
                      setConversionJobs((current) => ({
                        ...current,
                        [assetId]: next,
                      })),
                    )
                    .catch(showError);
                }}
              />
            ) : null;
          })()
        : null}
    </div>
  );
}
