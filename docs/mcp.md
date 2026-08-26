# MCP server

Earth Stories ships a stdio [MCP](https://modelcontextprotocol.io) server so an
agent running on the same computer — Claude Code, Claude Desktop, or any other
MCP client — can author stories in a local project folder.

The server is a thin client of the loopback project service at
`127.0.0.1:4317`. It never touches `story.json` directly. Every write goes
through the same routes the editor uses, so the service keeps ownership of
schema validation, the per-project lock, the atomic save, and the timestamped
backup. An invalid edit is refused before anything is written.

The service must already be running: start the desktop application, or run
`yarn dev` from the repository.

## Configure a client

Build the bundle once:

```bash
yarn workspace @earth-stories/mcp build
```

Claude Code:

```bash
claude mcp add earth-stories -- node <repository>/apps/mcp/dist/mcp.js
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "earth-stories": {
      "command": "node",
      "args": ["<repository>/apps/mcp/dist/mcp.js"]
    }
  }
}
```

During development the bundle step can be skipped:

```bash
claude mcp add earth-stories -- yarn --cwd <repository> workspace @earth-stories/mcp dev
```

Set `EARTH_STORIES_SERVICE_URL` when the service listens somewhere other than
`http://127.0.0.1:4317`. The server exits with a message on stderr when the
service is unreachable, because stdout carries the protocol.

## Tools

| Tool                     | What it does                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `list_projects`          | Local projects with id, title, and chapter count                                      |
| `read_project`           | One project as validated `story.json`                                                 |
| `create_project`         | Create an empty project from a title                                                  |
| `update_project`         | Replace a project with a full, schema-valid project object                            |
| `add_chapter`            | Append one validated chapter                                                          |
| `list_examples`          | Curated example stories and public example connections                                |
| `create_example_story`   | Materialize an example story as an independent local project                          |
| `add_example_connection` | Add a curated public connection to a project as a connected source                    |
| `discover_source`        | Inspect a public URL: format, size, CORS, byte ranges, PMTiles layers, Zarr variables |
| `prepare_data`           | Prepare an imported raw file into a story-ready source; returns a job                 |
| `get_job`                | Poll a conversion job's status and progress                                           |
| `preflight`              | Publication preflight: blocking errors, portability warnings, size estimates          |
| `build_publication`      | Build the latest publication folder                                                   |

The `earth-stories://schema/chapter` resource lists every chapter type and the
fields it requires, including the three chart series kinds.

## Scope

Loopback only, one computer, no remote transport, and no authentication beyond
the service's own origin check. Styling a layer, moving a camera, or rewriting
a narrative is an ordinary `update_project` call — there are no per-field tools.
Wiring the desktop application to print a ready-made client configuration is
follow-up work.
