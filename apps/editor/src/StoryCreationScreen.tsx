import { GenerationProgress } from "./GenerationProgress";
import { compileProject } from "@earth-stories/publisher/compile";
import { resolvePreviewManifest } from "./resolvePreviewManifest";
import { captureEnhancementMaps } from "./EnhancementContextCapture";
import { enhancementDirections } from "./enhancementDirections";
import { EditorBrand } from "./EditorBrand";
import { useEffect, useRef, useState } from "react";
import {
  wholeStoryVisualTreatmentIssue,
  type GenerationJob,
  type PublicationManifest,
  type ReferenceInput,
  type StoryBrief,
  type StoryProject,
} from "@earth-stories/story-schema";
import {
  ActionButton,
  FileInput,
  FormField,
  SelectInput,
  TextArea,
  TextInput,
  StatusNotice,
} from "@earth-stories/ui";
import { StoryViewer } from "@earth-stories/viewer";
import * as api from "./api";
import { parseReferenceLinks } from "./reference-links";
import { ChatGPTConnectionPanel } from "./ChatGPTConnectionPanel";
import { GenerationResult } from "./GenerationResult";
import "./storyCreation.css";
const initial: StoryBrief = {
  title: "",
  audience: "General readers",
  takeaway: "",
  narrative: "",
  visualDirection:
    "Original illustrations of the story’s subject, with continuous scenes and meaningful scroll-driven motion",
  references: [],
  requestedOutputs: ["illustration", "animation", "prose"],
};
const stageLabels = {
  queued: "Waiting to start",
  planning: "Planning chapters and visual direction",
  illustrating: "Composing vector scenes",
  assembling: "Assembling the story",
  validating: "Checking the preview",
  ready: "Ready for your review",
  failed: "Generation needs attention",
  cancelled: "Generation cancelled",
  accepted: "Story created",
};
const terminal = new Set(["ready", "failed", "cancelled", "accepted"]);
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "This action could not finish.";
export function StoryCreationScreen({
  jobId,
  sourceProjectId,
  preview,
  onNavigate,
  onCreated,
  onBack,
  onWorkspace,
}: {
  onWorkspace: () => void;
  jobId: string | null;
  sourceProjectId?: string;
  preview: boolean;
  onNavigate: (jobId: string | null, preview?: boolean) => void;
  onCreated: (id: string) => Promise<void>;
  onBack: () => void;
}) {
  const [source, setSource] = useState<StoryProject | null>(null);
  const [sourceManifest, setSourceManifest] =
    useState<PublicationManifest | null>(null);
  const captureController = useRef<AbortController | null>(null);
  const [preparingContext, setPreparingContext] = useState(false);
  useEffect(() => () => captureController.current?.abort(), []);
  const [brief, setBrief] = useState<StoryBrief>(initial);
  const [editing, setEditing] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [manifest, setManifest] = useState<PublicationManifest | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const submitting = useRef(false),
    acceptLock = useRef(false);
  const enhancing = Boolean(sourceProjectId || job?.enhancement);
  const wholeStoryIssue = source && wholeStoryVisualTreatmentIssue(source);
  const selectedTreatment = brief.visualTreatment ?? "focused";
  const blockedWholeStory =
    enhancing && selectedTreatment === "whole-story" && wholeStoryIssue;
  useEffect(() => {
    if (!sourceProjectId || preview) return;
    let live = true;
    setSource(null);
    setSourceManifest(null);
    void api
      .openProject(sourceProjectId)
      .then((project) => {
        if (!live) return;
        setSourceManifest(
          resolvePreviewManifest(project, compileProject(project)),
        );
        setSource(project);
        if (!jobId)
          setBrief({
            ...initial,
            title: project.metadata.title,
            visualTreatment: wholeStoryVisualTreatmentIssue(project)
              ? "focused"
              : "whole-story",
            narrative: "",
          });
      })
      .catch((cause) => {
        if (live) setError(message(cause));
      });
    return () => {
      live = false;
    };
  }, [sourceProjectId, jobId, preview]);
  useEffect(() => {
    setEditing(false);
    setJob(null);
    setManifest(null);
    setError("");
    if (!jobId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await api.getGeneration(jobId);
        if (!live) return;
        if (sourceProjectId && next.enhancement?.projectId !== sourceProjectId)
          throw new Error(
            "This enhancement belongs to a different story. Return to your story and reopen Enhance with AI.",
          );
        setJob(next);
        if (preview && ["ready", "accepted"].includes(next.stage)) {
          const view = await api.generationPreview(jobId);
          if (live) setManifest(view);
        }
        if (!terminal.has(next.stage)) timer = setTimeout(load, 1500);
      } catch (e) {
        if (live) {
          setError(message(e));
          timer = setTimeout(load, 3000);
        }
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [jobId, preview, pollVersion, sourceProjectId]);
  async function generate() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const links = parseReferenceLinks(urls);
      if (brief.references.length + links.length > 20)
        throw new Error(
          "Use at most 20 references, including files and links.",
        );
      const input = { ...brief, references: [...brief.references, ...links] };
      if (enhancing && !source)
        throw new Error(
          "The original story must finish loading before generation.",
        );
      if (blockedWholeStory) throw new Error(blockedWholeStory);
      const controller = new AbortController();
      captureController.current = controller;
      setPreparingContext(enhancing);
      const maps =
        enhancing && sourceManifest
          ? await captureEnhancementMaps(sourceManifest, controller.signal)
          : {};
      controller.signal.throwIfAborted();
      setPreparingContext(false);
      const created =
        enhancing && source
          ? await api.enhanceStory(
              source.id,
              input,
              Object.fromEntries(Object.entries(maps).slice(0, 12)),
              source.metadata.updated,
            )
          : await api.startGeneration(input);
      onNavigate(created.id);
    } catch (e) {
      setError(message(e));
    } finally {
      captureController.current = null;
      setPreparingContext(false);
      submitting.current = false;
      setBusy(false);
    }
  }
  async function accept() {
    if (
      !job ||
      job.stage !== "ready" ||
      acceptLock.current ||
      actionLock.current
    )
      return;
    acceptLock.current = true;
    setAccepting(true);
    setError("");
    try {
      const result = await api.acceptGeneration(job.id);
      if (result.candidateDigest !== job.candidate?.digest)
        throw new Error("The accepted result did not match this preview.");
      await onCreated(result.projectId);
    } catch (e) {
      setError(message(e));
    } finally {
      acceptLock.current = false;
      setAccepting(false);
    }
  }
  async function files(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      if (files.length + brief.references.length > 20)
        throw new Error("Use at most 20 references.");
      const uploaded: ReferenceInput[] = [];
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${file.name} exceeds 20 MiB.`);
        const types: Record<string, string> = {
          txt: "text/plain",
          md: "text/markdown",
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
        };
        const type = types[file.name.split(".").pop()?.toLowerCase() ?? ""];
        if (!type)
          throw new Error("Use TXT, Markdown, PDF, PNG, JPEG, or WebP files.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () =>
            reject(new Error("Could not read the reference."));
          reader.readAsDataURL(file);
        });
        uploaded.push({
          kind: "upload",
          name: file.name,
          classification: type.startsWith("image/") ? "visual-style" : "facts",
          mediaType: type as Extract<
            ReferenceInput,
            { kind: "upload" }
          >["mediaType"],
          data,
        });
      }
      setBrief((current) => ({
        ...current,
        references: [...current.references, ...uploaded],
      }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const actionLock = useRef(false);
  async function action(fn: () => Promise<unknown>) {
    if (actionLock.current || acceptLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function editInstructions() {
    if (!job) return;
    return action(async () => {
      const restored = await api.getGenerationBrief(job.id);
      if (job.enhancement) {
        const latest = await api.openProject(job.enhancement.projectId);
        const manifest = resolvePreviewManifest(latest, compileProject(latest));
        setSource(latest);
        setSourceManifest(manifest);
      }
      setBrief(
        job.enhancement
          ? {
              ...restored,
              narrative: "",
              visualDirection: enhancementDirections(restored),
            }
          : restored,
      );
      setUrls("");
      setEditing(true);
    });
  }
  const reviewing = Boolean(jobId && !editing);
  const discard = () =>
    action(async () => {
      if (!job) return;
      await api.discardGeneration(job.id);
      onNavigate(null);
    });
  if (preview)
    return (
      <div className="story-preview-shell">
        <header className="story-preview-bar">
          <strong>
            {job?.stage === "accepted"
              ? "Story preview · saved result"
              : "Story preview · not applied or published"}
          </strong>
        </header>
        {error ? <p role="alert">{error}</p> : null}
        {manifest ? (
          <StoryViewer manifest={manifest} />
        ) : (
          <p role="status">Preparing story preview…</p>
        )}
      </div>
    );
  return (
    <>
      <header className="editor-topbar story-creation-topbar">
        <EditorBrand onClick={onWorkspace} />
        <nav aria-label="Story navigation">
          <ActionButton variant="surface" onClick={onBack}>
            {enhancing ? "Back to story" : "Back to stories"}
          </ActionButton>
        </nav>
      </header>
      <main className="story-creation">
        <div
          className={`story-creation__intro${reviewing ? " story-creation__intro--compact" : ""}`}
        >
          {!reviewing ? (
            <p className="eyebrow">
              {enhancing
                ? "Visual direction for your story"
                : "From an idea to a story"}
            </p>
          ) : null}
          <h1>
            {editing
              ? "Edit your story brief"
              : enhancing
                ? "Enhance your story with AI"
                : job
                  ? "Review your new story"
                  : "What story do you want to tell?"}
          </h1>
          {!reviewing ? (
            <p>
              {enhancing
                ? "Add illustrations and animation to your existing story. Its chapters, maps, images and data are preserved; any small supporting text edits are shown for approval."
                : "Describe the audience, message, and visual direction. Review a working preview before adding it to your stories."}
            </p>
          ) : null}
        </div>
        {error ? (
          <StatusNotice tone="danger" title="Something needs attention">
            {error}
          </StatusNotice>
        ) : null}
        {!jobId || editing ? (
          <form
            className="story-creation__form"
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <div className="story-creation__fields">
              {enhancing ? (
                <FormField label="Visual treatment" hint={wholeStoryIssue}>
                  <SelectInput
                    value={selectedTreatment}
                    onChange={(e) =>
                      setBrief({
                        ...brief,
                        visualTreatment: e.target.value as
                          "focused" | "whole-story",
                      })
                    }
                  >
                    <option
                      value="whole-story"
                      disabled={Boolean(wholeStoryIssue)}
                    >
                      Whole story — scenes, transitions and companion artwork
                    </option>
                    <option value="focused">Focused artwork</option>
                  </SelectInput>
                </FormField>
              ) : null}
              {(
                [
                  ["title", "Working title", false],
                  ["audience", "Who is this for?", false],
                  ["takeaway", "What should readers take away?", true],
                  ["narrative", "Story context and source material", true],
                  ["visualDirection", "Visual direction", true],
                ] as const
              )
                .filter(([key]) => !enhancing || key === "visualDirection")
                .map(([key, label, multiline]) => (
                  <FormField
                    key={key}
                    label={
                      enhancing && key === "visualDirection"
                        ? "What would you like to add or change visually?"
                        : label
                    }
                    hint={
                      enhancing
                        ? "Describe the atmosphere, colors, illustration style and motion you want. Your saved story supplies the facts."
                        : undefined
                    }
                    required={key === "title"}
                  >
                    {multiline ? (
                      <TextArea
                        rows={enhancing || key === "narrative" ? 7 : 3}
                        value={brief[key]}
                        onChange={(e) =>
                          setBrief({ ...brief, [key]: e.target.value })
                        }
                      />
                    ) : (
                      <TextInput
                        value={brief[key]}
                        onChange={(e) =>
                          setBrief({ ...brief, [key]: e.target.value })
                        }
                      />
                    )}
                  </FormField>
                ))}
            </div>
            <section>
              <h2>References</h2>
              <p>
                Use factual references for claims and visual references for
                style. Instructions inside reference documents are treated as
                source material.
              </p>
              <FormField
                label="Reference files"
                hint="TXT, Markdown, extractable PDF, PNG, JPEG, or WebP. Up to 20 MiB per file."
              >
                <FileInput
                  multiple
                  accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
                  disabled={busy}
                  onChange={(e) => void files(e.target.files)}
                />
              </FormField>
              {brief.references.map((reference, index) => (
                <div className="story-creation__reference" key={index}>
                  <div>
                    <strong>{reference.name}</strong>
                    {reference.kind === "url" ? (
                      <>
                        <FormField label="Link">
                          <TextInput
                            type="url"
                            required
                            pattern="https://.*"
                            maxLength={2048}
                            value={reference.url}
                            onChange={(e) =>
                              setBrief((current) => ({
                                ...current,
                                references: current.references.map((r, i) =>
                                  i === index && r.kind === "url"
                                    ? {
                                        ...r,
                                        url: e.target.value,
                                        name:
                                          r.name === r.url.slice(0, 200)
                                            ? e.target.value.slice(0, 200)
                                            : r.name,
                                      }
                                    : r,
                                ),
                              }))
                            }
                          />
                        </FormField>
                        <FormField label="What should we use from this reference?">
                          <TextArea
                            rows={2}
                            maxLength={4000}
                            value={reference.notes ?? ""}
                            onChange={(e) =>
                              setBrief((current) => ({
                                ...current,
                                references: current.references.map((r, i) =>
                                  i === index && r.kind === "url"
                                    ? { ...r, notes: e.target.value }
                                    : r,
                                ),
                              }))
                            }
                          />
                        </FormField>
                      </>
                    ) : null}
                  </div>
                  <SelectInput
                    aria-label={`Use ${reference.name} as`}
                    value={reference.classification}
                    onChange={(e) =>
                      setBrief({
                        ...brief,
                        references: brief.references.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                classification: e.target
                                  .value as ReferenceInput["classification"],
                              }
                            : r,
                        ),
                      })
                    }
                  >
                    <option value="facts">Factual reference</option>
                    <option value="visual-style">Visual style</option>
                    <option value="background">Background context</option>
                  </SelectInput>
                  <ActionButton
                    variant="ghost"
                    onClick={() =>
                      setBrief({
                        ...brief,
                        references: brief.references.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </ActionButton>
                </div>
              ))}
              <FormField
                label="Reference links and notes"
                hint="One link or public domain per line, with a note about what to use. For example: example.org — I like the colors. Add links below to choose Visual style, Facts or Background. Webpage previews may be incomplete; screenshots also work."
              >
                <TextArea
                  rows={3}
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                />
              </FormField>
              <ActionButton
                type="button"
                variant="surface"
                disabled={busy || !urls.trim()}
                onClick={() => {
                  try {
                    const links = parseReferenceLinks(urls);
                    if (brief.references.length + links.length > 20)
                      throw new Error("Use at most 20 references.");
                    setBrief((current) => ({
                      ...current,
                      references: [...current.references, ...links],
                    }));
                    setUrls("");
                    setError("");
                  } catch (cause) {
                    setError(message(cause));
                  }
                }}
              >
                Add links
              </ActionButton>
            </section>
            <ChatGPTConnectionPanel
              selectedModel={brief.model}
              onReady={(ready, model) => {
                setConfigured(ready);
                if (model)
                  setBrief((current) =>
                    current.model === model ? current : { ...current, model },
                  );
              }}
            />
            <StatusNotice tone="info" title="Before you generate">
              {enhancing
                ? "Your saved story, supported images, data extracts, available map previews, directions and references will be sent to OpenAI using your ChatGPT plan allowance. You review a private preview before applying it to this story. Content that could not be inspected is listed in the result. Nothing is published."
                : "Your brief and reference contents will be sent to OpenAI using your ChatGPT plan allowance. This creates a private local preview; it does not publish a story."}
            </StatusNotice>
            <div className="story-creation__submit">
              {editing ? (
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancel editing
                </ActionButton>
              ) : null}
              <ActionButton
                type="submit"
                disabled={
                  !configured ||
                  busy ||
                  !brief.title.trim() ||
                  (enhancing && !source) ||
                  Boolean(blockedWholeStory)
                }
              >
                {busy
                  ? preparingContext
                    ? "Preparing story context…"
                    : "Starting generation…"
                  : enhancing
                    ? "Generate visual enhancements"
                    : "Generate story"}
              </ActionButton>
            </div>
          </form>
        ) : job ? (
          <>
            <GenerationProgress
              working={!terminal.has(job.stage)}
              title={
                job.stage === "ready" && enhancing
                  ? "Your enhanced story is ready"
                  : stageLabels[job.stage]
              }
              busy={busy}
              error={job.error}
              onCancel={() =>
                void action(async () =>
                  setJob(await api.cancelGeneration(job.id)),
                )
              }
            >
              {job.stage === "failed" || job.stage === "cancelled" ? (
                <ActionButton
                  disabled={busy}
                  onClick={() => void editInstructions()}
                >
                  Edit instructions
                </ActionButton>
              ) : null}
              {job.stage === "failed" || job.stage === "cancelled" ? (
                <ActionButton
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api.retryGeneration(job.id);
                      setPollVersion((value) => value + 1);
                    })
                  }
                >
                  Retry generation
                </ActionButton>
              ) : null}
            </GenerationProgress>
            {job.stage === "failed" || job.stage === "cancelled" ? (
              <ChatGPTConnectionPanel onReady={() => {}} />
            ) : null}
            {job.candidate &&
            (job.stage === "ready" || job.stage === "accepted") ? (
              <GenerationResult
                job={job}
                accepting={accepting}
                discarding={busy}
                onDiscard={() => void discard()}
                onAccept={() => void accept()}
                onEditInstructions={() => void editInstructions()}
              />
            ) : null}
            {job.stage === "accepted" && job.acceptance ? (
              <ActionButton
                onClick={() => void onCreated(job.acceptance!.projectId)}
              >
                Open created story
              </ActionButton>
            ) : null}
            {terminal.has(job.stage) && !job.candidate ? (
              <ActionButton
                variant="ghost"
                disabled={busy || accepting}
                onClick={() => void discard()}
              >
                {enhancing ? "Discard changes" : "Discard result"}
              </ActionButton>
            ) : null}
            <details>
              <summary>Generation details</summary>
              <p>
                {job.usage.length} completed provider operations reported usage.
                Your ChatGPT account is the source for current usage limits.
              </p>
            </details>
          </>
        ) : (
          <p role="status">Loading generation…</p>
        )}
      </main>
    </>
  );
}
