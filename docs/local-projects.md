# Local projects

An Earth Stories project is a directory the author can inspect, copy, archive,
or put under version control. The minimum project is:

```text
my-story/
  story.json
```

Local data and media may live anywhere below that directory, conventionally in
`assets/`. Connected web sources remain URLs in `story.json`.

Imported raw data is recorded in the project-local data library. Prepared
outputs are written beneath the same project and can be reused by multiple
chapters without being imported again. Example data is seeded separately and
cannot be renamed, edited, or removed; adding an example story creates an
independent editable project copy.

The application opens on a workspace that lists local projects and bundled
example stories. Opening a project enters a three-part visual editor: chapter
structure on the left, the shared publication renderer in the center, and
story, chapter, or data settings in the right inspector. This interface state
does not add fields to `story.json`; the project remains the portable source of
truth.

Workspace rows can rename a story or remove it from the active list. Removal is
recoverable: Earth Stories moves the complete project directory into `.trash`
inside the configured projects directory instead of deleting its files.

## Save safety

The local service validates the full project against the authoring schema before
writing. It rejects attempts to change the project ID, preserves the original
creation time, updates the modification time, backs up the previous JSON, and
then replaces it atomically. A lock prevents two overlapping writes from
silently overwriting each other.

Backups are implementation safety copies, not a version-history interface. They
live at `.earth-stories/backups/<timestamp>.json` inside the project.

## API boundary

The editor uses a private loopback API:

- `GET /api/projects` lists valid project folders.
- `POST /api/projects` creates a project.
- `GET /api/projects/:id` opens and validates one.
- `PUT /api/projects/:id` validates and saves one.
- `DELETE /api/projects/:id` moves one into the workspace's local trash.
- `GET /api/projects/:id/assets/*` serves a file contained by that project.
- `POST /api/projects/:id/assets?filename=…` imports a file into the project.
- `POST /api/projects/:id/conversions` starts an inspect/prepare/verify job.
- `GET /api/projects/:id/conversions/:jobId` returns typed progress and results.
- `POST /api/discover` inspects a public connection before it is committed.
- `GET /api/projects/:id/export/preflight` validates publication readiness.
- `POST /api/projects/:id/export?format=folder|zip|archive|embed` replaces the
  latest release and returns the requested representation.

This API is not a public integration contract. Tools should integrate through
the versioned `story.json` schema or publication manifest instead.

## Publication profiles

The MVP exposes two practical delivery policies during authoring:

- **Included** copies a local publication-ready asset into the ZIP.
- **Connected** keeps a public URL and records its runtime requirements.

**Automatic** chooses between them from the source location. These policies are
the foundation for future portable and offline profiles, but the MVP makes no
offline guarantee because the basemap and connected assets may require network
access.

## Latest publication

Successful builds replace the project’s `publication/` directory. A candidate
is fully assembled before the existing directory is moved aside; if the final
rename fails, the prior publication is restored. After success the prior copy
is deleted. Publication history is intentionally deferred.
