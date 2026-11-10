# ADR 0001: Keep four coordinated visual domains

- **Status:** Established
- **Date:** 2026-08-06

## Decision

Earth Stories maintains four coordinated but distinct domains:

1. Product UI: workspace, editor, preparation, and publishing use
   `@earth-stories/ui` semantic tokens and shared behavior.
2. Reader UI: publication and embed themes are viewer-owned. Their default is
   CNG-derived, while the editorial theme remains an intentional exception.
3. Authored/data appearance: map layers, classifications, chart series, and
   author choices remain outside the product palette.
4. Rendering boundaries: canvas, WebGL, map styles, and generated documents may
   require concrete values or small exported constants.

Shared accessibility, terminology, state, and local-first requirements cross
all domains. Palette values do not cross them blindly.

## Consequences

The editor must not recolor authored data to satisfy product-token checks. The
viewer must not depend on Chakra to render. Exceptions are documented and
scoped instead of copied into new product UI or mechanically eliminated.

## Illustrated Atlas reader

The optional `atlas` publication theme is a reader-owned exception: ivory paper,
navy ink, a restrained crimson accent, local serif/system typography, and a
compass/line motif. It does not change product tokens or recolor authored maps.
The hurricane example uses it with a clearly labeled generated engraving and
unchanged recorded track/intensity data. The illustration is not evidence.

Atlas chapters are reader-directed pages with real fragment links, Back/Forward
support, previous/next controls, a read-all view, and explicit map exploration
and reset. There is no scroll capture or automatic advancement. Consecutive map
chapters retain their renderer so authored camera/time transitions can run;
reduced-motion preferences skip those transitions. Snapshot mode renders every
chapter. The same reader and theme contract run in preview and publication.

A chart's numeric or unambiguous ISO date/time x domain uses the actual values,
shared across series; categorical labels retain ordinal positions. Exact values
remain available in a keyboard-accessible table. In particular, irregular
landfall fixes must not make time appear evenly spaced by observation count.

### Experiential atlas atmosphere

The optional `publication.atmosphere: "sea"` setting belongs to the reader
visual domain and defaults to no atmosphere when absent. It is explicitly
selected in Story settings and compiled into the publication. Other atlas
stories do not acquire weather imagery automatically.

A generated engraving sits behind independent SVG cloud contours and two
wave planes. Slow transform-only motion provides depth without moving the
reading text. These layers are illustrative, do not encode measured weather,
and never draw on top of the data map or chart. The source credit and visible
scene label make that distinction.

Atlas chapter changes use one interruptible 1600 ms clock for the camera,
recorded time, image-to-data reveal, and text opacity. The reader can pause,
resume, skip the transition, or turn motion off. Map gestures and explicit
time controls interrupt the authored transition. Background tabs suspend it;
OS reduced motion settles the scene and disables continuous playback.
Read-all and snapshot output use a complete static layout. No sound, scroll
locking, mandatory wait, or atmospheric measurement is introduced.
