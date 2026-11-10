-- Owner decision 2026-11-09: duplicate customers are acceptable and are never auto-merged.
-- Rebuild customer_details without UNIQUE(store_id,name_key); same column order; every row preserved.
CREATE TABLE customer_details_0009(customer_id TEXT PRIMARY KEY REFERENCES customers(id),store_id TEXT NOT NULL REFERENCES stores(id),surname TEXT NOT NULL,given_name TEXT NOT NULL,contact TEXT NOT NULL,name_key TEXT NOT NULL,contact_key TEXT NOT NULL,FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id)) STRICT;
INSERT INTO customer_details_0009(customer_id,store_id,surname,given_name,contact,name_key,contact_key) SELECT customer_id,store_id,surname,given_name,contact,name_key,contact_key FROM customer_details;
DROP INDEX IF EXISTS customer_contact_key;
DROP TABLE customer_details;
ALTER TABLE customer_details_0009 RENAME TO customer_details;
CREATE INDEX customer_details_name_key ON customer_details(store_id,name_key);
CREATE INDEX customer_details_contact_key ON customer_details(store_id,contact_key);
