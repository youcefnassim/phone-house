# Decision register

Current owner direction (6 November 2026, 23:27 UTC): business data must reside with Cloudflare, targeting Workers + SQLite-based D1 + private R2. External Supabase and built-in Lovable Cloud are forbidden. No provider connection/provisioning, credentials, hosted schema execution or deployment is authorized. Preserve PostgreSQL proposals as references; native source implementation proceeds independently. Resource-specific identity and owner approval are required before hosted operations. Lovable deployment to Cloudflare is unsupported; no deployment infrastructure is generated. No real data, production posting or destructive resets. Historical restrictions below do not prohibit safe coding.

The owner supplied the original register on 2026-11-05. Its full contents are preserved verbatim in `docs/OPEN_DECISIONS_AND_CONFLICTS.md`; both uploaded Markdown copies and the ZIP entry are byte-identical. All OD-01 through OD-18 remain OPEN, with the original safe interim rules and document conflicts controlling implementation. The prior missing-source status is resolved, not the decisions themselves.

Use the original OD identifiers, questions and restrictions rather than assigning numbers from summaries. Financial rounding remains separately unapproved. Nonblocking interface work continues; legally or financially unsafe issuance and transactions fail closed.

Review07 permits implementing real PostgreSQL transaction SOURCE and inactive authenticated integration, not executing it. No local/remote connection, migration execution, real account creation, Cloud activation or production adapter switch is authorized. The isolated test approval checkpoint is in `REVIEW07_IMPLEMENTATION.md`; it does not resolve any OD decision. The original OD register remains byte-preserved and all eighteen decisions OPEN.

Review08 corrects source under the independent audit and requires stronger fresh networkless disposal/identity/owner/reset approval. No database action, account creation, connection, posting or activation occurred. `REVIEW08_EXECUTION_CHECKPOINT.md` supersedes prior loopback flags. All OD decisions and original register remain unchanged.

## 2026-11-09 — Batch 1c: flexible staff roles (owner decision)

Supersedes the fixed active-role/store topology and roster caps. MANAGER and SELLER can be assigned to either M01 or M02 by the global SUPER_ADMIN, with more staff added over time. Existing membership CHECK constraints already allow both roles at both stores; no migration is required or added. Legacy identities/history are retained and retired staff are not automatically reactivated. Owner can explicitly add/activate local staff in Users; this is browser-local presentation, not hosted authentication.

The shared role-operation matrix grants SELLER store-scoped checkout, receiving, customer/model creation, sale pricing, cash open/blind close, transfer scans, SAV open/events and operational reads. MANAGER additionally has cash evidence, debt/repayment drafts, purchase/supplier saves and purchase/supplier/expense/audit metadata reads. Global SUPER_ADMIN retains all operations. Acquisition costs and audit payload/before JSON remain owner-only; changed native accounts' sessions are revoked and owner/self targeting is rejected. Policy-blocked drafts remain blocked.

Transfer approval remains one global SUPER_ADMIN plus one M02 MANAGER, two distinct people; its exception is centralized in the permissions policy for a later explicit owner decision.

## 2026-11-09 — Batch 1d transfer permissions and deterministic rejections

- Transfers: a MANAGER of the source store (or SUPER_ADMIN) creates; only SUPER_ADMIN dispatches (owner confirms, staff scan); MANAGER or SELLER of the destination store (or SUPER_ADMIN) receives. Unchanged: two distinct approvers (SUPER_ADMIN + M02 MANAGER), dispatcher and receiver must be different people, scans required at both ends.
- Deterministic rejections: a failed write caused by a constraint or trigger (CHECK, UNIQUE, FOREIGN KEY, NOT NULL, RAISE(ABORT)) is a business rejection — the specific code when diagnosable (TRANSFER_STATE, SAME_PERSON, SHIFT_CLOSED, …) or REJECTED 409, never retryable. NOT_RECORDED 503 retryable is reserved for non-constraint failures (network, timeout, unavailable). POS and receiving offer Cancel to discard a not-recorded or rejected transaction.

## 2026-11-09 — Batch 3a: POS settlement and open-shift correction

