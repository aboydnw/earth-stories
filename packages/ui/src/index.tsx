import type { PropsWithChildren, ReactNode } from "react";
import {
  Box,
  Button,
  ChakraProvider,
  Field,
  Heading,
  Text,
  type BoxProps,
  type ButtonProps,
} from "@chakra-ui/react";
import { system } from "./theme.js";

export { Box, Button, Field, Heading, Text } from "@chakra-ui/react";
export { system } from "./theme.js";
export { BrandSpinner } from "./BrandSpinner.js";
export { ConfirmDialog } from "./ConfirmDialog.js";
export { StatePanel, type StatePanelTone } from "./StatePanel.js";

export function EarthStoriesProvider({ children }: PropsWithChildren) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}

export function ActionButton(props: ButtonProps) {
  return <Button {...props} />;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
}) {
  return (
    <Box>
      {eyebrow ? (
        <Text textStyle="metadata" color="action.primary" mb="2">
          {eyebrow}
        </Text>
      ) : null}
      <Heading textStyle="sectionTitle">{title}</Heading>
      {description ? (
        <Text color="fg.muted" mt="2" maxW="65ch">
          {description}
        </Text>
      ) : null}
    </Box>
  );
}

export function StatusNotice({
  tone = "info",
  children,
  ...props
}: PropsWithChildren<
  { tone?: "info" | "success" | "warning" | "danger" } & BoxProps
>) {
  return (
    <Box
      role={tone === "danger" ? "alert" : "status"}
      bg={`status.${tone}.subtle`}
      color={`status.${tone}.fg`}
      borderRadius="control"
      px="4"
      py="3"
      textStyle="sm"
      {...props}
    >
      {children}
    </Box>
  );
}
