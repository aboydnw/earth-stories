import type { Meta, StoryObj } from "@storybook/react-vite";
import { GenerationResult } from "./GenerationResult";
import {
  generationJobSchema,
  storyProjectSchema,
  defaultReaderPalette,
  composeVectorScene,
} from "@earth-stories/story-schema";
import "./editor.css";
import "./storyCreation.css";
const meta = {
  title: "Editor/Story creation",
  decorators: [
    (Story) => (
      <main className="story-creation">
        <Story />
      </main>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const project = storyProjectSchema.parse({
  schema: "earth-stories/project/v3",
  id: "river",
  metadata: {
    title: "A river reaches the sea",
    description: "A fictional illustrated journey",
    author: null,
    created: "2026-11-19T00:00:00Z",
    updated: "2026-11-19T00:00:00Z",
  },
  basemap: {
    id: "neutral",
    label: "Neutral",
    styleUrl: "https://example.com/style.json",
    attribution: null,
  },
  publication: { palette: defaultReaderPalette },
  sources: [],
  chapters: [
    {
      id: "opening",
      type: "prose",
      title: "The source",
      narrative: "A fictional river.",
    },
  ],
});
const job = generationJobSchema.parse({
  id: "example",
  stage: "ready",
  brief: {
    title: "River",
    audience: "Public",
    takeaway: "Follow water",
    narrative: "Fictional",
    visualDirection: "Ink",
    references: [],
    requestedOutputs: ["prose"],
  },
  plan: null,
  assets: [],
  candidate: {
    project,
    assets: [],
    warnings: ["Replace placeholder prose before publishing."],
    digest: "example",
  },
  error: null,
  createdAt: "2026-11-19T00:00:00Z",
  updatedAt: "2026-11-19T00:00:00Z",
  usage: [],
  acceptance: null,
});
export const Ready: Story = {
  render: () => (
    <GenerationResult
      onEditInstructions={() => {}}
      job={job}
      accepting={false}
      onAccept={() => {}}
    />
  ),
};
export const Creating: Story = {
  render: () => (
    <GenerationResult
      onEditInstructions={() => {}}
      job={job}
      accepting
      onAccept={() => {}}
    />
  ),
};
export const Waiting: Story = {
  render: () => (
    <GenerationResult
      onEditInstructions={() => {}}
      job={{ ...job, stage: "planning", candidate: null }}
      accepting={false}
      onAccept={() => {}}
    />
  ),
};

const enhancementChapter = {
  id: "visual",
  type: "illustrated",
  title: "From source to sea",
  narrative: "An illustrative journey.",
  alt: "River flow",
  caption: "Illustrative, not measured data",
  scene: composeVectorScene({
    template: "flow",
    heading: "Source to sea",
    labels: ["Source", "Sea"],
    motif: "river",
    motion: true,
  }),
};
const enhancementJob = generationJobSchema.parse({
  ...job,
  enhancement: { projectId: "river", sourceDigest: "original", warnings: [] },
  candidate: {
    ...job.candidate,
    project: {
      ...project,
      chapters: [...project.chapters, enhancementChapter],
    },
  },
  plan: {
    title: "River",
    description: "",
    palette: { ...defaultReaderPalette, mutedText: defaultReaderPalette.text },
    artwork: [],
    warnings: [],
    chapters: [{ ...enhancementChapter, afterChapterId: "opening" }],
    textEdits: [
      {
        chapterId: "opening",
        before: "A fictional river.",
        after: "Follow the river in the illustration below.",
        reason: "Introduce the flow illustration",
        visualChapterId: "visual",
      },
    ],
  },
});
export const EnhancementReview: Story = {
  render: () => (
    <GenerationResult
      onEditInstructions={() => {}}
      job={enhancementJob}
      accepting={false}
      onAccept={() => {}}
    />
  ),
};

export const NarrowReview: Story = {
  ...EnhancementReview,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const WithoutWarnings: Story = {
  render: () => (
    <GenerationResult
      job={{
        ...enhancementJob,
        candidate: { ...enhancementJob.candidate!, warnings: [] },
        plan: { ...enhancementJob.plan!, textEdits: [] },
      }}
      accepting={false}
      onAccept={() => {}}
      onEditInstructions={() => {}}
    />
  ),
};
export const ApplyingEnhancements: Story = {
  render: () => (
    <GenerationResult
      job={enhancementJob}
      accepting
      onAccept={() => {}}
      onEditInstructions={() => {}}
    />
  ),
};
