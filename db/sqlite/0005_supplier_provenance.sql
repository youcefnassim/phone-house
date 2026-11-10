-- Additive source proposal, local tests only; NOT HOSTED/APPLIED.
CREATE TABLE receipt_sources(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 phone_id TEXT REFERENCES phones(id),
 receiving_id TEXT REFERENCES receiving(id),
 supplier_id TEXT REFERENCES suppliers(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 received_at INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES accounts(id),
 reference TEXT,
 CHECK(phone_id IS NULL OR quantity=1),
 CHECK(phone_id IS NOT NULL OR receiving_id IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX one_phone_source ON receipt_sources(phone_id) WHERE phone_id IS NOT NULL;
CREATE TABLE supplier_source_reviews(
 id INTEGER PRIMARY KEY,
 source_id TEXT NOT NULL REFERENCES receipt_sources(id),
 command_key TEXT NOT NULL UNIQUE REFERENCES commands(key),
 old_supplier_id TEXT REFERENCES suppliers(id),
 new_supplier_id TEXT REFERENCES suppliers(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id),
 reviewed_at INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason))>0)
) STRICT;
CREATE TRIGGER source_scope BEFORE INSERT ON receipt_sources WHEN
 (NEW.phone_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM phones WHERE id=NEW.phone_id AND store_id=NEW.store_id)) OR
 (NEW.receiving_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receiving r JOIN purchases p ON p.id=r.purchase_id WHERE r.id=NEW.receiving_id AND p.store_id=NEW.store_id))
 BEGIN SELECT RAISE(ABORT,'SOURCE_SCOPE'); END;
CREATE TRIGGER sources_no_update BEFORE UPDATE ON receipt_sources BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER sources_no_delete BEFORE DELETE ON receipt_sources BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER reviews_no_update BEFORE UPDATE ON supplier_source_reviews BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER reviews_no_delete BEFORE DELETE ON supplier_source_reviews BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;