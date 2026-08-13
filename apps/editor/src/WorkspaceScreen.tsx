import type { FormEvent, ReactNode } from "react";
import {
  FolderOpen,
  MapTrifold,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  ActionButton,
  ConfirmDialog,
  FormField,
  IconButton,
  StatePanel,
  TextInput,
  WorkspaceRow,
} from "@earth-stories/ui";
import type { ExampleCatalog, ProjectSummary } from "./api";
import { DataWorkspace } from "./DataWorkspace";

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
  onShowProjectFolder,
  onRequestDelete,
  onConfirmDelete,
  onDismissDelete,
  onOpenExample,
  view,
  onViewChange,
  selectedDatasetId,
  onDatasetChange,
  applicationVersion,
  workspacePath,
  workspaceSettingsOpen,
  workspaceBusy,
  onOpenWorkspaceSettings,
  onCloseWorkspaceSettings,
  onChooseWorkspace,
  onShowWorkspaceFolder,
  toolsPanel,
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
  onShowProjectFolder?: (id: string) => void;
  onRequestDelete: (project: ProjectSummary) => void;
  onConfirmDelete: () => void;
  onDismissDelete: () => void;
  onOpenExample: (id: string) => void;
  view: "stories" | "data";
  onViewChange: (view: "stories" | "data") => void;
  selectedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
  applicationVersion: string | null;
  workspacePath?: string | null;
  workspaceSettingsOpen?: boolean;
  workspaceBusy?: boolean;
  onOpenWorkspaceSettings?: () => void;
  onCloseWorkspaceSettings?: () => void;
  onChooseWorkspace?: () => void;
  onShowWorkspaceFolder?: () => void;
  toolsPanel?: ReactNode;
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
        <nav className="workspace-tabs" aria-label="Workspace sections">
          <button
            type="button"
            className={view === "stories" ? "is-active" : ""}
            aria-current={view === "stories" ? "page" : undefined}
            onClick={() => onViewChange("stories")}
          >
            Stories
          </button>
          <button
            type="button"
            className={view === "data" ? "is-active" : ""}
            aria-current={view === "data" ? "page" : undefined}
            onClick={() => onViewChange("data")}
          >
            Data
          </button>
        </nav>
      </header>
      {view === "data" ? (
        <DataWorkspace
          projects={projects}
          examples={examples}
          onOpenStory={onOpen}
          selectedDatasetId={selectedDatasetId}
          onDatasetChange={onDatasetChange}
        />
      ) : (
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
            <form className="workspace-create" onSubmit={onCreate}>
              <div className="workspace-create__controls">
                <FormField label="New story title (optional)">
                  <TextInput
                    id="story-title"
                    value={newTitle}
                    onChange={(event) => onNewTitleChange(event.target.value)}
                    placeholder="Untitled story"
                  />
                </FormField>
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
                  <WorkspaceRow
                    key={item.id}
                    number={String(item.chapterCount).padStart(2, "0")}
                    title={item.title}
                    description={
                      item.invalidReason ??
                      (item.description || "No description yet")
                    }
                    meta={`${item.chapterCount} ${item.chapterCount === 1 ? "chapter" : "chapters"}`}
                    badge={
                      item.isExample ? (
                        <mark className="project-list__tag">Example</mark>
                      ) : undefined
                    }
                    disabled={Boolean(item.invalidReason)}
                    onOpen={() => onOpen(item.id)}
                    actions={
                      <>
                        {onShowProjectFolder ? (
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Show project folder for ${item.title}`}
                            onClick={() => onShowProjectFolder(item.id)}
                          >
                            <FolderOpen size={16} />
                          </IconButton>
                        ) : null}
                        <IconButton
                          size="sm"
                          variant="ghost"
                          disabled={Boolean(item.invalidReason)}
                          label={`Rename ${item.title}`}
                          onClick={() => onRename(item)}
                        >
                          <PencilSimple size={16} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={`Remove ${item.title}`}
                          onClick={() => onRequestDelete(item)}
                        >
                          <Trash size={16} />
                        </IconButton>
                      </>
                    }
                  />
                ))}
                {examples?.stories
                  .filter(
                    (story) =>
                      !projects.some(
                        (project) => project.id === `example-${story.id}`,
                      ),
                  )
                  .map((story) => (
                    <WorkspaceRow
                      key={`example-${story.id}`}
                      number={String(story.chapterCount).padStart(2, "0")}
                      title={story.title}
                      description={story.description}
                      meta={`${story.formats.join(" + ")} · ${
                        story.authoringConnectivity === "local"
                          ? "Available offline"
                          : "Network required"
                      }`}
                      badge={<mark className="project-list__tag">Example</mark>}
                      onOpen={() => onOpenExample(story.id)}
                    />
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
      )}
      <footer className="workspace-footer">
        <span>Built for portable geospatial storytelling</span>
        {applicationVersion ? <span>Version {applicationVersion}</span> : null}
        {onOpenWorkspaceSettings ? (
          <button type="button" onClick={onOpenWorkspaceSettings}>
            Workspace settings
          </button>
        ) : null}
        <span>No account required</span>
      </footer>
      {workspaceSettingsOpen ? (
        <div
          className="workspace-settings"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace settings"
        >
          <h2>Workspace settings</h2>
          <p>Earth Stories stores projects in this folder.</p>
          <code>{workspacePath ?? "Loading workspace…"}</code>
          {toolsPanel}
          <div>
            <button
              type="button"
              disabled={workspaceBusy}
              onClick={onShowWorkspaceFolder}
            >
              Show folder
            </button>
            <button
              type="button"
              disabled={workspaceBusy}
              onClick={onChooseWorkspace}
            >
              Choose workspace
            </button>
            <button
              type="button"
              disabled={workspaceBusy}
              onClick={onCloseWorkspaceSettings}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
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
