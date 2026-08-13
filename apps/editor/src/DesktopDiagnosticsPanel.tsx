import { useState } from "react";
import type { DesktopBridge } from "./desktop";

export function DesktopDiagnosticsPanel({
  desktop,
}: {
  desktop: DesktopBridge;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportDiagnostics = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await desktop.exportDiagnostics();
      setStatus(
        result === "exported"
          ? "Diagnostics exported and revealed in your file browser."
          : "Diagnostics export cancelled.",
      );
    } catch {
      setStatus("Diagnostics could not be exported.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="desktop-diagnostics-title">
      <h3 id="desktop-diagnostics-title">Diagnostics</h3>
      <p>
        Export technical lifecycle codes for support. Story content, paths,
        URLs, and credentials are excluded.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void exportDiagnostics()}
      >
        {busy ? "Exporting diagnostics…" : "Export diagnostics"}
      </button>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