- H3: one sale may settle with Cash + Bank. Only the cash allocation enters the drawer, and change belongs only to cash received. Bank remains BANK_UNRECONCILED with Virement or CCP / BaridiMob (H1); no card terminal or cheque. FA9 removes the bank reference requirement completely.
- Pending FA8 confirmation: discount is an exact DZD amount, **limit per sale, above = refused**. An empty owner setting disables discounts. SELLER/MANAGER are capped; configured SUPER_ADMIN is uncapped. The atomic sale settlement and audit retain the discount, verified actor, and limit in force. No percentage or rounding is introduced.
- H7: parked baskets are client-side on this terminal only, do not reserve stock, and must pass fresh checkout stock/price checks when resumed.
- H6: store MANAGER or global SUPER_ADMIN may cancel only an OPEN-shift sale; closed shift is refused with “use SAV”. Same-key replay is idempotent; a second cancellation key is refused. Original sales, receipt snapshots and sold lines remain unchanged; append-only void records restore stock and reverse the cash allocation in its shift, bank allocation separately, and warranty effectiveness. No SAV return/refund policy is approved by this cancellation rule.
- Migration 0013 remains native source and isolated local test evidence only; no hosted connection, activation or migration was performed.

## 2026-11-09 — Batch 3b: cash movements and customer credit

- L3: store MANAGER or SUPER_ADMIN records cash IN/OUT into the OPEN drawer shift, with audited reason/note. Owner-editable reasons initially Loyer, Électricité, Salaires, Frais and Autre (requires note). Closed shifts and SELLER movements are refused; movements enter expected cash at close.
- O1 / FU8–FU10: only store MANAGER or SUPER_ADMIN completes a credit sale, for phones or accessories, with surname, given name, phone and due date. Deposit and credit are free per sale; no fixed eligibility/limit is invented. Cash/Bank deposit and customer-linked debt are one atomic checkout. Cash alone enters the drawer.
- Interim choices: repayments recorded by store staff (SELLER/MANAGER) or SUPER_ADMIN; reversal owner-only, audited and append-only. Cash repayments/reversals need a current OPEN shift; bank remains BANK_UNRECONCILED. The database caps simultaneous repayments at outstanding balance; zero projects PAID. Original debt, sale and repayment snapshots remain unchanged.
- Positive balances after the due date (Africa/Algiers calendar) alert SUPER_ADMIN and that store's MANAGER only, in À suivre and the credit list. No SMS is implemented. Historical blocked debt/repayment records stay readable; new credit uses the approved path.
- Cancellation with an active repayment fails closed until that repayment is explicitly reversed; no automatic deletion or assumed customer refund is introduced. Native source/isolation tests are not hosted acceptance; no provider activation or hosted migration was performed.

## 2026-11-09 — Batch 4a: suppliers, transfers and inventory

- Supplier directory: name + phone; purchase orders optional and direct receiving remains default. Owner records later per-phone or per-accessory receipt-lot costs, supplier payables and payments. Confidential values never enter staff DTOs, exports or shared caches; cash supplier payments use the selected OPEN store shift as OUT “Paiement fournisseur”, bank stays outside drawers.
- Dispatch records carrier. Partial receipts move arrived scanned quantities exactly once; missing/damaged goods remain outside available stocks with immutable discrepancies. Owner resolves return-to-source or reasoned write-off. Owner cancellation after dispatch and before completed receipt returns goods once; received goods are not silently reversed. Distinct approvers, both-end scans and dispatcher ≠ receiver remain binding.
- One monthly count per store, blind expected quantities until submitted; submitted phone missing-IMEI differences are owner-only and never automatically change phone state. Store staff post reasoned accessory adjustments; immutable records get PENDING / OK / FLAGGED owner review.
- Native migration 0015 is additive, isolated execution only. No Cloud, external provider, hosted migration or deployment activated. Local review finance is isolated from the shared operational workspace and is not an authenticated security boundary.


## 2026-11-09 — Batch 4b: owner decisions and implementation boundaries

- Store managers or owner approve linked SAV outcomes; elapsed sale days are informational, never an automatic deadline. Refunds are capped at paid amounts, append-only and atomic; cash requires the store OPEN shift. Returned units remain in SAV holding until explicit owner restock. Manufacturer repair routing and paid-repair need tracking have no invented pricing.
- Individual used-phone purchases: M01 owner only, M02 manager/owner; OPEN-shift cash OUT, private seller identity/image and owner-only acquisition cost. Native photos remain pending private storage.
- Only requested report is store/day sales in Africa/Algiers with Excel/PDF; Zakat preparation uses stock purchase cost + cash + receivables minus payables, explicitly non-certified with missing-cost coverage.
- Current exchange implementation is restricted to one-phone, non-credit original sales and a full refund plus fully paid replacement sale in one native batch. Mixed-payment, credit and multi-line exchange cases are not completed. Local exchange remains rehearsal and its warranty/numbering parity is incomplete. Native UI outcome recovery and individual-purchase post-write readback remain incomplete; no hosted acceptance is claimed.

