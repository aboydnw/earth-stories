# UX improvement backlog

This document preserves the prioritized ideas produced from the Laws of UX
review and the subsequent ADHD divergent/convergent ideation pass. It is a
product backlog, not an implementation commitment. Detailed designs should
continue to use the repository's established design-system and product-pattern
documentation as the source of truth.

The implementation plan for items 1, 2, 3, and 10 is in
[`plans/ux-guidance-readiness-provenance.md`](plans/ux-guidance-readiness-provenance.md).
Those items shipped together in
[`devlog/2026-08-08-guidance-readiness-provenance.md`](devlog/2026-08-08-guidance-readiness-provenance.md).

## Recommended roadmap

| #   | Idea                                                       | Effort      | Expected impact |
| --- | ---------------------------------------------------------- | ----------- | --------------- |
| 1   | Add a lightweight guided path to the editor                | Low–medium  | Very high       |
| 2   | Rewrite empty states and controls around user outcomes     | Low         | High            |
| 3   | Add readiness information inside the existing Publish menu | Low         | High            |
| 4   | Make preview available at the chapter level                | Low–medium  | High            |
| 5   | Start every dataset with a recommended working view        | Medium      | Very high       |
| 6   | Explain what readers will notice for visualization choices | Medium      | High            |
| 7   | Turn chapter creation into intent-based choices            | Medium      | High            |
| 8   | Give chapters a compact purpose summary                    | Medium      | Medium–high     |
| 9   | Add lightweight undo and human-readable change history     | Medium–high | High            |
| 10  | Show provenance beside every published visualization       | Medium      | High            |
| 11  | Add accessibility checks directly to Reader Preview        | High        | Very high       |
| 12  | Build an intent-first story studio as a north star         | Very high   | Transformative  |

## Idea details

### 1. Guided editor path

Add a quiet, clickable `Story → Chapters → Data → Preview → Publish` cue.
Highlight the earliest incomplete step, mark completed steps, treat Data as
optional when appropriate, and show exactly one contextual next action. Keep
the editor non-linear rather than turning it into a wizard.

### 2. Outcome-oriented language and empty states

Replace system-oriented terminology and dead ends with plain-language outcomes.
Every empty, invalid, or blocked state should say what happened, what remains
intact, and provide one clear recovery action.

### 3. Publish-menu readiness

Show Ready, Needs review, or Blocked in the existing Publish menu. Include a
compact chapter/dataset/preview summary, distinguish blocking findings from
recommendations, leave Preview available when publication is blocked, and give
successful publication a clear completion state.

### 4. Chapter-level reader preview

Place “See this chapter as a reader” near the chapter title. Open at the active
chapter, preserve editor position, support responsive widths, and surface one
meaningful reader-experience issue at a time.

### 5. Recommended working data view

Render a credible map before exposing specialist GIS configuration. Lead with
one recommended view, one or two meaningful alternatives, immediate preview
updates, a single Advanced disclosure, and Reset to recommended.

### 6. Reader consequences for visualization choices

Describe map choices by the story consequence—what becomes easy to notice,
what may be obscured, and whether the result remains legible on mobile—rather
than by renderer terminology.

### 7. Intent-based chapter creation

Start with goals such as explain, locate, compare, show change, or add media,
then create the corresponding supported chapter setup automatically.

### 8. Chapter purpose summary

Keep Place, Data, Message, and Reader action visible and editable at the top of
each chapter so configuration does not obscure narrative purpose.

### 9. Reversible change feedback

Begin with undo for risky actions such as replacing data, changing a
visualization, deleting or reordering chapters, and changing publication
visibility. Use human-readable descriptions of the change.

### 10. Visualization provenance

Give every map a standard expandable provenance area showing source, freshness,
active filters, relevant transformations, geographic and temporal coverage,
and stale-data warnings. Show the same information while authoring and in the
reader publication.

### 11. Accessibility checks in preview

Incrementally check missing alternative text and captions, contrast and text
size, keyboard navigation, reading order, link clarity, and map fallbacks in
the context where the reader encounters them.

### 12. Intent-first story studio

Begin from place, change, reader takeaway, audience, and available evidence.
Propose an editable chapter outline, map states, captions, evidence gaps, and
transitions for scene-by-scene approval in a reader-faithful preview. Keep all
suggestions transparent and reversible.

## Additional divergent ideas retained for reference

### Orientation and momentum

- Persistent workflow cue.
- One contextual “next fastest move.”
- Chapter readiness indicators.
- Publication readiness strip.
- Expedition-route workflow metaphor.
- Automatically generated “publishable slice.”

### Simpler language and decisions

- Outcome-based Preview and Publish labels.
- Actionable empty states.
- Sentence-starter chapter creation.
- One missing-item suggestion at a time.
- Before-and-after consequence thumbnails.
- Chapter purpose summary card.

### Data and map configuration

- Recommended working map first.
- Two story-oriented alternatives.
- Advanced settings disclosure.
- Drag a dataset onto a chapter.
- Progressive map-control disclosure.
- Data provenance and freshness panel.

### Preview, safety, and publishing

- Chapter-level reader preview.
- Guided rehearsal mode.
- Accessibility preview overlays.
- Human-readable undo history.
- Draft-versus-published change review.
- Stable draft link that becomes the published link.
- Audience-based sharing states.
- Cross-device safe-publish simulation.

### Transformative authoring

- Reader preview as the primary editing surface.
- Intent-first story generator.
- “Tell the story out loud” creation.
- Natural-language story command palette.
- Scene-by-scene assisted approval.

## Deferred or risky directions

- Do not introduce a decorative expedition metaphor until the core workflow is
  demonstrably understandable.
- Do not replace established Preview and Publish controls with large metaphorical
  “doors” in a professional authoring interface.
- Validate guided text entry before investing in voice-first creation.
- Do not generate an entire story from one dataset without evidence and framing
  safeguards.
- Prioritize responsive preview and accessibility checks before building a full
  cross-device and slow-network rehearsal environment.
