import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Export,
  FileArrowUp,
  FloppyDisk,
  Link,
  MapTrifold,
  Plus,
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
  importAsset,
  listProjects,
  openProject,
  saveProject,
  type ProjectSummary,
} from "./api";
import { PublishPanel } from "./PublishPanel";

type SaveState = "saved" | "changed" | "saving" | "exporting";
const camera = {
  center: [0, 20] as [number, number],
  zoom: 1.5,
  bearing: 0,
  pitch: 0,
};
const sourcePath = (source: ProjectSource) =>
  source.kind === "local-geojson" ||
  source.kind === "image" ||
  source.kind === "csv"
    ? source.path
    : source.kind === "pmtiles" || source.kind === "geoparquet"
      ? source.locator
      : null;

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [activeChapter, setActiveChapter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [connectedUrl, setConnectedUrl] = useState("");
  const [connectedKind, setConnectedKind] = useState<
    "cog" | "pmtiles" | "geoparquet" | "xyz"
  >("cog");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);

  const refreshProjects = async () => setProjects(await listProjects());
  useEffect(() => {
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
    setActiveChapter(next.chapters[0]?.id ?? "");
    setSaveState("saved");
  }
  function changeProject(update: (current: StoryProject) => StoryProject) {
    setProject((current) => (current ? update(current) : current));
    setSaveState("changed");
    setError(null);
  }

  const publication = useMemo(() => {
    if (!project || !project.metadata.title.trim()) return null;
    const compiled = compileProject(project);
    const sources = new Map(
      project.sources.map((source) => [source.id, source]),
    );
    return {
      ...compiled,
      assets: compiled.assets.map((asset) => {
        const source = sources.get(asset.id);
        const path = source ? sourcePath(source) : null;
        return asset.delivery === "included" && path
          ? {
              ...asset,
              href: `/api/projects/${encodeURIComponent(project.id)}/assets/${path.split("/").map(encodeURIComponent).join("/")}`,
            }
          : asset;
      }),
    };
  }, [project]);
  const selectedChapter = project?.chapters.find(
    (chapter) => chapter.id === activeChapter,
  );
  const selectedSource =
    selectedChapter && selectedChapter.type !== "prose"
      ? project?.sources.find(
          (source) => source.id === selectedChapter.sourceId,
        )
      : null;

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
          "Use GeoJSON, PMTiles, GeoParquet, CSV, PNG, JPEG, WebP, or GIF files.",
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
        {error ? <p className="error-message">{error}</p> : null}
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
          <label>
            <FileArrowUp size={16} /> Import file
            <input
              type="file"
              accept=".geojson,.json,.pmtiles,.parquet,.csv,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
          </label>
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
          {selectedChapter ? (
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
                </div>
              ) : null}
              {selectedSource ? (
                <label>
                  Publication data policy
                  <select
                    value={selectedSource.delivery}
                    onChange={(event) =>
                      changeProject((current) => ({
                        ...current,
                        sources: current.sources.map((source) =>
                          source.id === selectedSource.id
                            ? {
                                ...source,
                                delivery: event.target.value as
                                  "auto" | "included" | "connected",
                              }
                            : source,
                        ),
                      }))
                    }
                  >
                    <option value="auto">Automatic</option>
                    <option value="included">Include in ZIP</option>
                    {selectedSource.kind !== "local-geojson" &&
                    selectedSource.kind !== "image" &&
                    selectedSource.kind !== "csv" ? (
                      <option value="connected">Keep connected</option>
                    ) : null}
                  </select>
                </label>
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
            Give the story a title to generate its publication preview.
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
      />
    </div>
  );
}