## 2026-11-09 — SAV return on a credit sale (Batch 9d) — PENDING OWNER CONFIRMATION (interim)
- A full sale void still voids the whole credit (unchanged).
- A SAV refund or exchange return reduces the remaining credit only by the returned phone line amount: balance = max(0, previous balance − returned line amount). Lines the customer keeps stay owed.
- If the returned line amount exceeds the remaining balance, only the excess is refundable (also capped by the amount paid). A return fully absorbed by the debt is recorded with no money movement.
- Implemented by additive migration 0018 (redefines `credit_balances`, adds a refund-excess trigger); 0017 is superseded, not edited; no row changed.

## 2026-11-10 — SAV return value, discount split and credit exchange (Phase 1 audit) — AGENCY RECOMMENDATION, PENDING OWNER CONFIRMATION

Status: agency recommendation, **pending owner confirmation**. Implemented as the safe interim rule because the previous behaviour allowed over-refunds. Changing either decision later requires a new additive migration.

- **D-2026-11-10-01 Credit return.** A SAV return (plain return or exchange) reduces the sale's credit debt by the returned line's **net** amount only: balance = max(0, credit − active repayments − returned net). Lines the customer keeps stay owed. Supersedes the gross-line rule of Batch 9d / 0018.
- **D-2026-11-10-02 Discount on a partial return.** The sale discount is split across lines in proportion to their price. Net line = line price − ceil(discount × line price ÷ sale price before discount), i.e. floor(line price × sale total ÷ sale price before discount). Rounding always favours the store by less than one centime per line. Financial rounding in general remains unapproved (OD register); this rule covers SAV returns only.
- **Refund cap (all sales, cash/bank/split/credit).** Cumulative SAV refunds on a sale never exceed min(amount actually paid, max(0, returned net − outstanding debt before returns)). Enforced twice: a server command guard (`savRemainingRefundableSql`, `src/backend/sqlite/batch4b-commands.ts`) and an SQL trigger (`sav_refund_net_cap`, migration 0019). Previously a cash sale could refund the whole sale for one returned phone.
- **Exchange on credit.** An exchange may carry a zero refund only when the remaining debt absorbs the returned line (server guard; otherwise REJECTED). The return and the replacement sale are recorded in one atomic batch and linked by `sav_exchanges (case_id → new_sale_key)`. The replacement sale itself is still fully paid (no new credit) — unchanged.
- Implemented by additive migration `0019_sav_net_line_refund.sql` (views `sale_line_net`, `sav_returned_net`, `sale_refund_capacity`; redefines `credit_balances`; adds `sav_refund_net_cap`). 0016–0018 are not edited; their looser caps remain in place; no row changed. Tests: `src/test/sav-net-refund.test.ts`.
- Not decided here (still open): whether a plain `sav.outcome` REFUND with **no** refund may be recorded when money is due back (today it is allowed and the customer silently receives nothing).

## 2026-11-10 — Public reference parsing and declined SAV refunds (owner-approved)

- **D-2026-11-10-03 Public reference check character (owner decision).** Every place a public reference is parsed or validated accepts the full Crockford check alphabet `0-9 A-H J K M N P-T V-Z * ~ $ = U` (`publicReferenceFormat`, `src/domain/warranty-documents.ts`): `sav.open` saleId, receipt lookup (input trimmed and upper-cased), and `validPublicReference`. The generator is unchanged (mod-31, emits the 30 data symbols or `*`); `~ $ = U` therefore parse but never pass the checksum. Previously ~1 in 31 references (ending `*`) could not open a SAV case. The warranty test is deterministic: seeded cases cover all 31 producible check characters. No live data existed.
- **D-2026-11-10-04 Never a silent zero (owner decision).** A SAV REFUND outcome with money still due must carry either a refund amount or `refundDeclined: true` with a mandatory reason, approved by a MANAGER of the sale's store or SUPER_ADMIN. The decline records the exact waived amount in the append-only `sav_refund_declines` ledger (migration 0020). A REFUND with neither is accepted only when nothing is due (debt absorbs the return). A decline when nothing is due is refused. No refund can follow a decline. Supersedes the open item at the end of D-2026-11-10-01/02.
- Still open (not decided): a **partial** refund (amount below what is due) is accepted without a stated reason for the remainder.
