# Product patterns

## Workspace collections — Established

Represent loading, ready, empty, partial success, and failure distinctly.
Previously loaded content stays usable during refresh. A project that fails to
open does not hide successful projects. Removal is recoverable and names the
local trash behavior.

## Save lifecycle — Established

Use `clean`, `dirty`, `saving`, `saved`, `validation-error`, and
`service-error`. Saving is quiet and persistent; failure remains visible and
must not imply work is stored. The editor header shows Save and Publish; Save is
enabled only for changed content or a retryable save failure. Routine saved and
readiness badges are omitted. Publishing or leaving with unsaved work needs a
clear decision.

## Data preparation — Established

The user-facing stages are inspecting, waiting for input, downloading tools,
converting, verifying, ready, retryable failure, and unsupported format. State
what is happening and whether the user can leave. Keep source files and choices
after recoverable failure, prevent duplicate jobs, and lead success to the map.

## Data library — Established

Distinguish empty, immutable example, local source, connected source, missing
source, partial project failure, and source usage. Connected means the source
requires networking. Never display a fallback dataset as though it were the
stored selection. Workspace uploads and public connections do not require a
story. Label storage as **Shared local file**, **Local file**, or **Web connection**.
Dataset details offer **Add to story**; a shared local file remains in the workspace
library and its editable-story dependency is disclosed beside that action.

## Editor chapters — Established

Adding, duplicating, reordering, and deleting preserve the selected chapter and
preview whenever possible. Rows and inspector headings show only blocking errors from publisher
readiness; omit routine Ready and optional-review badges. Disabled actions explain unavailable
prerequisites. Destructive removal names dependent data effects and remains
recoverable where the product supports it.

The center canvas mounts the selected chapter through the viewer-owned renderer.
**Publish → Preview** opens the complete saved reader publication. Focused maps
have a definite height with narrative below, so neither prose nor controls obscure
the map in the narrow editor column. Moving an authoring map updates the project draft
after a short pause and offers one-step Undo. `View updated` means the in-memory
project draft changed; only the global Save action means it is persisted on this
computer. **Starting view** coordinates are an advanced path—ordinary map composition
happens directly on the map with Fit and Reset actions.

Chapter-only content and behavior stay in the chapter inspector. Source label,
delivery, interpretation, shared appearance, filtering, legend, and provenance
live in Story data and always state that they affect every chapter using the
source. Secondary chapter controls use task-based disclosure rather than a
single long settings form.

At 960px and below, Chapters, Canvas, and Edit become keyboard-operable tabs.
Only the active region mounts, preserving the selected chapter and draft values
without leaving hidden map runtimes active.

## Publishing — Established

Preflight separates blocking errors, portability/network warnings, and
information. Build progress uses real stages. A failed build preserves the
previous publication. The workshop places progress, errors, and completion
immediately after the build action, before separate publishing controls. Success
identifies the local output: a desktop folder with a native reveal action or a
browser ZIP with a retained download-again link. Focus moves to completion so the
result is discoverable by keyboard and at enlarged text sizes. A failed folder
reveal must not erase a successful build or its saved location. Building is
explicitly local; hosting instructions and provider links never upload files on
the author's behalf. The resulting folder/ZIP carries the same instructions.
Keep the editor’s Publish menu focused on **Preview** and **Publish publicly**.
Preflight still runs and authorizes builds; omit routine check summaries and
optional-warning panels. Show actionable blocking errors and operation failures.
Network requirements, publication profiles, and delivery guarantees remain
visible where authors choose the output. Stale results never authorize a build.

## Authoring guidance — Provisional

`Story → Chapters → Data → Preview → Publish` is a derived, non-linear view of
the current project, never a persisted wizard. Every stage remains clickable.
Data is optional when no chapter references a source; an empty source library
alone is not incomplete. Show one contextual next action at a time. Unsaved or
failed saves take precedence over ordinary guidance, followed by structural
story/chapter blockers, required data, preview review, server publication
blockers, warnings, and publish.

## Map and reader controls — Established principles

Map loading, unavailable sources, attribution, network dependency, animation,
and reduced-motion behavior remain explicit. Map controls carry their own
legible surface over changing basemaps and stay at the map-control layer. Story
prose becomes readable without waiting for map code.

Concise attribution remains visible on the map for legal and visual context.
Expanded source, license, coverage, transformation, freshness-policy, and
active-filter details live in a keyboard-accessible disclosure beside the
visualization and remain readable when the visualization cannot load.

## Content

Use “on this computer,” “project folder,” “local service,” and “connected
source.” Prefer outcomes over implementation names. Errors say what failed,
what remains intact, and the next action. Avoid account, cloud, and workspace
server terminology unless the product actually introduces those concepts.

### Reader preview from the editor

The editing canvas always shows the selected chapter. **View as reader** saves
that draft and opens its reader view in a separate tab, preserving editor
selection and scroll position. Failed saves retain edits and do not open a stale
preview; blocked popups offer a link after saving. A preview reviews the saved
revision, not later edits. Publishing remains a separate explicit action.
Development feedback controls occupy a reserved bottom dock rather than cover
navigation. The example animation experiment labels its static baseline and
requires an animated treatment before enabling rehearsal controls.

### Illustrated chapters and reader palettes

Illustrated chapters contain validated image, text, and vector path layers.
The focused canvas offers a scene scrubber; full reader scrolling advances the
same shared renderer. Reduced motion and archival export use the authored still
frame. Missing artwork is explicit. The inspector edits captions, descriptions,
layer text, image source choices, motion strength, scroll length, and still frame.
It is not a general animation timeline.

