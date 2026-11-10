// Structural database port, not a deployed Worker or a browser database client.
// D1 adapter must implement batch atomically and never expose this binding publicly.
export interface SqlStatement {
  sql: string;
  params: (string | number | null)[];
}
export interface SqlResult {
  rows: Record<string, unknown>[];
  changes: number;
}
export interface AtomicSqlPort {
  capabilities?: { atomicBatch: true };
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
  read(statement: SqlStatement): Promise<Record<string, unknown>[]>;
}
export interface VerifiedIdentity {
  userId: string;
  expiresAt: number;
  sessionId?: string;
}
export interface IdentityVerifier {
  verify(credential: string): Promise<VerifiedIdentity | null>;
}
export interface PrivateDocumentPort {
  get(objectKey: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null>;
  put(objectKey: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
}
