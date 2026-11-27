# Design tokens

Implemented in `apps/web/src/app/globals.css`. Light is the default theme; dark applies with `<html data-theme="dark">`. Components use the Tailwind names, never raw colours.

## Colour

| Spec token        | Tailwind name            | Light                          | Dark                    | Use                            |
| ----------------- | ------------------------ | ------------------------------ | ----------------------- | ------------------------------ |
| `brand.primary`   | `primary`                | `#2563EB`                      | `#60A5FA`               | Main actions and links         |
| (new)             | `primary-fg`             | `#FFFFFF`                      | `#0B1220`               | Text on primary fills          |
| `brand.secondary` | `secondary`              | `#7C3AED`                      | `#A78BFA`               | Accents and AI identity        |
| `bg.canvas`       | `canvas`                 | `#F5F7FB`                      | `#0B1220`               | Page background                |
| `bg.surface`      | `surface`                | `#FFFFFF`                      | `#111B2E`               | Cards and panels               |
| `bg.elevated`     | `elevated`               | `rgba(255,255,255,.72)`        | `rgba(23,32,51,.72)`    | Glass panels                   |
| `text.primary`    | `fg`                     | `#172033`                      | `#F8FAFC`               | Main text                      |
| `text.secondary`  | `fg-muted`               | **`#5B6B82`** (spec `#64748B`) | `#A8B4C7`               | Supporting text                |
| `border.subtle`   | `subtle`                 | `#E2E8F0`                      | `rgba(255,255,255,.12)` | Borders and dividers           |
| `state.success`   | `success`                | `#16A34A`                      | `#4ADE80`               | Icons, fills, large text       |
| (new)             | `success-text`           | `#15803D`                      | `#4ADE80`               | Success text                   |
| `state.warning`   | `warning`                | `#D97706`                      | `#FBBF24`               | Icons, fills, large text       |
| (new)             | `warning-text`           | `#B45309`                      | `#FBBF24`               | Warning text                   |
| `state.danger`    | `danger` / `danger-text` | `#DC2626`                      | `#F87171`               | Errors and destructive actions |

### Contrast check (WCAG 2.2, measured 2026-11-27)

AA needs 4.5:1 for normal text and 3:1 for large text and UI graphics.

| Pair                                                | Ratio               | Result                                             |
| --------------------------------------------------- | ------------------- | -------------------------------------------------- |
| Light `text.secondary` spec `#64748B` on canvas     | 4.44                | **Fails AA**, so replaced                          |
| Light `fg-muted` `#5B6B82` on canvas                | 5.06                | Pass                                               |
| Light `fg` on canvas                                | 15.17               | Pass                                               |
| Light `primary` on surface / canvas                 | 5.17 / 4.82         | Pass                                               |
| White on `primary` (buttons)                        | 5.17                | Pass                                               |
| Light `secondary` on surface                        | 5.70                | Pass                                               |
| Light `success` `#16A34A` on surface                | 3.30                | Fails for text, so `success-text` was added (5.02) |
| Light `warning` `#D97706` on surface                | 3.19                | Fails for text, so `warning-text` was added (5.02) |
| Light `danger` on surface; white on `danger`        | 4.83                | Pass                                               |
| Dark `fg` / `fg-muted` on canvas                    | 17.89 / 8.93        | Pass                                               |
| Dark `primary` on surface; canvas text on `primary` | 6.77 / 7.36         | Pass                                               |
| Dark `success` / `warning` / `danger` on surface    | 9.88 / 10.31 / 6.22 | Pass                                               |

Glass panels must be re-checked whenever they sit over images or gradients.

## Typography

Geist Sans (via the `geist` package) with system fallbacks.

| Token      | Class          | Size / line height |
| ---------- | -------------- | ------------------ |
| Display    | `text-display` | 36 / 44 px         |
| H1         | `text-h1`      | 30 / 38 px         |
| H2         | `text-h2`      | 24 / 32 px         |
| H3         | `text-h3`      | 20 / 28 px         |
| Body       | `text-body`    | 16 / 24 px         |
| Supporting | `text-support` | 14 / 20 px         |
| Caption    | `text-caption` | 12 / 16 px         |

## Spacing, radius, elevation

- Spacing uses Tailwind's 4px scale (`1` = 4px … `16` = 64px).
- Radius: `rounded-sm` 8, `rounded-md` 12, `rounded-lg` 16, `rounded-xl` 20, `rounded-2xl` 24 px. Glass panels use 18px from the spec.
- Shadow: `shadow-soft`.
- Content max width: `max-w-content` (1280px).
- Interactive controls are at least 44×44px.

## Glass panel

`.glass-panel` uses a solid surface by default and switches to the translucent, 16px-blurred version only where `backdrop-filter` is supported.

## Motion

`prefers-reduced-motion: reduce` shortens all animations and transitions to effectively zero (tested in `apps/web/e2e/smoke.spec.ts`).
