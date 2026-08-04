import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { publicationManifestSchema } from "@earth-stories/story-schema";
import { StoryViewer } from "@earth-stories/viewer";
import "./viewer-app.css";

async function start() {
  const response = await fetch("./publication.json");
  if (!response.ok)
    throw new Error(`Could not load publication (${response.status})`);
  const manifest = publicationManifestSchema.parse(await response.json());
  document.title = manifest.metadata.title;
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing application root");
  createRoot(root).render(
    <StrictMode>
      <StoryViewer
        manifest={manifest}
        theme={(() => {
          const requested = new URLSearchParams(window.location.search).get(
            "theme",
          );
          return requested === "editorial" || requested === "cng"
            ? requested
            : undefined;
        })()}
        embed={
          window.location.pathname.endsWith("/embed.html") ||
          window.location.pathname.endsWith("embed.html")
        }
      />
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root)
    root.textContent = error instanceof Error ? error.message : String(error);
});
