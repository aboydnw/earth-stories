import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CheckCircle,
  Copy,
  DownloadSimple,
  FolderOpen,
  Globe,
  ImageSquare,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { StoryProject } from "@earth-stories/story-schema";
import type { AuthoringReadiness } from "@earth-stories/publisher/readiness";
import { compileProject } from "@earth-stories/publisher/compile";
import { geolibreContinuationStatus } from "@earth-stories/publisher/geolibre";
import {
  ActionButton,
  ProgressPresentation,
  PublicationFinding,
  ReadinessSummary,
  StatusNotice,
} from "@earth-stories/ui";
import {
  exportProject,
  shareCardUrl,
  uploadShareCard,
  type ExportFormat,
} from "./api";
import { captureShareCard } from "./captureShareCard";
import type { PublicationReadinessState } from "./usePublicationReadiness";
import {
  captureMapSnapshots,
  downloadAnimatedMapCaptures,
  downloadMapSnapshots,
} from "./captureSnapshots";
import { ShareRehearsal } from "./ShareRehearsal";
import { PublishToWeb } from "./PublishToWeb";
import { detectDesktopBridge } from "./desktop";
import { PublicationNextSteps } from "./PublicationNextSteps";

interface Props {
  open: boolean;
  project: StoryProject;
  onClose: () => void;
  onBeforeExport: () => Promise<StoryProject | null>;
  onPublicationChange: (
    changes: Partial<StoryProject["publication"]>,
  ) => Promise<StoryProject | null>;
  preflightState: PublicationReadinessState;
  onRefreshPreflight: () => void;
  localReadiness: AuthoringReadiness;
  unsaved: boolean;
}

const secondaryFormats: Array<{
  id: Exclude<ExportFormat, "folder">;
  title: string;
  description: string;
  icon: typeof DownloadSimple;
}> = [
  {
    id: "zip",
    title: "Download ZIP",
    description: "A portable copy of the complete publication folder.",
    icon: DownloadSimple,
  },
  {
    id: "archive",
    title: "Download archival HTML",
    description: "One self-contained preservation copy with map snapshots.",
    icon: Archive,
  },
  {
    id: "embed",
    title: "Create embed code",
    description: "An iframe for the deployed publication’s embed page.",
    icon: Globe,
  },
];

const publicationProfiles = [
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
  ["offline", "Offline", "No internet required after this build."],
  ["custom", "Custom", "Use each asset’s publication data policy."],
] as const;

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function compileForContinuations(project: StoryProject) {
  try {
    return compileProject(project);
  } catch {
    return null;
  }
}

