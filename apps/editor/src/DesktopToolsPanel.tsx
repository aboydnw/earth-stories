import { useEffect, useState } from "react";
import type { DesktopBridge, InstalledDesktopTool } from "./desktop";

export function DesktopToolsPanel({ desktop }: { desktop: DesktopBridge }) {
  const [tools, setTools] = useState<InstalledDesktopTool[] | null>(null);
  useEffect(() => {
    let current = true;
    void desktop.listTools().then((value) => current && setTools(value));
    return () => {
      current = false;
    };
  }, [desktop]);
  const remove = async (capability: string) => {
    await desktop.removeTool(capability);
    setTools(await desktop.listTools());
  };
  return (
    <section aria-labelledby="desktop-tools-title">
      <h3 id="desktop-tools-title">Conversion tools</h3>
      {tools === null ? <p>Checking installed tools…</p> : null}
      {tools?.length === 0 ? <p>No conversion tools installed.</p> : null}
      {tools?.map((tool) => (
        <div key={`${tool.destination}:${tool.capability}`}>
          <strong>{tool.capability}</strong>{" "}
          <span>{Math.ceil(tool.bytes / 1_000_000)} MB on disk</span>{" "}
          <button type="button" onClick={() => void remove(tool.capability)}>
            Remove {tool.capability} tools
          </button>
        </div>
      ))}
    </section>
  );
}
