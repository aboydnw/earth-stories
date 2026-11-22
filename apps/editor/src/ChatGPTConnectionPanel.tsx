import { useEffect, useRef, useState } from "react";
import type { ChatGPTModel, ChatGPTStatus } from "@earth-stories/story-schema";
import {
  ActionButton,
  FormField,
  SelectInput,
  StatusNotice,
} from "@earth-stories/ui";
import { detectDesktopBridge } from "./desktop";
import * as api from "./api";
export function ChatGPTConnectionPanel({
  onReady,
  selectedModel,
}: {
  selectedModel?: string;
  onReady: (ready: boolean, model?: string) => void;
}) {
  const [status, setStatus] = useState<ChatGPTStatus | null>(null),
    [models, setModels] = useState<ChatGPTModel[]>([]),
    [model, setModel] = useState(""),
    [account, setAccount] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [launch, setLaunch] = useState<string | null>(null);
  const desiredModel = useRef(selectedModel);
  desiredModel.current = selectedModel;
  const notify = useRef(onReady);
  notify.current = onReady;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.chatGPTStatus();
        if (live) {
          setStatus(next);
          if (!next.pending) setLaunch(null);
        }
      } catch {
        if (live) {
          setError(
            "Could not read the ChatGPT connection. Check that the local service is running.",
          );
          setStatus(null);
        }
      } finally {
        if (live) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (status)
      setAccount(status.activeAccount ?? status.accounts[0]?.id ?? "");
  }, [status?.activeAccount, status?.accounts[0]?.id]);
  useEffect(() => {
    setModels([]);
    setModel("");
    setError("");
    if (!status?.configured || status.pending) return;
    let live = true;
    void api
      .chatGPTModels()
      .then((list) => {
        if (live) {
          setModels(list);
          setModel(
            list.some((m) => m.id === desiredModel.current)
              ? desiredModel.current!
              : (list[0]?.id ?? ""),
          );
          if (!list.length)
            setError("No models are available for this ChatGPT account.");
        }
      })
      .catch((cause) => {
        if (live)
          setError(
            cause instanceof Error
              ? cause.message
              : "Models could not be loaded.",
          );
      });
    return () => {
      live = false;
    };
  }, [status?.activeAccount, status?.configured, status?.pending, refresh]);
  useEffect(() => {
    notify.current(
      Boolean(
        status?.configured &&
        !status.pending &&
        status.activeAccount === account &&
        models.some((m) => m.id === model) &&
        !busy &&
        !launch,
      ),
      model || undefined,
    );
  }, [
    status?.configured,
    status?.pending,
    status?.activeAccount,
    account,
    models,
    model,
    busy,
    launch,
  ]);
  async function signIn(accountId?: string) {
    const desktop = detectDesktopBridge();
    const tab = desktop ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const result = await api.connectChatGPT(accountId);
      const url = new URL(result.url);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        url.pathname !== "/launch" ||
        !url.searchParams.get("ticket")
      )
        throw new Error("The sign-in address was invalid.");
      setLaunch(url.href);
      if (desktop) await desktop.openExternal(url.href);
      else if (tab) tab.location.href = url.href;
      setRefresh((v) => v + 1);
    } catch (cause) {
      tab?.close();
      setAccount(status?.activeAccount ?? status?.accounts[0]?.id ?? "");
      setError(
        cause instanceof Error ? cause.message : "Sign-in could not start.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await run();
      setAccount(status?.activeAccount ?? status?.accounts[0]?.id ?? "");
      setLaunch(null);
      setRefresh((v) => v + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connection could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chatgpt-connection" aria-label="ChatGPT connection">
      <h2>Account and model</h2>
      {!status && !error ? (
        <p role="status">Checking your connection…</p>
      ) : null}
      <div className="chatgpt-connection__fields">
        {status?.accounts.length ? (
          <FormField label="ChatGPT account">
            <SelectInput
              value={account}
              onChange={(e) => {
                const id = e.target.value;
                setAccount(id);
                if (id !== status.activeAccount) void signIn(id);
              }}
              disabled={busy || status.pending}
            >
              {status.accounts.map((a, i) => (
                <option key={a.id} value={a.id}>
                  {a.label} · Account {i + 1}
                </option>
              ))}
            </SelectInput>
          </FormField>
        ) : null}
        {models.length ? (
          <FormField label="Story model">
            <SelectInput
              value={model}
              disabled={busy || status?.pending}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </SelectInput>
          </FormField>
        ) : null}
      </div>
      <div className="chatgpt-connection__actions">
        <ActionButton
          type="button"
          variant="surface"
          data-oai-siwc-button=""
          disabled={!status || busy || status.pending}
          onClick={() => void signIn()}
        >
          {status?.accounts.length ? "Add account" : "Continue with ChatGPT"}
        </ActionButton>
        {status && !status.configured && account ? (
          <ActionButton
            type="button"
            variant="surface"
            disabled={busy || status.pending}
            onClick={() => void signIn(account)}
          >
            Reconnect
          </ActionButton>
        ) : null}
        {status?.pending ? (
          <ActionButton
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void action(api.cancelChatGPT)}
          >
            Cancel sign-in
          </ActionButton>
        ) : null}
      </div>
      {status?.pending ? (
        <p role="status">Finish signing in with ChatGPT in your browser.</p>
      ) : null}
      {launch ? (
        <a href={launch} target="_blank" rel="noreferrer">
          Open sign-in window
        </a>
      ) : null}
      {error || status?.error ? (
        <StatusNotice tone="warning" title="ChatGPT connection needs attention">
          {error || status?.error}
          <ActionButton type="button" onClick={() => setRefresh((v) => v + 1)}>
            Check connection again
          </ActionButton>
        </StatusNotice>
      ) : null}
      <p>
        Generation uses your plan allowance. You can review app limits in
        ChatGPT. No automatic publishing.
      </p>
    </section>
  );
}
