import { compileProject } from "@earth-stories/publisher/compile";
import { resolvePreviewManifest } from "./resolvePreviewManifest";
import { captureMapSnapshots } from "./captureSnapshots";
import { useEffect, useRef, useState } from "react";
import type {
  GenerationJob,
  PublicationManifest,
  ReferenceInput,
  StoryBrief,
  StoryProject,
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
}: {
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
  const sourcePreview = useRef<HTMLDivElement>(null);
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
      const maps =
        enhancing && sourcePreview.current
          ? await captureMapSnapshots(sourcePreview.current)
          : {};
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
      submitting.current = false;
      setBusy(false);
    }
  }
  async function accept() {
    if (!job || job.stage !== "ready" || acceptLock.current) return;
    acceptLock.current = true;
    setAccepting(true);
    setError("");
    try {
      const result = await api.acceptGeneration(job.id);
      if (result.candidateDigest !== job.candidate?.digest)
        throw new Error("The accepted candidate did not match this preview.");
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
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (preview)
    return (
      <div className="story-preview-shell">
        <header className="story-preview-bar">
          <a
            href={
              sourceProjectId
                ? `/stories/${encodeURIComponent(sourceProjectId)}/enhance/${encodeURIComponent(jobId ?? "")}`
                : `/create/${encodeURIComponent(jobId ?? "")}`
            }
          >
            Back to candidate
          </a>
          <strong>Candidate preview · not applied or published</strong>
        </header>
        {error ? <p role="alert">{error}</p> : null}
        {manifest ? (
          <StoryViewer manifest={manifest} />
        ) : (
          <p role="status">Preparing candidate preview…</p>
        )}
      </div>
    );
  return (
    <main className="story-creation">
      <header className="story-creation__header">
        <ActionButton variant="ghost" onClick={onBack}>
          {enhancing ? "Back to story" : "Back to stories"}
        </ActionButton>
        <span>
          Earth Stories / {enhancing ? "Visual enhancement" : "Story creation"}
        </span>
      </header>
      <div className="story-creation__intro">
        <p className="eyebrow">
          {enhancing
            ? "Visual direction for your story"
            : "From an idea to a story"}
        </p>
        <h1>
          {editing
            ? "Edit your story brief"
            : enhancing
              ? "Enhance your story with AI"
              : job
                ? "Review your new story"
                : "What story do you want to tell?"}
        </h1>
        <p>
          {enhancing
            ? "Add illustrations and animation to your existing story. Its chapters, maps, images and data are preserved; any small supporting text edits are shown for approval."
            : "Describe the audience, message, and visual direction. Review a working preview before adding it to your stories."}
        </p>
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
          <ChatGPTConnectionPanel
            onReady={(ready, model) => {
              setConfigured(ready);
              setBrief((current) =>
                current.model === model ? current : { ...current, model },
              );
            }}
          />
          <div className="story-creation__fields">
            {(
              [
                ["title", "Working title", false],
                ["audience", "Who is this for?", false],
                ["takeaway", "What should readers take away?", true],
                ["narrative", "Story context and source material", true],
                ["visualDirection", "Visual direction", true],
              ] as const
            )
              .filter(
                ([key]) =>
                  !enhancing ||
                  key === "narrative" ||
                  key === "visualDirection",
              )
              .map(([key, label, multiline]) => (
                <FormField
                  key={key}
                  label={
                    enhancing && key === "narrative"
                      ? "Additional context for the visuals"
                      : label
                  }
                  required={key === "title"}
                >
                  {multiline ? (
                    <TextArea
                      rows={key === "narrative" ? 7 : 3}
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
              Use factual references for claims and visual references for style.
              Instructions inside reference documents are treated as source
              material.
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
                <strong>{reference.name}</strong>
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
              label="Public reference links"
              hint="One HTTPS link per line, directly to a supported file—not a webpage. Put descriptions in Visual direction or Story context and source material. For webpage styling, upload a screenshot and select Visual style."
            >
              <TextArea
                rows={3}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
              />
            </FormField>
          </section>
          <StatusNotice tone="info" title="Before you generate">
            {enhancing
              ? "Your saved story, supported images, data extracts, available map previews, directions and references will be sent to OpenAI using your ChatGPT plan allowance. You review a private candidate before applying it to this story. Content that could not be inspected is listed in the result. Nothing is published."
              : "Your brief and reference contents will be sent to OpenAI using your ChatGPT plan allowance. This creates a private local candidate; it does not publish a story."}
          </StatusNotice>
          <ActionButton
            type="submit"
            disabled={
              !configured ||
              busy ||
              !brief.title.trim() ||
              (enhancing && !source)
            }
          >
            {busy
              ? "Starting generation…"
              : enhancing
                ? "Generate visual enhancements"
                : "Generate story"}
          </ActionButton>
        </form>
      ) : job ? (
        <>
          <section className="story-creation__progress" aria-live="polite">
            <h2>{stageLabels[job.stage]}</h2>
            {!terminal.has(job.stage) ? (
              <p>Composing editable chapters and vector scenes.</p>
            ) : null}
            {job.error ? <p>{job.error}</p> : null}
            {!terminal.has(job.stage) ? (
              <ActionButton
                disabled={busy}
                onClick={() =>
                  void action(async () =>
                    setJob(await api.cancelGeneration(job.id)),
                  )
                }
              >
                Cancel generation
              </ActionButton>
            ) : null}
            {job.stage === "failed" ||
            job.stage === "cancelled" ||
            (job.enhancement && job.stage === "ready") ? (
              <ActionButton
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const restored = await api.getGenerationBrief(job.id);
                    if (job.enhancement) {
                      const latest = await api.openProject(
                        job.enhancement.projectId,
                      );
                      const manifest = resolvePreviewManifest(
                        latest,
                        compileProject(latest),
                      );
                      setSource(latest);
                      setSourceManifest(manifest);
                    }
                    setBrief(restored);
                    setUrls("");
                    setEditing(true);
                  })
                }
              >
                Edit brief and references
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
          </section>
          {job.stage === "failed" || job.stage === "cancelled" ? (
            <ChatGPTConnectionPanel onReady={() => {}} />
          ) : null}
          {job.stage !== "failed" && job.stage !== "cancelled" ? (
            <GenerationResult
              job={job}
              accepting={accepting}
              onAccept={() => void accept()}
            />
          ) : null}
          {job.stage === "accepted" && job.acceptance ? (
            <ActionButton
              onClick={() => void onCreated(job.acceptance!.projectId)}
            >
              Open created story
            </ActionButton>
          ) : null}
          <div className="story-creation__actions">
            <ActionButton
              variant="ghost"
              disabled={busy}
              onClick={() => onNavigate(null)}
            >
              {enhancing ? "Start a fresh enhancement" : "Start another brief"}
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={busy || accepting}
              onClick={() =>
                void action(async () => {
                  await api.discardGeneration(job.id);
                  onNavigate(null);
                })
              }
            >
              Discard candidate files
            </ActionButton>
          </div>
          <details>
            <summary>Recorded API usage</summary>
            <p>
              {job.usage.length} completed provider operations reported usage.
              Your OpenAI account is the source for billing totals.
            </p>
          </details>
        </>
      ) : (
        <p role="status">Loading generation…</p>
      )}
      {(!jobId || editing) && enhancing && sourceManifest ? (
        <section ref={sourcePreview} aria-label="Original story context">
          <h2>Original story</h2>
          <p>
            Existing content is included as context. Maps that cannot finish
            loading are identified in the result.
          </p>
          <StoryViewer manifest={sourceManifest} snapshotMode />
        </section>
      ) : null}
    </main>
  );
}
