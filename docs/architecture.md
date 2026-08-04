# Architecture

## Product boundary

Earth Stories is a local authoring application, not a locally deployed SaaS
stack. The editable project is owned by the author and the publication is a
compiled static artifact.

```text
authoring project -> compiler -> publication manifest + viewer + assets
```

The two contracts are deliberately separate:

- `StoryProject` preserves editable intent and source provenance.
- `PublicationManifest` contains resolved browser-facing data and build facts.

## Runtime rule

`@earth-stories/viewer` is the only interactive story renderer. The editor
embeds it for preview and the static viewer app embeds it for publication. A
story feature is not MVP-compatible until both paths support it.

## Design-system rule

`@earth-stories/ui` is the source of truth for product-interface tokens,
recipes, and reusable components. The editor and publication workshop consume
that package; Storybook documents its supported states. This is a copied and
adapted continuation of the CNG design system, not an upstream dependency.

The reader shares the Development Seed defaults but keeps publication themes
separate from product chrome. The CNG-derived reader theme is the default; the
earlier editorial treatment is optional.

## Local authoring runtime

`yarn dev` starts two cooperating processes:

```text
browser editor :5173 -> loopback project service 127.0.0.1:4317 -> project folders
                       |
                       +-> validated story.json
                       +-> local project assets
                       +-> timestamped save backups
```

The service binds only to the loopback interface. It lists, creates, opens, and
saves projects and serves assets from inside a selected project directory. Path
containment checks prevent asset requests from escaping that directory. Writes
use a per-project lock, a fully flushed temporary file, and an atomic rename.
The previous `story.json` is copied to `.earth-stories/backups/` first.

This service is an implementation detail of the local application, not a
multi-user server or remotely operated API. `story.json` and assets remain the
portable source of truth; the editor can later be placed in a native wrapper
without changing the project format.

## Independence from CNG Sandbox

This repository contains copied and adapted source, not references to the old
application. In particular it must not add:

- git submodules or subtree update scripts;
- dependencies with filesystem or GitHub paths pointing to CNG Sandbox;
- calls to CNG APIs, tilers, storage proxies, or viewer domains;
- schemas containing CNG workspace IDs;
- CI jobs that check out or build CNG Sandbox.

Historical provenance belongs in documentation and commit messages, not in the
runtime architecture.

## Publication service boundary

The MVP service owns project lifecycle, local asset imports and reads, preflight,
and publication builds. It assembles a candidate directory beside the project,
then replaces `<project>/publication/` through a recoverable two-phase rename.
Only the latest successful release remains. ZIP, archival, and embed responses
are derived from that same directory so their manifests cannot drift.

The latest folder contains the shared viewer, compiled manifest, included
assets, `embed.html`, self-contained `archival.html`, dependency report,
preflight summary, embed instructions, and deployment instructions.

The compiler—not the editor—is authoritative for delivery policy and rejects
missing source references or incompatible chapter/source combinations. Connected
assets remain external dependencies and are reported with their CORS, network,
and byte-range requirements.

Conversion jobs remain deliberately outside the MVP. Earth Stories accepts
publication-ready formats instead of reproducing the CNG ingestion stack.
