import type { Meta, StoryObj } from "@storybook/react-vite";
import { Archive, FloppyDisk, Plus } from "@phosphor-icons/react";
import { Grid, Stack } from "@chakra-ui/react";
import { ActionButton, SectionHeader, StatusNotice } from "./index";

const meta = { title: "Components/Product UI" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Actions: Story = {
  render: () => (
    <Stack align="start" gap="4">
      <ActionButton>
        <Plus />
        Create story
      </ActionButton>
      <ActionButton variant="surface">
        <FloppyDisk />
        Save changes
      </ActionButton>
      <ActionButton variant="ghost">
        <Archive />
        View publication
      </ActionButton>
      <ActionButton disabled>Unavailable</ActionButton>
    </Stack>
  ),
};

export const Feedback: Story = {
  render: () => (
    <Grid gap="3" maxW="680px">
      <StatusNotice tone="success">Publication is ready.</StatusNotice>
      <StatusNotice tone="warning">
        One connected source requires network access.
      </StatusNotice>
      <StatusNotice tone="danger">A local asset is missing.</StatusNotice>
      <StatusNotice>Files remain on this computer.</StatusNotice>
    </Grid>
  ),
};

export const SectionHeading: Story = {
  render: () => (
    <SectionHeader
      eyebrow="Local project"
      title="Notes from the river edge"
      description="Edit the story, preview the shared reader, and publish a portable static site."
    />
  ),
};
