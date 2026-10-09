# AthleteCore Web — Design System Spec

Status: v0.1. Source of truth for every color, type, spacing and component decision. Dark theme only.

## 1. Sources of truth

- Tokens: `docs/design/tokens.json` (W3C DTCG format). Do not duplicate values anywhere else.
- Allowed contrast pairs: `docs/design/contrast.json`.
- Generated CSS variables: `src/styles/tokens.css` (or `design/generated/tokens.css` if there is no `src/`). Auto-generated, never edit by hand.
- Only `design-system-keeper` may edit the files above and this document. Everyone else requests changes through it (skill: `design-tokens`).
- Visual reference only (not a source of values): `docs/design/reference/`.

## 2. Hard rules

1. Never write hex, rgb(), hsl() literals in app code. Use CSS variables from the generated file.
2. Use only semantic variables (`--color-surface-*`, `--color-text-*`, ...). Never use `--color-primitive-*` outside the tokens files.
3. No arbitrary values for color, spacing, radius or typography. Use the scale.
4. Use only components from section 6, with their documented variants and states.
5. Red (`status.danger*`) is only for errors and destructive actions. Never as primary or decoration.
6. If something you need does not exist: stop and request it from `design-system-keeper`. Do not approximate.

## 3. Color roles (what each token is for)

| Token (CSS var) | Use | Do not |
|---|---|---|
| `surface.bg` | Page and main content background | |
| `surface.sidebar` | Sidebar (slightly lighter than bg) | |
| `surface.card` | Cards, panels, tables | |
| `surface.elevated` | Dropdowns, modals, table row hover | Place inputs or `text.subtle` / `action.primary-text` text on it |
| `border.default` / `border.divider` | Card borders / subtle separators | Use for form control borders |
| `border.input` | Input, select, textarea borders | Use on `surface.elevated` (contrast < 3:1) |
| `text.primary` | Titles, key text | |
| `text.secondary` | Card titles, body | |
| `text.muted` | Labels, nav items, secondary info | |
| `text.subtle` | Axis labels, placeholders | Use on `surface.elevated` |
| `action.primary` | Fills: primary button, active nav item, solid badge. Text on it: `text.on-primary` | Use as text or icon color |
| `action.primary-hover` / `-active` | Hover and pressed states of primary fills | |
| `action.primary-text` | Links and icons in primary color | Use on `surface.elevated` |
| `action.secondary` | Violet accent fills (badges). Sparingly | Use as the only indicator of state |
| `action.secondary-text` | Violet text | |
| `subtle.primary` / `subtle.secondary` | Selected rows, soft highlights. Text on `subtle.primary` must be `text.primary` | Use `action.primary-text` on `subtle.primary` (4.2:1) |
| `status.success/warning/info` (+ `-subtle`) | Status badges, banners | Confuse info (cyan) with primary |
| `status.danger` (+ `-text`, `-subtle`) | Destructive buttons, error borders, validation banners | Any non-error use |
| `data.series-1..4` | Chart series, in order | Rely on color alone: always add legend labels, direct labels or patterns |
| `data.avatar` | Default avatar fill | |
| `focus-ring` | Focus indicator on every interactive element | Remove or override |

## 4. Typography (PROVISIONAL: typeface to be confirmed)

Family `font.family.sans` (Inter). Scale: caption 12/16, label 13/20, body 14/20, title 16/24, heading 24/32, metric 32/40. Weights: 400, 500, 600, 700. Page title = heading/600. Card title = title/600. KPI numbers = metric/700. Sentence case, no all-caps labels.

## 5. Spacing, radius, layout

- Spacing scale (4px base): `space.1`=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32. Card padding `space.5`; gap between cards `space.4`.
- Radius: controls `radius.control` (8), cards `radius.card` (12), badges `radius.pill`.
- Flat style: cards use a 1px `border.default` border, no shadows.
- Layout: sidebar `layout.sidebar-width` (240), content max `layout.content-max` (1200). Below 860px the sidebar becomes a horizontal bar and grids collapse to one column.

