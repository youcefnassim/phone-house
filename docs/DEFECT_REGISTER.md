# Defect register

| Item                                                           | Status               | Impact                                                                                                            |
| -------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Strict TS optional/index narrowing errors during initial edits | FIXED                | Automatic build now reports OK                                                                                    |
| Browser mobile navigation immediate assertion                  | FIXED TEST           | Wait for route heading after navigation                                                                           |
| Generic draft forms across business modules                    | OPEN                 | Not yet full module-specific field schemas or operational workflows                                               |
| Inventory barcode preview                                      | RESOLVED FOR WAVE 02 | Dynamic CODE128 encoder rendered and checked; hardware NOT RUN. Older catalog decorative preview remains OPEN     |
| Preferences                                                    | OPEN                 | Session-only preview; no production persistence                                                                   |
| Demo week date labels                                          | OPEN                 | Illustrative weekly data, not real operational calendar aggregation                                               |
| Specialized refunds, bank evidence, official receipts/A4       | OPEN                 | Further frontend waves and approvals needed; wave 02 has blind-count and clearly unposted receipt preview         |
| Wave 02 form errors remained after correction                  | FIXED                | Shared form now clears corrected field errors; fresh browser captures checked                                     |
| Wave 02 typed draft-row/index errors                           | FIXED                | Automatic build/typecheck OK; 20 tests PASS                                                                       |
| Cash denomination worksheet and richer historical fixtures     | OPEN                 | Current blind close accepts explicit counted total; histories are synthetic fixtures plus unposted session drafts |
