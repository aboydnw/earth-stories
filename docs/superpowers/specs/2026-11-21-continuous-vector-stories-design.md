# Continuous, story-specific vector scenes

Status: implemented on the feature branch; pending PR review, offline browser verification, and author visual acceptance.

## Outcome

Replace the four-template AI generation constraint with custom layered vector scenes whose visual state progresses through several narrative sections. Edge of the Ice, followed by Tracking a Hurricane, are the author's manual acceptance examples. Do not modify either real story as an implementation fixture.

## Selected approach

Generate declarative, validated vector geometry and animation tracks. Reuse the shared scene renderer and extend it for continuous narrative presentation. Merely enlarging the template catalog retains the demonstrated repetition; executing generated JavaScript would add an unnecessary runtime and authority boundary. The scene description should express original geometry, composition, narrative anchors, and animation, without scripts, markup, external URLs, or CSS injection.

## Authored contract

Introduce optional story-level visual sequences. Each sequence contains a stable ID, an ordered list of existing chapter IDs, a scene definition, accessible description, and a reader-facing caption. Each narrative step associates its chapter with a progress interval. Existing chapters remain the source of narrative text: do not copy their prose into scene data.

A sequence may span consecutive prose and illustrated chapters. Map/scrolly, flyover, chart, image, and video chapters retain their existing renderers and end the current visual sequence. Subsequent sequences can reuse a visual composition at its previous ending state to create continuity around these sections. Do not replace real data visualizations with illustrative representations.

Reject missing, duplicate, overlapping, reversed, or nonconsecutive chapter references. Preserve old projects and publications with absent sequences; existing generated artwork remains readable and editable. Update project and publication schemas, compatibility tests, compiler, preflight, and archival rendering together.

## Vector vocabulary

Retain validated path geometry and add rotation about a defined layer center to the existing translation, scale, opacity, and reveal tracks. Use authored palette roles. Support enough layers for meaningful composition with explicit limits on layer count, path length, total geometry, keyframes, and response size. Validation errors identify the offending scene or layer and feed the existing bounded repair attempt. Never silently substitute a generic template after failure.

The AI must describe a subject-specific composition and meaningful changes before returning geometry. For a hurricane this can be cloud bands, an eye, coastline, and movement; for ice it can be glacier boundaries, exposed terrain, and the water interface. Do not imply illustrative motion, sizes, or boundaries are measured unless they are derived from provided data.

## Reader behavior

A single sticky scene fills the available viewport while ordinary HTML narrative steps pass above it. Scene progress follows the actual scrolling container, including editor preview and embeds. Text remains readable and selectable. Keep labels sparse and position artwork around narrative text instead of putting large headings inside the drawing.

Use the same sequence renderer in all reader themes, editor preview, and publication. Narrow layouts retain readable text and the meaningful parts of the composition. Reduced motion and print show explanatory stills with all narrative text; focused chapter previews show the corresponding step rather than an unrelated final state. Existing standalone illustrated chapters continue to render normally.

## Generation and application

Both new-story generation and existing-story enhancement use the custom scene contract. Enhancement proposes sequences around existing content and may insert new visual chapters only when they add visual value. Preserve original text, IDs, order, maps, data, images, attribution, publication settings, and the existing small supporting-edit limits.

Keep ChatGPT sign-in, local candidate preview, explicit Apply, atomic saves, stale-source protection, and author-controlled publishing. Candidate review identifies affected chapters, proposed additions, and any text edits. Production directions and animation rationale belong in review metadata, not reader captions.

## Verification and quality

Automate schema rejection, legacy compatibility, deterministic compilation, sequence grouping, interpolation, nested scrolling, reduced motion, application preservation, and export coverage. Add distinct glacier and hurricane fixtures without using author projects. Check browser frames at multiple scroll positions and narrow/wide sizes. Verify offline runtime because this changes publication rendering.

Manual acceptance is qualitative: the subjects must be recognizable without labels, compositions must differ substantially, motion must communicate the story, and visual continuity must extend beyond an isolated slide. Passing tests alone does not establish polished artwork. The author will test Ice first and Hurricane second.

## Separate investigation

The hurricane recording shows an unavailable-data warning. Its cause is not established by the recording; investigate independently and do not hide it with the visual redesign.
