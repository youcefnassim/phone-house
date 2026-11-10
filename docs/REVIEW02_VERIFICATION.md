# Phone House Maghnia — Executive review 02

## Original decisions

Original document supplied 5 November 2026, preserved byte-for-byte at docs/OPEN_DECISIONS_AND_CONFLICTS.md. Both Markdown uploads and ZIP entry matched. All OD-01–OD-18 remain OPEN, including original conflicts and safe interim restrictions. No backend connected, migrations executed, credentials requested, or Antigravity resources accessed.

## Baseline before major changes

1440×1000 dashboard Light/Dark screenshots captured before operational source edits. DEMO visible; no observed browser console errors or pageerrors. Dashboard and shell preserved. Generic forms incomplete; barcode patterns decorative; pagination disabled. The controls without visible text have accessible names (navigation, theme, notifications); this is not evidence of a broken control.

## Actual route/component inventory

All 20 content leaves inspected for unique titles, descriptions, Open Graph titles/descriptions, og:type and twitter:card. No absolute page-cover URL; image tags correctly omitted. Shared shell/provider owned by root.

| URL                  | Source                             | Component            |
| -------------------- | ---------------------------------- | -------------------- |
| `/audit`             | `src/routes/audit.tsx`             | ModulePage           |
| `/auth`              | `src/routes/auth.tsx`              | Auth                 |
| `/cash`              | `src/routes/cash.tsx`              | CashRegisters        |
| `/catalog`           | `src/routes/catalog.tsx`           | ModulePage           |
| `/customers`         | `src/routes/customers.tsx`         | ModulePage           |
| `/debts`             | `src/routes/debts.tsx`             | ModulePage           |
| `/expenses`          | `src/routes/expenses.tsx`          | ModulePage           |
| `/facility`          | `src/routes/facility.tsx`          | ModulePage           |
| `/`                  | `src/routes/index.tsx`             | Dashboard            |
| `/pos`               | `src/routes/pos.tsx`               | Pos + ReceiptPreview |
| `/purchases`         | `src/routes/purchases.tsx`         | ModulePage           |
| `/reports`           | `src/routes/reports.tsx`           | Reports              |
| `/sav`               | `src/routes/sav.tsx`               | ModulePage           |
| `/settings`          | `src/routes/settings.tsx`          | SettingsPage         |
| `/stock/accessories` | `src/routes/stock.accessories.tsx` | AccessoriesInventory |
| `/stock/phones`      | `src/routes/stock.phones.tsx`      | PhonesInventory      |
| `/suppliers`         | `src/routes/suppliers.tsx`         | ModulePage           |
| `/transfers`         | `src/routes/transfers.tsx`         | ModulePage           |
| `/users`             | `src/routes/users.tsx`             | ModulePage           |

## Exact existing ten tests

Command: `bunx vitest run src/test/erp-domain.test.ts src/test/app-routing.test.tsx`
Observed baseline: 2 files PASS, 10 tests PASS; rerun after POS changes 23:22:49 UTC also PASS.

1. allows only one line quantity for a serialized phone
2. increments repeated accessory scans
3. keeps exact decimal amounts without whole-dinar rounding
4. filters synthetic M01 stock independently from M02
5. does not enable operational offline sales
6. leaves discounts unconfigured
7. keeps operational writes blocked
8. marks owner finance exclusive in frontend policy, not a security proof
9. uses only approved store labels
10. matches a page for / instead of falling back to not found

## Wave 02 implemented

- POS: explicit one-store basket, barcode/IMEI scanning, serialized phone qty 1, accessory controls, customer and Cash/Bank selection, synthetic shift/operator, blocked handoff and discount approval, unposted receipt preview.
- Cash: one physical drawer per store; opening, cash-in/out movement and blind counted-total drafts; expected value hidden in count dialog, exact signed discrepancy after draft; seller attribution/history. No one-shift-per-day rule.
- Phones: dedicated available-first searchable/filterable table; intake name/brand/store/NEW–USED/separate box condition/IMEI1/IMEI2/serial/battery/color/storage/barcode/remarks; synthetic duplicate identifiers checked globally; detail and history, real CODE128 rendering.
- Accessories: dedicated inventory/category-SKU/movement views; editable category, SKU, variant, compatibility, barcode/store/receiving quantity/reference fields; receiving draft readback and history. Draft quantity is not stock.
- Shared typed read-only operations adapter, reusable validated forms/dialogs, decimal arithmetic, semantic theme styles. All visible figures and histories synthetic; typed session drafts have no persistence or operational success claims.

## New tests

1. keeps NEW/USED independent from box condition
2. rejects malformed and duplicate IMEI identities
3. accepts optional IMEI2 and rejects battery health beyond 100
4. rejects zero and fractional accessory receiving quantities
5. represents exactly one physical drawer per store without a daily shift cap
6. computes signed cash discrepancy without rounding
7. blocks official receipt issuance and hardware acceptance claims
8. rejects sold phone units from demo checkout
9. rejects a mixed-store basket and zero accessory stock
10. validates receiving form before delivering an isolated draft

Final command: `bunx vitest run src/test/operations.test.tsx src/test/erp-domain.test.ts src/test/app-routing.test.tsx`
Observed: 3 files PASS, 20 tests PASS at 23:26:27 UTC. Meaningful React form validation/readback included; no styling snapshots.
Automatic harness build/typecheck: latest checked `build OK` at 2026-11-05T23:26:31Z. No manual build/typecheck command run because the platform performs them automatically.

## Browser evidence

Commands: `python3 /tmp/browser/review02/check_wave.py` and `python3 /tmp/browser/review02/check_remaining.py`.

- Phone invalid form → corrected intake → draft table → identity/history/barcode readback PASS.
- Accessory invalid form → 7-unit receiving draft → movement reference readback PASS. Fixture balances unchanged.
- Cash opening and movement drafts read back; M02 scope filters rows PASS.
- Blind count 41999.99 vs fixture 42000 → -0.01 DZD discrepancy draft PASS. Dialog omits expected total; no close posted.
- Scan AC000001 twice and PH000001 twice → accessory qty 2, phone qty 1; selected customer and Bank read in 192600 DZD unposted receipt PASS.
- Discount approval disabled; M02 hardware uncertainty; empty phone search; dark/mobile form validation and mobile navigation PASS.
- Four pages: 1440×1000 Light/Dark screenshots; 390×844 mobile pages no document horizontal overflow. Inventory tables intentionally scroll horizontally.
- No pageerrors in main end-to-end script. Initial automated clicks needed hydration waits; screenshots during entrance animations were recaptured after settling. Type narrowing issues and stale field errors corrected.

## Known limits and review checkpoint

Drafts expire on reload/navigation and never change fixture balances. Current cash counting accepts an explicit total, not a denomination worksheet; histories are synthetic fixtures plus unposted drafts, not an audit ledger. Standalone catalog maintenance, richer receiving-existing-SKU flows, richer financial forms, transfer/credit/bank/SAV/A4 modules need further frontend refinement. Catalog still has an older decorative label preview; new inventory labels use CODE128. No real auth/security, concurrency, persistence, bank evidence, device integration, legal/tax compliance, warranty term, restore or operational readiness claimed. Synchronous demo reads do not exercise asynchronous server loading/network failures.

No further major wave started: waiting for owner review of this wave's visuals and functional evidence. Real backend remains postponed; all unsafe issuance/actions remain blocked under original decisions.
