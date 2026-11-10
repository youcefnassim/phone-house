-- Additive supplier dedup keys; existing rows keep NULL key and stay matched
-- via lower(trim(name)). No historical row is rewritten.
ALTER TABLE suppliers ADD COLUMN name_key TEXT;
CREATE INDEX supplier_name_keys ON suppliers(store_id,name_key) WHERE name_key IS NOT NULL;
