import { useRef, useState } from "react";
import type { ReferenceInput } from "@earth-stories/story-schema";
import {
  ActionButton,
  FileInput,
  FormField,
  StatusNotice,
  TextInput,
} from "@earth-stories/ui";
import { prepareArtworkImage } from "./api";
export function SuppliedArtworkFields({
  references,
  onChange,
  disabled,
  onBusy,
}: {
  references: ReferenceInput[];
  onChange: (references: ReferenceInput[]) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const lock = useRef(false);
  const images = references.filter(
    (r): r is Extract<ReferenceInput, { kind: "upload" }> =>
      r.kind === "upload" && Boolean(r.artworkRole),
  );
  const original = images.find((r) => r.artworkRole === "original");
  async function upload(files: FileList | null, role: "original" | "layer") {
    if (!files?.length || lock.current) return;
    const selected = Array.from(files);
    lock.current = true;
    onBusy(true);
    setError("");
    try {
      if (
        role === "layer" &&
        (!original || images.length + selected.length > 7)
      )
        throw new Error(
          "Add an original first, then up to six prepared layers.",
        );
      const retained =
        role === "original"
          ? references.filter((r) => r.kind !== "upload" || !r.artworkRole)
          : references;
      if (retained.length + selected.length > 20)
        throw new Error(
          "Use at most 20 references and artwork files combined.",
        );
      const prepared: ReferenceInput[] = [];
      const originalSize =
        role === "layer" && original
          ? await prepareArtworkImage(original.data)
          : null;
      for (const file of selected) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${file.name} exceeds 20 MiB.`);
        if (!/\.(png|jpe?g|webp)$/i.test(file.name))
          throw new Error("Use PNG, JPEG or WebP artwork.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("Could not read artwork."));
          reader.readAsDataURL(file);
        });
        const image = await prepareArtworkImage(data);
        if (
          originalSize &&
          (image.width !== originalSize.width ||
            image.height !== originalSize.height)
        )
          throw new Error(
            "Prepared layers must use the same full canvas dimensions as the original.",
          );
        prepared.push({
          kind: "upload",
          name: (file.name.replace(/\.[^.]+$/, "") || "Illustration").slice(
            0,
            200,
          ),
          classification: "visual-style",
          mediaType: "image/png",
          data: image.data,
          artworkRole: role,
        });
      }
      if (
        [...retained, ...prepared].reduce(
          (n, r) =>
            n +
            (r.kind === "upload" && r.artworkRole
              ? (r.data.length * 3) / 4
              : 0),
          0,
        ) >
        60 * 1024 * 1024
      )
        throw new Error(
          "Keep the illustration and layers below 60 MiB combined.",
        );
      onChange([...retained, ...prepared]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not prepare artwork.",
      );
    } finally {
      lock.current = false;
      onBusy(false);
    }
  }
  return (
    <section aria-label="Supplied illustration">
      <h2>Your illustration</h2>
      <p>
        Give the story a visual starting point. The agent will use this artwork
        across scenes, transitions and companion illustrations, with motion and
        supporting vectors that fit your story. You’ll review the whole result
        before applying it.
      </p>
      <FormField
        label="Original illustration"
        hint="PNG, JPEG or WebP, up to 20 MiB. One image is enough; replacing it clears any prepared layers."
      >
        <FileInput
          accept=".png,.jpg,.jpeg,.webp"
          disabled={disabled}
          onChange={(e) => {
            void upload(e.target.files, "original");
            e.target.value = "";
          }}
        />
      </FormField>
      {original ? (
        <>
          <p>
            A single illustration supports gentle framing and whole-image
            motion. Objects within it cannot move independently.
          </p>
          <FormField
            label="Prepared layers (optional)"
            hint="Up to six full-canvas PNG or WebP layers, prepared by you. Keep the original canvas size; use transparency around isolated objects. There is no automatic separation."
          >
            <FileInput
              multiple
              accept=".png,.webp"
              disabled={disabled || images.length >= 7}
              onChange={(e) => {
                void upload(e.target.files, "layer");
                e.target.value = "";
              }}
            />
          </FormField>
        </>
      ) : null}
      {images.map((image) => (
        <div
          className="story-creation__reference"
          key={references.indexOf(image)}
        >
          <img
            src={`data:image/png;base64,${image.data}`}
            alt={image.name}
            width={96}
            height={64}
            style={{ objectFit: "contain" }}
          />
          <FormField
            label={
              image.artworkRole === "original"
                ? "Illustration description"
                : "Layer description"
            }
          >
            <TextInput
              maxLength={200}
              value={image.name}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  references.map((r) =>
                    r === image ? { ...image, name: e.target.value } : r,
                  ),
                )
              }
            />
          </FormField>
          <ActionButton
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange(
                references.filter((r) =>
                  image.artworkRole === "original"
                    ? r.kind !== "upload" || !r.artworkRole
                    : r !== image,
                ),
              )
            }
          >
            Remove {image.artworkRole === "original" ? "illustration" : "layer"}
          </ActionButton>
        </div>
      ))}
      {error ? (
        <StatusNotice title="Artwork needs attention" tone="danger">
          {error}
        </StatusNotice>
      ) : null}
    </section>
  );
}
