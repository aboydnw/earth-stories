import { useMemo, useState } from "react";
import {
  ArrowSquareOut,
  Check,
  Export,
  FolderOpen,
  MapTrifold,
} from "@phosphor-icons/react";
import { compileProject } from "@devseed-stories/publisher/compile";
import {
  storyProjectSchema,
  type StoryProject,
} from "@devseed-stories/story-schema";
import { StoryViewer } from "@devseed-stories/viewer";
import fixtureProject from "../../../fixtures/field-notes/story.json";

const fixture = storyProjectSchema.parse(fixtureProject);

export function App() {
  const [project] = useState<StoryProject>(fixture);
  const [activeChapter, setActiveChapter] = useState(
    project.chapters[0]?.id ?? "",
  );
  const publication = useMemo(() => compileProject(project), [project]);
  const included = publication.assets.filter(
    (asset) => asset.delivery === "included",
  ).length;
  const connected = publication.assets.length - included;

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <a
          className="editor-brand"
          href="#top"
          aria-label="DevSeed Stories home"
        >
          <MapTrifold size={22} weight="duotone" />
          <span>DevSeed Stories</span>
          <small>prototype 01</small>
        </a>
        <div className="editor-status">
          <Check size={14} weight="bold" /> Saved locally
        </div>
        <button className="button button--primary" type="button">
          <Export size={17} /> Export story
        </button>
      </header>

      <aside className="editor-rail">
        <div className="project-label">
          <span>Local project</span>
          <strong>{project.metadata.title}</strong>
          <button type="button">
            <FolderOpen size={15} /> Show project files
          </button>
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
        <div className="workspace-heading">
          <div>
            <p>Publication preview</p>
            <h1>What you see is what you export.</h1>
          </div>
          <a href="#preview">
            <ArrowSquareOut size={16} /> Open reader preview
          </a>
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
