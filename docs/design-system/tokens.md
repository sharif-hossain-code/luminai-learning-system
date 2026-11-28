# Design tokens

Source of truth: the Figma file (variables and text styles), exported to `/design/figma-export/tokens.css` in the project files. Implemented in `apps/web/src/app/globals.css`. Light is the default theme; dark applies with `<html data-theme="dark">`. Components use the Tailwind names below, never raw colours.

## Colour

| Figma variable                        | Tailwind name                   | Light                                                 | Dark                              | Use                              |
| ------------------------------------- | ------------------------------- | ----------------------------------------------------- | --------------------------------- | -------------------------------- |
| (logo)                                | `brand-mark`                    | `#2563EB`                                             | `#2563EB`                         | Logo tile only                   |
| `brand-primary`                       | `primary`                       | `#2563EB`                                             | `#60A5FA`                         | Main actions and links           |
| `brand-primary-hover`                 | `primary-hover`                 | `#1D4ED8`                                             | `#3B82F6`                         | Hover on primary                 |
| `brand-primary-strong`                | `primary-strong`                | `#1E4FC2`                                             | `#93C5FD`                         | Text on `primary-subtle`         |
| `brand-primary-subtle` / `-soft`      | `primary-subtle` / `-soft`      | `#E8EFFD` / `#D6E2FC`                                 | `#1A2747`                         | Selected rows, info alerts       |
| `text-on-brand`                       | `primary-fg`                    | `#FFFFFF`                                             | `#0B1220`                         | Text on primary fills            |
| `brand-secondary` / `-subtle`         | `secondary` / `-subtle`         | `#7C3AED` / `#F1EAFE`                                 | `#A78BFA`                         | AI identity, avatars             |
| `bg-canvas`                           | `canvas`                        | `#F5F7FB`                                             | `#0B1220`                         | Page background                  |
| `bg-surface` / `-raised`              | `surface` / `surface-raised`    | `#FFFFFF` / `#FBFCFF`                                 | `#111B2E`                         | Cards, panels, selected cards    |
| `bg-muted`                            | `muted`                         | `#F1F5F9`                                             | `#1A2538`                         | Read-only fields, rule lists     |
| `bg-segmented`                        | `segmented`                     | `#E9EEF5`                                             | `#1A2538`                         | Segmented control track          |
| `bg-hover`                            | `hover`                         | `#EEF2F8`                                             | `#1A2538`                         | Hover fills                      |
| `bg-inverse`                          | `inverse`                       | `#172033`                                             | `#020617`                         | Auth brand panel, selected chips |
| `text-primary`                        | `fg`                            | `#172033`                                             | `#F8FAFC`                         | Main text                        |
| `text-secondary`                      | `fg-muted`                      | `#4A5A70`                                             | `#A8B4C7`                         | Supporting text                  |
| `text-tertiary`                       | `fg-subtle`                     | `#5A6A80`                                             | `#94A3B8`                         | Icons, tertiary text             |
| `text-nav`                            | `fg-nav`                        | `#3B4A61`                                             | `#CBD5E1`                         | Sidebar links                    |
| `text-on-inverse` / `-muted`          | `on-inverse` / `-muted`         | `#FFFFFF` / `#C5CFDD`                                 | same                              | Text on `inverse`                |
| (auth panel)                          | `on-inverse-accent` / `-link`   | `#60A5FA` / `#93C5FD`                                 | same                              | Ticks and links on `inverse`     |
| `text-placeholder`                    | `placeholder`                   | **`#64748B`** (Figma #94A3B8)                         | `#8391A7`                         | Placeholders                     |
| `border-subtle`                       | `subtle`                        | `#E2E8F0`                                             | `#24324A`                         | Dividers, card borders           |
| `border-default`                      | `default`                       | `#CBD5E1`                                             | `#334155`                         | Inputs, secondary buttons        |
| `focus-ring` / `focus-halo`           | (in `.field-control`)           | `#2563EB` / `#C7D7FA`                                 | `#60A5FA`                         | Focus border + 3px halo          |
| `state-success` / `-text` / `-subtle` | `success` / `-text` / `-subtle` | `#16A34A` / `#15803D` / **`#EDF8F1`** (Figma #E6F6EC) | `#22C55E` / `#4ADE80` / `#0F2A1C` | Success                          |
| `state-warning` / `-text` / `-subtle` | `warning` / `-text` / `-subtle` | `#D97706` / `#B45309` / `#FEF3E2`                     | `#F59E0B` / `#FBBF24` / `#2E2010` | Warnings                         |
| `state-danger` / `-text` / `-subtle`  | `danger` / `-text` / `-subtle`  | `#DC2626` / `#B91C1C` / `#FEECEC`                     | `#F87171` / `#FCA5A5` / `#2E1414` | Errors, destructive              |
| `domain-*` / `-subtle`                | `domain-language` etc.          | blue / teal `#0E7490` / violet                        | lighter                           | Domain icon tiles                |

### Contrast check (WCAG 2.2, measured 2026-11-27)

AA needs 4.5:1 for normal text and 3:1 for large text and UI graphics.

| Pair                                              | Ratio       | Result                                          |
| ------------------------------------------------- | ----------- | ----------------------------------------------- |
| `fg-muted` `#4A5A70` on canvas / surface          | 6.55 / 7.03 | Pass                                            |
| `fg-subtle` on surface                            | 5.51        | Pass                                            |
| `primary` on surface; white on `primary`          | 5.17        | Pass                                            |
| `primary-strong` on `primary-subtle` (info alert) | 6.16        | Pass                                            |
| `danger-text` on `danger-subtle`                  | 5.68        | Pass                                            |
| `warning-text` on `warning-subtle`                | 4.58        | Pass                                            |
| `success-text` on Figma `#E6F6EC`                 | 4.48        | **Fails**, so `success-subtle` lightened (4.61) |
| Figma placeholder `#94A3B8` on white              | 2.56        | **Fails**, so darkened to `#64748B` (4.76)      |
| `on-inverse-muted` / `-link` on `inverse`         | 10.3 / 9.0  | Pass                                            |
| Dark `fg-muted` on canvas; text on `primary`      | 8.93 / 7.36 | Pass                                            |
| Dark placeholder `#8391A7` on surface             | 5.39        | Pass                                            |
| `border-default` `#CBD5E1` against white          | 1.48        | **Below 3:1** for input boundaries; see A15     |

Glass panels must be re-checked whenever they sit over images or gradients.

## Typography

Inter (variable, self-hosted via `@fontsource-variable/inter`, so no request to Google), with system fallbacks.

| Token      | Class           | Size / line height | Use                                 |
| ---------- | --------------- | ------------------ | ----------------------------------- |
| Display    | `text-display`  | 40 / 48 px         | Auth brand panel                    |
| H1         | `text-h1`       | 28 / 36 px         | Auth headings (app pages use 32/40) |
| H2         | `text-h2`       | 24 / 32 px         |                                     |
| H3         | `text-h3`       | 18 / 26 px         | Card and section titles             |
| Body       | `text-body`     | 15 / 24 px         |                                     |
| Supporting | `text-support`  | 14 / 20 px         | Labels                              |
| Caption    | `text-caption`  | 13 / 18 px         | Hints and errors                    |
| Overline   | `text-overline` | 12 / 16 px         | "STEP 1 OF 3"                       |

`cn()` (`apps/web/src/lib/cn.ts`) registers these sizes with tailwind-merge, so `text-body` and a colour such as `text-primary-fg` don't cancel each other out.

## Spacing, radius, elevation, sizes

- Spacing uses Tailwind's 4px scale.
- Radius: `rounded-sm` 8, `rounded-md` 12, `rounded-lg` 16, `rounded-xl` 20, `rounded-2xl` 24 px.
- Shadows: `shadow-soft` (glass), `shadow-xs` (segmented control thumb).
- Controls: 48px tall on auth screens (`size="lg"`), 44px in the app (`md`), 36px for inline actions (`sm`).
- Layouts: auth is a 50/50 split with a 420px form column; onboarding is a 72px top bar and a 720px column; the app has a 264px sidebar and settings sections use a 280px description column.

## Components

Shared building blocks live in `apps/web/src/components/ui/`: `Button`/`ButtonLink`, `TextField`/`SelectField`/`Checkbox`, `Alert`/`IconBadge`/`Pill` and `PasswordRules` (live rules and a 4-segment strength meter, using the same rules as the API).

## Glass panel

`.glass-panel` uses a solid surface by default and switches to the translucent, 16px-blurred version only where `backdrop-filter` is supported.

## Motion

`prefers-reduced-motion: reduce` shortens all animations and transitions to effectively zero (tested in `apps/web/e2e/smoke.spec.ts`).
