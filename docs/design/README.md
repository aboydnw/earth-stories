# Earth Stories design system

This directory is the canonical, versioned reference for Earth Stories product
design. It is written for designers, developers, reviewers, and coding agents.
Earth Stories evolves the established CNG Sandbox language for a local-first
geospatial authoring tool; it does not recreate that system independently.

## Start here

- [Foundations](foundations.md) defines tokens, typography, density, motion,
  layering, responsive behavior, and accessibility.
- [Components](components.md) catalogues supported shared contracts and explains
  when layout CSS should remain feature-owned.
- [Patterns](patterns.md) defines recurring workspace, save, conversion, data,
  editor, publication, map, and reader states.
- [Audit](audit.md) explains how to classify apparent inconsistencies.
- [Visual-domain ADR](decisions/0001-visual-domains.md) separates product UI,
  reader themes, authored colors, and rendering constraints.
- [Dependency policy](dependencies.md) records what works locally and what may
  require a network connection.
- [UX improvement backlog](../ux-improvement-backlog.md) preserves researched
  product opportunities that have not yet become established patterns.

## Source-of-truth order

1. Product behavior and accessibility requirements.
2. These durable design decisions.
3. `packages/ui/src/tokens.ts` and shared component contracts.
4. Tests and Storybook fixtures.
5. Individual screen composition.

`packages/ui/src/tokens.ts` is the executable token source. Chakra values and
the `--es-*` CSS properties are derived from it; application CSS must not define
a competing palette.

## Lifecycle language

| Status          | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| **Established** | Production-ready and appropriate for new work.        |
| **Provisional** | In production but still evolving; reuse deliberately. |
| **Exception**   | Intentionally limited to a documented visual domain.  |
| **Candidate**   | Repeated or promising, but not yet a shared contract. |
| **Deprecated**  | Retained temporarily and must not gain consumers.     |

The labels are documentation and Storybook metadata, not a runtime registry.

## Contribution workflow

1. Identify the owning visual domain and user outcome.
2. Reuse an established token, component, or pattern when its complete contract
   applies.
3. Cover loading, empty, partial, error, disabled, focus, narrow, and
   reduced-motion states that are relevant.
4. Keep feature layout local; move reusable behavior and state semantics into
   `@earth-stories/ui`.
5. Add or update stable Storybook fixtures for shared contracts.
6. Record a new token, exception, or durable pattern in this directory.
7. Run `yarn check:ui`, `yarn typecheck`, `yarn test`, `yarn build`, and
   `yarn storybook:build` before review.