export function PublishPanel({
  open,
  project,
  onClose,
  onBeforeExport,
  onPublicationChange,
  preflightState,
  onRefreshPreflight,
  localReadiness,
  unsaved,
}: Props) {
  const desktop = detectDesktopBridge();
  const preflight = preflightState.result;
  const operationRef = useRef(0);
  const runningRef = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [directory, setDirectory] = useState<string | null>(null);
  const [download, setDownload] = useState<{
    href: string;
    filename: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardWarning, setCardWarning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [lastFormat, setLastFormat] = useState<ExportFormat | null>(null);
  const [snippet, setSnippet] = useState("");
  const [resultBuildId, setResultBuildId] = useState<string | null>(null);
  const [verifiedOffline, setVerifiedOffline] = useState(false);
  const [publicationUrl, setPublicationUrl] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [cardVersion, setCardVersion] = useState(0);
  const [busyLabel, setBusyLabel] = useState(
    "Building and validating the latest publication…",
  );
  const compiledForContinuations = useMemo(
    () => compileForContinuations(project),
    [project],
  );
  const geolibreEnabled = project.publication.geolibreContinuation !== false;
  const geolibreStatus = compiledForContinuations
    ? geolibreContinuationStatus(compiledForContinuations, publicationUrl)
    : "pending-build";
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const onRefreshRef = useRef(onRefreshPreflight);
  onCloseRef.current = onClose;
  onRefreshRef.current = onRefreshPreflight;

  useEffect(() => {
    operationRef.current += 1;
    runningRef.current = false;
    setLoading(false);
    setDirectory(null);
    setDownload(null);
    if (!open) return;
    setError(null);
    setCardWarning(null);
    setResult(null);
    setLastFormat(null);
    setResultBuildId(null);
    setVerifiedOffline(false);
    return () => {
      operationRef.current += 1;
    };
  }, [open, project.id]);

  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.href);
    };
  }, [download]);

  useEffect(() => {
    if (!open || (!loading && !result && !error)) return;
    feedbackRef.current?.scrollIntoView?.({ block: "nearest" });
    if (!loading) feedbackRef.current?.focus({ preventScroll: true });
  }, [open, loading, result, error]);

  useEffect(() => {
    setPublicationUrl("");
    setSnippet("");
    setCardVersion(0);
    setShareBusy(false);
    setPublishBusy(false);
  }, [project.id]);

  useEffect(() => {
    if (
      open &&
      !unsaved &&
      (preflightState.status === "idle" || preflightState.status === "stale")
    )
      onRefreshRef.current();
  }, [open, preflightState.status, unsaved]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => {
        const closed = element.closest("details:not([open])");
        return (
          !closed ||
          (element.tagName === "SUMMARY" && element.parentElement === closed)
        );
      });
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

  const currentServerResult =
    !unsaved && preflightState.status === "ready" ? preflight : null;
  const findings = currentServerResult?.issues ?? localReadiness.findings;
  const errors = findings.filter((issue) => issue.severity === "error");
  const warnings = findings.filter((issue) => issue.severity === "warning");
  const information = findings.filter((issue) => issue.severity === "info");
  const readinessStatus = errors.length
    ? "blocked"
    : warnings.length || !currentServerResult
      ? "review"
      : "ready";
  const canBuild =
    !loading &&
    !shareBusy &&
    !publishBusy &&
    !unsaved &&
    preflightState.status === "ready" &&
    Boolean(preflight?.ready);
  const hasShareCard = Boolean(
    currentServerResult &&
    !currentServerResult.issues.some(({ id }) => id === "share-card"),
  );
  const persistedCard =
    hasShareCard || cardVersion ? shareCardUrl(project.id, cardVersion) : null;

  async function prepareShareCard(
    saved: StoryProject,
    isCurrent: () => boolean,
  ) {
    if (hasShareCard || cardVersion) return;
    setBusyLabel("Creating the link preview image…");
    try {
      const image = await captureShareCard(saved.metadata.title);
      if (!isCurrent()) return;
      await uploadShareCard(saved.id, image);
      if (!isCurrent()) return;
      setCardVersion((version) => version + 1);
    } catch (cause) {
      if (!isCurrent()) return;
      setCardWarning(
        cause instanceof Error
          ? `The release will use no preview image: ${cause.message}`
          : "The release will use no preview image because it could not be created.",
      );
    }
  }

  function requestDownload(artifact: { href: string; filename: string }) {
    const anchor = document.createElement("a");
    anchor.href = artifact.href;
    anchor.download = artifact.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Keep the URL alive for the visible retry link; WebKit/Electron may
    // consume the download after click() returns.
  }

  async function showPublication() {
    if (!desktop) return;
    setError(null);
    try {
      if (desktop.showPublicationFolder)
        await desktop.showPublicationFolder(project.id);
      else await desktop.showProjectFolder(project.id);
    } catch (cause) {
      setError(
        `The publication was built, but its folder could not be shown. ${cause instanceof Error ? cause.message : "Use the saved location below."}`,
      );
    }
  }

  async function run(format: ExportFormat) {
    if (runningRef.current) return;
    runningRef.current = true;
    const operation = ++operationRef.current;
    const isCurrent = () => operationRef.current === operation;
    setLoading(true);
    setBusyLabel("Preparing your publication…");
    setError(null);
    setCardWarning(null);
    setResult(null);
    setDirectory(null);
    setDownload(null);
    setLastFormat(null);
    setResultBuildId(null);
    setVerifiedOffline(false);
    setSnippet("");
    try {
      const saved = await onBeforeExport();
      if (!isCurrent()) return;
      if (!saved)
        throw new Error(
          "The story could not be saved. Save your changes, then build again.",
        );
      await prepareShareCard(saved, isCurrent);
      if (!isCurrent()) return;
      setBusyLabel("Building and validating the latest publication…");
      const mapSnapshots = await captureMapSnapshots();
      if (!isCurrent()) return;
      const response = await exportProject(saved.id, format, {
        mapSnapshots,
        publicationUrl: publicationUrl.trim(),
      });
      if (!isCurrent()) return;
      setLastFormat(format);
      setResultBuildId(response.buildId ?? null);
      setVerifiedOffline(saved.publication.profile === "offline");
      if (response.blob && response.filename) {
        const artifact = {
          href: URL.createObjectURL(response.blob),
          filename: response.filename,
        };
        setDownload(artifact);
        setResult(
          format === "zip"
            ? "Your publication ZIP is ready."
            : "Your archival HTML is ready.",
        );
        requestDownload(artifact);
      } else if (format === "folder" && response.directory) {
        setDirectory(response.directory);
        setResult("Your publication folder is ready.");
      } else if (format === "embed") {
        setSnippet(response.snippet ?? "");
        setResult("Embed code is ready.");
      } else
        throw new Error("The build returned no output. Try building again.");
      onRefreshRef.current();
    } catch (cause) {
      if (isCurrent())
        setError(cause instanceof Error ? cause.message : "Export failed");
    } finally {
      if (isCurrent()) {
        runningRef.current = false;
        setLoading(false);
      }
    }
  }

  async function downloadStillImages() {
    if (runningRef.current) return;
    runningRef.current = true;
    const operation = ++operationRef.current;
    const isCurrent = () => operationRef.current === operation;
    setLoading(true);
    setDownload(null);
    setDirectory(null);
    setResultBuildId(null);
    setVerifiedOffline(false);
    setCardWarning(null);
    setSnippet("");
    setError(null);
    setResult(null);
    setLastFormat(null);
    setBusyLabel("Capturing attributed chapter images…");
    try {
      const count = await downloadMapSnapshots(project.metadata.title);
      if (!isCurrent()) return;
      setResult(
        count
          ? `Downloaded ${count} attributed chapter image${count === 1 ? "" : "s"}`
          : "No ready map chapters could be captured.",
      );
    } catch (cause) {
      if (!isCurrent()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Chapter images could not be captured.",
      );
    } finally {
      if (isCurrent()) {
        runningRef.current = false;
        setLoading(false);
      }
    }
  }

  async function downloadAnimatedImages() {
    if (runningRef.current) return;
    runningRef.current = true;
    const operation = ++operationRef.current;
    const isCurrent = () => operationRef.current === operation;
    setLoading(true);
    setDownload(null);
    setDirectory(null);
    setResultBuildId(null);
    setVerifiedOffline(false);
    setCardWarning(null);
    setSnippet("");
    setError(null);
    setResult(null);
    setLastFormat(null);
    setBusyLabel(
      "Recording animated map chapters. This takes a few seconds for each chapter…",
    );
    try {
      const { count, format } = await downloadAnimatedMapCaptures(
        project.metadata.title,
      );
      if (!isCurrent()) return;
      setResult(
        count
          ? `Downloaded ${count} animated ${format.toUpperCase()} chapter capture${count === 1 ? "" : "s"}.`
          : "No ready map chapters could be recorded.",
      );
    } catch (cause) {
      if (!isCurrent()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Animated chapter captures could not be recorded.",
      );
    } finally {
      if (isCurrent()) {
        runningRef.current = false;
        setLoading(false);
      }
    }
  }

  async function copySnippet() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setResult("Embed code copied to the clipboard.");
    } catch {
      setError(
        "The embed code could not be copied. Select and copy it manually.",
      );
    }
  }

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
            <p>Publish</p>
            <h2 id="publish-title">Build your release</h2>
            <span>
              Build the files for your website first, then choose where to
              publish them.
            </span>
          </div>
          <ActionButton
            variant="ghost"
            onClick={onClose}
            aria-label="Close publication workshop"
          >
            <X size={20} />
          </ActionButton>
        </header>

        <div className="publish-readiness">
          <ReadinessSummary
            status={readinessStatus}
            errors={errors.length}
            warnings={warnings.length}
            loading={preflightState.status === "loading" && !preflight}
            stale={
              unsaved ||
              preflightState.status === "stale" ||
              (preflightState.status === "loading" && Boolean(preflight))
            }
          />
          <ActionButton
            variant="ghost"
            className="publish-refresh"
            disabled={unsaved || preflightState.status === "loading"}
            onClick={onRefreshPreflight}
          >
            {unsaved ? "Save to check" : "Refresh checks"}
          </ActionButton>
        </div>

        {preflightState.error ? (
          <StatusNotice tone="danger">{preflightState.error}</StatusNotice>
        ) : null}

        {errors.length ? (
          <div className="publish-issues publish-issues--error">
            <h3>
              <Warning weight="fill" /> Fix before building
            </h3>
            {errors.map((issue) => (
              <PublicationFinding
                key={issue.id}
                severity="error"
                message={issue.message}
                resolution={issue.resolution}
              />
            ))}
          </div>
        ) : null}

        {warnings.length ? (
          <details className="publish-disclosure publish-disclosure--warnings">
            <summary>
              <span>
                <Warning /> Review {warnings.length} optional warning
                {warnings.length === 1 ? "" : "s"}
              </span>
              <small>Warnings do not prevent a build</small>
            </summary>
            <div className="publish-disclosure__body">
              {warnings.map((issue) => (
                <PublicationFinding
                  key={issue.id}
                  severity="warning"
                  message={issue.message}
                  resolution={issue.resolution}
                />
              ))}
            </div>
          </details>
        ) : null}

        <section className="publish-primary" aria-labelledby="primary-output">
          <div>
            <p>Recommended output</p>
            <h3 id="primary-output">
              {desktop ? "Publication folder" : "Publication ZIP"}
            </h3>
            <span>
              {desktop
                ? "Save the complete interactive story in your project’s publication folder."
                : "Download the complete interactive story as a ZIP, ready to upload to a static host."}
            </span>
          </div>
          <ActionButton
            className="publish-primary__action button button--primary"
            disabled={!canBuild}
            onClick={() => void run(desktop ? "folder" : "zip")}
          >
            <FolderOpen size={20} weight="duotone" />
            {loading ? "Building…" : "Build publication"}
          </ActionButton>
        </section>

        <div
          ref={feedbackRef}
          className="publish-feedback"
          tabIndex={-1}
          aria-label="Publication build status"
          aria-busy={loading}
        >
          {cardWarning ? (
            <StatusNotice tone="warning">{cardWarning}</StatusNotice>
          ) : null}
          {error ? (
            <StatusNotice className="publish-result" tone="danger">
              {error}
            </StatusNotice>
          ) : null}
          {loading ? (
            <div className="publish-progress">
              <ProgressPresentation
                stage="verifying"
                title={busyLabel}
                detail="The last successful publication remains available while this operation runs."
              />
            </div>
          ) : null}
          {result ? (
            <div className="publish-completion">
              <StatusNotice className="publish-result" tone="success">
                <CheckCircle weight="fill" /> {result}
              </StatusNotice>
              {directory ? (
                <p className="publish-output-path">
                  <strong>Saved on this computer:</strong> {directory}
                </p>
              ) : null}
              {download ? (
                <p>
                  Download requested: <strong>{download.filename}</strong>.
                  Check your downloads, or use the link below if it did not
                  start.
                </p>
              ) : null}
              {lastFormat ? (
                <p>
                  {resultBuildId ? `Build ${resultBuildId}. ` : ""}
                  {verifiedOffline ? (
                    <>
                      <strong>Verified offline</strong>. This export passed its
                      offline runtime check.
                    </>
                  ) : (
                    "This is a local build, not a live website yet."
                  )}
                </p>
              ) : null}
              <div className="publish-output-actions">
                {directory && desktop ? (
                  <ActionButton
                    variant="surface"
                    onClick={() => void showPublication()}
                  >
                    <FolderOpen size={18} />{" "}
                    {desktop.showPublicationFolder
                      ? desktop.platform === "darwin"
                        ? "Show publication in Finder"
                        : "Show publication folder"
                      : "Show project folder"}
                  </ActionButton>
                ) : null}
                {directory && desktop && !desktop.showPublicationFolder ? (
                  <p>Open the publication folder inside your project.</p>
                ) : null}
                {download ? (
                  <a
                    href={download.href}
                    download={download.filename}
                    className="publish-download-link"
                  >
                    <DownloadSimple size={18} /> Download{" "}
                    {lastFormat === "zip" ? "ZIP" : "HTML"} again
                  </a>
                ) : null}
                {lastFormat === "folder" ? (
                  <ActionButton
                    variant="surface"
                    disabled={!canBuild}
                    onClick={() => void run("zip")}
                  >
                    <DownloadSimple size={18} /> Build and download ZIP
                  </ActionButton>
                ) : null}
              </div>
              {lastFormat === "folder" || lastFormat === "zip" ? (
                <PublicationNextSteps />
              ) : null}
            </div>
          ) : null}
        </div>

        <PublishToWeb
          project={project}
          disabled={!canBuild}
          onBusyChange={setPublishBusy}
          onPublished={onRefreshPreflight}
        />

        <details className="publish-disclosure">
          <summary>
            <span>Release settings</span>
            <small>
              {project.publication.profile} ·{" "}
              {preflight
                ? bytes(preflight.estimatedIncludedBytes)
                : "size pending"}
            </small>
          </summary>
          <div className="publish-disclosure__body">
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
            <section
              className="publication-privacy-boundary"
              aria-labelledby="publication-privacy-title"
            >
              <h3 id="publication-privacy-title">What leaves this computer</h3>
              <ul>
                <li>Your working files stay in your local workspace.</li>
                <li>
                  {preflight?.includedAssets ?? 0} asset
                  {(preflight?.includedAssets ?? 0) === 1 ? "" : "s"} will be
                  copied into this publication.
                </li>
                <li>
                  {preflight?.connectedAssets ?? 0} asset
                  {(preflight?.connectedAssets ?? 0) === 1 ? "" : "s"} remain at
                  their public source URLs.
                </li>
                <li>
                  GeoLibre receives only the public URLs in the finished
                  publication, never your workspace or unpublished files.
                </li>
              </ul>
            </section>
            <div className="publication-connectivity">
              <section aria-labelledby="assembly-inputs-status">
                <h3 id="assembly-inputs-status">Assembly inputs</h3>
                <strong>
                  {!currentServerResult
                    ? "Check pending"
                    : currentServerResult.needsBuildInternet
                      ? "Internet needed during assembly"
                      : "No internet needed during assembly"}
                </strong>
                <span>
                  {currentServerResult ? (
                    <>
                      {currentServerResult.needsBuildInternet
                        ? `${bytes(currentServerResult.requiredDownloadBytes)} to download`
                        : "No downloads needed"}
                      {currentServerResult.unknownDownloadSizes
                        ? ` · ${currentServerResult.unknownDownloadSizes} input${currentServerResult.unknownDownloadSizes === 1 ? " has" : "s have"} unknown sizes`
                        : ""}
                      {currentServerResult.availableDiskBytes === null
                        ? " · available disk space unknown"
                        : ` · ${bytes(currentServerResult.availableDiskBytes)} available`}
                    </>
                  ) : (
                    "Save and refresh checks to calculate downloads."
                  )}
                </span>
              </section>
              <section aria-labelledby="publication-runtime-status">
                <h3 id="publication-runtime-status">Publication runtime</h3>
                <strong>
                  {!currentServerResult
                    ? "Check pending"
                    : currentServerResult.needsRuntimeInternet
                      ? "Internet required after publishing"
                      : "No internet required after this build."}
                </strong>
                <span>
                  {!currentServerResult
                    ? "Save and refresh checks to inspect runtime dependencies."
                    : currentServerResult.needsRuntimeInternet
                      ? `${currentServerResult.connectedAssets} connected asset${currentServerResult.connectedAssets === 1 ? "" : "s"}`
                      : "All publication dependencies will be included."}
                </span>
              </section>
            </div>
            <fieldset className="publication-profiles">
              <legend>Data delivery</legend>
              {publicationProfiles.map(([id, title, description]) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="publication-profile"
                    value={id}
                    checked={project.publication.profile === id}
                    disabled={loading || unsaved}
                    onChange={() => {
                      setLoading(true);
                      setError(null);
                      void onPublicationChange({ profile: id })
                        .then(() => undefined)
                        .catch((cause: unknown) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "The data delivery setting could not be updated.",
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
            {information.length ? (
              <div className="publish-details-list">
                <h3>Release details</h3>
                {information.map((issue) => (
                  <PublicationFinding
                    key={issue.id}
                    severity="info"
                    message={issue.message}
                    resolution={issue.resolution}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </details>

        <details className="publish-disclosure">
          <summary>
            <span>More output options</span>
            <small>ZIP, archival HTML, and embed code</small>
          </summary>
          <div className="publish-disclosure__body publish-secondary-actions">
            {secondaryFormats.map(({ id, title, description, icon: Icon }) => (
              <ActionButton
                variant="surface"
                key={id}
                disabled={!canBuild}
                onClick={() => void run(id)}
              >
                <Icon size={19} weight="duotone" />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </ActionButton>
            ))}
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
          </div>
        </details>

        <details className="publish-disclosure">
          <summary>
            <span>Export chapter media</span>
            <small>Still images and short map recordings</small>
          </summary>
          <div className="publish-disclosure__body publish-secondary-actions">
            <ActionButton
              variant="surface"
              disabled={loading}
              onClick={() => void downloadStillImages()}
            >
              <ImageSquare size={19} />
              <span>
                <strong>Download attributed images</strong>
                <small>PNG captures of ready map chapters.</small>
              </span>
            </ActionButton>
            <ActionButton
              variant="surface"
              disabled={loading}
              onClick={() => void downloadAnimatedImages()}
            >
              <DownloadSimple size={19} />
              <span>
                <strong>Record animated maps</strong>
                <small>Six-second MP4 or WebM chapter captures.</small>
              </span>
            </ActionButton>
          </div>
        </details>

        <details className="publish-disclosure publish-share-tools">
          <summary>
            <span>Verify and share after deployment</span>
            <small>Preview and test the public link</small>
          </summary>
          <div className="publish-disclosure__body">
            <label className="publication-url">
              Deployed publication URL
              <input
                type="text"
                inputMode="url"
                value={publicationUrl}
                onChange={(event) => setPublicationUrl(event.target.value)}
                placeholder="https://example.org/my-story"
              />
              <small>
                If you know the final URL, enter it before the final build so
                link previews use the public address.
              </small>
            </label>
            <div className="publication-continuation">
              <label>
                <input
                  type="checkbox"
                  checked={geolibreEnabled}
                  disabled={loading || unsaved}
                  onChange={(event) => {
                    const geolibreContinuation = event.target.checked;
                    setLoading(true);
                    setError(null);
                    void onPublicationChange({ geolibreContinuation })
                      .then(() => undefined)
                      .catch((cause: unknown) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "The GeoLibre setting could not be updated.",
                        ),
                      )
                      .finally(() => setLoading(false));
                  }}
                />
                <strong>Offer an “Open in GeoLibre” link</strong>
              </label>
              <span role="status">
                {!geolibreEnabled
                  ? "Readers will not see a GeoLibre link."
                  : geolibreStatus === "ready"
                    ? "Readers can open compatible published layers in GeoLibre. Your host must allow cross-origin requests (GitHub Pages does)."
                    : geolibreStatus === "pending-build"
                      ? "GeoLibre availability will be checked when the publication is built. Resolve any publishing issues first. GeoLibre requires internet access."
                      : geolibreStatus === "needs-url"
                        ? "Add the final HTTPS publication URL to enable Open in GeoLibre."
                        : "This story has no layers that Earth Stories can currently hand off to GeoLibre."}
              </span>
            </div>
            <ShareRehearsal
              key={project.id}
              project={project}
              publicationUrl={publicationUrl}
              cardUrl={persistedCard}
              disabled={loading}
              onBusyChange={setShareBusy}
              onCardSaved={() => {
                setCardVersion((version) => version + 1);
                onRefreshRef.current();
              }}
            />
          </div>
        </details>
      </section>
    </div>
  );
}
