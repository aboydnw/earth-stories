import type { PublicationContinuation } from "@earth-stories/story-schema";

export function StoryContinuations({
  continuations,
}: {
  continuations: PublicationContinuation[];
}) {
  if (!continuations.length) return null;
  return (
    <aside
      className="story-continuations"
      aria-labelledby="story-continuations-title"
    >
      <p className="story-kicker">What next?</p>
      <h2 id="story-continuations-title">Continue exploring</h2>
      <p>
        Open the published map and compatible data layers in the open-source
        GeoLibre workspace.
      </p>
      <div className="story-continuations__actions">
        {continuations.map((continuation) => (
          <a
            key={continuation.kind}
            href={continuation.href}
            target="_blank"
            rel="noreferrer"
          >
            {continuation.label}
          </a>
        ))}
      </div>
    </aside>
  );
}
