import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyArtworkMotion,
  createDefaultSourceProvenance,
  type ProjectSource,
  type StoryProject,
} from "@earth-stories/story-schema";
import { compileProject } from "@earth-stories/publisher/compile";
import { FocusedChapterViewer, StoryViewer } from "@earth-stories/viewer";
import {
  ActionButton,
  FileInput,
  FormField,
  SelectInput,
  StatusNotice,
  TextArea,
} from "@earth-stories/ui";
import { IllustrationInspector } from "./IllustrationInspector";
import { ChatGPTConnectionPanel } from "./ChatGPTConnectionPanel";
import {
  artworkAnchors,
  artworkChapter,
  insertArtworkChapter,
  type ArtworkChapter,
} from "./artworkScene";
import * as api from "./api";
import "./illustrationStudio.css";

type Upload = api.PreparedArtworkImage & {
  id: string;
  name: string;
  file: File;
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The illustration could not be prepared.";
function encoded(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () =>
      reject(new Error("Could not read the illustration."));
    reader.readAsDataURL(file);
  });
}
function pngFile(upload: Upload): File {
  return new File(
    [Uint8Array.from(atob(upload.data), (c) => c.charCodeAt(0))],
    `${upload.id}.png`,
    { type: "image/png" },
  );
}
function sourceFor(upload: Upload): ProjectSource {
  return {
    id: upload.id,
    kind: "image",
    label: upload.name,
    path: `assets/${upload.id}.png`,
    sizeBytes: pngFile(upload).size,
    delivery: "included",
    attribution: null,
    provenance: createDefaultSourceProvenance(),
  };
}
export function IllustrationStudio({
  project,
  onSaved,
  onBack,
}: {
  project: StoryProject;
  onSaved: (project: StoryProject, chapterId: string) => void;
  onBack: () => void;
}) {
  const [original, setOriginal] = useState<Upload | null>(null);
  const [layers, setLayers] = useState<Upload[]>([]);
  const [chapter, setChapter] = useState<ArtworkChapter | null>(null);
  const [after, setAfter] = useState<string>(project.chapters.at(-1)?.id ?? "");
  const [busy, setBusy] = useState<"upload" | "motion" | "save" | null>(null);
  const [error, setError] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [preview, setPreview] = useState<"scene" | "scroll" | "still">("scene");
  const [aiOpen, setAiOpen] = useState(false);
  const [direction, setDirection] = useState(
    "Subtle depth and slow movement that preserves the illustration’s composition.",
  );
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const layerInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!original) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [original]);
  const uploads = layers.length ? layers : original ? [original] : [];
  const sources = useMemo(() => uploads.map(sourceFor), [original, layers]);
  const manifest = useMemo(() => {
    if (!chapter) return null;
    const result = compileProject({
      ...project,
      publication: { ...project.publication, profile: "custom" },
      chapters: [chapter],
      sources,
      visualSequences: [],
      visualAccents: [],
    });
    result.assets = result.assets.map((asset) => ({
      ...asset,
      href: `data:image/png;base64,${uploads.find((u) => u.id === asset.id)!.data}`,
    }));
    return result;
  }, [chapter, sources, project]);
  async function upload(files: FileList | null, isOriginal: boolean) {
    if (!files?.length || lock.current) return;
    lock.current = true;
    setBusy("upload");
    setError("");
    const active = new AbortController();
    controller.current = active;
    try {
      if (!isOriginal && !original)
        throw new Error("Upload the original illustration first.");
      if (!isOriginal && files.length + layers.length > 6)
        throw new Error("Use at most six prepared layers.");
      const total =
        [...files].reduce((n, f) => n + f.size, 0) +
        (isOriginal
          ? 0
          : (original?.file.size ?? 0) +
            layers.reduce((n, l) => n + l.file.size, 0));
      if (total > 60 * 1024 * 1024)
        throw new Error(
          "Keep the illustration and its layers below 60 MiB combined.",
        );
      const added: Upload[] = [];
      for (const file of [...files]) {
        if (
          !/\.(png|jpe?g|webp)$/i.test(file.name) ||
          file.size > 20 * 1024 * 1024
        )
          throw new Error("Use PNG, JPEG or WebP files no larger than 20 MiB.");
        const prepared = await api.prepareArtworkImage(
          await encoded(file),
          active.signal,
        );
        active.signal.throwIfAborted();
        if (prepared.width < 100 || prepared.height < 100)
          throw new Error("Use artwork at least 100 pixels wide and tall.");
        if (
          !isOriginal &&
          (prepared.width !== original!.width ||
            prepared.height !== original!.height)
        )
          throw new Error(
            "Export each layer on the same full-size canvas as the original illustration, with transparency around the object.",
          );
        added.push({
          ...prepared,
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ""),
          file,
        });
      }
      if (isOriginal) {
        const first = added[0]!;
        setOriginal(first);
        setLayers([]);
        setChapter(
          artworkChapter(crypto.randomUUID(), first.name, first, [first]),
        );
      } else {
        const next = [...layers, ...added];
        setLayers(next);
        setChapter((current) => {
          const fresh = artworkChapter(
            current!.id,
            current!.title,
            original!,
            next,
          );
          return {
            ...current!,
            scene: {
              ...current!.scene,
              layers: [
                ...fresh.scene.layers.map(
                  (layer) =>
                    current!.scene.layers.find((l) => l.id === layer.id) ??
                    layer,
                ),
                ...current!.scene.layers.filter((l) => l.kind !== "image"),
              ],
            },
          };
        });
      }
    } catch (cause) {
      if (!active.signal.aborted) setError(message(cause));
    } finally {
      controller.current = null;
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function suggest() {
    if (!chapter || lock.current) return;
    lock.current = true;
    setBusy("motion");
    setError("");
    const active = new AbortController();
    controller.current = active;
    try {
      const images = chapter.scene.layers.flatMap((layer) => {
        if (layer.kind !== "image") return [];
        const file = uploads.find((u) => u.id === layer.sourceId)!;
        return [{ id: layer.id, name: layer.alt, data: file.thumbnail }];
      });
      const plan = await api.suggestArtworkMotion(
        {
          model,
          direction,
          context: JSON.stringify({
            title: project.metadata.title,
            chapters: project.chapters.map((c) => ({
              title: c.title,
              narrative: c.narrative,
            })),
          }).slice(0, 20000),
          images,
        },
        active.signal,
      );
      active.signal.throwIfAborted();
      setChapter({
        ...chapter,
        scene: applyArtworkMotion(chapter.scene, plan),
      });
    } catch (cause) {
      if (!active.signal.aborted) setError(message(cause));
    } finally {
      controller.current = null;
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function apply() {
    if (!chapter || !original || lock.current) return;
    lock.current = true;
    setBusy("save");
    setError("");
    try {
      // Validate the complete proposal before importing any files. The ordinary
      // save checks the source version again under the project lock.
      insertArtworkChapter(project, chapter, sources, after || null);
      const imported: ProjectSource[] = [];
      for (const upload of uploads) {
        const asset = await api.importAsset(project.id, pngFile(upload));
        imported.push({
          ...sourceFor(upload),
          path: asset.path,
          sizeBytes: asset.sizeBytes,
        } as ProjectSource);
      }
      const retained = await api.importAsset(project.id, original.file);
      imported.push({
        id: `original-${original.id}`,
        kind: "image",
        label: `Original artwork — ${original.name}`,
        path: retained.path,
        sizeBytes: retained.sizeBytes,
        delivery: "included",
        attribution: null,
        provenance: createDefaultSourceProvenance(),
      });
      const saved = await api.saveProject(
        insertArtworkChapter(project, chapter, imported, after || null),
      );
      if (alive.current) onSaved(saved, chapter.id);
    } catch (cause) {
      if (alive.current) setError(message(cause));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  return (
    <main className="illustration-studio">
      <header className="illustration-studio__header">
        <div>
          <p className="eyebrow">Story settings</p>
          <h1>Animate an illustration</h1>
        </div>
        <ActionButton
          variant="surface"
          disabled={busy === "save"}
          onClick={() => {
            if (
              !original ||
              window.confirm("Discard this unsaved illustration preview?")
            ) {
              controller.current?.abort();
              onBack();
            }
          }}
        >
          Back to story
        </ActionButton>
      </header>
      <p>
        Bring artwork you love, preview gentle scroll motion, then add it as a
        new chapter. Existing story content stays intact.
      </p>
      {error ? (
        <StatusNotice tone="danger" title="Illustration needs attention">
          {error}
        </StatusNotice>
      ) : null}
      <fieldset
        disabled={busy !== null}
        className="illustration-studio__uploads"
      >
        <FormField
          label="Original illustration"
          hint="PNG, JPEG or WebP, up to 20 MiB. The original file is retained when you add the scene."
        >
          <FileInput
            accept=".png,.jpg,.jpeg,.webp"
            onChange={(e) => {
              void upload(e.target.files, true);
              e.target.value = "";
            }}
          />
        </FormField>
        {original ? (
          <>
            <p>Original: {original.file.name}</p>
            <FormField
              label="Prepared layers (optional)"
              hint={`Up to six images, exported on the original ${original.width} × ${original.height} canvas. Use a background first, then transparent foreground layers. We do not separate the image automatically.`}
            >
              <FileInput
                ref={layerInput}
                multiple
                accept=".png,.webp"
                onChange={(e) => {
                  void upload(e.target.files, false);
                  e.target.value = "";
                }}
              />
            </FormField>
            <p>
              {layers.length
                ? "Prepared layers replace the original image in the scene. The original stays in your story’s data library."
                : "Using one image: motion affects the whole illustration. Upload prepared layers for independent movement."}
            </p>
            {layers.slice(1).some((l) => !l.hasTransparency) ? (
              <StatusNotice tone="warning" title="An upper layer is opaque">
                It may hide the artwork behind it. Check the preview or export
                that layer with a transparent background.
              </StatusNotice>
            ) : null}
          </>
        ) : null}
      </fieldset>
      {busy ? (
        <div role="status">
          {busy === "upload"
            ? "Preparing artwork…"
            : busy === "motion"
              ? "Suggesting gentle motion…"
              : "Saving the illustration…"}
          {busy !== "save" ? (
            <ActionButton
              variant="ghost"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </ActionButton>
          ) : null}
        </div>
      ) : null}
      {chapter && manifest ? (
        <>
          <div className="illustration-studio__layout">
            <section
              className="illustration-studio__preview"
              aria-label="Illustration preview"
            >
              <div className="field-row">
                <FormField label="Preview mode">
                  <SelectInput
                    value={preview}
                    onChange={(e) =>
                      setPreview(e.target.value as typeof preview)
                    }
                  >
                    <option value="scene">Scene controls</option>
                    <option value="scroll">Scroll through scene</option>
                    <option value="still">Still frame</option>
                  </SelectInput>
                </FormField>
                <FormField label="Preview width">
                  <SelectInput
                    value={narrow ? "narrow" : "wide"}
                    onChange={(e) => setNarrow(e.target.value === "narrow")}
                  >
                    <option value="wide">Desktop</option>
                    <option value="narrow">Narrow screen</option>
                  </SelectInput>
                </FormField>
              </div>
              <div
                className={`illustration-studio__canvas${narrow ? " illustration-studio__canvas--narrow" : ""}`}
              >
                {preview === "scroll" ? (
                  <StoryViewer manifest={manifest} />
                ) : (
                  <FocusedChapterViewer
                    manifest={manifest}
                    chapterId={chapter.id}
                    snapshotMode={preview === "still"}
                  />
                )}
              </div>
              <p>Private preview · not added or published</p>
            </section>
            <fieldset
              disabled={busy !== null}
              className="illustration-studio__controls"
            >
              <IllustrationInspector
                chapter={chapter}
                sources={sources}
                sourceUsage={{}}
                onChange={setChapter}
                onAddData={() => layerInput.current?.click()}
                onEditSource={() => {}}
                allowDataEditing={false}
              />
            </fieldset>
          </div>
          <section className="illustration-studio__ai">
            <ActionButton
              variant="surface"
              disabled={busy !== null}
              onClick={() => setAiOpen(!aiOpen)}
            >
              {aiOpen ? "Hide motion assistant" : "Suggest motion with ChatGPT"}
            </ActionButton>
            {aiOpen ? (
              <>
                <FormField label="Motion direction">
                  <TextArea
                    value={direction}
                    maxLength={4000}
                    disabled={busy !== null}
                    onChange={(e) => setDirection(e.target.value)}
                  />
                </FormField>
                <ChatGPTConnectionPanel
                  selectedModel={model}
                  onReady={(connected, selected) => {
                    setReady(connected);
                    setModel(selected);
                  }}
                />
                <p>
                  Suggesting motion sends small previews of the active image
                  layers, your direction, and up to 20,000 characters of story
                  context to OpenAI using your ChatGPT allowance. It changes
                  motion only; it does not create or separate artwork.
                </p>
                <ActionButton
                  disabled={
                    !ready ||
                    busy !== null ||
                    !direction.trim() ||
                    !chapter.scene.layers.some((l) => l.kind === "image")
                  }
                  onClick={() => void suggest()}
                >
                  Suggest layer motion
                </ActionButton>
              </>
            ) : null}
          </section>
          <fieldset
            disabled={busy !== null}
            className="illustration-studio__apply"
          >
            <FormField label="Insert illustration after">
              <SelectInput
                value={after}
                onChange={(e) => setAfter(e.target.value)}
              >
                <option value="">Before the first chapter</option>
                {artworkAnchors(project).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || "Untitled chapter"}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <p>
              Adding saves this scene and its artwork to your story. Nothing is
              published. You can continue editing the layers in the chapter
              inspector.
            </p>
            <ActionButton
              disabled={!chapter.scene.layers.some((l) => l.kind === "image")}
              onClick={() => void apply()}
            >
              Add illustration to story
            </ActionButton>
          </fieldset>
        </>
      ) : null}
    </main>
  );
}
