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
