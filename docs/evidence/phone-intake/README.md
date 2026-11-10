# Option 01 — Simple phone intake (local review only)

- Unit/acceptance tests: `src/test/phone-intake-option01.test.tsx` (CAT-02/04/07/08/09/10/11/17, SALE-05, UX-01..05, SEC-01).
- Browser: `run_intake.py` against isolated fresh Playwright contexts (no owner browser data). 42 PASS / 0 FAIL:
  FR 1440 light, AR-RTL 390 dark, EN 768 dark — empty/price/IMEI-checksum errors, hidden box-condition expands, double-click → one unit, generated `PHU-…` code, reload persistence, barcode search, POS scan.
- NOT RUN in browser this turn: POS checkout → A4 invoice/warranty after the new intake (covered by unit tests), Light/Dark on every size.
- NOT RUN: hosted authorization, hosted database, hardware scanners/printers.
