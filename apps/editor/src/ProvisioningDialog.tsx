import type { ConversionJobEvent } from "@earth-stories/story-schema";

type Disclosure = Extract<
  ConversionJobEvent,
  { type: "provisioning-disclosure" }
>;

export function ProvisioningDialog(props: {
  disclosure: Disclosure;
  onAcknowledge(): void;
  onCancel(): void;
}) {
  const { disclosure } = props;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-disclosure-title"
    >
      <h2 id="tool-disclosure-title">Install {disclosure.capabilityName}?</h2>
      <p>
        Earth Stories will download pinned tools when you continue. They are not
        available offline until this installation finishes.
      </p>
      <dl>
        <dt>Estimated installed size</dt>
        <dd>{Math.ceil(disclosure.estimatedBytes / 1_000_000)} MB on disk</dd>
        <dt>Location</dt>
        <dd>{disclosure.destination}</dd>
        <dt>Versions</dt>
        <dd>{disclosure.versions.join(", ")}</dd>
        <dt>Tool credits</dt>
        <dd>
          {disclosure.credits
            .map((credit) => `${credit.name} (${credit.license})`)
            .join(", ")}
        </dd>
      </dl>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
      <button type="button" onClick={props.onAcknowledge} autoFocus>
        Install tools and continue
      </button>
    </div>
  );
}
