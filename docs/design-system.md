# Earth Stories design system

Earth Stories is the local-first continuation of CNG Sandbox. Its product UI
therefore retains the Development Seed visual language instead of presenting as
a separate brand.

## Source of truth

`packages/ui` owns semantic theme tokens, Chakra recipes, shared product
components, and matching CSS custom properties used by layout-specific styles.
Applications name interface colors by role (`bg`, `fg`, `border`, `action`, and
`status`) instead of introducing one-off values.

The package is copied and adapted code. Earth Stories has no runtime or build
dependency on the archived CNG Sandbox repository.

## Component development

Run `yarn storybook` from the repository root. The catalogue documents
foundations, action variants, feedback states, and product patterns, with the
accessibility addon enabled for local review. CI builds the static catalogue so
broken stories and missing imports block a pull request.

## Product UI and publication UI

The editor and publication workshop use the shared product system: Satoshi,
warm neutral surfaces, restrained orange actions, consistent focus rings,
rounded controls, and semantic feedback colors.

The reader defaults to the same polished CNG-derived language. Publications
can opt into the earlier field-journal treatment with `?theme=editorial`; this
keeps expressive story styling separate from the authoring application.

## Maintenance rules

- Add reusable tokens and recipes to `packages/ui`, not individual apps.
- Add or update a story for every reusable component or state.
- Keep authored data colors outside the product palette.
- Preserve visible keyboard focus and semantic loading, empty, success,
  warning, and error states.
- Keep application layout CSS local when it is not a reusable component.
