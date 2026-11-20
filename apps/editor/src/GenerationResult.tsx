import type { GenerationJob } from "@earth-stories/story-schema";
import { ActionButton, StatusNotice } from "@earth-stories/ui";
export function GenerationResult({
  job,
  accepting,
  onAccept,
}: {
  job: GenerationJob;
  accepting: boolean;
  onAccept: () => void;
}) {
  const candidate = job.candidate;
  return (
    <section className="generation-result" aria-label="Generated story">
      <h2>
        {candidate?.project.metadata.title ?? "Your story is being prepared"}
      </h2>
      {candidate ? (
        <>
          <p>{candidate.project.metadata.description}</p>
          <div className="generation-palette">
            {Object.entries(candidate.project.publication.palette ?? {}).map(
              ([role, color]) => (
                <div key={role}>
                  <span style={{ backgroundColor: color }} aria-hidden="true" />
                  <strong>
                    {role.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </strong>
                  <small>{color}</small>
                </div>
              ),
            )}
          </div>
          <h3>Chapters</h3>
          <ol>
            {candidate.project.chapters.map((chapter) => (
              <li key={chapter.id}>
                <strong>{chapter.title}</strong>
                <span>
                  {chapter.type === "illustrated"
                    ? "Illustrated scene"
                    : "Text chapter"}
                </span>
              </li>
            ))}
          </ol>
          {candidate.assets.length ? (
            <>
              <h3>Generated artwork</h3>
              <div className="generation-artwork">
                {candidate.assets.map((asset) => (
                  <figure key={asset.id}>
                    <img
                      src={`/api/generation/jobs/${encodeURIComponent(job.id)}/${asset.path}`}
                      alt={`Generated illustration ${asset.id}`}
                    />
                    <figcaption>{asset.id}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          ) : null}
          {candidate.warnings.length ? (
            <StatusNotice title="Review before creating" tone="warning">
              <ul>
                {candidate.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </StatusNotice>
          ) : null}
          <a
            className="generation-preview-link"
            href={`/create/${encodeURIComponent(job.id)}/preview`}
            target="_blank"
            rel="noreferrer"
          >
            View as reader ↗
          </a>
        </>
      ) : null}
      <ActionButton
        disabled={job.stage !== "ready" || accepting}
        onClick={onAccept}
      >
        {accepting ? "Creating your story…" : "Create this story"}
      </ActionButton>
      <p>
        Creating saves an editable local story. You decide when to publish it.
      </p>
    </section>
  );
}
