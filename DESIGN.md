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
| `surface.elevated` | Dropdowns, modals, table row hover | `text.subtle` (4.06) or `action.primary-text` (4.45) text: both stay below 4.5. Form controls are fine (see `border.input`) |
| `border.default` / `border.divider` | Card borders / subtle separators | Use for form control borders |
| `border.input` | Form control borders (input, select, textarea, checkbox) and the switch "off" track fill (the registry's `--color-input` and the app alias `--color-field-line`). Clears 3:1 on `surface.bg` (5.59), `surface.card` (4.65) and `surface.elevated` (4.06) | Use for card or panel borders (that is `border.default`), or on non-form elements |
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
| `status.danger` / `status.danger-text` (+ `-subtle`) | Error borders and validation banners; destructive buttons render SOFT: label `status.danger-text` on a ~10% tint of it (≈ `status.danger-subtle`) — see §9 | Any non-error use |
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

Each component must implement the states listed. Focus is `focus-ring` on `:focus-visible`; disabled is `opacity.disabled` with no pointer events (registry components realize both with their own upstream classes — see §9).

- Button — variants: primary (`action.primary` fill), secondary (transparent + `border.input`), destructive (SOFT: label `status.danger-text` on a ~10% tint of it, ≈ `status.danger-subtle` — see §9). States: default, hover, active, focus, disabled. Radius control, label weight 600.
- Input / Select / Number input — `surface.bg` fill, `border.input` border. States: default, hover, focus, disabled, error (border `status.danger-text` + message). Fields inside dialogs render transparent over `surface.elevated`: the border still clears 3:1 there (4.06).
- Switch — single boolean flag (form control, immediate effect). Track: on = `action.primary` fill, off = `border.input` fill; thumb `surface.bg`; `radius.pill`. States: off, on, focus (`focus-ring`), disabled, error (`aria-invalid` border `status.danger-text`). Always inside a labelled field (`Label` names the flag). The off track clears 3:1 against every surface a dialog can place it on — `surface.bg` (5.59), `surface.card` (4.65) and `surface.elevated` (4.06) — and the state itself is carried by the thumb (`surface.bg`): 5.59 against the off track, 3.73 against the `action.primary` track. The checked fill alone is 2.70 on `surface.elevated` (§9). Track and thumb rendering depend on the attribute bridge in `src/shared/theme/globals.css` — see §9(d).
- Card — `surface.card`, `border.default`, `radius.card`. KPI card: label (muted), metric number, optional sparkline, ring or progress bar.
- Badge — pill. Variants: primary (solid `action.primary`), secondary (solid `action.secondary`), success/warning/info (`*-subtle` fill + status text color).
- Table — header `text.muted` caption, rows separated by `border.default`, row hover `surface.elevated`, status as badge.
- Nav item (sidebar) — default `text.muted`; hover `surface.card`; active `action.primary` fill + `text.on-primary`.
- Tabs — in-page sub-navigation (navigating between modules stays in the sidebar). `TabsList` (`default` variant): `surface.elevated` track, `radius.control`. `TabsTrigger`: inactive label `text.primary` at 60%, full `text.primary` on hover, active = `surface.bg` fill + `text.primary` — that fill is only 1.38:1 on the track, so the active state must also read from the label emphasis; never signal selection by fill alone. `line` variant: transparent track, active tab underlined in `text.primary`. Body size, weight 500; focus `focus-ring`. Triggers are real links (`asChild`), with the active value derived from the route.
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
- Light theme (not defined; dark only). The theme is already dark at `:root` (`src/shared/theme/globals.css`), so the registry's `dark:` branches never activate: the per-component colors in §6 are the effective root rendering (e.g. the tabs active label is full `text.primary`, not the `dark:` override).
- Loading skeletons, toasts, modals, tooltips, chart tooltips, pagination.
- Mobile layouts beyond the basic collapse in section 5.
- The mockup showed a subtle violet-tinted gradient on lower cards; it is NOT tokenized (cards are flat `surface.card`). Decision pending.
- Full tonal scales (50-950) per hue: not generated yet; only the sampled values exist.
- Linters for the final stack (Stylelint/ESLint) and visual regression tests: pending stack decision. `scripts/check-hardcoded-styles.mjs` is the interim enforcement.
- Script limitations (documented debt from the design-contract review): `check-hardcoded-styles.mjs` excludes only `src/styles/tokens.css` (the `design/generated/tokens.css` fallback path is not excluded yet); error handling is not uniformly wrapped across the design scripts (raw stacks on malformed JSON input instead of explicit messages).
- `Button` `destructive` is SOFT in the registry (`src/components/ui/button.tsx:18-19`: `bg-destructive/10 text-destructive`, and `--color-destructive` maps to `status.danger-text`): label `status.danger-text` on a ~10% tint of itself. A solid `status.danger` button fill is used nowhere, and the `text.on-primary` / `status.danger` pair (4.83:1, still in `docs/design/contrast.json`) has no consumer. The soft rendering is already app-wide (every DELETE confirmation). Open decision: formalize soft as the destructive style, or fork the variant to a solid `status.danger` fill — which would also lift the label contrast on `surface.elevated`. §3/§6 describe the current rendering until that is decided.
- Registry realization drift (documented debt): `src/components/ui/*` are upstream files and are not hand-edited in this repo. (a) Focus is drawn as a `focus-ring` ring (`ring-3 ring-ring/50`) instead of the 2px outline with 2px offset that §6 asks for, and disabled uses upstream `disabled:opacity-50` — `opacity.disabled` (0.4) has no consumer yet. (b) On `surface.elevated` (the background of every registry modal, `--color-popover`) one upstream combination still falls below the minimums, computed over the token values as an sRGB alpha composite: the soft destructive label `status.danger-text` at 4.29:1 (min 4.5). Fixing it means overriding a registry variant or changing where modals sit; pending. The switch "off" track used to fail here too (2.79:1 with the previous `border.input`); moving that token to `neutral.400` fixed it (4.06:1) and lifted the border of every field inside a dialog with it. (c) `action.primary` fills are only 2.70:1 on `surface.elevated`, and they are accepted: the pair is deliberately NOT listed in `docs/design/contrast.json`, which registers boundaries, not fills. What identifies those controls is not the fill but the thumb position (`surface.bg` thumb on the checked track = 3.73:1) or the button label (`text.on-primary` on `action.primary` = 5.07:1); §6 applies the same reasoning to the active tab fill. (d) Attribute bridge: the registry writes its state styles as `data-checked:` / `data-unchecked:`, but `@radix-ui/react-switch` and `@radix-ui/react-checkbox` 1.4.x emit only `data-state` (verified in the installed sources and in the latest published version), so those classes never matched anything — the Switch painted NO track and its thumb never moved (a control with no state indicator at all), and a checked Checkbox got no fill. `src/shared/theme/globals.css` maps both variants onto `[data-state=…]` while keeping the literal attribute for future primitive versions (same fix shape as the `data-active` that `reports-tabs.tsx` passes by hand). That is what makes §6's Switch rendering real; the Checkbox revives with it, and it keeps the registry's untokenized `rounded-[4px]` corner (smaller than `radius.control`).
- `border.input` deviates from the mockup sample on purpose: the prototype (`docs/design/reference/athletecore-prototype.html`) carries `--border-input:#69708A` (`neutral.500`), which is only 2.79:1 on `surface.elevated` — below the 3:1 that WCAG 1.4.11 asks of a control boundary. The token uses `neutral.400`, the same primitive step as `text.subtle`, so a single boundary token clears 3:1 on page (5.59), card (4.65) and modal (4.06) surfaces with no per-surface variant and no registry fork. The prototype is a visual reference, not a source of values, and is left untouched.
- Token values come from a visual sample of the chosen mockup, not from a Figma file.
