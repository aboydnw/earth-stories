import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CloudArrowDown,
  Database,
  MapTrifold,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { DataSourceRow, IconButton, WorkspaceRow } from "@earth-stories/ui";
import "./editor.css";

const meta = { title: "Patterns/Editor collections" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceRows: Story = {
  render: () => (
    <div className="project-list" style={{ maxWidth: 940 }}>
      <WorkspaceRow
        number="07"
        title="Lower Mekong floodplain"
        description="A long project description wraps without displacing its chapter count or actions."
        meta="7 chapters"
        badge={<mark className="project-list__tag">Example</mark>}
        onOpen={() => undefined}
        actions={
          <>
            <IconButton
              size="sm"
              variant="ghost"
              label="Rename Lower Mekong floodplain"
            >
              <PencilSimple />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              label="Remove Lower Mekong floodplain"
            >
              <Trash />
            </IconButton>
          </>
        }
      />
      <WorkspaceRow
        number="00"
        title="Project needs repair"
        description="A referenced project file is missing."
        meta="Unavailable"
        disabled
        onOpen={() => undefined}
      />
    </div>
  ),
};

export const DataSources: Story = {
  render: () => (
    <div className="data-list" style={{ maxWidth: 940 }}>
      <DataSourceRow
        label="Flood depth scenario 2042"
        kind="cog"
        leading={<MapTrifold />}
        delivery={
          <>
            <CloudArrowDown />
            connected
          </>
        }
        usage="used in 3 chapters"
        onOpen={() => undefined}
      />
      <DataSourceRow
        label="Survey sites"
        kind="geojson"
        leading={<Database />}
        delivery={
          <>
            <Database />
            on this computer
          </>
        }
        usage="not used in a chapter"
        onOpen={() => undefined}
      />
    </div>
  ),
};
