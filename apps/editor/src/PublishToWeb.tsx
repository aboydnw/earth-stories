import { useEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  Copy,
  GlobeHemisphereWest,
} from "@phosphor-icons/react";
import type { StoryProject } from "@earth-stories/story-schema";
import {
  ActionButton,
  ProgressPresentation,
  StatusNotice,
} from "@earth-stories/ui";
import {
  getPublishJob,
  getPublishRecord,
  startPublish,
  type PublishJob,
  type PublishRecord,
  type GitHubRepository,
} from "./api";
import { GitHubConnection } from "./GitHubConnection";
import { captureMapSnapshots } from "./captureSnapshots";
import { isMissingJobError } from "./httpErrors";

interface Props {
  project: StoryProject;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
  onPublished?: () => void;
}

const POLL_INTERVAL_MS = 1500;

export function repoNameFromTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
  return slug || "earth-story";
}

const isSettled = (job: PublishJob | null) =>
  job?.status === "succeeded" || job?.status === "failed";

export function PublishToWeb(props: Props) {
  return <PublishToWebSession key={props.project.id} {...props} />;
}

function PublishToWebSession({
  project,
  disabled,
  onBusyChange,
  onPublished,
}: Props) {
  const [record, setRecord] = useState<PublishRecord | null>(null);
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [recordLoaded, setRecordLoaded] = useState(false);
  const [recordAttempt, setRecordAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  const startLock = useRef(false);
  const [job, setJob] = useState<PublishJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const publishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    void getPublishRecord(project.id)
      .then((found) => {
        if (cancelled) return;
        setRecord(found);
        setError(null);
        setRecordLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the previous publication. Reopen this panel to retry.",
          );
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [project.id, recordAttempt]);

  useEffect(() => {
    if (!job || isSettled(job)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void getPublishJob(job.id)
        .then((next) => {
          if (cancelled) return;
          setError(null);
          setJob(next);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          if (isMissingJobError(cause)) {
            setJob(null);
            setError("This publish job ended when the workspace changed.");
            return;
          }
          setError(
            cause instanceof Error
              ? cause.message
              : "The publish job could not be checked.",
          );
          setPollAttempt((attempt) => attempt + 1);
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job, pollAttempt]);

  const running = starting || (Boolean(job) && !isSettled(job));

  useEffect(() => {
    onBusyChange?.(running);
    return () => onBusyChange?.(false);
  }, [running, onBusyChange]);

  useEffect(() => {
    if (job?.status !== "succeeded" || publishedRef.current) return;
    publishedRef.current = true;
    if (job.record) setRecord(job.record);
    onPublished?.();
  }, [job, onPublished]);

  async function publish() {
    if (
      startLock.current ||
      running ||
      disabled ||
      !repository ||
      !recordLoaded
    )
      return;
    startLock.current = true;
    setStarting(true);
    setError(null);
    setCopied(false);
    setPollAttempt(0);
    publishedRef.current = false;
    try {
      const mapSnapshots = await captureMapSnapshots();
      if (!mounted.current) return;
      const next = await startPublish(project.id, {
        repositoryId: repository.id,
        mapSnapshots,
      });
      if (mounted.current) setJob(next);
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The story could not be published.",
      );
    } finally {
      startLock.current = false;
      if (mounted.current) setStarting(false);
    }
  }

  async function copyLink() {
    const url = job?.url ?? record?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("The link could not be copied. Select and copy it manually.");
    }
  }

  const publishedUrl =
    job?.status === "succeeded" ? (job.url ?? record?.url) : record?.url;
  const latestEvent = job?.events.at(-1);

  return (
    <section className="publish-to-web">
      <h3>Publish to the web</h3>
      <p>
        Earth Stories can put this story on GitHub Pages, free hosting you own.
        Re-publishing keeps the same address, so links you already shared keep
        working.
      </p>

      {record ? (
        <div className="publish-to-web__current">
          <small>Published at</small>
          <a href={record.url} target="_blank" rel="noreferrer">
            {record.url} <ArrowSquareOut size={14} />
          </a>
        </div>
      ) : null}

      {recordLoaded ? (
        <GitHubConnection
          record={record}
          disabled={disabled || running}
          onRepositoryChange={setRepository}
        />
      ) : null}
      <p>
        Publishing makes the compiled story and its included assets public. It
        replaces the selected repository’s gh-pages branch contents and
        configures GitHub Pages to serve that branch. Your editable project is
        not uploaded.
      </p>
      {repository ? <p>Destination: {repository.fullName}</p> : null}

      <div className="publish-to-web__actions">
        <ActionButton
          variant="surface"
          disabled={disabled || running || !repository || !recordLoaded}
          onClick={() => void publish()}
        >
          <GlobeHemisphereWest size={18} />{" "}
          {running
            ? "Publishing…"
            : record
              ? "Update published story"
              : "Publish to the web"}
        </ActionButton>
        {publishedUrl ? (
          <ActionButton variant="surface" onClick={() => void copyLink()}>
            <Copy size={18} /> {copied ? "Link copied" : "Copy link"}
          </ActionButton>
        ) : null}
      </div>

      {running && latestEvent ? (
        <div className="publish-to-web__progress">
          <ProgressPresentation
            stage="verifying"
            title={latestEvent.message}
            detail="You can leave this open. Publishing takes a few minutes the first time."
          />
        </div>
      ) : null}

      {job?.status === "succeeded" && publishedUrl ? (
        <StatusNotice tone="success">
          Published at{" "}
          <a href={publishedUrl} target="_blank" rel="noreferrer">
            {publishedUrl}
          </a>
        </StatusNotice>
      ) : null}

      {job?.status === "failed" ? (
        <StatusNotice tone="danger">
          {job.error ?? "The story could not be published."}
        </StatusNotice>
      ) : null}

      {error ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
      {!recordLoaded && error ? (
        <ActionButton
          variant="surface"
          onClick={() => {
            setError(null);
            setRecordAttempt((value) => value + 1);
          }}
        >
          Retry publication details
        </ActionButton>
      ) : null}

      {job && job.events.length > 1 ? (
        <ol className="publish-to-web__log">
          {job.events.map((event, index) => (
            <li key={`${event.at}-${index}`} data-severity={event.severity}>
              {event.message}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
