# Data model

Current: RecordRow, PhoneUnit, AccessorySku, CartLine, decimal Money, Scope and DataContract in frontend domain. Synthetic demo records only; placeholder IMEIs are expressly non-operational.

Future normalized PostgreSQL modules (NOT EXECUTED): stores; profiles; separate roles/memberships; devices and seller sessions; drawers/shifts/movements; brands/models/variants; phone units and global IMEI identifier registry; accessory categories/SKUs/store balances/movements/counts; private unit/batch costs; supplier operational contacts and private financials; purchases/receipts/payables/payments; customers/sales/lines/tenders; debts/repayments; facilities/installments/bank remittances; transfers/approvals/scans; SAV/returns/refunds; expenses/documents/audit/idempotency/offline conflicts.

Constraints planned: no negative stock; one phone line quantity; global IMEI uniqueness across both slots; one OPEN shift per physical drawer; M01-only facility; deduplicated bank evidence; immutable posted history and reversal entries. Transactional cumulative refund/repayment validation and row locking remain unimplemented.
