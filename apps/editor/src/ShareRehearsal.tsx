import { useState } from "react";
import { ImageSquare, LinkSimple } from "@phosphor-icons/react";
import type { StoryProject } from "@earth-stories/story-schema";
import {
  shareDescription,
  withHttpScheme,
} from "@earth-stories/publisher/share";
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
  cardUrl?: string | null;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
  onCardSaved?: () => void;
}

function hostLabel(url: string): string {
  try {
    return new URL(withHttpScheme(url.trim())).hostname
      .replace(/^www\./, "")
      .toUpperCase();
  } catch {
    return "YOUR-DOMAIN.ORG";
  }
}

export function ShareRehearsal({
  project,
  publicationUrl,
  cardUrl = null,
  disabled,
  onBusyChange,
  onCardSaved,
}: Props) {
  const [renderedCard, setRenderedCard] = useState<string | null>(null);
  const [report, setReport] = useState<
    (ShareLinkReport & { checkedUrl: string }) | null
  >(null);
  const [busy, setBusyState] = useState<"card" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title = project.metadata.title.trim() || "Untitled story";
  const description = shareDescription(project);
  const card = renderedCard ?? cardUrl;
  const trimmedUrl = publicationUrl.trim();
  const currentReport = report?.checkedUrl === trimmedUrl ? report : null;

  function setBusy(value: "card" | "link" | null) {
    setBusyState(value);
    onBusyChange?.(value !== null);
  }

  async function generateCard() {
    setBusy("card");
    setError(null);
    setNotice(null);
    try {
      const image = await captureShareCard(title);
      const { bytes } = await uploadShareCard(project.id, image);
      setRenderedCard(image);
      setNotice(
        `Link preview image saved (${Math.round(bytes / 1024)} KB). It will be included in the next build.`,
      );
      onCardSaved?.();
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
      setReport({
        ...(await checkShareLink(trimmedUrl)),
        checkedUrl: trimmedUrl,
      });
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
      <h3>Link preview</h3>
      <p>
        A representative preview of the title, summary, and image social
        platforms read from the published page.
      </p>
      <figure className="share-preview">
        <div className="share-preview__image">
          {card ? (
            <img src={card} alt="" />
          ) : (
            <span>
              <ImageSquare size={28} /> Created automatically when you build
            </span>
          )}
        </div>
        <figcaption>
          <small>{hostLabel(publicationUrl)}</small>
          <strong>{title}</strong>
          {description ? <span>{description}</span> : null}
        </figcaption>
      </figure>
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
              ? "Refresh preview image"
              : "Create preview image"}
        </ActionButton>
        <ActionButton
          variant="surface"
          disabled={disabled || busy !== null || !trimmedUrl}
          onClick={() => void runLinkCheck()}
        >
          <LinkSimple size={18} />{" "}
          {busy === "link"
            ? "Checking published link…"
            : "Check published link"}
        </ActionButton>
      </div>
      {!trimmedUrl ? (
        <p className="share-hint">
          Add your deployed publication URL above to check how the live link
          unfurls.
        </p>
      ) : null}
      {error ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
      {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
      {currentReport ? (
        currentReport.problems.length ? (
          <div className="publish-issues">
            <h4>Problems with the published link</h4>
            {currentReport.problems.map((problem) => (
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
