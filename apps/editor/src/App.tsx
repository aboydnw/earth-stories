import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ArrowDown,
  ArrowUp,
  ArrowClockwise,
  BookOpen,
  Database,
  Export,
  FileArrowUp,
  FloppyDisk,
  Link,
  MapTrifold,
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

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => {
    getExamples()
      .then(setExamples)
      .catch(() => undefined);
    listProjects()
      .then(async (items) => {
        setProjects(items);
        if (items[0]) activate(await openProject(items[0].id));
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
      <main className="start-screen">
        <p>Opening your local workspace…</p>
      </main>
    );
  if (!project)
    return (
      <main className="start-screen">
        <MapTrifold size={42} weight="duotone" />
        <p>Earth Stories</p>
        <h1>Make a story that lives on your computer.</h1>
        <form onSubmit={handleCreate}>
          <label htmlFor="story-title">Name your first story</label>
          <div>
            <input
              id="story-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Field notes from…"
              autoFocus
            />
            <ActionButton className="button button--primary" type="submit">
              <Plus size={17} /> Create story
            </ActionButton>
          </div>
        </form>
        {error ? (
          <div className="start-error" role="alert">
            <p className="error-message">{error}</p>
            <button onClick={() => window.location.reload()}>
              <ArrowClockwise size={16} /> Retry connection
            </button>
          </div>
        ) : null}
        {examples?.stories.length ? (
          <section
            className="example-stories"
            aria-labelledby="example-heading"
          >
            <div>
              <BookOpen size={20} />
              <h2 id="example-heading">Or begin with an example</h2>
            </div>
            <div className="example-story-list">
              {examples.stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => void handleExampleStory(story.id)}
                >
                  <span>{story.formats.join(" + ")}</span>
                  <strong>{story.title}</strong>
                  <small>{story.description}</small>
                  <em>
                    {story.chapterCount} chapters · creates an editable copy
                  </em>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <small>Your files stay on this computer. No account required.</small>
      </main>
    );

  const included =
    publication?.assets.filter((asset) => asset.delivery === "included")
      .length ?? 0;
  const connected = (publication?.assets.length ?? 0) - included;
  return (
    <div className="editor-shell">
      <a className="skip-link" href="#top">
        Skip to story editor
      </a>
      <header className="editor-topbar">
        <a className="editor-brand" href="#top">
          <MapTrifold size={22} weight="duotone" />
          <span>Earth Stories</span>
          <small>local</small>
        </a>
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
          <span>Local project</span>
          <select
            value={project.id}
            onChange={(event) => void handleOpen(event.target.value)}
          >
            {projects.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <nav aria-label="Story chapters">
          <p>Chapters</p>
          {project.chapters.map((chapter, index) => (
            <button
              className={
                chapter.id === activeChapter
                  ? "chapter-link is-active"
                  : "chapter-link"
              }
              key={chapter.id}
              onClick={() => setActiveChapter(chapter.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{chapter.title || "Untitled"}</strong>
              <small>{chapter.type}</small>
            </button>
          ))}
        </nav>
        <div className="add-content">
          <p>Add content</p>
          <button onClick={addProse}>
            <TextT size={16} /> Text chapter
          </button>
          <button onClick={addVideo}>
            <TextT size={16} /> Video chapter
          </button>
          <button onClick={addFlyover}>
            <MapTrifold size={16} /> Flyover chapter
          </button>
          <label>
            <FileArrowUp size={16} /> Import file
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
            Trajectory imports must use a browser-ready{" "}
            <code>*.trips.json</code> file containing paths and timestamps.
          </small>
          <form onSubmit={addConnected}>
            <div>
              <Link size={16} />
              <select
                value={connectedKind}
                onChange={(event) =>
                  setConnectedKind(event.target.value as typeof connectedKind)
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
            </div>
            <input
              type="url"
              required
              value={connectedUrl}
              onChange={(event) => setConnectedUrl(event.target.value)}
              placeholder="Public URL"
            />
            <button type="submit">Connect source</button>
          </form>
          {examples?.stories.length ? (
            <details className="example-connections">
              <summary>
                <BookOpen size={16} /> Example stories
              </summary>
              <p>Create a separate editable project from a complete example.</p>
              {examples.stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => void handleExampleStory(story.id)}
                >
                  <span>{story.formats.join(" + ")}</span>
                  <strong>{story.title}</strong>
                  <small>{story.description}</small>
                </button>
              ))}
            </details>
          ) : null}
          {examples?.connections.length ? (
            <details className="example-connections">
              <summary>
                <Database size={16} /> Example data
              </summary>
              <p>Add a public, editable connection and a map chapter.</p>
              {examples.connections.map((example) => (
                <button
                  key={example.id}
                  onClick={() => addExampleConnection(example)}
                >
                  <span>{example.kind}</span>
                  <strong>{example.title}</strong>
                  <small>{example.description}</small>
                </button>
              ))}
            </details>
          ) : null}
        </div>
        <div className="asset-summary">
          <p>Export plan</p>
          <div>
            <strong>{included}</strong>
            <span>included</span>
          </div>
          <div>
            <strong>{connected}</strong>
            <span>connected</span>
          </div>
        </div>
      </aside>
      <section className="editor-workspace" id="top">
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <div className="author-panel">
          <label>
            Story title
            <input
              value={project.metadata.title}
              onChange={(event) =>
                changeProject((current) => ({
                  ...current,
                  metadata: { ...current.metadata, title: event.target.value },
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
              Publication appearance
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
                <option value="editorial">Field journal</option>
              </select>
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
                  onChange={(event) => setBasemapStyleDraft(event.target.value)}
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
          {selectedChapter ? (
            <>
              <div className="chapter-actions" aria-label="Chapter actions">
                <button type="button" onClick={() => moveChapter(-1)}>
                  <ArrowUp size={15} /> Move up
                </button>
                <button type="button" onClick={() => moveChapter(1)}>
                  <ArrowDown size={15} /> Move down
                </button>
                <button type="button" onClick={duplicateChapter}>
                  <Copy size={15} /> Duplicate
                </button>
                <button
                  type="button"
                  onClick={deleteChapter}
                  disabled={project.chapters.length === 1}
                >
                  <Trash size={15} /> Delete
                </button>
              </div>
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
            <p>Publication preview</p>
            <h1>What you see is what you export.</h1>
          </div>
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
