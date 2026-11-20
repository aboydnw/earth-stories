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
const usageUrl = "https://chatgpt.com/settings/usage";
export function ChatGPTConnectionPanel({
  onReady,
}: {
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
          setModel(list[0]?.id ?? "");
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
      Boolean(status?.configured && !status.pending && model && !busy),
      model || undefined,
    );
  }, [status?.configured, status?.pending, model, busy]);
  async function signIn() {
    const desktop = detectDesktopBridge();
    const tab = desktop ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const result = await api.connectChatGPT(account || undefined);
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
  const active = status?.accounts.find((a) => a.id === status.activeAccount);
  return (
    <section className="chatgpt-connection" aria-label="ChatGPT connection">
      <h2>Your ChatGPT connection</h2>
      <p>
        Use your ChatGPT plan to create an editable story with composed vector
        illustrations and scroll animation.
      </p>
      {!status && !error ? (
        <p role="status">Checking your connection…</p>
      ) : null}
      {active ? (
        <p>
          {active.label} · Account {status!.accounts.indexOf(active) + 1}
        </p>
      ) : null}
      {status?.configured ? (
        <p>
          <strong>Using ChatGPT plan</strong>
        </p>
      ) : null}
      {status?.accounts.length ? (
        <FormField label="ChatGPT account">
          <SelectInput
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            disabled={busy || status.pending}
          >
            <option value="">Add a ChatGPT account</option>
            {status.accounts.map((a, i) => (
              <option key={a.id} value={a.id}>
                {a.label} · Account {i + 1}
              </option>
            ))}
          </SelectInput>
        </FormField>
      ) : null}
      <div className="chatgpt-connection__actions">
        <ActionButton
          type="button"
          data-oai-siwc-button=""
          disabled={!status || busy || status.pending}
          onClick={() => void signIn()}
        >
          Continue with ChatGPT
        </ActionButton>
        {status?.pending ? (
          <ActionButton
            type="button"
            disabled={busy}
            onClick={() => void action(api.cancelChatGPT)}
          >
            Cancel sign-in
          </ActionButton>
        ) : null}
        {active?.connected ? (
          <ActionButton
            type="button"
            disabled={busy}
            onClick={() => void action(api.disconnectChatGPT)}
          >
            Sign out
          </ActionButton>
        ) : null}
        <ActionButton
          type="button"
          onClick={() => {
            const desktop = detectDesktopBridge();
            if (desktop)
              void desktop
                .openExternal(usageUrl)
                .catch(() =>
                  setError("Could not open ChatGPT usage settings."),
                );
            else window.open(usageUrl, "_blank", "noopener,noreferrer");
          }}
        >
          Manage usage
        </ActionButton>
      </div>
      {status?.pending ? (
        <p role="status">Finish signing in with ChatGPT in your browser.</p>
      ) : null}
      {launch ? (
        <a href={launch} target="_blank" rel="noreferrer">
          Open sign-in window
        </a>
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
