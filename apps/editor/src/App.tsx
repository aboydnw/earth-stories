import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Export,
  FloppyDisk,
  MapTrifold,
  Plus,
} from "@phosphor-icons/react";
import { compileProject } from "@earth-stories/publisher/compile";
import type { StoryProject } from "@earth-stories/story-schema";
import { StoryViewer } from "@earth-stories/viewer";
import {
  createProject,
  listProjects,
  openProject,
  saveProject,
  type ProjectSummary,
} from "./api";

type SaveState = "saved" | "changed" | "saving";

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [activeChapter, setActiveChapter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProjects() {
    setProjects(await listProjects());
  }

  useEffect(() => {
    listProjects()
      .then(async (items) => {
        setProjects(items);
        if (items[0]) {
          const opened = await openProject(items[0].id);
          setProject(opened);
          setActiveChapter(opened.chapters[0]?.id ?? "");
        }
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not open local projects",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const publication = useMemo(
    () => (project ? compileProject(project) : null),
    [project],
  );
  const selectedChapter = project?.chapters.find(
    (chapter) => chapter.id === activeChapter,
  );

  function changeProject(update: (current: StoryProject) => StoryProject) {
    setProject((current) => (current ? update(current) : current));
    setSaveState("changed");
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setError(null);
      const created = await createProject(newTitle);
      setProject(created);
      setActiveChapter(created.chapters[0]?.id ?? "");
      setNewTitle("");
      setSaveState("saved");
      await refreshProjects();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create project",
      );
    }
  }

  async function handleOpen(id: string) {
    try {
      const opened = await openProject(id);
      setProject(opened);
      setActiveChapter(opened.chapters[0]?.id ?? "");
      setSaveState("saved");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open project",
      );
    }
  }

  async function handleSave() {
    if (!project) return;
    try {
      setSaveState("saving");
      const saved = await saveProject(project);
      setProject(saved);
      setSaveState("saved");
      await refreshProjects();
    } catch (cause) {
      setSaveState("changed");
      setError(
        cause instanceof Error ? cause.message : "Could not save project",
      );
    }
  }

  if (loading)
    return (
      <main className="start-screen">
        <p>Opening your local workspace…</p>
      </main>
    );

  if (!project || !publication) {
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
            <button className="button button--primary" type="submit">
              <Plus size={17} /> Create story
            </button>
          </div>
        </form>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <small>
          Your files stay in the Earth Stories projects folder. No account
          required.
        </small>
      </main>
    );
  }

  const included = publication.assets.filter(
    (asset) => asset.delivery === "included",
  ).length;
  const connected = publication.assets.length - included;
  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <a className="editor-brand" href="#top" aria-label="Earth Stories home">
          <MapTrifold size={22} weight="duotone" />
          <span>Earth Stories</span>
          <small>local</small>
        </a>
        <div className="editor-status">
          <Check size={14} weight="bold" />{" "}
          {saveState === "saving"
            ? "Saving…"
            : saveState === "changed"
              ? "Changes not saved"
              : "Saved locally"}
        </div>
        <button
          className="button button--save"
          disabled={saveState === "saved"}
          onClick={handleSave}
          type="button"
        >
          <FloppyDisk size={17} /> Save
        </button>
        <button className="button button--primary" type="button">
          <Export size={17} /> Export story
        </button>
      </header>
      <aside className="editor-rail">
        <div className="project-label">
          <span>Local project</span>
          <select
            aria-label="Open project"
            value={project.id}
            onChange={(event) => handleOpen(event.target.value)}
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
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{chapter.title}</strong>
              <small>{chapter.type}</small>
            </button>
          ))}
        </nav>
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
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
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
          {selectedChapter && (
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
            </>
          )}
        </div>
        <div className="workspace-heading">
          <div>
            <p>Publication preview</p>
            <h1>What you see is what you export.</h1>
          </div>
        </div>
        <div className="preview-frame" id="preview">
          <div className="preview-browser">
            <span />
            <span />
            <span />
            <code>local preview · build {publication.build.id}</code>
          </div>
          <StoryViewer manifest={publication} />
        </div>
      </section>
    </div>
  );
}
