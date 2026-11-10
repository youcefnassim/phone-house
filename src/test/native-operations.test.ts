import { afterEach, beforeEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeRepository, TransportError } from "@/data/native-repository";
let h: ReturnType<typeof sqliteHarness>;
const seed = `INSERT INTO accounts VALUES('owner',1),('s1',1),('m2',1);
INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('m2','M02','MANAGER');
INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;
INSERT INTO catalog VALUES('model','phone','PH','Phone','{}'),('acc','accessory','ACC','Cable','{}');
INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('p1','M01','model','PH-1','AVAILABLE','{}','SN1'),('p2','M01','model','PH-2','SOLD','{}','SN2');
INSERT INTO phone_identifiers VALUES('490154203237518','p1',1),('490154203237526','p2',1);
INSERT INTO accessory_balances VALUES('M01','acc',5),('M02','acc',0);
INSERT INTO customers VALUES('cu1','M01','Amir Benali','REF-1');
INSERT INTO drawers VALUES('d1','M01');
INSERT INTO shifts VALUES('sh1','M01','d1','s1','OPEN',0,NULL);
INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json) VALUES('ck1','s1','M01','pos.checkout','h','DONE','tx0','{}');
INSERT INTO sales(id,command_key,store_id,shift_id,seller_id,customer_id,total_minor,tender,tendered_minor,change_minor,bank_reference) VALUES('sa1','ck1','M01','sh1','s1','cu1',5000,'Cash',5000,0,NULL);
INSERT INTO sale_lines VALUES('sa1','p2','phone',1,5000);
INSERT INTO receipt_snapshots VALUES('sa1',1729983600000,'{}');
INSERT INTO suppliers(id,store_id,name,reference) VALUES('supA','M01','Fournisseur A','REF-A'),('supB','M02','Fournisseur B','REF-B');
INSERT INTO standalone_receipts VALUES('sr1','ck1','M01','acc','supA',3,1000,'s1','REF-R1');`;
const service = () =>
  createNativeService(
    h.port,
    { verify: async (user) => ({ userId: user, sessionId: user, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
const cmd = (operation: string, payload: unknown, key: string) => ({
  version: "native-2026-11-06",
  key,
  operation,
  payload,
});
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(seed);
});
afterEach(() => h.db.close());

it("2026-11-09 transfer permissions (batch 1d): owner dispatches, destination staff receive; full lifecycle: create, dual approval, scanned dispatch and receipt move stock exactly once", async () => {
  const svc = service();
  const created = (await svc.execute(
    "owner",
    cmd(
      "transfer.create",
      {
        store: "M01",
        id: "t1",
        destination: "M02",
        lines: [
          { itemId: "p1", kind: "phone", quantity: 1, code: "PH-1" },
          { itemId: "acc", kind: "accessory", quantity: 2, code: "ACC" },
        ],
      },
      "transfer-create-0001",
    ),
  )) as { status: string };
  expect(created.status).toBe("DRAFT");
  // An M01 seller can never approve.
  await expect(
    svc.execute(
      "s1",
      cmd(
        "transfer.approve",
        { store: "M01", transferId: "t1", approval: "SUPER_ADMIN" },
        "transfer-approve-bad1",
      ),
    ),
  ).rejects.toThrow("FORBIDDEN");
  await svc.execute(
    "owner",
    cmd(
      "transfer.approve",
      { store: "M01", transferId: "t1", approval: "SUPER_ADMIN" },
      "transfer-approve-own1",
    ),
  );
  await svc.execute(
    "m2",
    cmd(
      "transfer.approve",
      { store: "M02", transferId: "t1", approval: "M02_MANAGER" },
      "transfer-approve-mgr1",
    ),
  );
  // A mismatched scan code is rejected at scan time, and dispatch is blocked
  // while any line lacks a matching scan.
  await expect(
    svc.execute(
      "s1",
      cmd(
        "transfer.scan",
        { store: "M01", transferId: "t1", itemId: "p1", code: "WRONG", quantity: 1 },
        "transfer-scan-wrong1",
      ),
    ),
  ).rejects.toThrow("REJECTED");
  await expect(
    svc.execute(
      "owner",
      cmd(
        "transfer.dispatch",
        { store: "M01", transferId: "t1", evidence: "manifest", carrier: "Carrier" },
        "transfer-dispatch-bd1",
      ),
    ),
  ).rejects.toThrow("TRANSFER_STATE");
  await svc.execute(
    "s1",
    cmd(
      "transfer.scan",
      { store: "M01", transferId: "t1", itemId: "p1", code: "PH-1", quantity: 1 },
      "transfer-scan-ok-p1",
    ),
  );
  await svc.execute(
    "s1",
    cmd(
      "transfer.scan",
      { store: "M01", transferId: "t1", itemId: "acc", code: "ACC", quantity: 2 },
      "transfer-scan-ok-acc",
    ),
  );
  await svc.execute(
    "owner",
    cmd(
      "transfer.dispatch",
      { store: "M01", transferId: "t1", evidence: "manifest", carrier: "Carrier" },
      "transfer-dispatch-01",
    ),
  );
  expect(h.db.prepare("SELECT state FROM phones WHERE id='p1'").all()[0]).toMatchObject({
    state: "IN_TRANSIT",
  });
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M01'").all()[0],
  ).toMatchObject({ quantity: 3 });
  // Double dispatch with a fresh key is rejected by the stage guard.
  await expect(
    svc.execute(
      "owner",
      cmd(
        "transfer.dispatch",
        { store: "M01", transferId: "t1", evidence: "again", carrier: "Carrier" },
        "transfer-dispatch-02",
      ),
    ),
  ).rejects.toThrow("TRANSFER_STATE");
  // The dispatcher cannot receive their own transfer.
  await expect(
    svc.execute(
      "owner",
      cmd(
        "transfer.receive",
        { store: "M02", transferId: "t1", evidence: "self" },
        "transfer-recv-self-1",
      ),
    ),
  ).rejects.toThrow("SAME_PERSON");
  await svc.execute(
    "m2",
    cmd(
      "transfer.scan",
      { store: "M02", transferId: "t1", itemId: "p1", code: "PH-1", quantity: 1 },
      "transfer-scan-d-p1",
    ),
  );
  await svc.execute(
    "m2",
    cmd(
      "transfer.scan",
      { store: "M02", transferId: "t1", itemId: "acc", code: "ACC", quantity: 2 },
      "transfer-scan-d-acc",
    ),
  );
  // 2026-11-09 batch 1d: the receiver is destination-store staff (M02 manager), not an extra owner.
  await svc.execute(
    "m2",
    cmd(
      "transfer.receive",
      { store: "M02", transferId: "t1", evidence: "received" },
      "transfer-receive-001",
    ),
  );
  expect(h.db.prepare("SELECT store_id,state FROM phones WHERE id='p1'").all()[0]).toMatchObject({
    store_id: "M02",
    state: "AVAILABLE",
  });
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'").all()[0],
  ).toMatchObject({ quantity: 2 });
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M01'").all()[0],
  ).toMatchObject({ quantity: 3 });
  const detail = await svc.transferDetail("m2", { store: "M02", transferId: "t1" });
  expect(detail.transfer.stage).toBe("COMPLETED");
  expect(detail.approvals.map((a) => a.approval)).toEqual(["M02_MANAGER", "SUPER_ADMIN"]);
  expect(detail.dispatch).toMatchObject({ actorId: "owner" });
  expect(detail.receipt).toMatchObject({ actorId: "m2" });
  expect(JSON.stringify(detail)).not.toMatch(/cost|margin|profit/);
  await expect(svc.transferDetail("s1", { store: "M01", transferId: "nope" })).rejects.toThrow(
    "NOT_FOUND",
  );
});

