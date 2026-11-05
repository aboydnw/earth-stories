import { useEffect, useRef, useState } from "react";
import {
  ActionButton,
  FormField,
  SelectInput,
  StatusNotice,
} from "@earth-stories/ui";
import {
  cancelGitHubConnection,
  connectGitHub,
  disconnectGitHub,
  getGitHubConnection,
  getGitHubRepositories,
  type GitHubConnectionSnapshot,
  type GitHubRepository,
  type PublishRecord,
} from "./api";

interface Props {
  record: PublishRecord | null;
  disabled: boolean;
  onRepositoryChange: (repository: GitHubRepository | null) => void;
}
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "GitHub could not be reached. Please retry.";

export function GitHubConnection({
  record,
  disabled,
  onRepositoryChange,
}: Props) {
  const [connection, setConnection] = useState<GitHubConnectionSnapshot | null>(
    null,
  );
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [poll, setPoll] = useState(0);
  const mounted = useRef(false);
  const generation = useRef(0);
  const repositoryGeneration = useRef(0);
  const pending = useRef(false);
  const lock = useRef(false);
  const selectedRef = useRef("");

  function clearSelection() {
    setSelected("");
    onRepositoryChange(null);
  }

  async function refreshRepositories() {
    const version = ++repositoryGeneration.current;
    setLoadingRepositories(true);
    setRepositoryError(null);
    clearSelection();
    try {
      const available = await getGitHubRepositories();
      if (!mounted.current || version !== repositoryGeneration.current) return;
      setRepositories(available);
      const previous = selectedRef.current;
      const match = previous
        ? available.find((item) => String(item.id) === previous)
        : record?.repositoryId
          ? available.find(
              (item) =>
                item.id === record.repositoryId &&
                item.owner === record.owner &&
                item.name === record.repo,
            )
          : null;
      selectedRef.current = match ? String(match.id) : "";
      setSelected(selectedRef.current);
      onRepositoryChange(match ?? null);
    } catch (cause) {
      if (mounted.current && version === repositoryGeneration.current) {
        setRepositories([]);
        setRepositoryError(message(cause));
      }
    } finally {
      if (mounted.current && version === repositoryGeneration.current)
        setLoadingRepositories(false);
    }
  }

  async function perform(
    action: "check" | "connect" | "disconnect" | "cancel",
  ) {
    if (lock.current) return;
    lock.current = true;
    const version = ++generation.current;
    setBusy(true);
    setError(null);
    if (action !== "check") {
      ++repositoryGeneration.current;
      clearSelection();
      setRepositories([]);
    }
    if (action === "connect") pending.current = true;
    try {
      const next = await {
        check: getGitHubConnection,
        connect: connectGitHub,
        disconnect: disconnectGitHub,
        cancel: cancelGitHubConnection,
      }[action]();
      if (!mounted.current || version !== generation.current) return;
      pending.current = next.status === "connecting";
      setConnection(next);
      if (next.status !== "connected") clearSelection();
    } catch (cause) {
      if (mounted.current && version === generation.current)
        setError(message(cause));
    } finally {
      if (mounted.current && version === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    void perform("check");
    return () => {
      mounted.current = false;
      ++generation.current;
      ++repositoryGeneration.current;
      lock.current = false;
      if (pending.current) void cancelGitHubConnection().catch(() => undefined);
    };
    // This component is mounted for one publication session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (connection?.status !== "connected") return;
    void refreshRepositories();
    // Refresh when the account or saved publication changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connection?.status,
    connection?.login,
    record?.owner,
    record?.repo,
    record?.repositoryId,
  ]);

  useEffect(() => {
    if (connection?.status !== "connecting" || busy) return;
    const timer = setTimeout(() => {
      void perform("check").finally(() => {
        if (mounted.current) setPoll((value) => value + 1);
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, busy, poll]);

  const connected = connection?.status === "connected";
  return (
    <div>
      {!connection && !error ? <p>Checking GitHub connection…</p> : null}
      {connection && !connection.configured ? (
        <StatusNotice tone="warning">
          GitHub connection is not configured in this installation. Use Build
          publication or download a ZIP to host the story yourself.
        </StatusNotice>
      ) : null}
      {connection?.configured ? (
        <>
          <p>
            {connected
              ? `Connected to GitHub as ${connection.login ?? "your account"}.`
              : "Connect GitHub, then choose which repositories Earth Stories can publish to."}
          </p>
          {!connected && connection.status !== "connecting" ? (
            <ActionButton
              variant="surface"
              disabled={busy || disabled}
              onClick={() => void perform("connect")}
            >
              Connect GitHub
            </ActionButton>
          ) : null}
          {connection.status === "connecting" ? (
            <>
              <p>Finish connecting in your browser, then return here.</p>
              {connection.authorizationUrl ? (
                <a
                  href={connection.authorizationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Continue on GitHub
                </a>
              ) : null}
              <ActionButton
                variant="surface"
                disabled={busy}
                onClick={() => void perform("cancel")}
              >
                Cancel connection
              </ActionButton>
            </>
          ) : null}
          {connection.installationUrl ? (
            <p>
              <a
                href={connection.installationUrl}
                target="_blank"
                rel="noreferrer"
              >
                Install / select repositories
              </a>
              . Choose “Only select repositories” on GitHub. Use dedicated
              publication repositories. Administration write permission is
              needed to configure GitHub Pages, alongside Contents and Pages
              write permissions.
            </p>
          ) : null}
          {connected ? (
            <>
              <FormField
                label="Publication repository"
                hint="Only public, writable repositories selected for the GitHub App appear here."
              >
                <SelectInput
                  value={selected}
                  disabled={disabled || busy || loadingRepositories}
                  onChange={(event) => {
                    const value = event.target.value;
                    selectedRef.current = value;
                    setSelected(value);
                    onRepositoryChange(
                      repositories.find((item) => String(item.id) === value) ??
                        null,
                    );
                  }}
                >
                  <option value="">Choose a repository</option>
                  {repositories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              {loadingRepositories ? (
                <p>Loading repositories…</p>
              ) : !repositories.length && !repositoryError ? (
                <p>
                  No repositories are available. On GitHub, choose “Only select
                  repositories” and a dedicated publication repository. Grant
                  Contents, Pages, and Administration write permissions, then
                  refresh.
                </p>
              ) : null}
              {record &&
              !loadingRepositories &&
              !repositories.some(
                (item) =>
                  (!record.repositoryId || item.id === record.repositoryId) &&
                  item.owner === record.owner &&
                  item.name === record.repo,
              ) ? (
                <StatusNotice tone="warning">
                  The previous destination, {record.owner}/{record.repo}, is not
                  available. Restore its access on GitHub or explicitly choose a
                  different repository.
                </StatusNotice>
              ) : null}
              {record && !record.repositoryId ? (
                <StatusNotice tone="warning">
                  This publication was saved before repository identity checks.
                  Explicitly choose its repository to continue; Earth Stories
                  will verify it belongs to this story before replacing
                  anything.
                </StatusNotice>
              ) : null}
              <p>
                Need a repository?{" "}
                <a
                  href="https://github.com/new"
                  target="_blank"
                  rel="noreferrer"
                >
                  Create one on GitHub
                </a>
                , then add it to the app’s selected repositories.
              </p>
              <ActionButton
                variant="surface"
                disabled={disabled || busy || loadingRepositories}
                onClick={() => void refreshRepositories()}
              >
                Refresh repositories
              </ActionButton>
              <ActionButton
                variant="surface"
                disabled={disabled || busy || loadingRepositories}
                onClick={() => void perform("disconnect")}
              >
                Disconnect GitHub
              </ActionButton>
              <p>
                Disconnect removes this app’s saved local connection. Manage
                installation access on GitHub separately.
              </p>
            </>
          ) : null}
        </>
      ) : null}
      {connection?.error ? (
        <StatusNotice tone="danger">{connection.error}</StatusNotice>
      ) : null}
      {repositoryError ? (
        <StatusNotice tone="danger">
          {repositoryError} Refresh repositories to retry.
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="danger">
          {error}{" "}
          <ActionButton
            variant="surface"
            disabled={busy}
            onClick={() => void perform("check")}
          >
            Retry connection check
          </ActionButton>
        </StatusNotice>
      ) : null}
    </div>
  );
}
