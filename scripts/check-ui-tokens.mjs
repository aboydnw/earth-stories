import { readFile } from "node:fs/promises";

const editorCss = await readFile(
  new URL("../apps/editor/src/editor.css", import.meta.url),
  "utf8",
);
const hardcodedColors = editorCss.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
if (hardcodedColors.length) {
  throw new Error(
    `Editor CSS bypasses @earth-stories/ui tokens: ${[...new Set(hardcodedColors)].join(", ")}`,
  );
}
if (!editorCss.includes("var(--es-action)"))
  throw new Error("Editor CSS is not consuming the shared UI token contract");

process.stdout.write("Shared UI token check passed.\n");
