# Design foundations

## Product character

Earth Stories is a warm, map-led workbench: capable, quietly technical, and
approachable. Prefer real maps and output previews, stable hierarchy,
progressive disclosure, direct local-first language, and visibly recoverable
states. Avoid generic cloud/SaaS terminology, decorative gradients, and
infrastructure vocabulary as the primary label.

## Color and visual domains

Product interface colors use semantic roles from `packages/ui/src/tokens.ts`:

- Surfaces: `bg`, `bg.subtle`, `bg.raised`, `bg.emphasized`, `bg.muted`
- Text: `fg`, `fg.muted`, `fg.placeholder`, `fg.disabled`
- Boundaries: `border`, `border.emphasized`
- Action and selection: `action.*`, `selection`, `focus.*`
- Status: `status.{success,warning,danger,info}.{fg,subtle,border}`
- Environment: `overlay`, `disabled`, `map.chrome`

Map layers, chart series, classifications, author-selected colors, canvas APIs,
and publication themes do not become product palette tokens. They remain owned
by their visual domain and require a legend or another non-color cue when color
carries meaning.

## Typography and local fonts

Plus Jakarta Sans is the product and default reader family; DM Mono is used for
technical values. Both are bundled into editor and viewer builds. Font loading
must not require Fontshare or Google Fonts.

Use the named `display`, `pageTitle`, `sectionTitle`, `cardTitle`, `body`,
`label`, and `metadata` styles for reusable hierarchy. Use sentence case, keep
prose near 65 characters per line, use tabular figures for changing numeric
data, and avoid important interface copy below 12px.

## Spacing and density

Use the shared spacing scale. Product inspectors have three control densities:

- Compact: 32px for repeated secondary controls in dense inspectors.
- Standard: 40px for ordinary editor controls.
- Comfortable: 44px for primary/touch-oriented workspace controls.

Inspector fields use a 12px internal gap and major sections use a 20px gap.
One- or two-pixel optical adjustments belong inside a component, not repeated
at call sites.

## Shape, depth, and layering

Controls use the 8px `control` radius; panels and dialogs use the 12px `panel`
radius. Shadows communicate actual elevation rather than decoration.

| Layer        | Value | Purpose                      |
| ------------ | ----: | ---------------------------- |
| `base`       |     0 | Normal content               |
| `sticky`     |    10 | Sticky navigation            |
| `mapControl` |    20 | Map controls and legends     |
| `overlay`    |    30 | Drawers and scrims           |
| `modal`      |   100 | Blocking dialogs             |
| `toast`      |   200 | Toasts and focused skip link |

Use the named Chakra token or matching `--es-z-*` variable. Do not introduce
arbitrary high values.

## Motion

Use `fast` (180ms), `moderate` (240ms), `slow` (340ms), and the shared outgoing
easing. Product motion must not compete with map camera or temporal animation.
Honor `prefers-reduced-motion`; imperative map animation needs its own fallback.

## Icons

Use Phosphor for interface actions with consistent weight. Decorative icons are
hidden from assistive technology. Icon-only controls require an accessible name
and visible focus. Logos, cartographic marks, and data symbols are separate.

## Responsive and accessibility baseline

Review 390px, 768px, 1024px, and 1440px layouts. Responsive behavior changes
composition and priority rather than only shrinking spacing. The target is WCAG
2.2 AA: semantic controls, visible focus, logical keyboard order, focus return,
associated errors, meaningful names, zoom support, reduced motion, and map
status with a textual path where possible.
