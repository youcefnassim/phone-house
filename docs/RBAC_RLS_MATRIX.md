# Future RBAC / RLS matrix

No authentication or RLS is currently operational. The demo owner label is not an authenticated role. No public role switching is provided.

| Capability                                                  | Super Admin                           | Manager                | Seller                 |
| ----------------------------------------------------------- | ------------------------------------- | ---------------------- | ---------------------- |
| Operational records                                         | Global                                | Authorized store only  | Authorized store only  |
| Purchase costs, COGS, margins, net profit, supplier finance | Only authorized reader/writer         | DENY                   | DENY                   |
| Facility creation                                           | M01 only, further permissions pending | Pending owner approval | Pending owner approval |
| Discount / credit / refunds / adjustments                   | Policy pending                        | Policy pending         | Policy pending         |

Future public tables require CREATE → explicit GRANT → ENABLE RLS → policies. Private schema must be unexposed, grant-restricted, and reached only by role-checked server transactions. Frontend filtering is not security. Negative API tests have not run.
