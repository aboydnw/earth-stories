import { useEffect, useState } from "react";
import {
  CAPABILITY_INSTALL_ESTIMATES,
  CONVERSION_CAPABILITIES,
  type ConversionCapability,
} from "@earth-stories/story-schema";
import type { DesktopBridge, InstalledDesktopTool } from "./desktop";

export function DesktopToolsPanel({ desktop }: { desktop: DesktopBridge }) {
  const [tools, setTools] = useState<InstalledDesktopTool[] | null>(null);
  const [selected, setSelected] = useState<ConversionCapability[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void desktop
      .listTools()
      .then((value) => current && setTools(value))
      .catch((cause) => {
        if (!current) return;
        setTools([]);
        setError(
          cause instanceof Error ? cause.message : "Could not inspect tools",
        );
      });
    return () => {
      current = false;
    };
  }, [desktop]);
  const remove = async (capability: string) => {
    try {
      setError(null);
      await desktop.removeTool(capability);
      setTools(await desktop.listTools());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove tools",
      );
    }
  };
  const installed = new Map(
    (tools ?? []).map((tool) => [tool.capability, tool] as const),
  );
  const selectedBytes = selected.reduce(
    (total, capability) =>
      total + CAPABILITY_INSTALL_ESTIMATES[capability].estimatedBytes,
    0,
  );
  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      setTools(await desktop.prepareTools(selected));
      setSelected([]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not prepare tools",
      );
    } finally {
      setPreparing(false);
    }
  };
  return (
    <section className="desktop-tools" aria-labelledby="desktop-tools-title">
      <h3 id="desktop-tools-title">Offline authoring readiness</h3>
      <p>
        Publication can work offline without every conversion environment. Add
        only the pinned tools you expect to use while disconnected.
      </p>
      {tools === null ? <p>Checking installed tools…</p> : null}
      {tools?.length === 0 ? <p>No conversion tools installed.</p> : null}
      {tools !== null ? (
        <div className="desktop-tools__list">
          {CONVERSION_CAPABILITIES.map((capability) => {
            const tool = installed.get(capability);
            const estimate = CAPABILITY_INSTALL_ESTIMATES[capability];
            return (
              <label key={capability}>
                <input
                  type="checkbox"
                  checked={tool ? false : selected.includes(capability)}
                  disabled={Boolean(tool) || preparing}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, capability]
                        : current.filter((value) => value !== capability),
                    )
                  }
                />
                <span>
                  <strong>{estimate.name}</strong>
                  <small>
                    <span>{tool ? "Installed" : "Needs download"}</span>
                    <span>
                      {Math.ceil(
                        (tool?.apparentBytes ?? estimate.estimatedBytes) /
                          1_000_000,
                      )}{" "}
                      MB apparent file size
                    </span>
                  </small>
                </span>
                {tool ? (
                  <button
                    type="button"
                    disabled={preparing}
                    onClick={(event) => {
                      event.preventDefault();
                      void remove(capability);
                    }}
                  >
                    Remove {capability} tools
                  </button>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
      <p>
        {Math.ceil(selectedBytes / 1_000_000)} MB selected · internet required
        to prepare missing tools
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        disabled={selected.length === 0 || preparing}
        onClick={() => void prepare()}
      >
        {preparing
          ? "Preparing pinned tools…"
          : "Prepare this computer for offline work"}
      </button>
    </section>
  );
}
