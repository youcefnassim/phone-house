-- Additive only. No guessed/backfilled customer metadata or warranty.
CREATE TABLE customer_details(customer_id TEXT PRIMARY KEY REFERENCES customers(id),store_id TEXT NOT NULL REFERENCES stores(id),surname TEXT NOT NULL,given_name TEXT NOT NULL,contact TEXT NOT NULL,name_key TEXT NOT NULL,contact_key TEXT NOT NULL,FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id),UNIQUE(store_id,name_key)) STRICT;
CREATE UNIQUE INDEX customer_contact_key ON customer_details(store_id,contact_key) WHERE contact_key<>'';
CREATE TABLE receipt_snapshots(sale_id TEXT PRIMARY KEY REFERENCES sales(id),sold_at INTEGER NOT NULL,snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json))) STRICT;
CREATE TABLE warranty_requests(sale_id TEXT NOT NULL REFERENCES sales(id),phone_id TEXT NOT NULL REFERENCES phones(id),requested INTEGER NOT NULL CHECK(requested IN(0,1)),months INTEGER,start_date TEXT,end_date TEXT,state TEXT NOT NULL CHECK(state='DRAFT_PENDING'),PRIMARY KEY(sale_id,phone_id),CHECK((requested=0 AND months IS NULL AND start_date IS NULL AND end_date IS NULL) OR(requested=1 AND months IN(1,3,6,12) AND start_date IS NOT NULL AND end_date IS NOT NULL))) STRICT;
CREATE TRIGGER immutable_receipt_update BEFORE UPDATE ON receipt_snapshots BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_receipt_delete BEFORE DELETE ON receipt_snapshots BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_warranty_update BEFORE UPDATE ON warranty_requests BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_warranty_delete BEFORE DELETE ON warranty_requests BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TABLE shift_closures(shift_id TEXT PRIMARY KEY REFERENCES shifts(id),closed_at INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES accounts(id),counted_minor INTEGER NOT NULL,expected_minor INTEGER NOT NULL,notes TEXT NOT NULL,review_state TEXT NOT NULL CHECK(review_state IN('PENDING','OPTIONAL'))) STRICT;
CREATE TABLE shift_reviews(id TEXT PRIMARY KEY,shift_id TEXT NOT NULL UNIQUE REFERENCES shift_closures(shift_id),actor_id TEXT NOT NULL REFERENCES accounts(id),reviewed_at INTEGER NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN('NO_ISSUE','FLAGGED')),note TEXT NOT NULL CHECK(length(trim(note))>0)) STRICT;
CREATE TRIGGER immutable_closure_update BEFORE UPDATE ON shift_closures BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_closure_delete BEFORE DELETE ON shift_closures BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_review_update BEFORE UPDATE ON shift_reviews BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_review_delete BEFORE DELETE ON shift_reviews BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_closed_shift BEFORE UPDATE ON shifts WHEN OLD.state='CLOSED' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CLOSE'); END;
CREATE TRIGGER immutable_closed_shift_delete BEFORE DELETE ON shifts WHEN OLD.state='CLOSED' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CLOSE'); END;
CREATE TRIGGER immutable_count_update BEFORE UPDATE ON cash_counts BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER immutable_count_delete BEFORE DELETE ON cash_counts BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;