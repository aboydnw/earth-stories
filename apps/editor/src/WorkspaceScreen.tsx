import type { FormEvent } from "react";
import {
  CaretDown,
  MapTrifold,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { ActionButton, ConfirmDialog, StatePanel } from "@earth-stories/ui";
import type { ExampleCatalog, ProjectSummary } from "./api";

export function WorkspaceScreen({
  projects,
  examples,
  newTitle,
  error,
  deleteTarget,
  deletePending,
  deleteError,
  onNewTitleChange,
  onCreate,
  onOpen,
  onRename,
  onRequestDelete,
  onConfirmDelete,
  onDismissDelete,
  onOpenExample,
}: {
  projects: ProjectSummary[];
  examples: ExampleCatalog | null;
  newTitle: string;
  error: string | null;
  deleteTarget: ProjectSummary | null;
  deletePending: boolean;
  deleteError: string | null;
  onNewTitleChange: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onOpen: (id: string) => void;
  onRename: (project: ProjectSummary) => void;
  onRequestDelete: (project: ProjectSummary) => void;
  onConfirmDelete: () => void;
  onDismissDelete: () => void;
  onOpenExample: (id: string) => void;
}) {
  return (
    <div className="workspace-screen">
      <header className="workspace-topbar">
        <div className="workspace-brand">
          <MapTrifold size={23} weight="duotone" />
          <span>Earth Stories</span>
          <small>local</small>
        </div>
        <span>Your stories stay on this computer until you publish</span>
      </header>
      <main className="workspace-main">
        <section className="workspace-intro">
          <div>
            <p>Your workspace</p>
            <h1>Stories, ready when you are.</h1>
            <span>
              Return to a recent story, start a new one, or explore an editable
              example.
            </span>
          </div>
          <form className="workspace-create" onSubmit={onCreate}>
            <label htmlFor="story-title">New story title (optional)</label>
            <div>
              <input
                id="story-title"
                value={newTitle}
                onChange={(event) => onNewTitleChange(event.target.value)}
                placeholder="Untitled story"
              />
              <ActionButton className="button button--primary" type="submit">
                <Plus size={17} /> Create story
              </ActionButton>
            </div>
          </form>
        </section>
        {error ? (
          <StatePanel
            tone="danger"
            title="Couldn’t open the local workspace"
            description={error}
            actionLabel="Retry connection"
            onAction={() => window.location.reload()}
          />
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
          {projects.length || examples?.stories.length ? (
            <div className="project-list">
              {projects.map((item) => (
                <div className="project-list__row" key={item.id}>
                  <button
                    className="project-list__open"
                    disabled={Boolean(item.invalidReason)}
                    onClick={() => onOpen(item.id)}
                  >
                    <span className="project-list__number">
                      {String(item.chapterCount).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>
                        {item.title}
                        {item.isExample ? (
                          <mark className="project-list__tag">Example</mark>
                        ) : null}
                      </strong>
                      <small>
                        {item.invalidReason ??
                          (item.description || "No description yet")}
                      </small>
                    </span>
                    <em>
                      {item.chapterCount}{" "}
                      {item.chapterCount === 1 ? "chapter" : "chapters"}
                    </em>
                    <CaretDown size={18} className="project-list__arrow" />
                  </button>
                  <div className="project-list__actions">
                    <button
                      type="button"
                      disabled={Boolean(item.invalidReason)}
                      aria-label={`Rename ${item.title}`}
                      onClick={() => onRename(item)}
                    >
                      <PencilSimple size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => onRequestDelete(item)}
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {examples?.stories
                .filter(
                  (story) =>
                    !projects.some(
                      (project) => project.id === `example-${story.id}`,
                    ),
                )
                .map((story) => (
                  <button
                    key={`example-${story.id}`}
                    onClick={() => onOpenExample(story.id)}
                  >
                    <span className="project-list__number">
                      {String(story.chapterCount).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>
                        {story.title}
                        <mark className="project-list__tag">Example</mark>
                      </strong>
                      <small>{story.description}</small>
                    </span>
                    <em>{story.formats.join(" + ")}</em>
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
      </main>
      <footer className="workspace-footer">
        <span>Built for portable geospatial storytelling</span>
        <span>No account required</span>
      </footer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remove ${deleteTarget?.title ?? "this story"}?`}
        description="The story will leave this workspace but remain recoverable in Earth Stories’ local trash folder."
        error={deleteError}
        loading={deletePending}
        confirmLabel="Remove story"
        onConfirm={onConfirmDelete}
        onOpenChange={(open) => {
          if (!open) onDismissDelete();
        }}
      />
    </div>
  );
}
