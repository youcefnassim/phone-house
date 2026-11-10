-- Additive: command/audit time and canonical content. Nullable so legacy rows stay valid.
ALTER TABLE commands ADD COLUMN created_at INTEGER;
ALTER TABLE audit_events ADD COLUMN at INTEGER;
ALTER TABLE audit_events ADD COLUMN payload_json TEXT;
ALTER TABLE audit_events ADD COLUMN before_json TEXT;
