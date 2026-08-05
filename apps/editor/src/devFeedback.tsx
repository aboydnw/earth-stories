import { createRoot } from "react-dom/client";
import { RiffrecProvider, RiffrecRecorder } from "riffrec";

const FEEDBACK_ROOT_ID = "earth-stories-dev-feedback";

export function mountDevFeedback() {
  if (document.getElementById(FEEDBACK_ROOT_ID)) return;

  const feedbackRoot = document.createElement("div");
  feedbackRoot.id = FEEDBACK_ROOT_ID;
  document.body.append(feedbackRoot);

  createRoot(feedbackRoot).render(
    <RiffrecProvider
      downloadNoticeTitle="Feedback recording saved"
      downloadNoticeMessage="Share the downloaded ZIP with the Earth Stories team so they can replay what happened."
      onError={(error) => {
        console.warn("Earth Stories feedback recording failed", error);
      }}
    >
      <RiffrecRecorder
        startLabel="Record feedback"
        stopLabel="Stop and save"
        consentTitle="Record an Earth Stories issue"
        consentDescription="Capture this tab, optional microphone narration, clicks, network activity, and console errors so the team can reproduce the issue. Typed values and network contents are not recorded."
        consentLabel="I understand what will be included in this recording."
      />
    </RiffrecProvider>,
  );
}
