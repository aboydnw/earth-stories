import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EarthStoriesProvider } from "@earth-stories/ui";
import { App } from "./App";
import "@earth-stories/ui/styles.css";
import "./editor.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <StrictMode>
    <EarthStoriesProvider>
      <App />
    </EarthStoriesProvider>
  </StrictMode>,
);
