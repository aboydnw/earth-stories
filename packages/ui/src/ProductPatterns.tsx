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
}: PropsWithChildren<{ title: string; defaultOpen?: boolean }>) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen}>
      <Collapsible.Trigger asChild>
        <Button variant="ghost" width="full" justifyContent="space-between">
          {title}
          <CaretDown />
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
