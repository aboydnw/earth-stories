import { open, realpath, stat } from "node:fs/promises";
import { relative, isAbsolute, extname, sep } from "node:path";
import {
  storyProjectSchema,
  type StoryProject,
  type PreparedReference,
  type ReferenceInput,
} from "@earth-stories/story-schema";
import type { ProjectStore } from "@earth-stories/project-store";
import { prepareReferences } from "./reference-inputs.js";
export type SourceFile = { path: string; size: number; modified: number };
export type EnhancementSnapshot = {
  project: StoryProject;
  files: SourceFile[];
  references: PreparedReference[];
  warnings: string[];
};

async function safeProjectDirectory(store: ProjectStore, id: string) {
  const base = await realpath(store.projectPath(id));
  const workspace = await realpath(store.root);
  if (relative(workspace, base) !== id)
    throw new Error(
      "Story folders cannot redirect outside their workspace location.",
    );
  return base;
}
export async function safeSourcePath(
  store: ProjectStore,
  id: string,
  path: string,
) {
  const base = await safeProjectDirectory(store, id);
  const target = await realpath(store.assetPath(id, path));
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("Asset is outside the story folder.");
  return target;
}
export async function verifySourceFiles(
  store: ProjectStore,
  snapshot: EnhancementSnapshot,
) {
  await safeProjectDirectory(store, snapshot.project.id);
  for (const file of snapshot.files) {
    const info = await stat(
      await safeSourcePath(store, snapshot.project.id, file.path),
    );
    if (info.size !== file.size || info.mtimeMs !== file.modified)
      throw new Error(
        "A story asset changed during generation. Generate a fresh enhancement before applying.",
      );
  }
}
export async function enhancementContext(
  store: ProjectStore,
  projectId: string,
  maps: Record<string, string>,
  signal: AbortSignal,
): Promise<EnhancementSnapshot> {
  await safeProjectDirectory(store, projectId);
  const project = storyProjectSchema.parse(await store.read(projectId));
  if (JSON.stringify(project).length > 500000)
    throw new Error(
      "This story is too large for enhancement context (500,000 characters).",
    );
  const files: SourceFile[] = [],
    references: PreparedReference[] = [],
    warnings: string[] = [];
  let bytesUsed = 0,
    images = 0,
    textCharacters = 0;
  for (const source of project.sources) {
    signal.throwIfAborted();
    const path =
      "path" in source
        ? source.path
        : "locator" in source
          ? source.locator
          : null;
    if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
      warnings.push(
        `${source.label}: configuration and attribution included; connected content was not downloaded for AI inspection.`,
      );
      continue;
    }
    try {
      const target = await safeSourcePath(store, projectId, path);
      const info = await stat(target);
      if (!info.isFile()) throw new Error("Not a file");
      files.push({ path, size: info.size, modified: info.mtimeMs });
      const image = source.kind === "image";
      const text =
        source.kind === "csv" ||
        source.kind === "local-geojson" ||
        source.kind === "trajectory";
      const limit = image ? 8 * 1024 * 1024 : 200000;
      if (
        (!image && !text) ||
        (text && textCharacters >= 200000) ||
        (image && images >= 8) ||
        info.size > limit ||
        bytesUsed + info.size > 32 * 1024 * 1024
      ) {
        warnings.push(
          `${source.label}: metadata included; file contents were not inspected (format or context size limit).`,
        );
        continue;
      }
      const file = await open(target, "r");
      let data: Buffer;
      try {
        const buffer = Buffer.alloc(limit + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > limit) throw new Error("Too large");
        data = buffer.subarray(0, bytesRead);
      } finally {
        await file.close();
      }
      bytesUsed += data.length;
      if (image) {
        const mediaType = (
          {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
          } as const
        )[extname(path).toLowerCase() as ".png"];
        if (!mediaType) throw new Error("Unsupported image");
        const prepared = await prepareReferences(
          [
            {
              kind: "upload",
              name: source.label,
              classification: "facts",
              mediaType,
              data: data.toString("base64"),
            },
          ],
          signal,
        );
        references.push({ ...prepared[0]!, id: `story-source-${source.id}` });
        images++;
      } else {
        // Bounded raw extracts retain values and field names without inventing statistics.
        textCharacters += Math.min(data.length, 20000);
        references.push({
          id: `story-source-${source.id}`,
          name: source.label,
          classification: "facts",
          text: data.toString("utf8").slice(0, 20000),
        });
        if (data.length > 20000)
          warnings.push(
            `${source.label}: only the first 20,000 characters were inspected.`,
          );
      }
    } catch {
      signal.throwIfAborted();
      warnings.push(
        `${source.label}: configuration retained, but local content could not be inspected.`,
      );
    }
  }
  for (const chapter of project.chapters) {
    if (!["map", "scrolly", "flyover"].includes(chapter.type)) continue;
    const capture = maps[chapter.id];
    if (
      !capture ||
      images >= 12 ||
      !capture.startsWith("data:image/png;base64,")
    ) {
      warnings.push(
        `${chapter.title}: map configuration included; no readable map preview was available.`,
      );
      continue;
    }
    try {
      const input: ReferenceInput = {
        kind: "upload",
        name: `Map preview: ${chapter.title}`,
        classification: "facts",
        mediaType: "image/png",
        data: capture.slice("data:image/png;base64,".length),
      };
      const prepared = await prepareReferences([input], signal);
      references.push({ ...prepared[0]!, id: `map-preview-${chapter.id}` });
      images++;
    } catch {
      signal.throwIfAborted();
      warnings.push(`${chapter.title}: map preview could not be inspected.`);
    }
  }
  if (project.dataAssets.length)
    warnings.push(
      "Data library metadata is included. Raw library assets are inspected only when used by a supported story source.",
    );
  if (project.chapters.some((c) => c.type === "video"))
    warnings.push(
      "Video metadata is included; video and audio contents are not inspected.",
    );
  if (warnings.length)
    references.push({
      id: "story-context-coverage",
      name: "Context coverage limits",
      classification: "background",
      text: warnings.join("\n"),
    });
  await verifySourceFiles(store, { project, files, references, warnings });
  return { project, files, references, warnings };
}
