import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Grid, Stack } from "@chakra-ui/react";
import {
  ProgressPresentation,
  PublicationFinding,
  SaveStatus,
  StatePanel,
  StatusBadge,
} from "./index";

const meta = { title: "Patterns/Product states" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SaveLifecycle: Story = {
  render: () => (
    <Stack align="start" gap="3">
      {(
        [
          "clean",
          "dirty",
          "saving",
          "saved",
          "validation-error",
          "service-error",
          "exporting",
        ] as const
      ).map((state) => (
        <SaveStatus key={state} state={state} />
      ))}
    </Stack>
  ),
};

export const ConversionLifecycle: Story = {
  render: () => (
    <Grid gap="5" maxW="680px">
      <ProgressPresentation
        stage="inspecting"
        title="Inspecting floodplain.gpkg"
        detail="Reading layers and geometry on this computer."
      />
      <ProgressPresentation
        stage="waiting"
        title="Choose a layer to continue"
        detail="The source file remains in the project folder."
        action={<Button size="sm">Choose layer</Button>}
      />
      <ProgressPresentation
        stage="verifying"
        title="Verifying prepared map data"
        detail="You can keep editing while this finishes."
      />
      <ProgressPresentation
        stage="ready"
        title="Dataset is ready"
        detail="Open it on the map before adding it to a chapter."
      />
      <ProgressPresentation
        stage="failed"
        title="Conversion stopped"
        detail="The original source is intact. Review the message and retry."
      />
    </Grid>
  ),
};

export const CollectionStates: Story = {
  render: () => (
    <Grid gap="4" maxW="680px">
      <StatePanel
        title="Loading stories on this computer"
        description="Previously opened stories remain available while the list refreshes."
      />
      <StatePanel
        tone="warning"
        title="Some projects could not be opened"
        description="Three datasets are available. One project needs repair."
      />
      <StatePanel
        tone="danger"
        title="The local service is not responding"
        description="Return to the terminal, confirm the service is running, then retry."
        actionLabel="Retry"
        onAction={() => undefined}
      />
    </Grid>
  ),
};

export const FindingsAndBadges: Story = {
  render: () => (
    <Stack gap="3" maxW="680px">
      <Stack direction="row">
        <StatusBadge>Local</StatusBadge>
        <StatusBadge tone="info">Connected</StatusBadge>
        <StatusBadge tone="success">Ready</StatusBadge>
        <StatusBadge tone="warning">Network required</StatusBadge>
      </Stack>
      <PublicationFinding
        severity="error"
        message="A chapter has no title."
        resolution="Give every chapter a title before publishing."
      />
      <PublicationFinding
        severity="warning"
        message="This publication uses a connected dataset."
        resolution="Readers need a network connection to open that layer."
      />
      <PublicationFinding
        severity="info"
        message="The archival copy preserves interactive maps as attributed snapshots."
      />
    </Stack>
  ),
};
