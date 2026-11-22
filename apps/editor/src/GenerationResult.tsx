import type { GenerationJob } from "@earth-stories/story-schema";
import { ActionButton, StatusNotice } from "@earth-stories/ui";
export function GenerationResult({
  job,
  accepting,
  onAccept,
  onEditInstructions,
}: {
  job: GenerationJob;
  accepting: boolean;
  onAccept: () => void;
  onEditInstructions: () => void;
}) {
  const candidate = job.candidate;
  if (!candidate) return <p role="status">Your story is being prepared.</p>;
  const edits = job.plan?.textEdits ?? [];
  const additions = job.plan?.chapters ?? [];
  const scenes = job.plan?.visualSequences ?? [];
  const previewHref = job.enhancement
    ? `/stories/${encodeURIComponent(job.enhancement.projectId)}/enhance/${encodeURIComponent(job.id)}/preview`
    : `/create/${encodeURIComponent(job.id)}/preview`;
  return (
    <section className="generation-result" aria-label="Generated story">
      <div
        className="story-creation__actions"
        role="group"
        aria-label="Review story"
      >
        <a
          className="generation-preview-link"
          href={previewHref}
          target="_blank"
          rel="noreferrer"
        >
          Preview story ↗
        </a>
        <ActionButton
          variant="surface"
          disabled={job.stage !== "ready" || accepting}
          onClick={onAccept}
        >
          {accepting
            ? job.enhancement
              ? "Applying enhancements…"
              : "Creating your story…"
            : job.enhancement
              ? "Apply to story"
              : "Create this story"}
        </ActionButton>
        <ActionButton
          variant="surface"
          disabled={accepting}
          onClick={onEditInstructions}
        >
          Edit instructions
        </ActionButton>
      </div>
      <div>
        <h2>{candidate.project.metadata.title}</h2>
        <p>{candidate.project.metadata.description}</p>
        <p>
          {scenes.length} visual {scenes.length === 1 ? "scene" : "scenes"} ·{" "}
          {additions.length} new{" "}
          {additions.length === 1 ? "chapter" : "chapters"}
          {job.enhancement
            ? ` · ${edits.length ? `${edits.length} supporting text ${edits.length === 1 ? "change" : "changes"}` : "Original text unchanged"}`
            : ""}
        </p>
        <p>
          {job.enhancement
            ? "Apply updates this story. If its content changed during generation, generate again before applying."
            : "Create saves an editable local story."}{" "}
          You decide when to publish.
        </p>
      </div>
      {candidate.warnings.length ? (
        <StatusNotice tone="warning" title="Review notes">
          <p>
            {candidate.warnings.length} source or review{" "}
            {candidate.warnings.length === 1 ? "note" : "notes"}. Check Sources
            used and unavailable below before applying.
          </p>
        </StatusNotice>
      ) : null}
      <details>
        <summary>Your instructions</summary>
        <p className="generation-instructions">
          {[job.brief.narrative, job.brief.visualDirection]
            .filter(Boolean)
            .join("\n\n")}
        </p>
      </details>
      <details>
        <summary>Proposed changes</summary>
        {scenes.map((sequence) => (
          <section key={sequence.id}>
            <h3>{sequence.alt}</h3>
            <p>
              {sequence.steps
                .map(
                  (s) =>
                    candidate.project.chapters.find((c) => c.id === s.chapterId)
                      ?.title ?? s.chapterId,
                )
                .join(" → ")}
            </p>
            <p>{sequence.caption}</p>
          </section>
        ))}
        {additions.length ? (
          <>
            <h3>New chapters</h3>
            <ul>
              {additions.map((c) => (
                <li key={c.id}>
                  {c.title}
                  {job.enhancement
                    ? ` — ${c.afterChapterId ? `after ${candidate.project.chapters.find((x) => x.id === c.afterChapterId)?.title ?? c.afterChapterId}` : "before the first chapter"}`
                    : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {Object.keys(candidate.project.publication.palette ?? {}).length ? (
          <div className="generation-palette">
            {Object.entries(candidate.project.publication.palette ?? {}).map(
              ([role, color]) => (
                <div key={role}>
                  <span style={{ backgroundColor: color }} aria-hidden="true" />
                  <strong>{role}</strong>
                  <small>{color}</small>
                </div>
              ),
            )}
          </div>
        ) : null}
        <h3>Story chapters</h3>
        <ol>
          {candidate.project.chapters.map((c) => (
            <li key={c.id}>{c.title}</li>
          ))}
        </ol>
        {candidate.assets.length ? (
          <div className="generation-artwork">
            {candidate.assets.map((a) => (
              <img
                key={a.id}
                src={`/api/generation/jobs/${encodeURIComponent(job.id)}/${a.path}`}
                alt={`Generated illustration ${a.id}`}
              />
            ))}
          </div>
        ) : null}
      </details>
      {edits.length ? (
        <details open data-text-changes>
          <summary>Original text changes ({edits.length})</summary>
          {edits.map((edit) => (
            <section key={edit.chapterId}>
              <h3>
                {
                  candidate.project.chapters.find(
                    (c) => c.id === edit.chapterId,
                  )?.title
                }
              </h3>
              <p>Before: {edit.before}</p>
              <p>After: {edit.after}</p>
              <p>Reason: {edit.reason}</p>
            </section>
          ))}
        </details>
      ) : null}
      {candidate.warnings.length || job.referenceMetadata?.length ? (
        <details>
          <summary>Sources used and unavailable</summary>
          {job.referenceMetadata?.length ? (
            <>
              <h3>Supplied references</h3>
              <ul>
                {job.referenceMetadata.map((reference, index) => (
                  <li key={index}>
                    {reference.name} · {reference.classification}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <ul>
            {candidate.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
