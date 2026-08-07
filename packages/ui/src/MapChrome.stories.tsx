import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";

const meta = {
  title: "Patterns/Map chrome",
  parameters: { status: "Provisional" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutLiveMap: Story = {
  render: () => (
    <Box
      position="relative"
      minH="430px"
      overflow="hidden"
      borderRadius="panel"
      bg="bg.emphasized"
      backgroundImage="repeating-linear-gradient(0deg, transparent, transparent 31px, var(--es-border) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, var(--es-border) 32px)"
    >
      <Box
        position="absolute"
        top="4"
        left="4"
        zIndex="mapControl"
        bg="map.chrome"
        border="1px solid"
        borderColor="border.emphasized"
        borderRadius="panel"
        shadow="md"
        p="4"
        width="260px"
      >
        <Text textStyle="metadata" color="action.primary">
          Connected source
        </Text>
        <Text textStyle="cardTitle" mt="1">
          Columbia River temperature
        </Text>
        <Text color="fg.muted" fontSize="sm" mt="2">
          The map shell is local. Opening this layer requires networking.
        </Text>
      </Box>
      <Stack position="absolute" right="4" top="4" zIndex="mapControl" gap="2">
        <Button variant="surface" aria-label="Zoom in">
          +
        </Button>
        <Button variant="surface" aria-label="Zoom out">
          −
        </Button>
      </Stack>
      <Flex
        position="absolute"
        left="4"
        right="4"
        bottom="4"
        zIndex="mapControl"
        justify="space-between"
        align="center"
        bg="map.chrome"
        border="1px solid"
        borderColor="border.emphasized"
        borderRadius="control"
        p="3"
      >
        <Text fontSize="sm">Map preview unavailable in Storybook fixture</Text>
        <Button size="sm" variant="surface">
          Retry source
        </Button>
      </Flex>
    </Box>
  ),
};
