import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Stack, Text } from "@chakra-ui/react";
import {
  BrandSpinner,
  CollapsibleSection,
  ConfirmDialog,
  InspectorSection,
  PanelShell,
} from "./index";

const meta = { title: "Components/Structure and overlays" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const InspectorSections: Story = {
  render: () => (
    <Stack maxW="360px">
      <InspectorSection
        title="Map appearance"
        description="Controls use compact inspector density."
      >
        <Text>Layer and legend controls belong here.</Text>
      </InspectorSection>
      <CollapsibleSection title="Advanced filtering">
        <Text>Values remain intact while this section is collapsed.</Text>
      </CollapsibleSection>
    </Stack>
  ),
};

export const Loading: Story = {
  render: () => (
    <BrandSpinner size="md" label="Loading data on this computer" />
  ),
};

export const Confirmation: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open confirmation</Button>
        <ConfirmDialog
          open={open}
          title="Remove River survey?"
          description="The story remains recoverable in the local trash folder."
          confirmLabel="Remove story"
          onConfirm={() => setOpen(false)}
          onOpenChange={setOpen}
        />
      </>
    );
  },
};

export const Panel: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open panel</Button>
        <PanelShell
          open={open}
          eyebrow="Publication workshop"
          title="Review this release"
          onOpenChange={setOpen}
          footer={<Button>Continue</Button>}
        >
          <Text>
            Blocking findings, network dependencies, and build options share one
            focus-managed shell.
          </Text>
        </PanelShell>
      </>
    );
  },
};