it("2026-11-09 owner transfer create is idempotent: same key replay returns original, altered payload is unknown", async () => {
  const svc = service();
  const envelope = cmd(
    "transfer.create",
    {
      store: "M01",
      id: "t2",
      destination: "M02",
      lines: [{ itemId: "p1", kind: "phone", quantity: 1, code: "PH-1" }],
    },
    "transfer-replay-0001",
  );
  const first = (await svc.execute("owner", envelope)) as { key: string; status: string };
  const replay = (await svc.execute("owner", envelope)) as { key: string; status: string };
  expect(replay).toEqual(first);
  expect(h.db.prepare("SELECT count(*) n FROM transfers").all()[0]).toMatchObject({ n: 1 });
  await expect(
    svc.execute("owner", {
      ...envelope,
      payload: {
        store: "M01",
        id: "t2",
        destination: "M02",
        lines: [{ itemId: "p1", kind: "phone", quantity: 1, code: "XX" }],
      },
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});

it("SAV: open on a real sold phone, append-only events, scoped read, refund stays blocked", async () => {
  const svc = service();
  const opened = (await svc.execute(
    "s1",
    cmd(
      "sav.open",
      {
        store: "M01",
        id: "case1",
        saleId: "sa1",
        phoneId: "p2",
        customerId: "cu1",
        imei: "490154203237526",
        issue: "écran fissuré",
      },
      "sav-open-000000001",
    ),
  )) as { status: string };
  expect(opened.status).toBe("RECORDED");
  await svc.execute(
    "s1",
    cmd(
      "sav.event",
      { store: "M01", caseId: "case1", note: "diagnostic", evidence: "photo-1" },
      "sav-event-000000001",
    ),
  );
  const refund = (await svc.execute(
    "owner",
    cmd(
      "sav.refund.review",
      { store: "M01", caseId: "case1", amount: "10.00", evidence: "demande" },
      "sav-refund-00000001",
    ),
  )) as { status: string };
  expect(refund.status).toBe("POLICY_BLOCKED");
  const list = await svc.savCases("s1", { store: "M01" });
  expect(list.cases).toHaveLength(1);
  expect(list.cases[0]).toMatchObject({
    id: "case1",
    state: "INSPECTION",
    imei1: "490154203237526",
    customerName: "Amir Benali",
  });
  expect(list.cases[0]?.events[0]).toMatchObject({ actorId: "s1", note: "diagnostic" });
  const byImei = await svc.savCases("s1", { store: "M01", search: "490154203237526" });
  expect(byImei.cases).toHaveLength(1);
  await expect(svc.savCases("m2", { store: "M01" })).rejects.toThrow("FORBIDDEN");
  // A case cannot be opened against another store's sale.
  await expect(
    svc.execute(
      "m2",
      cmd(
        "sav.open",
        {
          store: "M02",
          id: "case2",
          saleId: "sa1",
          phoneId: "p2",
          customerId: "cu1",
          imei: "490154203237526",
          issue: "x",
        },
        "sav-open-000000002",
      ),
    ),
  ).rejects.toThrow("REJECTED");
});

it("2026-11-09 authorized manager/owner debts, facility and expenses stay drafts/blocked with typed cost-free reads", async () => {
  const svc = service();
  const debt = (await svc.execute(
    "owner",
    cmd(
      "debt.draft",
      { store: "M01", id: "debt1", customerId: "cu1", saleId: "sa1", amount: "20.00" },
      "debt-draft-00000001",
    ),
  )) as { status: string };
  expect(debt.status).toBe("POLICY_BLOCKED");
  const rep = (await svc.execute(
    "owner",
    cmd(
      "repayment.draft",
      { store: "M01", debtId: "debt1", amount: "5.00", reference: "REF-PAY-1" },
      "repayment-draft-0001",
    ),
  )) as { status: string };
  expect(rep.status).toBe("DRAFT");
  const debts = await svc.debtList("s1", { store: "M01" });
  expect(debts.debts[0]).toMatchObject({ id: "debt1", amountMinor: 2000, state: "POLICY_BLOCKED" });
  expect(debts.debts[0]?.repayments[0]).toMatchObject({ amountMinor: 500, state: "DRAFT" });
  expect(JSON.stringify(debts)).not.toMatch(/cost|margin|profit/);
  const fac = (await svc.execute(
    "owner",
    cmd(
      "facility.draft",
      {
        store: "M01",
        id: "fac1",
        customerId: "cu1",
        employer: "Sonatrach",
        cashPrice: "100.00",
        schedule: {
          contractPrice: "120.00",
          installments: [{ month: "2026-12", amount: "120.00" }],
        },
      },
      "facility-draft-00001",
    ),
  )) as { status: string };
  expect(fac.status).toBe("POLICY_BLOCKED");
  // Facility is M01-only: an M02 payload fails validation before any SQL.
  await expect(
    svc.execute(
      "m2",
      cmd(
        "facility.draft",
        {
          store: "M02",
          id: "fac2",
          customerId: "cu1",
          employer: "X",
          cashPrice: "1.00",
          schedule: { contractPrice: "1.00", installments: [{ month: "2026-12", amount: "1.00" }] },
        },
        "facility-draft-00002",
      ),
    ),
  ).rejects.toThrow();
  const facilities = await svc.facilityList("s1", { store: "M01" });
  expect(facilities.facilities[0]).toMatchObject({
    id: "fac1",
    employer: "Sonatrach",
    cashPriceMinor: 10000,
    state: "POLICY_BLOCKED",
  });
  expect(facilities.facilities[0]?.installments[0]).toMatchObject({
    month: "2026-12",
    amountMinor: 12000,
  });
  const exp = (await svc.execute(
    "owner",
    cmd(
      "expense.draft",
      { store: "M02", id: "e1", amount: "10.00", evidence: "RECU-1" },
      "expense-draft-00001",
    ),
  )) as { status: string };
  expect(exp.status).toBe("POLICY_BLOCKED");
  expect((await svc.expenseList("m2", { store: "M02" })).expenses[0]).toMatchObject({
    id: "e1",
    amountMinor: 1000,
  });
  await expect(svc.expenseList("s1", { store: "M01" })).rejects.toThrow("FORBIDDEN");
});

it("standalone receipt correction is owner-only, append-only and keeps the original receipt immutable", async () => {
  const svc = service();
  await expect(
    svc.correctStandaloneSupplier("s1", {
      key: "corr-standalone-001",
      store: "M01",
      receiptId: "sr1",
      supplierId: null,
      reason: "erreur saisie",
    }),
  ).rejects.toThrow("FORBIDDEN");
  const first = await svc.correctStandaloneSupplier("owner", {
    key: "corr-standalone-001",
    store: "M01",
    receiptId: "sr1",
    supplierId: null,
    reason: "erreur saisie",
  });
  expect(first).toEqual({ key: "corr-standalone-001", status: "RECORDED" });
  await svc.correctStandaloneSupplier("owner", {
    key: "corr-standalone-002",
    store: "M01",
    receiptId: "sr1",
    supplierId: "supA",
    reason: "confirmation fournisseur",
  });
  const reviews = h.db
    .prepare(
      "SELECT old_supplier_id o,new_supplier_id n,reason FROM standalone_source_reviews ORDER BY id",
    )
    .all() as { o: string | null; n: string | null; reason: string }[];
  expect(reviews).toEqual([
    { o: "supA", n: null, reason: "erreur saisie" },
    { o: null, n: "supA", reason: "confirmation fournisseur" },
  ]);
  // Original receipt row untouched.
  expect(h.db.prepare("SELECT supplier_id FROM standalone_receipts").all()[0]).toMatchObject({
    supplier_id: "supA",
  });
  // Unknown supplier or cross-store receipt is rejected.
  await expect(
    svc.correctStandaloneSupplier("owner", {
      key: "corr-standalone-003",
      store: "M01",
      receiptId: "sr1",
      supplierId: "supB",
      reason: "cross-store",
    }),
  ).rejects.toThrow();
});

it("quick-add supplier dedup folds case, accents and whitespace via name_key", async () => {
  const svc = service();
  const first = (await svc.receive("s1", {
    key: "recv-dedup-0000001",
    store: "M01",
    itemId: "acc",
    quantity: 1,
    newSupplierName: "Société Câbles",
    reference: "R1",
  })) as { status: string };
  expect(first.status).toBe("RECORDED");
  await svc.receive("s1", {
    key: "recv-dedup-0000002",
    store: "M01",
    itemId: "acc",
    quantity: 1,
    newSupplierName: "  SOCIETE   CABLES ",
    reference: "R2",
  });
  const suppliers = h.db
    .prepare("SELECT id,name_key FROM suppliers WHERE name LIKE '%Câbles%' OR name LIKE '%CABLES%'")
    .all();
  expect(suppliers).toHaveLength(1);
  expect(suppliers[0]).toMatchObject({ name_key: "societe cables" });
  // Both receipts keep their own provenance rows pointing at the same supplier.
  expect(h.db.prepare("SELECT count(*) n FROM standalone_receipts").all()[0]).toMatchObject({
    n: 3,
  });
});

it("2026-11-09 owner creates transfer; typed adapter enforces scope and fails closed for the new projections", async () => {
  const svc = service();
  const base = {
    status: async () => ({ connected: true, verified: true }),
    read: async () => null,
    execute: async () => null,
  };
  const repository = createNativeRepository({
    ...base,
    transferDetail: (q) => svc.transferDetail("s1", q),
    savCases: (q) => svc.savCases("s1", q),
  });
  await svc.execute(
    "owner",
    cmd(
      "transfer.create",
      {
        store: "M01",
        id: "t3",
        destination: "M02",
        lines: [{ itemId: "p1", kind: "phone", quantity: 1, code: "PH-1" }],
      },
      "transfer-create-0003",
    ),
  );
  expect((await repository.transferDetail({ store: "M01", transferId: "t3" })).transfer.id).toBe(
    "t3",
  );
  await expect(
    createNativeRepository({
      ...base,
      transferDetail: async () => ({
        source: "SERVER",
        store: "M02",
        transfer: { id: "t3", sourceStore: "M01", destinationStore: "M02", stage: "APPROVALS" },
        lines: [],
        approvals: [],
        dispatch: null,
        receipt: null,
      }),
    }).transferDetail({ store: "M01", transferId: "t3" }),
  ).rejects.toThrow("PROJECTION_SCOPE_MISMATCH");
  await expect(
    createNativeRepository({
      status: async () => ({ connected: false, verified: false }),
      read: async () => null,
      execute: async () => null,
    }).savCases({ store: "M01" }),
  ).rejects.toThrow("NOT_CONNECTED");
  await expect(
    createNativeRepository({
      ...base,
      correctStandaloneSupplier: async () => ({ key: "other", status: "RECORDED" }),
    }).correctStandaloneSupplier({
      key: "corr-standalone-009",
      store: "M01",
      receiptId: "sr1",
      supplierId: null,
      reason: "x",
    }),
  ).rejects.toThrow("OUTCOME_UNKNOWN");
  await expect(
    createNativeRepository({
      ...base,
      expenseList: async () => {
        throw new TransportError("FORBIDDEN");
      },
    }).expenseList({ store: "M01" }),
  ).rejects.toThrow("FORBIDDEN");
});
