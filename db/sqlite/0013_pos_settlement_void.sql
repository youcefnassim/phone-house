-- Additive settlement and append-only cancellation; original sales/receipts remain unchanged.
CREATE TABLE sale_settlements (
 sale_id TEXT PRIMARY KEY REFERENCES sales(id),
 cash_minor INTEGER NOT NULL CHECK(cash_minor BETWEEN 0 AND 99999999999999),
 bank_minor INTEGER NOT NULL CHECK(bank_minor BETWEEN 0 AND 99999999999999),
 cash_received_minor INTEGER NOT NULL CHECK(cash_received_minor BETWEEN 0 AND 99999999999999),
 bank_method TEXT CHECK(bank_method IN ('VIREMENT','CCP_BARIDIMOB')),
 discount_minor INTEGER NOT NULL CHECK(discount_minor BETWEEN 0 AND 99999999999999),
 discount_actor TEXT NOT NULL REFERENCES accounts(id),
 discount_limit_minor INTEGER CHECK(discount_limit_minor BETWEEN 0 AND 99999999999999),
 CHECK(cash_received_minor>=cash_minor)
) STRICT;
CREATE TABLE sale_voids (
 sale_id TEXT PRIMARY KEY REFERENCES sales(id),
 command_key TEXT NOT NULL UNIQUE REFERENCES commands(key),
 actor_id TEXT NOT NULL REFERENCES accounts(id),
 at INTEGER NOT NULL,
 reason TEXT NOT NULL
) STRICT;
CREATE TABLE cash_reversals (
 sale_id TEXT PRIMARY KEY REFERENCES sale_voids(sale_id),
 command_key TEXT NOT NULL UNIQUE REFERENCES commands(key),
 shift_id TEXT NOT NULL REFERENCES shifts(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999999999)
) STRICT;
CREATE TABLE bank_reversals (
 sale_id TEXT PRIMARY KEY REFERENCES sale_voids(sale_id),
 command_key TEXT NOT NULL UNIQUE REFERENCES commands(key),
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999999999),
 bank_method TEXT CHECK(bank_method IN ('VIREMENT','CCP_BARIDIMOB'))
) STRICT;
CREATE TABLE warranty_voids (
 sale_id TEXT NOT NULL REFERENCES sale_voids(sale_id),
 phone_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state='VOID'),
 PRIMARY KEY(sale_id,phone_id),
 FOREIGN KEY(sale_id,phone_id) REFERENCES warranty_requests(sale_id,phone_id)
) STRICT;
CREATE VIEW effective_warranty_requests AS SELECT w.*,CASE WHEN v.phone_id IS NOT NULL THEN 'VOID' ELSE w.state END effective_state FROM warranty_requests w LEFT JOIN warranty_voids v ON v.sale_id=w.sale_id AND v.phone_id=w.phone_id;
CREATE VIEW effective_cash_movements AS SELECT id,command_key,shift_id,seller_id,amount_minor,reason FROM cash_movements UNION ALL SELECT sale_id||':VOID',command_key,shift_id,actor_id,-amount_minor,'SALE_VOID' FROM cash_reversals;
ALTER TABLE journals ADD COLUMN bank_method TEXT CHECK(bank_method IN ('VIREMENT','CCP_BARIDIMOB'));
-- Release exclusively voided ownership, while retaining every historical sold line.
DROP INDEX one_serialized_sale;
CREATE TRIGGER active_serialized_sale BEFORE INSERT ON sale_lines WHEN NEW.kind='phone' AND EXISTS(SELECT 1 FROM sale_lines l WHERE l.item_id=NEW.item_id AND l.kind='phone' AND NOT EXISTS(SELECT 1 FROM sale_voids v WHERE v.sale_id=l.sale_id)) BEGIN SELECT RAISE(ABORT,'PHONE_NOT_AVAILABLE'); END;
CREATE TRIGGER void_open_shift BEFORE INSERT ON sale_voids WHEN NOT EXISTS(SELECT 1 FROM sales s JOIN shifts sh ON sh.id=s.shift_id WHERE s.id=NEW.sale_id AND sh.state='OPEN') BEGIN SELECT RAISE(ABORT,'USE_SAV'); END;
CREATE TRIGGER reversal_open_shift BEFORE INSERT ON cash_reversals WHEN NOT EXISTS(SELECT 1 FROM shifts WHERE id=NEW.shift_id AND state='OPEN') BEGIN SELECT RAISE(ABORT,'USE_SAV'); END;
CREATE TRIGGER immutable_void_update BEFORE UPDATE ON sale_voids BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_void_delete BEFORE DELETE ON sale_voids BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_settlement_update BEFORE UPDATE ON sale_settlements BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_settlement_delete BEFORE DELETE ON sale_settlements BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;