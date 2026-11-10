# Phone House ERP design system

## Scope

Batches 7 and 10 change presentation only. Financial calculations, SQL, immutable records, permission matrix and test expectations remain unchanged. Production retains native-only access and fail-closed disconnected states; preview retains its existing local workspace. Role navigation is unchanged.

## Typography — owner v1.2 (2026-11-10)

Vazirmatn (OFL, one family for Latin and Arabic) replaces Alexandria. Self-hosted variable woff2 under `public/fonts/` (Latin, Arabic, Latin-extended subsets, unicode ranges, `font-display: swap`); Latin and Arabic are preloaded in the root head; license `Vazirmatn-OFL.txt`. The family is set only through `--font-ui` (`--font-sans` resolves to it).

| Role                        | Weight | Leading |
| --------------------------- | ------ | ------- |
| Totals, prices, key numbers | 600    | 1.2     |
| Headings                    | 600    | 1.2     |
| Labels, buttons, row titles | 500    | 1.45    |
| Text                        | 400    | 1.45    |

No weights above 600. Every amount, quantity and table column uses `tabular-nums`; amounts end-aligned (mirrors in RTL). Logo letters are artwork; the lens O and roof chevron never appear in UI text. No ALL-CAPS labels: column headers and group labels are sentence case.

## Button levels (three only)

| Level     | Look                                           | Variants mapped                                  |
| --------- | ---------------------------------------------- | ------------------------------------------------ |
| Primary   | Solid Phone Blue, white text, 6px radius       | `default`                                        |
| Secondary | Card surface, 1px Night Ink border, 6px radius | `outline`, `secondary`, `destructive` (red text) |
| Tertiary  | Text only, no box; `link` is underlined        | `ghost`, `link`                                  |

Height 44px standard (`min-h-11`), 52px (`size="lg"`, `min-h-13`) for the single main action of a screen. No pills, gradients, shadows, press scaling, arrows appended to labels or icons glued to labelled buttons (icon-only buttons with an `aria-label` keep their icon).

## Semantic colour tokens

| Token                      | Value   | Role                                         |
| -------------------------- | ------- | -------------------------------------------- |
| primary                    | #1238C9 | Phone Blue: commands / selected navigation   |
| night / foreground (light) | #0B1233 | Night Ink: text, figures, dark background    |
| card (light) / on-night    | #FFFFFF | White surfaces / text on ink                 |
| yellow                     | #FFC21A | Door Yellow: pending/new/open attention only |

Yellow is never text on white, never a broad decorative fill, and remains below 10% of a screen. Pending badges use ink on yellow; waiting indicators are small yellow dots only when there are actual waiting records. Success uses semantic teal, errors use destructive. Secondary chart series use teal, not yellow decoration.

Dark mode uses Night Ink with raised muted surfaces, light body/muted text, exact Phone Blue command fills with white labels, light secondary text and visible focus outlines. Blue-on-white and white-on-blue are brand AA/AAA pairs; all new small text uses contrasting semantic foregrounds. Formal printing remains on existing paper/ink tokens.

## Neutral greys

Surface/background #F5F6F9; hairlines #DADDE6 (panel borders) and #EEF0F5 (row separators, `--hairline`); input border #C9CEDB (`--input-border`); secondary text #4A5272 (`--muted-foreground`). Dark mode keeps Night Ink as background with equivalent dark tokens.

## Layout and components

- Panels: 10px radius, 1px #DADDE6 border, no shadow. Controls: 6px radius.
- No cards inside cards: nested lists are hairline rows. No coloured icon tiles on cards or product tiles. No middle-dot meta strings in owner lists; values sit in aligned columns.
- POS: one strong element — the full-width 52px "Encaisser"/review bar showing the total on the opposite side; basket lines are hairline rows; payment split (Espèces, Virement / CCP) are aligned label/amount rows; "Mettre en attente" secondary; cancel tertiary.
- Door Yellow only for "needs you" dots and badges (`.ph-attention-dot`, status badges), never more than 10% of a screen.
- Touch target: at least 44px.
- Focus: two-pixel visible ring with separation; keyboard focus never removed without replacement.
- Tables: one-pixel row rules, sticky headings within scroll areas, stable numeric columns.
- Empty states: neutral surface, concise current localized text. Loading: muted skeleton/pulse. Error: destructive text with an inline-start rule, retaining existing recovery controls.
- Native owner home has exactly five cards. Today's sales is a full-width Night Ink card with separate actual per-store totals; drawer, low-stock, late-credit and waiting lists retain server projections. Unknown/empty totals are never synthesized.
- POS keeps scan and product selection opposite a sticky basket on desktop, stacking on mobile. Payment parts remain mounted/readable; no controls are removed or validation changed. Scan focus returns after adding an item, not while editing customer/payment fields.
- Receiving progress is a read-only projection of product selection, identifiers/quantity and receiving; it never submits or mutates stock.
- RTL uses mirrored navigation, logical borders/gaps and isolated identifiers; both themes share the same family.

## Motion

`--motion-fast: 150ms`, `--motion-normal: 200ms`, `--motion-page: 250ms`, `--motion-ease: ease-out`.
Motion only answers an action (open, confirm, error), 150–200ms. No press scaling. Native sales totals interpolate for 600ms only in display state; original amounts remain accessible and commands never consume interpolated values. Sale success check appears only after the existing confirmed success state. No awaited animation, timeout before a command, or delayed scan handling. Reduced-motion disables interpolation, animations and transitions.

## Original artwork

Only owner-supplied artwork may be used, unchanged. Horizontal full colour belongs on a white/light solid panel; original reversed lockup belongs on Night Ink. Minimum horizontal width is 140px (current slot 180px), proportional sizing; clear space is at least one symbol stem width (one-fifth symbol width). Never redraw, retype, generate, recolour, distort, rotate or add effects. Use the dedicated `PH_symbol_16px-cut.svg` for the favicon, never a scaled reconstruction.

No original artwork is present in `public/assets` at this batch baseline. Neutral existing PH placeholder and existing favicon remain; missing full-colour horizontal, reversed-on-ink horizontal and dedicated 16px-cut favicon are reported rather than fabricated.
