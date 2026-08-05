import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ArrowDown,
  ArrowUp,
  ArrowClockwise,
  BookOpen,
  CaretDown,
  Database,
  Export,
  FileArrowUp,
  FloppyDisk,
  Link,
  MapTrifold,
  GearSix,
  House,
  Plus,
  Trash,
  TextT,
} from "@phosphor-icons/react";
import { compileProject } from "@earth-stories/publisher/compile";
import type {
  ProjectChapter,
  ProjectSource,
  StoryProject,
} from "@earth-stories/story-schema";
import { StoryViewer } from "@earth-stories/viewer";
import { ActionButton } from "@earth-stories/ui";
import {
  createProject,
  createExampleStory,
  getExamples,
  importAsset,
  listProjects,
  openProject,
  saveProject,
  type ProjectSummary,
  type ExampleCatalog,
  type ExampleConnection,
} from "./api";
import { PublishPanel } from "./PublishPanel";

type SaveState = "saved" | "changed" | "saving" | "exporting";
type InspectorMode = "chapter" | "story" | "data";
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
  const [activeChapter, setActiveChapter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [connectedUrl, setConnectedUrl] = useState("");
  const [basemapStyleDraft, setBasemapStyleDraft] = useState("");
  const [connectedKind, setConnectedKind] = useState<
    "cog" | "pmtiles" | "geoparquet" | "xyz" | "zarr" | "trajectory" | "copc"
  >("cog");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [examples, setExamples] = useState<ExampleCatalog | null>(null);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("chapter");
  const [addChapterOpen, setAddChapterOpen] = useState(false);

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => {
    getExamples()
      .then(setExamples)
      .catch(() => undefined);
    listProjects()
      .then(async (items) => {
        setProjects(items);
      })
      .catch(showError)
      .finally(() => setLoading(false));
  }, []);
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

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    try {
      activate(await createProject(newTitle));
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
      setSaveState("changed");
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
  }
  function addProse() {
    addChapter({
      id: crypto.randomUUID(),
      type: "prose",
      title: "New chapter",
      narrative: "",
    });
    setAddChapterOpen(false);
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
    setAddChapterOpen(false);
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
    setAddChapterOpen(false);
  }
  function moveChapter(offset: number) {
    if (!selectedChapter) return;
    changeProject((current) => {
      const from = current.chapters.findIndex(
        (chapter) => chapter.id === selectedChapter.id,
      );
      const to = Math.max(
        0,
        Math.min(current.chapters.length - 1, from + offset),
      );
      if (from === to) return current;
      const chapters = [...current.chapters];
      const [chapter] = chapters.splice(from, 1);
      chapters.splice(to, 0, chapter!);
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
  async function handleFile(file: File) {
    if (!project) return;
    try {
      const uploaded = await importAsset(project.id, file);
      const id = crypto.randomUUID();
      const extension = uploaded.filename.split(".").pop()?.toLowerCase();
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
      } else if (extension === "tif" || extension === "tiff") {
        source = {
          id,
          kind: "cog",
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
          "Use COG, GeoJSON, PMTiles, GeoParquet, CSV, PNG, JPEG, WebP, or GIF files.",
        );
      changeProject((current) => ({
        ...current,
        sources: [...current.sources, source],
        chapters: [...current.chapters, chapter],
      }));
      setActiveChapter(chapter.id);
    } catch (cause) {
      showError(cause);
    }
  }
  function addConnected(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !connectedUrl.trim()) return;
    const id = crypto.randomUUID();
    const common = {
      id,
      label: new URL(connectedUrl).hostname,
      locator: connectedUrl,
      attribution: null,
      sizeBytes: null,
      delivery: "connected" as const,
    };
    const source: ProjectSource =
      connectedKind === "pmtiles"
        ? { ...common, kind: "pmtiles", tileType: "vector" }
        : connectedKind === "zarr"
          ? {
              ...common,
              kind: "zarr",
              variable: "data",
              selection: {},
              timeDimension: null,
              timesteps: [],
              geozarr: null,
            }
          : connectedKind === "trajectory"
            ? { ...common, kind: "trajectory", trailLength: 600 }
            : connectedKind === "copc"
              ? {
                  ...common,
                  kind: "copc",
                  colorMode: "elevation",
                  pointSize: 2,
                }
              : { ...common, kind: connectedKind };
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
      chapters: [...current.chapters, chapter],
    }));
    setActiveChapter(chapter.id);
    setConnectedUrl("");
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
        <MapTrifold size={32} weight="duotone" />
        <p>Opening your local workspace…</p>
      </main>
    );
  if (!project)
    return (
      <div className="workspace-screen">
        <header className="workspace-topbar">
          <div className="workspace-brand">
            <MapTrifold size={23} weight="duotone" />
            <span>Earth Stories</span>
            <small>local</small>
          </div>
          <span>Your stories stay on this computer</span>
        </header>
        <main className="workspace-main">
          <section className="workspace-intro">
            <div>
              <p>Your workspace</p>
              <h1>Stories, ready when you are.</h1>
              <span>
                Return to a recent story, start a new one, or explore an
                editable example.
              </span>
            </div>
            <form className="workspace-create" onSubmit={handleCreate}>
              <label htmlFor="story-title">New story title</label>
              <div>
                <input
                  id="story-title"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Field notes from…"
                />
                <ActionButton className="button button--primary" type="submit">
                  <Plus size={17} /> Create story
                </ActionButton>
              </div>
            </form>
          </section>
          {error ? (
            <div className="start-error" role="alert">
              <p className="error-message">{error}</p>
              <button onClick={() => window.location.reload()}>
                <ArrowClockwise size={16} /> Retry connection
              </button>
            </div>
          ) : null}
          <section
            className="workspace-projects"
            aria-labelledby="stories-heading"
          >
            <header>
              <div>
                <p>On this computer</p>
                <h2 id="stories-heading">Your stories</h2>
              </div>
              <span>
                {projects.length} {projects.length === 1 ? "story" : "stories"}
              </span>
            </header>
            {projects.length ? (
              <div className="project-list">
                {projects.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => void handleOpen(item.id)}
                  >
                    <span className="project-list__number">
                      {String(item.chapterCount).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.description || "No description yet"}</small>
                    </span>
                    <em>
                      {item.chapterCount}{" "}
                      {item.chapterCount === 1 ? "chapter" : "chapters"}
                    </em>
                    <CaretDown size={18} className="project-list__arrow" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="workspace-empty">
                <MapTrifold size={28} weight="duotone" />
                <strong>Create your first story</strong>
                <span>Name it above. You can change everything later.</span>
              </div>
            )}
          </section>
          {examples?.stories.length ? (
            <section
              className="workspace-examples"
              aria-labelledby="example-heading"
            >
              <header>
                <div>
                  <p>Learn from a finished story</p>
                  <h2 id="example-heading">Example stories</h2>
                </div>
                <span>Opening an example creates your own editable copy.</span>
              </header>
              <div className="example-story-list">
                {examples.stories.map((story) => (
                  <button
                    key={story.id}
                    onClick={() => void handleExampleStory(story.id)}
                  >
                    <span>{story.formats.join(" + ")}</span>
                    <strong>{story.title}</strong>
                    <small>{story.description}</small>
                    <em>{story.chapterCount} chapters · editable copy</em>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </main>
        <footer className="workspace-footer">
          <span>Built for portable geospatial storytelling</span>
          <span>No account required</span>
        </footer>
      </div>
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
          onClick={() => {
            void (async () => {
              if (saveState === "changed" && !(await persist())) return;
              setProject(null);
              setError(null);
            })();
          }}
          aria-label="Return to your workspace"
        >
          <MapTrifold size={22} weight="duotone" />
          <span>Earth Stories</span>
          <small>local</small>
        </button>
        <div className="editor-status">
          <Check size={14} weight="bold" />{" "}
          {saveState === "saving"
            ? "Saving…"
            : saveState === "exporting"
              ? "Building publication…"
              : saveState === "changed"
                ? "Changes not saved"
                : "Saved locally"}
        </div>
        <ActionButton
          variant="surface"
          className="button button--save"
          disabled={saveState !== "changed"}
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
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (saveState === "changed" && !(await persist())) return;
                setProject(null);
              })();
            }}
          >
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
                  aria-label={`Actions for ${chapter.title}`}
                >
                  <button
                    type="button"
                    onClick={() => moveChapter(-1)}
                    disabled={index === 0}
                    aria-label="Move chapter up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveChapter(1)}
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
        <div className="chapter-add">
          <button
            className="chapter-add__trigger"
            type="button"
            onClick={() => setAddChapterOpen((open) => !open)}
            aria-expanded={addChapterOpen}
          >
            <Plus size={16} /> Add chapter <CaretDown size={14} />
          </button>
          {addChapterOpen ? (
            <div className="chapter-add__menu">
              <p>Choose a chapter type</p>
              <button type="button" onClick={addProse}>
                <TextT size={17} />
                <span>
                  <strong>Text</strong>
                  <small>Prose, headings and links</small>
                </span>
              </button>
              <button type="button" onClick={addVideo}>
                <TextT size={17} />
                <span>
                  <strong>Video</strong>
                  <small>YouTube or Vimeo</small>
                </span>
              </button>
              <button type="button" onClick={addFlyover}>
                <MapTrifold size={17} />
                <span>
                  <strong>Flyover</strong>
                  <small>Animate between map views</small>
                </span>
              </button>
            </div>
          ) : null}
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
                <h3>Import from this computer</h3>
                <p>
                  The file becomes an included story asset and creates a
                  matching chapter.
                </p>
                <label className="file-import">
                  <FileArrowUp size={18} /> Choose a file
                  <input
                    type="file"
                    accept=".tif,.tiff,.geojson,.json,.pmtiles,.parquet,.csv,.png,.jpg,.jpeg,.webp,.gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                <small>
                  COG, GeoJSON, PMTiles, GeoParquet, CSV, images, or
                  browser-ready <code>*.trips.json</code>.
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
                      onChange={(event) => setConnectedUrl(event.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                  <button type="submit">
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
            <div className="preview-browser">
              <span />
              <span />
              <span />
              <code>local preview · build {publication.build.id}</code>
            </div>
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
            setSaveState("changed");
            showError(cause);
            return null;
          }
        }}
      />
    </div>
  );
}
