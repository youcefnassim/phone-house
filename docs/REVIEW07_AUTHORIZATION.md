# Review07 proposed authorization

| Identity                    | M01 seller actions | M01 manager actions | M02 manager actions | Private finance            |
| --------------------------- | ------------------ | ------------------- | ------------------- | -------------------------- |
| Global active Super Admin   | Yes                | Yes                 | Yes                 | Yes, gated projection only |
| Active M01 Manager          | Yes                | Yes                 | No                  | No                         |
| Active M01 Seller           | Yes                | No                  | No                  | No                         |
| M02 Manager + M01 Seller    | Yes                | No                  | Yes                 | No                         |
| Inactive/unassigned/revoked | No                 | No                  | No                  | No                         |

Store scope is part of the same assignment row as role. Never infer Manager access by joining global role to unrelated membership. Public clients have no business DML. `ph_engine` is nonlogin, non-bypass, not a member of any browser role; its RLS policies and explicit object grants allow only internal command implementation. SECURITY DEFINER functions have fixed pg_catalog search paths and fully qualified tables. Actual catalog/ACL/role-inheritance verification is NOT RUN.

Bootstrap is one-time trusted operator source with an explicitly approved existing Auth UUID and ROLLBACK default. Invitations create only inactive identities via an injected future administrative port; role activation is separate. Revocation serializes before checking current owner authorization and protects the last owner. Account/session provisioning is not configured.

M01 handoff requires revoking previous operator session and independently signing in the next operator. No sellerId request or dropdown grants authority. Session duration, offline PIN and signup policies remain unconfigured. Hosted identity-transition tests and operator session readback require separate approval.
