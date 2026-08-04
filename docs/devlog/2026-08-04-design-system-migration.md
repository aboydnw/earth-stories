# CNG design-system migration

Earth Stories now treats CNG Sandbox as its first iteration rather than a
separate sibling product. The local-first editor keeps the mature Development
Seed look and the maintainability investments made in CNG.

## Built

- Added an independent `@earth-stories/ui` workspace with CNG-derived Chakra
  semantic tokens, component recipes, shared actions, status feedback, section
  headings, and matching CSS variables.
- Added a root Storybook with design-token, typography, action, feedback, and
  product-pattern coverage plus the accessibility review addon.
- Migrated the local editor and publication workshop to Satoshi typography,
  warm neutral surfaces, semantic feedback, rounded controls, consistent focus
  states, and shared components.
- Made the polished CNG-derived reader the publication default while preserving
  the earlier field-journal direction as an optional `editorial` theme.
- Added Storybook to CI and documented contribution boundaries.

## Architectural boundary

No CNG package, repository checkout, or runtime is referenced. The design code
is owned by Earth Stories and evolves with the local-first application.