## 6. Component catalog

Each component must implement the states listed. Focus: 2px `focus-ring` outline, 2px offset, on `:focus-visible`. Disabled: `opacity.disabled`, no pointer events.

- Button — variants: primary (`action.primary` fill), secondary (transparent + `border.input`), destructive (`status.danger` fill). States: default, hover, active, focus, disabled. Radius control, label weight 600.
- Input / Select / Number input — `surface.bg` fill, `border.input` border. States: default, hover, focus, disabled, error (border `status.danger-text` + message). Never on `surface.elevated`.
- Card — `surface.card`, `border.default`, `radius.card`. KPI card: label (muted), metric number, optional sparkline, ring or progress bar.
- Badge — pill. Variants: primary (solid `action.primary`), secondary (solid `action.secondary`), success/warning/info (`*-subtle` fill + status text color).
- Table — header `text.muted` caption, rows separated by `border.default`, row hover `surface.elevated`, status as badge.
- Nav item (sidebar) — default `text.muted`; hover `surface.card`; active `action.primary` fill + `text.on-primary`.
- Validation banner — `status.danger-subtle` fill, `status.danger` border, `status.danger-text` text, `role="alert"`; the invalid field also shows the error state.
- Progress bar — track `border.default`, fill `data.series-1`.
- Bar/line chart — series in order `data.series-1..4`, gridlines `border.default`, axis text `text.subtle`, legend above the chart with labels.
- Empty state — centered outline icon, one sentence explaining the state, one action button.
- Avatar — circle, `data.avatar` fill, initials in `text.on-primary`.
- Search field — `surface.card`-level fill, `border.default`, placeholder `text.subtle`.
- Icons — outlined, thin stroke (about 1.5px), 18px in nav. Icon set to be confirmed (candidate: Lucide).

## 7. Screen patterns

- Dashboard: row of 3 KPI cards; chart card + empty-state card (3:2); two list cards (upcoming sessions, recent activity).
- Athlete list: filters (Sport, Status) + action buttons on one toolbar; table inside a card.
- Athlete detail: header card (avatar, name, sport); progress chart; current plan progress bar; trainer notes.
- Create/edit plan form: single column, max width 640px; week breakdown as 4 number inputs; validation banner above the actions; Cancel (secondary) + Save (primary, disabled while invalid).

## 8. Checks and workflow

```
node scripts/build-tokens.mjs          # regenerate CSS variables
node scripts/check-contrast.mjs        # WCAG contrast of allowed pairs
node scripts/check-hardcoded-styles.mjs # no literals / primitives / arbitrary values
```

(`npm run design:check` runs all of them when `package.json` exists.) Run before finishing any UI task. To change or add tokens or components, follow the `design-tokens` skill through `design-system-keeper`.

## 9. Not defined yet / provisional

- Typeface and icon set (provisional above).
- Light theme (not defined; dark only).
- Loading skeletons, toasts, modals, tooltips, chart tooltips, pagination.
- Mobile layouts beyond the basic collapse in section 5.
- The mockup showed a subtle violet-tinted gradient on lower cards; it is NOT tokenized (cards are flat `surface.card`). Decision pending.
- Full tonal scales (50-950) per hue: not generated yet; only the sampled values exist.
- Linters for the final stack (Stylelint/ESLint) and visual regression tests: pending stack decision. `scripts/check-hardcoded-styles.mjs` is the interim enforcement.
- Script limitations (documented debt from the design-contract review): `check-hardcoded-styles.mjs` excludes only `src/styles/tokens.css` (the `design/generated/tokens.css` fallback path is not excluded yet); error handling is not uniformly wrapped across the design scripts (raw stacks on malformed JSON input instead of explicit messages).
- Token values come from a visual sample of the chosen mockup, not from a Figma file.
