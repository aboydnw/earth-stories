# Design audit

Classify before consolidating. Repetition alone does not create a system rule.

| Classification             | Treatment                                             |
| -------------------------- | ----------------------------------------------------- |
| Core system                | Reuse tokens, recipes, and shared components.         |
| Reader-theme variation     | Keep viewer-scoped; share behavior, not every token.  |
| Authored/data-driven value | Keep explicit and domain-owned.                       |
| Rendering constraint       | Centralize when practical; allow documented literals. |
| Consolidation candidate    | Migrate incrementally with behavior tests.            |
| Local one-off              | Revisit when its feature changes.                     |

## Current inventory

Core: Plus Jakarta Sans/DM Mono, warm semantic surfaces, orange action/focus, status
families, control/panel radii, motion, z-index scale, Phosphor icons, form and
state components.

Exceptions: editorial reader theme, authored category and layer colors,
colormaps, chart series, MapLibre/deck.gl values, canvas snapshot values, and
generated publication CSS.

High-priority candidates: workspace rows, Data workspace controls, save status,
conversion progress, publication findings, inspector field families, and
chapter action menus. PR #8 establishes the first six; remaining chapter fields
migrate only when touched.

## Audit workflow

1. Identify the visual domain and user meaning.
2. Preserve authored, data, and rendering-boundary values.
3. Replace interface roles with semantic tokens.
4. Consolidate only a complete behavior with concrete consumers.
5. Test focus, errors, responsive states, and reduced motion.
6. Record intentional exceptions rather than bypassing checks silently.