Unspecified reader colors retain the active theme defaults; archive scenes,
contrast checks, and palette controls resolve these through `resolveReaderPalette`.
Reader palette overrides belong to authored story content, are scoped to reader
roots, and never recolor product controls or data visualization ramps. Resetting
an override restores theme colors. Publication checks warn about low text contrast.

### Story creation from a brief

The workspace creation entry collects one brief and classified references. It
offers Continue with ChatGPT, saved accounts, available models, and Manage usage before generation. It identifies when the ChatGPT plan is in use; sign-in errors and usage limits do not switch billing paths.
Progress survives a page reload and names the current stage; failed or cancelled
jobs can be retried using a completed valid plan. The result shows reader colors,
chapters, composed scenes, missing-content notes, and a separate candidate reader preview.
Acceptance is disabled until validation succeeds and while import is pending.
Only **Create this story** creates an editable workspace project; publishing
remains a separate author action. The earlier chapter-specific Studio prototype
has been removed. Existing-story enhancement is accessed from Story settings
and requires explicit application of a reviewed candidate. No conversation history is exposed.

Legacy recipes select landscape, flow, reveal, or diagram layouts and remain
readable. New generation supplies validated custom path/text layers and motion
tracks. Executable code, injected markup, and generated raster files are not
accepted. Every scene retains a still frame for reduced motion and archival export. Reader palettes use contrast-checked
estuary, clay, or alpine roles. These are authored illustrations, never implied
measurements or replacements for source data.

### Continuous vector narratives

Visual sequences belong to the reader and authored rendering domains. A single
sticky vector canvas accompanies ordinary HTML narrative steps. Composition must
reserve quiet space for text, retain readable palette contrast, and remain usable
in narrow previews. Sequences reference chapter IDs, not duplicated prose; maps
and other media keep their existing renderers and interrupt continuity. Focused
previews expose a step-bounded scrubber. When a step is already an illustrated
chapter, its original artwork and caption stay visible alongside its narrative. Reduced-motion and print layouts retain
all narrative with descriptive stills. Preview, publication and archival export
use the same normalized geometry and keyframe interpretation. No generated code,
markup, external image URL or product-chrome styling enters a scene description.

### AI visual enhancement review

Enhancement stays in the editor navigation, with one visual-direction field,
annotated references, and compact account/model controls next to Generate.
Reopening older briefs combines their context and visual direction without
truncation; new-story creation retains separate content and visual fields.
The active ChatGPT account and a still-available saved model are selected by
default. Account switching remains unavailable for generation until sign-in
finishes. Adding an account is a separate action.

Ready results lead with Preview story, followed by equally prominent secondary
Apply to story and Edit instructions actions. Controls fit their labels and wrap
on narrow screens. A quieter Discard changes action belongs in that same group.
What AI changed explains the generated preview and names the chapters receiving
immersive scenes, transitions, and companion artwork. Instructions, changes, source coverage and generation
details use disclosures; supporting edits to original text remain expanded.
Preview opens separately and states that the result is not applied or published.
Applying preserves ordinary editing and author-controlled publishing.

Generate gathers map context through temporary focused chapter renderers, one
chapter at a time. The form does not display another copy of the source story.
Missing previews and unavailable sources remain explicit review notes.

Generated art should support the story's thematic subject with recognizable,
coherent illustrations and visible scroll movement. Avoid unsolicited diagrams,
new factual labels, and decoration of credits. Existing maps and charts remain
authoritative. Keyframe positions are absolute; scroll length sets minimum
travel. Quality checks apply to new generation, never reinterpret saved scenes.

Reference links can include an explanation on each line and an unambiguous bare
domain. Authors can edit the URL, notes, and intended use before generation.
Public HTML supplies bounded text and, when available, a static appearance
capture in an isolated browser with scripts disabled. This does not imply that
interactive page content was inspected. Browser availability or blocked resources
produce explicit limitations and a screenshot-upload fallback.

### Story-wide companion artwork

Generation uses a compact page identity and a prominent indeterminate working
region with the actual stage and Cancel generation. It reports no invented
percentage or completion estimate. Reduced motion keeps a still indicator.
Review controls appear only when a result can be reviewed; applying or discarding
disables competing actions.

New enhancement briefs default to Whole story: immersive narrative, an illustrated
transition, and companion artwork distributed through beginning, middle, and later
content. Focused artwork explicitly requests a smaller treatment. Legacy saved
briefs retain their prior behavior. Coverage checks examine the actual placements,
exclude credits, and allow only the existing single repair attempt.

Companion artwork is optional authored vector content attached to a stable chapter
ID. The shared viewer reserves leading, trailing, or margin space around chapter
copy. It never overlays a measured map, chart, source attribution, or controls.
Margin placement becomes an inline strip on narrow screens; grouped map steps
retain their shared map. Groups with companion artwork reserve a separate narrative
column beside the map on wide containers and stack below the map on narrow
containers and in print; artwork never enlarges an overlaid map card. Motion follows
the reader's scroll container, with a readable authored still for focused previews,
reduced motion, print, and archival export. Placement, alternative text, motion strength, static frame, and removal
are ordinary chapter-inspector controls. Chapter deletion reconciles references.
Sequence edits that conflict with companion art are blocked with an explanation
rather than deleting artwork. Focused map
previews place accented copy in document space above the map, preserving controls.

The project/publication contract limits companion artwork to 12 accents and one
per chapter; it cannot overlap an immersive sequence. Vector scene limits and a
combined sequence/accent budget apply. It grants no script, CSS, image-fetch, or
filesystem authority to generated content. Preview and explicit Apply remain the
only route to changing a saved story; publication remains author controlled.
