import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CloudArrowDown,
  Database,
  MapTrifold,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { DataSourceRow, IconButton, WorkspaceRow } from "@earth-stories/ui";
import {
  defaultSourceProvenance,
  type ProjectChapter,
  type ProjectSource,
  type SourceProvenance,
} from "@earth-stories/story-schema";
import type { AuthoringReadiness } from "@earth-stories/publisher/readiness";
import { useState } from "react";
import { PublishMenu } from "./PublishMenu";
import { SourceProvenanceFields } from "./SourceProvenanceFields";
import { WorkflowStatusMenu } from "./WorkflowStatusMenu";
import "./editor.css";
import { ChapterInspector } from "./ChapterInspector";
import { ChapterRail } from "./ChapterRail";
import { EditorShell } from "./EditorShell";

const meta = { title: "Patterns/Editor collections" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceRows: Story = {
  render: () => (
    <div className="project-list" style={{ maxWidth: 940 }}>
      <WorkspaceRow
        number="07"
        title="Lower Mekong floodplain"
        description="A long project description wraps without displacing its chapter count or actions."
        meta="7 chapters"
        badge={<mark className="project-list__tag">Example</mark>}
        onOpen={() => undefined}
        actions={
          <>
            <IconButton
              size="sm"
              variant="ghost"
              label="Rename Lower Mekong floodplain"
            >
              <PencilSimple />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              label="Remove Lower Mekong floodplain"
            >
              <Trash />
            </IconButton>
          </>
        }
      />
      <WorkspaceRow
        number="00"
        title="Project needs repair"
        description="A referenced project file is missing."
        meta="Unavailable"
        disabled
        onOpen={() => undefined}
      />
    </div>
  ),
};

export const DataSources: Story = {
  render: () => (
    <div className="data-list" style={{ maxWidth: 940 }}>
      <DataSourceRow
        label="Flood depth scenario 2042"
        kind="cog"
        leading={<MapTrifold />}
        delivery={
          <>
            <CloudArrowDown />
            connected
          </>
        }
        usage="used in 3 chapters"
        onOpen={() => undefined}
      />
      <DataSourceRow
        label="Survey sites"
        kind="geojson"
        leading={<Database />}
        delivery={
          <>
            <Database />
            on this computer
          </>
        }
        usage="not used in a chapter"
        onOpen={() => undefined}
      />
    </div>
  ),
};

const guidanceReadiness: AuthoringReadiness = {
  manifest: {} as AuthoringReadiness["manifest"] & object,
  findings: [
    {
      id: "attribution",
      area: "publish",
      severity: "warning",
      message: "Review source attribution.",
    },
  ],
  stages: {
    story: "complete",
    chapters: "complete",
    data: "optional",
    preview: "current",
    publish: "current",
    sharing: "current",
  },
};

function PublishMenuExample() {
  const [open, setOpen] = useState(true);
  return (
    <div
      style={{
        minHeight: 420,
        display: "flex",
        justifyContent: "flex-end",
        padding: 24,
      }}
    >
      <PublishMenu
        open={open}
        onOpenChange={setOpen}
        localReadiness={guidanceReadiness}
        serverReadiness={{
          status: "stale",
          result: null,
          error: null,
          key: "example",
        }}
        chapterCount={12}
        sourceCount={23}
        previewReviewed={false}
        onLoadReadiness={() => undefined}
        onPreview={() => undefined}
        onPublish={() => undefined}
      />
    </div>
  );
}

export const PublicationReadinessMenu: Story = {
  render: () => <PublishMenuExample />,
};

export const CompactWorkflowStatus: Story = {
  render: () => (
    <div
      style={{
        minHeight: 520,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        padding: 24,
      }}
    >
      <WorkflowStatusMenu
        stages={[
          { id: "story", label: "Story", state: "complete" },
          { id: "chapters", label: "Chapters", state: "complete" },
          { id: "data", label: "Data", state: "complete" },
          { id: "preview", label: "Preview", state: "complete" },
          {
            id: "publish",
            label: "Publish",
            state: "current",
            description: "Needs review",
          },
        ]}
        guidance={{
          id: "narrative",
          label: "Review warnings",
          message: "One chapter has no narrative.",
          destination: "publish",
          tone: "warning",
        }}
        errors={0}
        warnings={1}
        onStageSelect={() => undefined}
        onGuidance={() => undefined}
      />
    </div>
  ),
};

function ProvenanceFormExample() {
  const [value, setValue] = useState<SourceProvenance>({
    ...defaultSourceProvenance,
    publisher: "River Observatory",
    transformations: [
      "Removed duplicate observations",
      "Reprojected to EPSG:4326",
    ],
  });
  return (
    <div style={{ maxWidth: 760, padding: 24 }}>
      <SourceProvenanceFields value={value} onChange={setValue} />
    </div>
  );
}

export const ProvenanceForm: Story = {
  render: () => <ProvenanceFormExample />,
};

const mapSource: ProjectSource = {
  id: "floodplain",
  kind: "local-geojson",
  label: "Floodplain extent",
  path: "data/floodplain.geojson",
  attribution: "River Observatory",
  sizeBytes: 42_000,
  delivery: "included",
  provenance: defaultSourceProvenance,
};

const editorChapters: ProjectChapter[] = [
  {
    id: "intro",
    type: "prose",
    title: "Why the floodplain matters",
    narrative: "Seasonal water connects farms, wetlands, and settlements.",
  },
  {
    id: "extent",
    type: "map",
    title: "A changing edge with an intentionally long chapter title",
    narrative: "Move the map to compose the view readers should see.",
    sourceId: "floodplain",
    overlaySourceIds: [],
    camera: {
      center: [104.92, 12.48],
      zoom: 7.2,
      bearing: 4,
      pitch: 28,
    },
  },
];

export const MapChapterInspector: Story = {
  render: () => (
    <div style={{ width: 420, minHeight: 900, background: "var(--es-bg)" }}>
      <ChapterInspector
        chapter={editorChapters[1]!}
        chapterIndex={1}
        sources={[mapSource]}
        sourceUsage={{ floodplain: 2 }}
        readiness={{ tone: "warning", label: "Add reader text" }}
        currentCamera={
          editorChapters[1] && "camera" in editorChapters[1]
            ? editorChapters[1].camera
            : null
        }
        onUpdateChapter={() => undefined}
        onEditSource={() => undefined}
        onAddData={() => undefined}
      />
    </div>
  ),
};

export const ResponsiveChapterShell: Story = {
  render: () => (
    <div style={{ height: 760 }}>
      <EditorShell
        region="edit"
        onRegionChange={() => undefined}
        chapters={
          <ChapterRail
            projectTitle="Lower Mekong floodplain"
            chapters={editorChapters}
            activeChapterId="extent"
            mode="chapter"
            readiness={{
              intro: { tone: "ready", label: "Ready" },
              extent: { tone: "warning", label: "Add reader text" },
            }}
            onWorkspace={() => undefined}
            onStory={() => undefined}
            onStoryData={() => undefined}
            onSelectChapter={() => undefined}
            onRequestRegion={() => undefined}
            onMove={() => undefined}
            onDuplicate={() => undefined}
            onDelete={() => undefined}
            addChapter={<button type="button">Add chapter</button>}
          />
        }
        canvas={
          <div className="chapter-canvas__state">
            Interactive chapter canvas
          </div>
        }
        inspector={
          <ChapterInspector
            chapter={editorChapters[1]!}
            chapterIndex={1}
            sources={[mapSource]}
            sourceUsage={{ floodplain: 2 }}
            readiness={{ tone: "ready", label: "Ready" }}
            currentCamera={null}
            onUpdateChapter={() => undefined}
            onEditSource={() => undefined}
            onAddData={() => undefined}
          />
        }
      />
    </div>
  ),
};
