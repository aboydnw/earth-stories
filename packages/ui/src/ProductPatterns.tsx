import type { PropsWithChildren, ReactNode } from "react";
import {
  Box,
  Button,
  Collapsible,
  Flex,
  Text,
  type ButtonProps,
} from "@chakra-ui/react";
import {
  CaretDown,
  Check,
  CircleNotch,
  FloppyDisk,
  Warning,
} from "@phosphor-icons/react";

export type WorkflowStageState =
  "complete" | "current" | "optional" | "blocked";
export interface WorkflowStage {
  id: string;
  label: string;
  state: WorkflowStageState;
  description?: string;
}

const workflowStateCopy: Record<WorkflowStageState, string> = {
  complete: "Complete",
  current: "Current",
  optional: "Optional",
  blocked: "Blocked",
};

export function WorkflowGuide({
  label = "Authoring progress",
  stages,
  onStageSelect,
}: {
  label?: string;
  stages: WorkflowStage[];
  onStageSelect: (stageId: string) => void;
}) {
  return (
    <nav className="es-workflow" aria-label={label}>
      <ol>
        {stages.map((stage) => (
          <li key={stage.id} data-state={stage.state}>
            <button
              type="button"
              aria-current={stage.state === "current" ? "step" : undefined}
              onClick={() => onStageSelect(stage.id)}
            >
              <span className="es-workflow__marker" aria-hidden="true" />
              <span className="es-workflow__copy">
                <strong>{stage.label}</strong>
                <small>
                  {stage.description ?? workflowStateCopy[stage.state]}
                </small>
              </span>
              <span className="es-workflow__state">
                {workflowStateCopy[stage.state]}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function GuidancePrompt({
  children,
  actionLabel,
  onAction,
  tone = "neutral",
}: PropsWithChildren<{
  actionLabel: string;
  onAction: () => void;
  tone?: "neutral" | "warning" | "danger";
}>) {
  return (
    <div
      className="es-guidance"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <p>{children}</p>
      <Button
        size="sm"
        variant={tone === "danger" ? "solid" : "surface"}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

export type ReadinessStatus = "ready" | "review" | "blocked";
const readinessCopy: Record<ReadinessStatus, string> = {
  ready: "Ready",
  review: "Needs review",
  blocked: "Blocked",
};

export function ReadinessSummary({
  status,
  errors,
  warnings,
  loading = false,
  stale = false,
  metrics,
}: {
  status: ReadinessStatus;
  errors: number;
  warnings: number;
  loading?: boolean;
  stale?: boolean;
  metrics?: ReactNode;
}) {
  const tone =
    status === "ready" ? "success" : status === "review" ? "warning" : "danger";
  return (
    <section
      className="es-readiness"
      data-status={status}
      aria-label="Publication readiness"
    >
      <div>
        <span className="es-readiness__indicator" aria-hidden="true" />
        <div>
          <strong>
            {loading ? "Running publication checks…" : readinessCopy[status]}
          </strong>
          {stale ? <small>Previous checks · refresh required</small> : null}
        </div>
      </div>
      <div className="es-readiness__counts" aria-label="Readiness findings">
        <StatusBadge tone={errors ? "danger" : "neutral"}>
          {errors} error{errors === 1 ? "" : "s"}
        </StatusBadge>
        <StatusBadge tone={warnings ? "warning" : "neutral"}>
          {warnings} warning{warnings === 1 ? "" : "s"}
        </StatusBadge>
      </div>
      {metrics ? <div className="es-readiness__metrics">{metrics}</div> : null}
      <span
        className="es-readiness__tone"
        data-tone={tone}
        aria-hidden="true"
      />
    </section>
  );
}

export type SaveLifecycle =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "validation-error"
  | "service-error"
  | "exporting";

const saveCopy: Record<SaveLifecycle, string> = {
  clean: "Saved locally",
  dirty: "Changes not saved",
  saving: "Saving…",
  saved: "Saved locally",
  "validation-error": "Fix validation errors before saving",
  "service-error": "Changes are not saved on this computer",
  exporting: "Building publication…",
};

export function SaveStatus({ state }: { state: SaveLifecycle }) {
  const problem = state === "validation-error" || state === "service-error";
  const active = state === "saving" || state === "exporting";
  const Icon = problem
    ? Warning
    : active
      ? CircleNotch
      : state === "dirty"
        ? FloppyDisk
        : Check;
  return (
    <Flex
      className="es-save-status"
      role={problem ? "alert" : "status"}
      align="center"
      gap="2"
      color={problem ? "status.danger.fg" : "fg.muted"}
      fontSize="sm"
    >
      <Icon
        size={14}
        weight="bold"
        className={active ? "is-spinning" : undefined}
      />
      {saveCopy[state]}
    </Flex>
  );
}

export type ProgressStage =
  | "queued"
  | "inspecting"
  | "waiting"
  | "downloading"
  | "converting"
  | "verifying"
  | "ready"
  | "failed"
  | "unsupported";

export function ProgressPresentation({
  stage,
  title,
  detail,
  action,
}: {
  stage: ProgressStage;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  const active = [
    "queued",
    "inspecting",
    "downloading",
    "converting",
    "verifying",
  ].includes(stage);
  const tone =
    stage === "ready"
      ? "success"
      : stage === "failed" || stage === "unsupported"
        ? "danger"
        : stage === "waiting"
          ? "warning"
          : "info";
  return (
    <Box
      className="es-progress"
      data-stage={stage}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span
        className={
          active ? "es-progress__indicator is-active" : "es-progress__indicator"
        }
      />
      <Box>
        <Text textStyle="label">{title}</Text>
        {detail ? (
          <Text color="fg.muted" fontSize="sm">
            {detail}
          </Text>
        ) : null}
        {action ? <Box mt="2">{action}</Box> : null}
      </Box>
    </Box>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: PropsWithChildren<{
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}>) {
  const colors =
    tone === "neutral"
      ? { bg: "bg.emphasized", fg: "fg.muted", border: "border" }
      : {
          bg: `status.${tone}.subtle`,
          fg: `status.${tone}.fg`,
          border: `status.${tone}.border`,
        };
  return (
    <Box
      as="span"
      display="inline-flex"
      px="2"
      py="0.5"
      border="1px solid"
      borderColor={colors.border}
      borderRadius="control"
      bg={colors.bg}
      color={colors.fg}
      textStyle="metadata"
    >
      {children}
    </Box>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: PropsWithChildren<{ label: string } & ButtonProps>) {
  return (
    <Button {...props} aria-label={label} title={label} minW="10" px="0">
      {children}
    </Button>
  );
}

export function InspectorSection({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: ReactNode }>) {
  return (
    <Box as="section" className="es-inspector-section">
      <Box mb="3">
        <Text textStyle="label">{title}</Text>
        {description ? (
          <Text color="fg.muted" fontSize="sm" mt="1">
            {description}
          </Text>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  description,
  summary,
  issue,
}: PropsWithChildren<{
  title: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  summary?: ReactNode;
  issue?: ReactNode;
}>) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen}>
      <Collapsible.Trigger asChild>
        <Button
          className="es-collapsible-section__trigger"
          variant="ghost"
          width="full"
          height="auto"
          py="3"
          justifyContent="space-between"
          textAlign="start"
        >
          <Box as="span" display="block" minW="0">
            <Flex as="span" display="flex" align="center" gap="2" wrap="wrap">
              <Text as="span" display="block" fontWeight="semibold">
                {title}
              </Text>
              {issue ? (
                <Text
                  as="span"
                  display="block"
                  color="status.warning.fg"
                  fontSize="xs"
                  fontWeight="semibold"
                >
                  {issue}
                </Text>
              ) : null}
            </Flex>
            {description ? (
              <Text
                as="span"
                display="block"
                color="fg.muted"
                fontSize="sm"
                mt="1"
              >
                {description}
              </Text>
            ) : null}
            {summary ? (
              <Text
                as="span"
                display="block"
                color="fg.muted"
                fontSize="xs"
                mt="1"
              >
                {summary}
              </Text>
            ) : null}
          </Box>
          <CaretDown aria-hidden="true" />
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Box pt="3">{children}</Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function PublicationFinding({
  severity,
  message,
  resolution,
}: {
  severity: "error" | "warning" | "info";
  message: string;
  resolution?: string;
}) {
  const tone = severity === "error" ? "danger" : severity;
  return (
    <Box
      className="es-finding"
      bg={`status.${tone}.subtle`}
      border="1px solid"
      borderColor={`status.${tone}.border`}
      color={`status.${tone}.fg`}
    >
      <Text textStyle="label">{message}</Text>
      {resolution ? (
        <Text fontSize="sm" mt="1">
          {resolution}
        </Text>
      ) : null}
    </Box>
  );
}
