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
