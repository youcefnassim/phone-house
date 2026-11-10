-- Additive; existing sales and warranty records remain unchanged.
CREATE TABLE invoice_sequences (
  store_id TEXT NOT NULL REFERENCES stores(id),
  year INTEGER NOT NULL CHECK(year BETWEEN 1970 AND 9999),
  last INTEGER NOT NULL CHECK(last BETWEEN 1 AND 999999),
  PRIMARY KEY(store_id,year)
) STRICT;
ALTER TABLE sales ADD COLUMN invoice_number TEXT;
ALTER TABLE sales ADD COLUMN public_ref TEXT;
CREATE UNIQUE INDEX sales_invoice_number_unique ON sales(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX sales_public_ref_unique ON sales(public_ref) WHERE public_ref IS NOT NULL;
ALTER TABLE warranty_requests ADD COLUMN provider TEXT CHECK(provider IN ('SHOP','MANUFACTURER'));
