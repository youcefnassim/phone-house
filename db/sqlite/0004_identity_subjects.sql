-- Candidate additive migration, local execution only. No identity credentials are created.
CREATE TABLE identity_subjects(issuer TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES accounts(id),PRIMARY KEY(issuer,subject),UNIQUE(issuer,user_id)) STRICT;
-- Provider subject bindings must be provisioned by a separately authorized owner operation.