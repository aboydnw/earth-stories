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
