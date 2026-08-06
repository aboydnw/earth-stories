import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CheckCircle,
  Copy,
  DownloadSimple,
  FolderOpen,
  Globe,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { StoryProject } from "@earth-stories/story-schema";
import { ActionButton, StatusNotice } from "@earth-stories/ui";
import {
  exportProject,
  getPublicationPreflight,
  type ExportFormat,
  type PublicationPreflight,
} from "./api";
import {
  captureMapSnapshots,
  downloadAnimatedMapCaptures,
  downloadMapSnapshots,
} from "./captureSnapshots";

interface Props {
  open: boolean;
  project: StoryProject;
  onClose: () => void;
  onBeforeExport: () => Promise<StoryProject | null>;
  onProfileChange: (
    profile: StoryProject["publication"]["profile"],
  ) => Promise<StoryProject | null>;
}
const formats: Array<{
  id: ExportFormat;
  title: string;
  description: string;
  icon: typeof DownloadSimple;
}> = [
  {
    id: "zip",
    title: "Static ZIP",
    description:
      "Interactive site, assets, archive and embed files in one download.",
    icon: DownloadSimple,
  },
  {
    id: "folder",
    title: "Latest folder",
    description: "Build the publication folder beside your project files.",
    icon: FolderOpen,
  },
  {
    id: "archive",
    title: "Archival HTML",
    description: "One self-contained preservation copy with map snapshots.",
    icon: Archive,
  },
  {
    id: "embed",
    title: "Embed code",
    description: "Create an iframe for the deployed publication’s embed page.",
    icon: Globe,
  },
];
function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function PublishPanel({
  open,
  project,
  onClose,
  onBeforeExport,
  onProfileChange,
}: Props) {
  const [preflight, setPreflight] = useState<PublicationPreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [snippet, setSnippet] = useState("");
  const [publicationUrl, setPublicationUrl] = useState("");
  const [busyLabel, setBusyLabel] = useState(
    "Building and validating the latest publication…",
  );
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    getPublicationPreflight(project.id)
      .then(setPreflight)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Preflight failed"),
      );
  }, [open, project.id, project.metadata.updated]);
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () => [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ];
    focusable()[0]?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  async function run(format: ExportFormat) {
    setLoading(true);
    setError(null);
    setResult(null);
    setBusyLabel("Building and validating the latest publication…");
    try {
      const saved = await onBeforeExport();
      if (!saved) return;
      const mapSnapshots = await captureMapSnapshots();
      const response = await exportProject(saved.id, format, {
        mapSnapshots,
        publicationUrl,
      });
      if (response.blob && response.filename) {
        const href = URL.createObjectURL(response.blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = response.filename;
        anchor.click();
        URL.revokeObjectURL(href);
        setResult(`Downloaded ${response.filename}`);
      } else if (format === "folder")
        setResult(`Latest publication built at ${response.directory}`);
      else if (format === "embed") {
        setSnippet(response.snippet ?? "");
        setResult(
          "Embed code is ready. Deploy the latest publication folder before using it.",
        );
      }
      setPreflight(await getPublicationPreflight(saved.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }
  async function copySnippet() {
    if (snippet) await navigator.clipboard.writeText(snippet);
  }
  const errors =
    preflight?.issues.filter((issue) => issue.severity === "error") ?? [];
  const warnings =
    preflight?.issues.filter((issue) => issue.severity === "warning") ?? [];
  return (
    <div className="publish-backdrop" role="presentation">
      <section
        ref={panelRef}
        className="publish-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
      >
        <header>
          <div>
            <p>Publication workshop</p>
            <h2 id="publish-title">Build the latest release</h2>
          </div>
          <ActionButton
            variant="ghost"
            onClick={onClose}
            aria-label="Close publication workshop"
          >
            <X size={20} />
          </ActionButton>
        </header>
        <div className="publish-summary">
          <div>
            <strong>
              {preflight ? bytes(preflight.estimatedIncludedBytes) : "—"}
            </strong>
            <span>included data</span>
          </div>
          <div>
            <strong>{preflight?.includedAssets ?? "—"}</strong>
            <span>included assets</span>
          </div>
          <div>
            <strong>{preflight?.connectedAssets ?? "—"}</strong>
            <span>connected assets</span>
          </div>
        </div>
        <fieldset className="publication-profiles">
          <legend>Publication profile</legend>
          {(
            [
              [
                "connected",
                "Connected",
                "Keep public data at its source for a smaller release.",
              ],
              [
                "portable",
                "Portable",
                "Copy compatible COG, PMTiles, and GeoParquet data into the release.",
              ],
              ["custom", "Custom", "Use each asset’s publication data policy."],
            ] as const
          ).map(([id, title, description]) => (
            <label key={id}>
              <input
                type="radio"
                name="publication-profile"
                value={id}
                checked={project.publication.profile === id}
                disabled={loading}
                onChange={() => {
                  setLoading(true);
                  setError(null);
                  void onProfileChange(id)
                    .then(async (saved) => {
                      if (saved)
                        setPreflight(await getPublicationPreflight(saved.id));
                    })
                    .catch((cause: unknown) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "The publication profile could not be updated.",
                      ),
                    )
                    .finally(() => setLoading(false));
                }}
              />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {errors.length ? (
          <div className="publish-issues publish-issues--error">
            <h3>
              <Warning weight="fill" /> Fix before exporting
            </h3>
            {errors.map((issue) => (
              <p key={issue.id}>
                {issue.message}
                <small>{issue.resolution}</small>
              </p>
            ))}
          </div>
        ) : null}
        {warnings.length ? (
          <div className="publish-issues">
            <h3>
              <Warning /> Review before sharing
            </h3>
            {warnings.map((issue) => (
              <p key={issue.id}>
                {issue.message}
                <small>{issue.resolution}</small>
              </p>
            ))}
          </div>
        ) : null}
        <div className="publish-formats">
          {formats.map(({ id, title, description, icon: Icon }) => (
            <ActionButton
              variant="surface"
              key={id}
              disabled={loading || !preflight?.ready}
              onClick={() => void run(id)}
            >
              <Icon size={22} weight="duotone" />
              <strong>{title}</strong>
              <span>{description}</span>
            </ActionButton>
          ))}
        </div>
        <ActionButton
          variant="surface"
          className="chapter-image-export"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError(null);
            setResult(null);
            setBusyLabel("Capturing attributed chapter images…");
            void downloadMapSnapshots(project.metadata.title)
              .then((count) =>
                setResult(
                  count
                    ? `Downloaded ${count} attributed chapter image${count === 1 ? "" : "s"}`
                    : "No ready map chapters could be captured.",
                ),
              )
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Chapter images could not be captured.",
                ),
              )
              .finally(() => setLoading(false));
          }}
        >
          <DownloadSimple size={18} /> Download attributed chapter images
        </ActionButton>
        <ActionButton
          variant="surface"
          className="chapter-image-export"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError(null);
            setResult(null);
            setBusyLabel(
              "Recording animated map chapters. This takes a few seconds for each chapter…",
            );
            void downloadAnimatedMapCaptures(project.metadata.title)
              .then(({ count, format }) =>
                setResult(
                  count
                    ? `Downloaded ${count} animated ${format.toUpperCase()} chapter capture${count === 1 ? "" : "s"}.`
                    : "No ready map chapters could be recorded.",
                ),
              )
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Animated chapter captures could not be recorded.",
                ),
              )
              .finally(() => setLoading(false));
          }}
        >
          <DownloadSimple size={18} /> Record animated map chapters
        </ActionButton>
        <label className="publication-url">
          Deployed publication URL{" "}
          <input
            type="url"
            value={publicationUrl}
            onChange={(event) => setPublicationUrl(event.target.value)}
            placeholder="https://example.org/my-story"
          />
          <small>Optional until you generate embed code.</small>
        </label>
        {snippet ? (
          <div className="embed-result">
            <textarea
              readOnly
              value={snippet}
              rows={5}
              onClick={(event) => event.currentTarget.select()}
            />
            <button onClick={() => void copySnippet()}>
              <Copy size={16} /> Copy iframe
            </button>
          </div>
        ) : null}
        {error ? (
          <StatusNotice className="publish-result" tone="danger">
            {error}
          </StatusNotice>
        ) : null}
        {result ? (
          <StatusNotice className="publish-result" tone="success">
            <CheckCircle weight="fill" /> {result}
          </StatusNotice>
        ) : null}
        {loading ? (
          <div className="publish-progress">
            <span /> {busyLabel}
          </div>
        ) : null}
      </section>
    </div>
  );
}
