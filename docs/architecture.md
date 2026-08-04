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

## Remaining service boundary

The MVP service currently owns project lifecycle and asset reads. Publication
builds still run through the repository command. A later slice can expose export
planning and static builds through the same loopback boundary. Conversion jobs
remain deliberately outside the current MVP.
