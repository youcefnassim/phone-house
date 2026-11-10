<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->
## Track B frontend architecture
- Everyday UI disclosure is presentation-only: optional controls remain mounted for validation/submission; invalid hidden fields expand before focus, and labels never replace immutable option values or traceability keys.
- Sale documents project immutable sold-line snapshots through an isolated print portal; legal readiness gates official A4 printing independently from checkout, while legacy unnumbered specimens remain unchanged.
- Test procurement and expense/category drafts use shared session commands persisted with the IndexedDB workspace; purchase receiving remains unposted so policy approval is not inferred.
- Keep demo adapters isolated behind typed domain contracts; no production mutations or authentication are simulated, so backend integration can replace data access without rewriting interfaces.
- Use a UI-only production provider and native shell selected at build resolution; preview retains its workspace provider, and each internal area owns a TanStack route for navigation and metadata.
- Compile-time mode-gated lazy frames, page exports and workspace providers isolate preview imports; explicit route operations reject unknown paths, and native list pagination uses server hasMore rather than inferred counts.
- During an unresolved pathname change the shared shell renders destination loading content instead of previous route children; this prevents stale operational content under a new URL.
- Represent money as decimal strings and compute basket values with integer minor units without rounding; preserve financial-policy approval as a separate future requirement.
- Keep all visual tokens and reusable interface styles in the global design system to ensure equivalent Light/Dark behavior.
- Interface typography resolves through one global font-family token with self-hosted variable subsets; display-only animation never gates command execution or changes persisted amounts.
- Specialized operational pages use validated domain schemas and a typed read-only demo adapter; session drafts stay separate from fixture balances so future data access can replace them safely.
- Barcode previews dynamically load CODE128 encoding and decode the rendered image after hydration; receipts remain separately framed unposted drafts so browser evidence never implies device acceptance or legal issuance.
- Payment and receiving drafts use domain validation, exact decimal strings, and stable SKU identity; draft readback never changes fixture balances or authenticates seller attribution.
- Business modules use a typed operational snapshot with no purchase finance fields; confidential synthetic finance is a separate dynamically loaded Super Admin projection, never a security substitute.
- Business workflows keep fixtures read-only and session changes separate; transfer completion, repayments, remittances, refunds and receiving never mutate stock or cash, preserving future transaction boundaries.
- Business data-state controls exercise loading, empty, error and forbidden interfaces through the demo read contract; role preview is explicitly unauthenticated.
- Demo module access targets `ErpRepository`; inactive production business/inventory interfaces use native SQL DTOs and explicit capability states, so activation requires an approved UI mapping rather than falsely casting production data into session drafts.
- Production API shapes use the single version in `src/domain/transaction-contracts.ts`; `src/domain/contracts.ts` only re-exports production contracts and legacy schemas live under `src/domain/demo/` to prevent accidental authority inputs; PostgreSQL proposals under `legacy/db/proposed/` (quarantined with the Supabase repository/transport under `legacy/`, excluded from build, tsconfig, lint and tests) are UNDEPLOYED/UNTESTED and must never be executed without explicit owner authorization.
- The inactive `SupabaseRepository` uses injected authenticated business/inventory transports and strict cost-free DTOs; it is not assigned to the demo repository interface, ignores role preview and rejects synthetic draft methods.
- The inactive server-only command gateway uses a verified user-bound Postgres port and one RPC per transaction; roles, scope, prices and balances must be enforced inside SQL, never by request actor fields or a service-role ordinary read.
- Production command payloads use a separately versioned strict contract without actor or price authority; legacy draft contracts remain isolated to preserve existing interfaces.
- Fresh PostgreSQL proposals use a nonlogin non-bypass command owner, store-bound role rows and a private financial schema; actual deployment and test execution require separate owner authorization.
- Authenticated server-function source remains unconfigured and outside the demo route graph; injection, rather than global runtime credentials, preserves the authorization stop.
- Serialized ownership excludes append-only open-shift voids, never edits sale lines; purchase-linked receiving uses locked authorized quantities and private nullable cost provenance.
- Disposable acceptance uses independently digest-confirmed Stage A for environment/schema only and identity-linked Stage B for reset/tests/exact cleanup; full canonical structural/ACL evidence is rechecked before resets and after tests because table names and self-asserted flags do not certify authorization or schema.
- Production business and inventory snapshots are separate strict SQL DTOs; withheld or policy-blocked collections carry explicit availability and never become authoritative demo-compatible empty arrays.
- Shared-table trigger functions branch in PL/pgSQL before accessing table-specific fields; absent DELETE NEW records and cross-table CASE resolution must not break atomic commands.
- The shared route graph has build-isolated production leaf exports and rejects demo modules during bundling; preview retains IndexedDB review data without allowing production fallback.
- Local clean-start replaces workspace and session only in the fixed browser namespace; a persisted fixture policy distinguishes rehearsal reset from empty onboarding, and revision migration preserves records instead of reseeding.
- Module UI strings live in `src/locales/<module>.ts` (merged into `src/i18n.ts`); domain validation/status text stays English and is localized at render via `src/locales/messages.ts`.
- Seeded fixture text is localized only at render via `displayText` in `src/locales/display.ts`; stored values and user-entered records stay untranslated so IDs and references remain stable.
- Audit labels map raw stored codes via `src/locales/audit-actions.ts`.
- Native backend source targets private SQLite/D1-compatible SQL and private asset ports with authenticated server authorization; PostgreSQL adapters remain inactive references, and Cloudflare app deployment infrastructure is not generated because Lovable deployment there is unsupported.
- Native checkout uses a single atomic batch with failing constraint guards and bounded integer centimes; browser price/role assertions and partial batch posting cannot establish authority.
- Shared production route rendering uses only the typed native repository, never fixture route children; disconnected transport stays explicit until approved authenticated host wiring exists.
- Local staff presentation uses the active roster and a single workspace actor; retire choices without rewriting historical actors, and append owner review metadata to immutable closed-shift snapshots because closeout and review are separate events.
- Receiving shares an explicit-tag scan parser and gesture-started ZXing camera with track cleanup; label printing is a pure isolated DOM projection so decoding and reprinting cannot change inventory.
- Owner settings live in additive `app_settings` (native) / workspace `settings` (demo) with per-key schemas and defaults in `src/domain/intake.ts`; `settings.save` is owner-only via permissions.ts and empty values hide dependent features so nothing is invented.
- Allocate legal sequences and checked public references in the checkout batch and snapshot warranty provider/months; rollback and idempotent replay must not consume a sequence or rewrite sale history.
- Snapshot settlement, discount and credit in the checkout batch; append-only cash/credit repayment reversals and effective views preserve history and enforce balances.

- Keep supplier finance outside shared workspace/exports; separate owner storage preserves cost-free staff DTOs.
- Native operational forms use retained immutable command envelopes and explicit outcome/readback recovery; uncertain replies must never enable a new-key duplicate write.
- Stock count mutations use the shared retained-command controller; reveal readback only after unlock, so recovery cannot enable a duplicate action while a transaction is unresolved.
- Report exports share a byte-download boundary; signed mounted tests inspect actual XLSX/PDF content rather than mocking export functions.
- Native customer, staff and transfer screens consume scoped repository projections and the shared permissions matrix; rich controls do not substitute for server authorization.
- Owner dashboard reads an authenticated server-only aggregate projection and rechecks owner authorization after its queries; route visibility and direct URL gates derive from the shared operation matrix.
- SAV returns reduce a credit sale balance only by the returned phone line via the derived credit_balances view (latest migration redefines it) and a refund-excess trigger; append-only credit rows stay unchanged so history is preserved.
