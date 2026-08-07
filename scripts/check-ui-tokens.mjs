import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import colorNames from "color-name";

const root = new URL("../", import.meta.url);
const exceptions = JSON.parse(
  await readFile(new URL("scripts/ui-color-exceptions.json", root), "utf8"),
);

async function filesUnder(path) {
  const absolute = fileURLToPath(new URL(`${path}/`, root));
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if ([".css", ".ts", ".tsx"].includes(extname(entry.name)))
        output.push(target);
    }
  }
  await visit(absolute);
  return output;
}

const productFiles = [
  ...(await filesUnder("apps/editor/src")),
  ...(await filesUnder("packages/ui/src")),
].filter((path) => !path.endsWith("packages/ui/src/tokens.ts"));

function relativeFile(path) {
  return relative(fileURLToPath(new URL(".", root)), path)
    .split(sep)
    .join("/");
}

function exceptionAllows(file, source, match) {
  const start = source.lastIndexOf("\n", match.index ?? 0) + 1;
  const end = source.indexOf("\n", match.index ?? 0);
  const line = source.slice(start, end === -1 ? undefined : end);
  return exceptions.some(
    (entry) =>
      entry.file === file &&
      entry.value.toLowerCase() === match[0].toLowerCase() &&
      typeof entry.context === "string" &&
      line.includes(entry.context),
  );
}

const violations = [];
for (const path of productFiles) {
  const source = await readFile(path, "utf8");
  const file = relativeFile(path);
  for (const match of source.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) {
    if (!exceptionAllows(file, source, match))
      violations.push(`${file}: unapproved interface color ${match[0]}`);
  }
  for (const match of source.matchAll(/\bhsla?\([^)]*\)/gi)) {
    if (!exceptionAllows(file, source, match))
      violations.push(`${file}: unapproved interface color ${match[0]}`);
  }
  const namedColorPattern = file.endsWith(".css")
    ? /(?:^|[;{]\s*)(?:background(?:-color)?|color|border(?:-[a-z-]+)?-color|outline-color|fill|stroke)\s*:\s*([a-z]+)\s*(?=[;}!])/gim
    : /\b(?:background(?:Color)?|color|borderColor|outlineColor|fill|stroke)\s*:\s*["']([a-z]+)["']/gim;
  for (const match of source.matchAll(namedColorPattern)) {
    const value = match[1].toLowerCase();
    if (
      !exceptionAllows(file, source, {
        0: match[1],
        index: match.index,
      }) &&
      value in colorNames &&
      ![
        "inherit",
        "initial",
        "none",
        "revert",
        "revert-layer",
        "transparent",
        "unset",
      ].includes(value)
    )
      violations.push(`${file}: unapproved named interface color ${match[1]}`);
  }
  if (
    /(?:z-index\s*:\s*-?\d+|\bzIndex\s*(?:=|:)\s*(?:\{\s*)?["']?-?\d+)/i.test(
      source,
    )
  )
    violations.push(`${file}: use the documented z-index variables`);
}

const tokenSource = await readFile(
  new URL("packages/ui/src/tokens.ts", root),
  "utf8",
);
const definedVariables = new Set(
  [...tokenSource.matchAll(/"(--es-[a-z0-9-]+)"\s*:/g)].map(
    (match) => match[1],
  ),
);
for (const path of productFiles) {
  const source = await readFile(path, "utf8");
  const file = relativeFile(path);
  for (const variable of source.match(/--es-[a-z0-9-]+/g) ?? []) {
    if (!definedVariables.has(variable))
      violations.push(`${file}: ${variable} is not defined by tokens.ts`);
  }
  if (
    /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|api\.fontshare\.com)/.test(
      source,
    )
  )
    violations.push(`${file}: product fonts must be bundled`);
}
const viewerCss = await readFile(
  new URL("packages/viewer/src/viewer.css", root),
  "utf8",
);
if (
  /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|api\.fontshare\.com)/.test(
    viewerCss,
  )
)
  violations.push(
    "packages/viewer/src/viewer.css: reader fonts must be bundled",
  );

const theme = await readFile(new URL("packages/ui/src/theme.ts", root), "utf8");
if (!theme.includes("productCssVariables") || !theme.includes("productTokens"))
  violations.push(
    "Chakra and CSS variables must derive from the canonical token contract",
  );

const storyFiles = [
  ...(await filesUnder("packages/ui/src")),
  ...(await filesUnder("apps/editor/src")),
].filter((path) => path.includes(".stories."));
const stories = (
  await Promise.all(storyFiles.map((path) => readFile(path, "utf8")))
).join("\n");
for (const component of [
  "ActionButton",
  "BrandSpinner",
  "CheckboxField",
  "CollapsibleSection",
  "ConfirmDialog",
  "DataSourceRow",
  "FileInput",
  "FormField",
  "IconButton",
  "InspectorSection",
  "NumberInput",
  "PanelShell",
  "ProgressPresentation",
  "PublicationFinding",
  "SaveStatus",
  "SectionHeader",
  "SelectInput",
  "StatePanel",
  "StatusBadge",
  "StatusNotice",
  "TextArea",
  "TextInput",
  "WorkspaceRow",
]) {
  if (!stories.includes(component))
    violations.push(`Storybook is missing the shared ${component} contract`);
}

for (const document of [
  "docs/design/README.md",
  "docs/design/foundations.md",
  "docs/design/components.md",
  "docs/design/patterns.md",
  "docs/design/audit.md",
  "docs/design/dependencies.md",
  "docs/design/decisions/0001-visual-domains.md",
  ".github/pull_request_template.md",
]) {
  try {
    await readFile(new URL(document, root), "utf8");
  } catch {
    violations.push(`Missing design-system governance file: ${document}`);
  }
}

if (violations.length)
  throw new Error(`UI contract check failed:\n- ${violations.join("\n- ")}`);
process.stdout.write("Shared UI contract check passed.\n");
