# Receiving, scan and CODE128 acceptance

## Delivered

- Phone intake: gesture-started rear-preferred camera using ZXing multi-format decoding (CODE128, EAN, QR and other listed 1D formats), keyboard/manual fallback, explicit identifier assignment with ambiguous payload retained. No images saved/uploaded; media ends on success/cancel/close/unmount, including late permission responses.
- Compact manual intake remains valid without packaging: UNKNOWN is truthful and does not imply SEALED. Serial is visible when IMEI is absent. Existing fixture/historical records are not revalidated or reset. Unit quantity remains one; uniqueness, checksum and exact selling-price validation remain.
- Accessories: optional automatic SKU and persistent internal PHA code, explicit selling price or unpriced checkout hold, barcode-to-existing-SKU mapping, scoped +quantity receiving preserving existing price/history. Same receiving key prevents repeat posting; collisions are checked before state changes. Existing other-store SKU remains transfer-only.
- Phone and accessory detail/success offer real CODE128 labels, human product/reference and PHONE HOUSE text. Presets 60×40, 80×40, 100×50 mm; isolated label print/reprint does not mutate workspace/audit. No official logo recreation.
- POS exact barcode/IMEI/serial Enter lookup and model/brand search retain own-store availability boundaries. No new finance policy or hosted mode.

## Executed evidence

- `bunx vitest run`: **431 PASS, 0 FAIL**, 32 files, including original 411 and 20 receiving/scanner regressions. Canvas measurement and camera lifecycle are mocked in unit tests; the actual CODE128 encoder runs.
- Isolated receiving browser script: **54 PASS, 0 FAIL**. FR Light 1440px, AR RTL Dark 390px, EN Dark 768px: camera permission rejection, explicit dual-identifier assignment, omitted packaging, generated labels, real ZXing SVG roundtrip, print invocation/print CSS isolation/zero mutation, accessory +5, own-store Enter and cross-store rejection, reload and runtime/overflow checks.
- Synthetic camera stream script: **9 PASS, 0 FAIL**. Canvas MediaStream replaces real camera device; **actual ZXing decodes genuine CODE128 and QR frames**. Rear preference/audio constraints, track readyState ended on stop/Escape/success/final close, one-field and explicit dual-field assignment verified. This is not physical-camera acceptance.
- Additional browser actions: **6 PASS, 0 FAIL**: serial visibility, ambiguous QR no auto-assignment, serial-only intake/POS, keyboard manufacturer-code SKU mapping and receipt.
- Existing staff/cash/named-document browser script rerun: **16 PASS, 0 FAIL**: four active operators, both M01 sellers/shared drawer attribution, direct close/immutable owner flag, M02 Manager intake/POS/direct close, invoice/warranty print no mutation and ERP-context runtime check.
- Total targeted browser assertions: **85 PASS, 0 FAIL**. These are workflow assertions, not 85 independent end-to-end scenarios or full route recertification.
- Latest harness entry `2026-11-07T16:00:15Z`: **build OK**. Build/typecheck were automatic harness checks; no manual `build`, `tsc`, `oj` or `tsgo` command was run (project tooling policy). All 19 content routes inspected for title/description/OG/twitter metadata.
- Evidence scripts, exact outputs and screenshots: `docs/evidence/receiving-scanner/`. Earlier transient script failures were resolved (print-hidden-button invocation, icon-vs-barcode selector, load waits, synthetic frame crop and duplicate track-stop counter); final runs above only establish current coverage.

## Changed application files

`src/domain/operations.ts`, `src/domain/erp.ts`, `src/domain/scan-payload.ts`, `src/data/test-workspace.ts`, `src/components/erp/operation-ui.tsx`, `src/components/erp/scanner.tsx`, `src/components/erp/barcode-label.tsx`, `src/components/erp/inventory.tsx`, `src/components/erp/pos.tsx`, `src/locales/retail.ts`, `src/locales/messages.ts`, `src/styles.css`, `src/test/receiving-scanner.test.tsx`; architecture rule in `AGENTS.md`, owner constraints in project memory, roadmap and this evidence.

## NOT RUN / limits

- Physical mobile-camera permission/optics, thermal printer, actual USB scanner, hardware label readback: **NOT RUN (4 hardware areas)**. Browser Enter and synthetic camera are not hardware certification.
- Hosted identity/security, Workers/D1/private R2, multi-device transactions/concurrency: **NOT RUN (3 hosted acceptance areas)**. Nothing provisioned, connected or deployed; local actor preview is not authentication.
- Exhaustive 19-page × every locale/theme/size control audit, EAN frame decoding and every print preset on hardware: NOT RUN this wave. Existing routes/backend sources/policy holds preserved.
- No owner browser data was accessed or reset; all browser contexts were fresh synthetic contexts. IndexedDB schema/version unchanged. Existing receiving keys persist locally; cross-tab state is not authoritative server atomicity. Legal invoice/warranty, discount/credit policy remains unapproved.
