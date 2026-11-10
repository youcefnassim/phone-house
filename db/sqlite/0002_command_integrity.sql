-- Local-tested native source; NOT applied to a hosted resource.
CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL CHECK(revoked IN(0,1))) STRICT;
ALTER TABLE phones ADD COLUMN serial TEXT;
CREATE UNIQUE INDEX unique_phone_serial ON phones(serial) WHERE serial IS NOT NULL;
ALTER TABLE purchases ADD COLUMN evidence TEXT;
ALTER TABLE receiving ADD COLUMN command_key TEXT REFERENCES commands(key);
CREATE UNIQUE INDEX receiving_command ON receiving(command_key);
CREATE TABLE phone_receipts(phone_id TEXT PRIMARY KEY REFERENCES phones(id),purchase_id TEXT NOT NULL REFERENCES purchases(id),receiving_id TEXT NOT NULL REFERENCES receiving(id)) STRICT;
CREATE TABLE cash_counts(shift_id TEXT PRIMARY KEY REFERENCES shifts(id),counted_minor INTEGER NOT NULL CHECK(counted_minor BETWEEN 0 AND 99999999999999),expected_minor INTEGER NOT NULL CHECK(expected_minor BETWEEN 0 AND 99999999999999),actor_id TEXT NOT NULL REFERENCES accounts(id),reconciliation TEXT NOT NULL CHECK(reconciliation='POLICY_BLOCKED')) STRICT;
CREATE TABLE cash_evidence(id TEXT PRIMARY KEY,shift_id TEXT NOT NULL REFERENCES shifts(id),direction TEXT NOT NULL CHECK(direction IN('IN','OUT')),amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999999999),reference TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES accounts(id),state TEXT NOT NULL CHECK(state='POLICY_BLOCKED')) STRICT;
CREATE TABLE transfer_dispatches(transfer_id TEXT PRIMARY KEY REFERENCES transfers(id),actor_id TEXT NOT NULL REFERENCES accounts(id),evidence TEXT NOT NULL,command_key TEXT NOT NULL UNIQUE REFERENCES commands(key)) STRICT;
CREATE TABLE transfer_receipts(transfer_id TEXT PRIMARY KEY REFERENCES transfers(id),actor_id TEXT NOT NULL REFERENCES accounts(id),evidence TEXT NOT NULL) STRICT;
CREATE TABLE command_status(key TEXT PRIMARY KEY REFERENCES commands(key),status TEXT NOT NULL CHECK(status IN('RECORDED','DRAFT','POLICY_BLOCKED'))) STRICT;
CREATE TABLE document_integrity(document_id TEXT PRIMARY KEY REFERENCES documents(id),size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),sha256 TEXT NOT NULL CHECK(length(sha256)=64)) STRICT;
CREATE TABLE refund_reviews(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES service_cases(id),amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999999999),evidence TEXT NOT NULL,state TEXT NOT NULL CHECK(state='POLICY_BLOCKED')) STRICT;
CREATE TRIGGER receipt_quantity_cap BEFORE INSERT ON receiving
 WHEN NOT EXISTS(SELECT 1 FROM purchases p WHERE p.id=NEW.purchase_id AND p.state='AUTHORIZED' AND NEW.quantity+COALESCE((SELECT sum(quantity) FROM receiving r WHERE r.purchase_id=p.id),0)<=p.quantity)
 BEGIN SELECT RAISE(ABORT,'RECEIPT_CAP_OR_AUTHORIZATION'); END;
CREATE TRIGGER approval_identity BEFORE INSERT ON transfer_approvals
 WHEN NOT EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id WHERE a.id=NEW.actor_id AND a.active=1 AND ((NEW.approval='SUPER_ADMIN' AND m.role='SUPER_ADMIN' AND m.store_id='GLOBAL') OR(NEW.approval='M02_MANAGER' AND m.role='MANAGER' AND m.store_id='M02')))
 BEGIN SELECT RAISE(ABORT,'APPROVER_ROLE'); END;
CREATE TRIGGER sav_provenance BEFORE INSERT ON service_cases
 WHEN NOT EXISTS(SELECT 1 FROM sales s JOIN sale_lines l ON l.sale_id=s.id WHERE s.id=NEW.sale_id AND s.customer_id=NEW.customer_id AND l.item_id=NEW.phone_id AND l.kind='phone')
 BEGIN SELECT RAISE(ABORT,'SAV_SALE_PROVENANCE'); END;
CREATE TRIGGER debt_provenance BEFORE INSERT ON debts
 WHEN NOT EXISTS(SELECT 1 FROM sales WHERE id=NEW.sale_id AND customer_id=NEW.customer_id AND total_minor>=NEW.amount_minor)
 BEGIN SELECT RAISE(ABORT,'DEBT_SALE_PROVENANCE'); END;
CREATE TRIGGER immutable_ledger_update BEFORE UPDATE ON stock_movements BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_ledger_delete BEFORE DELETE ON stock_movements BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_audit_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_audit_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_service_update BEFORE UPDATE ON service_events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_service_delete BEFORE DELETE ON service_events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_receiving_update BEFORE UPDATE ON receiving BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_receiving_delete BEFORE DELETE ON receiving BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_journal_update BEFORE UPDATE ON journals BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_journal_delete BEFORE DELETE ON journals BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_payment_update BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_payment_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_cash_update BEFORE UPDATE ON cash_movements BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_cash_delete BEFORE DELETE ON cash_movements BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;