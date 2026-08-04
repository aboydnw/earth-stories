# Architecture

## Product boundary

DevSeed Stories is a local authoring application, not a locally deployed SaaS
stack. The editable project is owned by the author and the publication is a
compiled static artifact.

```text
authoring project -> compiler -> publication manifest + viewer + assets
```

The two contracts are deliberately separate:

- `StoryProject` preserves editable intent and source provenance.
- `PublicationManifest` contains resolved browser-facing data and build facts.

## Runtime rule

`@devseed-stories/viewer` is the only interactive story renderer. The editor
embeds it for preview and the static viewer app embeds it for publication. A
story feature is not MVP-compatible until both paths support it.

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

## Planned local service

The current slice uses fixture projects directly while the contracts settle.
The next slice adds a loopback-only local service responsible for atomic project
writes, local asset serving, conversion jobs, export planning, and builds. Its
operational database and cache will remain disposable; `story.json` and project
assets are the durable source of truth.
