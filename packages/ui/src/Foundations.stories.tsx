import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Grid, Heading, Stack, Text } from "@chakra-ui/react";

const meta = {
  title: "Foundations/Design tokens",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  ["bg", "Page canvas"],
  ["bg.subtle", "Quiet surface"],
  ["bg.raised", "Raised surface"],
  ["bg.emphasized", "Selected surface"],
  ["fg", "Primary text"],
  ["action.primary", "Primary action"],
  ["status.success.subtle", "Success"],
  ["status.warning.subtle", "Warning"],
  ["status.danger.subtle", "Danger"],
] as const;

export const Colors: Story = {
  render: () => (
    <Box bg="bg" color="fg" minH="100vh" p={{ base: 6, md: 10 }}>
      <Heading textStyle="pageTitle">Semantic colors</Heading>
      <Text color="fg.muted" mt="2" mb="8" maxW="65ch">
        Earth Stories names interface colors by role so the editor, dialogs, and
        future desktop shell evolve together.
      </Text>
      <Grid templateColumns="repeat(auto-fit,minmax(210px,1fr))" gap="4">
        {colors.map(([token, description]) => (
          <Box
            key={token}
            bg={token}
            color={
              token === "fg"
                ? "bg.raised"
                : token === "action.primary"
                  ? "action.onPrimary"
                  : "fg"
            }
            border="1px solid"
            borderColor="border"
            borderRadius="panel"
            minH="124px"
            p="4"
          >
            <Text textStyle="label">{token}</Text>
            <Text mt="2">{description}</Text>
          </Box>
        ))}
      </Grid>
    </Box>
  ),
};

export const Typography: Story = {
  render: () => (
    <Stack gap="8" maxW="900px">
      {[
        ["display", "Display"],
        ["pageTitle", "Page title"],
        ["sectionTitle", "Section title"],
        ["cardTitle", "Card title"],
        ["body", "Body copy"],
        ["label", "Control label"],
        ["metadata", "Metadata"],
      ].map(([style, label]) => (
        <Box key={style} borderBottom="1px solid" borderColor="border" pb="6">
          <Text textStyle="metadata" color="fg.muted" mb="2">
            {style}
          </Text>
          <Text textStyle={style}>{label}</Text>
        </Box>
      ))}
    </Stack>
  ),
};
