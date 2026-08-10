import { useState } from "react";
import { ImageSquare, LinkSimple } from "@phosphor-icons/react";
import type { StoryProject } from "@earth-stories/story-schema";
import { shareDescription } from "@earth-stories/publisher/share";
import {
  ActionButton,
  PublicationFinding,
  StatusNotice,
} from "@earth-stories/ui";
import { checkShareLink, uploadShareCard, type ShareLinkReport } from "./api";
import { captureShareCard } from "./captureShareCard";

interface Props {
  project: StoryProject;
  publicationUrl: string;
  disabled: boolean;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "YOUR-DOMAIN.ORG";
  }
}

export function ShareRehearsal({ project, publicationUrl, disabled }: Props) {
  const [card, setCard] = useState<string | null>(null);
  const [report, setReport] = useState<ShareLinkReport | null>(null);
  const [busy, setBusy] = useState<"card" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title = project.metadata.title.trim() || "Untitled story";
  const description = shareDescription(project);

  async function generateCard() {
    setBusy("card");
    setError(null);
    setNotice(null);
    try {
      const image = await captureShareCard(title);
      const { bytes } = await uploadShareCard(project.id, image);
      setCard(image);
      setNotice(
        `Link preview image saved (${Math.round(bytes / 1024)} KB). Export again to include it in the release.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The link preview image could not be created.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function runLinkCheck() {
    setBusy("link");
    setError(null);
    setNotice(null);
    try {
      setReport(await checkShareLink(publicationUrl));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The published link could not be checked.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="share-rehearsal">
      <h3>Share kit</h3>
      <p>
        This is how your link will look when a reader sees it. Social platforms
        read the published page’s metadata and never run its scripts.
      </p>
      <div className="share-previews">
        <figure className="share-preview share-preview--linkedin">
          <div className="share-preview__image">
            {card ? (
              <img src={card} alt="" />
            ) : (
              <span>
                <ImageSquare size={28} /> No link preview image yet
              </span>
            )}
          </div>
          <figcaption>
            <small>{hostLabel(publicationUrl)}</small>
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
          </figcaption>
          <span className="share-preview__label">LinkedIn</span>
        </figure>
        <figure className="share-preview share-preview--slack">
          <figcaption>
            <small>{hostLabel(publicationUrl)}</small>
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
            {card ? <img src={card} alt="" /> : null}
          </figcaption>
          <span className="share-preview__label">Slack</span>
        </figure>
      </div>
      {description ? null : (
        <PublicationFinding
          severity="warning"
          message="A shared link will show no summary beneath its title."
          resolution="Add a story description, or narrative text to the first chapter."
        />
      )}
      <div className="share-actions">
        <ActionButton
          variant="surface"
          disabled={disabled || busy !== null}
          onClick={() => void generateCard()}
        >
          <ImageSquare size={18} />{" "}
          {busy === "card"
            ? "Rendering link preview image…"
            : card
              ? "Render link preview image again"
              : "Render link preview image"}
        </ActionButton>
        <ActionButton
          variant="surface"
          disabled={disabled || busy !== null || !publicationUrl.trim()}
          onClick={() => void runLinkCheck()}
        >
          <LinkSimple size={18} />{" "}
          {busy === "link"
            ? "Checking published link…"
            : "Check published link"}
        </ActionButton>
      </div>
      {!publicationUrl.trim() ? (
        <p className="share-hint">
          Add your deployed publication URL above to check how the live link
          unfurls.
        </p>
      ) : null}
      {error ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
      {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
      {report ? (
        report.problems.length ? (
          <div className="publish-issues">
            <h4>Problems with the published link</h4>
            {report.problems.map((problem) => (
              <PublicationFinding
                key={problem.id}
                severity={problem.severity}
                message={problem.message}
                resolution={problem.resolution}
              />
            ))}
          </div>
        ) : (
          <StatusNotice tone="success">
            The published link unfurls correctly.
          </StatusNotice>
        )
      ) : null}
    </section>
  );
}
