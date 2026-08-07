import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@chakra-ui/react";
import {
  CheckboxField,
  FileInput,
  FormField,
  NumberInput,
  SelectInput,
  TextArea,
  TextInput,
} from "./index";

const meta = {
  title: "Components/Forms",
  parameters: { status: "Established" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const FieldFamilies: Story = {
  render: () => (
    <Stack gap="5" maxW="420px">
      <FormField label="Dataset label" hint="Shown in the Data workspace.">
        <TextInput defaultValue="Columbia River temperature" />
      </FormField>
      <FormField label="Opacity" error="Enter a value from 0 through 100.">
        <NumberInput defaultValue={140} aria-invalid="true" />
      </FormField>
      <FormField label="Source type">
        <SelectInput defaultValue="connected">
          <option value="local">On this computer</option>
          <option value="connected">Connected source</option>
        </SelectInput>
      </FormField>
      <FormField label="Description">
        <TextArea defaultValue="A deliberately long description demonstrates how field copy wraps inside a narrow inspector without obscuring the control." />
      </FormField>
      <CheckboxField
        label="Show legend"
        hint="The setting is stored with this chapter."
        defaultChecked
      />
      <FormField label="Import source file">
        <FileInput />
      </FormField>
    </Stack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <FormField label="Prepared source">
      <TextInput disabled value="Waiting for conversion" />
    </FormField>
  ),
};
