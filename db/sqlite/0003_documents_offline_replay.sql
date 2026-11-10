-- Version 0003 (D1/SQLite compatible). Local harness only; NOT applied to any hosted D1.
-- Private document verification history: append-only evidence of finalize/quarantine.
CREATE TABLE document_verifications(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id),actor_id TEXT NOT NULL REFERENCES accounts(id),outcome TEXT NOT NULL CHECK(outcome IN('AVAILABLE','QUARANTINED')),size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 0 AND 10485760),sha256 TEXT NOT NULL CHECK(length(sha256)=64),verified_at INTEGER NOT NULL) STRICT;
CREATE TRIGGER document_verifications_no_update BEFORE UPDATE ON document_verifications BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER document_verifications_no_delete BEFORE DELETE ON document_verifications BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
-- Registered POS devices for offline replay classification. Device identity is
-- NOT authentication; a verified session is still required for every replay.
CREATE TABLE devices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),store_id TEXT NOT NULL REFERENCES stores(id),revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1)),expires_at INTEGER NOT NULL) STRICT;
-- Offline replays are received evidence only. Classification is restricted to
-- POLICY_BLOCKED until OD-18 (offline seller authorization) is approved.
CREATE TABLE offline_replays(key TEXT PRIMARY KEY,device_id TEXT NOT NULL REFERENCES devices(id),actor_id TEXT NOT NULL REFERENCES accounts(id),store_id TEXT NOT NULL REFERENCES stores(id),payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),classification TEXT NOT NULL CHECK(classification='POLICY_BLOCKED'),received_at INTEGER NOT NULL) STRICT;
CREATE TRIGGER offline_replays_no_update BEFORE UPDATE ON offline_replays BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
