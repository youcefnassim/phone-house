# Provider-independent native data target

- Supplier provenance uses append-only receipt source rows and separate owner-authorized reviews, never SKU-level supplier overwrite or inferred sale-lot attribution; source services contain no acquisition finance.
- JWT verification consumes only trusted issuer/audience/public JWKS configuration and D1 subject/session mappings; token claims never authorize roles and provider selection remains external.
- Native target is private D1-compatible SQLite plus private R2 through injected service ports; standalone Worker source remains outside the application graph with mandatory explicit configuration because Lovable cannot deploy this separate service.
- Existing PostgreSQL/Supabase adapters and SQL remain inactive references; server functions must not connect them, because owner hosting correction forbids Supabase business data.
- Authenticate through an injected verified identity port and query actual active account/store memberships; never accept caller role or price authority, because SQLite has no RLS.
- Checkout is one atomic ordered SQL batch with CHECK-failing guards and in-batch price/stock/store/shift validation; never split it or assume a zero-row update rejects a transaction.
- Amounts use bounded integer centimes internally and exact decimal strings at domain boundaries; no financial rounding or JS-unsafe 64-bit values are allowed.
- A lost or undecodable mutation response is an unknown outcome retaining its original key and payload; a schema-valid result must also match the request key to avoid unsafe duplicate posting.
- Keep hosted configuration, SQL execution and acceptance distinct; configuration never activates production UI or suppresses the test badge without verified authentication/persistence.
- The production outbox is a separate IndexedDB store with project/user/device/store routing bindings, leases and exact-key recovery; bindings are not authentication and replay requires a server-verified policy port.
- Reconciliation SQL remains candidate source outside managed migration paths until exact-project inspection and owner migration approval; historical proposals remain preserved evidence.
- Native commands require a trusted session identifier and check expiry/revocation, account activity, membership, object state and key binding inside the atomic batch; provisioning never creates identity-provider credentials.
- Private object uploads stay PENDING after storage because SQL and object writes are not atomic; publication requires independently verified finalization and approved host wiring.
- The portable API handler uses standard Request/Response, exact-origin POST plus bearer credentials and sanitized correlation ids; the standalone Worker requires an approved host to supply identity, D1 and rate-limit bindings.
- Standalone receiving records immutable cost-free receipts separately from purchase-linked receipts; this preserves historical sources without inventing purchase finance or authorized purchases.
- Production pages read/write only through the injected `NativeTransportProvider`; the SYNTHETIC transport is dev-only, labeled and never hosted evidence.
- Receipt finance uses append-only private ledgers and owner-only no-cache endpoints to keep operational DTOs cost-free.
- Partial transfers keep arrived quantities and immutable discrepancy/resolution rows; counts hide expectation snapshots until submit, and atomic guards plus unique count adjustments prevent duplicate stock posting.

- SAV outcomes, refunds and individual acquisitions use additive private append-only ledgers; atomic command composition retains sale snapshots and cost-free staff projections rather than editing historical sales.
