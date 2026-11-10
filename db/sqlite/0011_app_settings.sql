-- Additive (owner decision 2026-11-09): shared owner settings. No existing row is touched.
CREATE TABLE IF NOT EXISTS app_settings(
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
