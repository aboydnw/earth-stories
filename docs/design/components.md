# Shared components

Shared components live in `@earth-stories/ui`. Use Chakra primitives when no
product behavior is needed, tokenized primitives for local composition, shared
components for reusable semantics, and feature components for domain-specific
state or layout. A wrapper that merely shortens syntax is not a contract.

## Established

- `ActionButton` and `IconButton`: product action, focus, disabled, and loading
  behavior. Icon buttons require an accessible label.
- `FormField` with `TextInput`, `NumberInput`, `SelectInput`, `TextArea`,
  `CheckboxField`, and `FileInput`: label, help, validation, and control
  association.
- `StatePanel` and `StatusNotice`: bounded loading, empty, information,
  success, warning, and error feedback.
- `StatusBadge` and `SaveStatus`: compact status and persistence lifecycle.
- `ProgressPresentation`: queued, active, waiting, verifying, success, and
  failure stages without invented percentages.
- `ConfirmDialog` and `PanelShell`: focus-managed destructive confirmation and
  modal panel anatomy.
- `PublicationFinding`: consistent preflight result semantics.
- `SectionHeader`, `InspectorSection`, and `CollapsibleSection`: reusable
  hierarchy and disclosure.
- `WorkspaceRow` and `DataSourceRow`: keyboard-operable collection rows with
  accessible metadata and optional actions.

## Provisional

- Chapter outline and chapter-add menu remain feature components while their
  editing and keyboard contracts settle.
- Map chrome shares foundation tokens but remains viewer-owned because camera,
  canvas, and overlay behavior are domain-specific.
- Data conversion configuration remains editor-owned; its progress and feedback
  presentations are shared.

## Local layout CSS

Grid templates, feature-specific responsive transformations, map viewport
placement, and dense editor composition remain in the application. They must
consume semantic variables but should not move into the UI package until two
consumers need the same complete behavior.

## Adding a shared component

Document purpose, lifecycle status, states, focus/keyboard behavior, long-copy
behavior, narrow layout, styling extension policy, concrete consumers, stories,
tests, and migration path. Shared-component changes without a Storybook story
fail the UI governance check.
