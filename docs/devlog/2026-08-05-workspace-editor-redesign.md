# Workspace and visual editor redesign

Earth Stories now opens on a local workspace instead of dropping directly into
the first project. The workspace lists local stories, creates new projects, and
keeps bundled example stories available as editable starting points.

The editor follows the mature CNG Sandbox authoring model without reintroducing
hosted-service dependencies:

- the left outline owns chapter selection, order, duplication, deletion, and a
  deliberate chapter-type chooser;
- the shared publication renderer remains visible in the center as the live
  authoring canvas;
- the right inspector switches between selected-chapter controls, story-wide
  settings, and local/public data workflows;
- publication profiles and delivery counts remain in the Publish workshop.

The work reuses the existing project schema, compiler, renderer, local API, and
publication flow. Workspace and inspector selection are transient interface
state and do not change the portable `story.json` format.

Validation included formatting, UI-token and repository-independence checks,
TypeScript build mode, 36 unit tests, editor and viewer production builds,
Storybook, and headless-browser walkthroughs of the workspace, chapter creation,
story settings, data connections, and live preview.

## Product-testing follow-up

A narrated pilot session exposed a crash after moving the same chapter twice.
Chapter reordering now targets an explicit chapter ID inside the state update,
handles missing and boundary positions without mutation, and has regression
coverage for repeated moves in both directions.

The same feedback pass also tightened first-run behavior: submitting the new
story form without a title creates **Untitled story**, examples appear as tagged
entries in the main story list, and reopening an example reuses its existing
editable project. Native selects and checkboxes now receive the shared Earth
Stories control treatment so the inspector is visually consistent across
platforms.

A second narrated pass focused on workspace and preview polish. Story rows now
offer rename and recoverable removal actions; removed projects move to the
workspace's `.trash` directory rather than being destroyed. The workspace also
states that stories remain local until publication. Publication option cards
now contain and wrap their descriptions, the live story uses the full preview
canvas without decorative browser chrome, and shared form-control styling has
crisper selected and focused states.
