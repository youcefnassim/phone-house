// @vitest-environment node
import { expect, it } from "vitest";
import { nativeCheckoutPayload } from "@/domain/native-checkout";
import { localD1AdapterHarness } from "./local-d1-adapter-harness";
import { createDailyNativeController } from "@/data/daily-native-controller";
import { projectNativeSpecimens } from "@/domain/daily-specimens";
import type { NativeCheckoutRequest } from "@/domain/native-checkout";

const accessory = "11111111-1111-4111-8111-111111111111";
const phone = "22222222-2222-4222-8222-222222222222";
const shift = "33333333-3333-4333-8333-333333333333";
async function setup() {
  const h = await localD1AdapterHarness();
  await h.db.exec(
    `INSERT INTO catalog VALUES('${accessory}','accessory','CABLE','Cable','{"barcode":"CABLE-1","variant":"USB-C"}'),('model','phone','MODEL','Phone','{}'); INSERT INTO prices VALUES('M01','${accessory}',500),('M02','${accessory}',500),('M01','model',10000); INSERT INTO drawers VALUES('drawer1','M01'),('drawer2','M02');`,
  );
  const seller = createDailyNativeController((await h.repository("s1")).repository, "M01");
  const second = createDailyNativeController((await h.repository("s2")).repository, "M01");
  const manager = createDailyNativeController((await h.repository("m2")).repository, "M02");
  const owner = createDailyNativeController((await h.repository("owner")).repository, "M01");
  return { h, seller, second, manager, owner };
}
function sale(store: "M01" | "M02", key: string, phoneSale = true): NativeCheckoutRequest {
  return {
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: key,
    clientRequestId: "44444444-4444-4444-8444-444444444444",
    payload: {
      store,
      shiftId: shift,
      lines: [
        {
          kind: phoneSale ? "phone" : "accessory",
          itemId: phoneSale ? phone : accessory,
          quantity: "1",
        },
      ],
      warranties: phoneSale ? [{ itemId: phone, requested: true, months: 3 }] : [],
      ...(phoneSale ? { buyer: { surname: "Synthetic", givenName: "Buyer", contact: "" } } : {}),
      tender: store === "M01" ? "Cash" : "Bank",
      tenderedAmount: phoneSale ? "100.00" : "5.00",
      ...(store === "M02" ? { bankReference: "LOCAL-BANK" } : {}),
    },
  };
}
const count = (h: Awaited<ReturnType<typeof localD1AdapterHarness>>, table: string) =>
  h.db.prepare(`SELECT count(*) n FROM ${table}`).first("n");

it("daily controller over real loopback HTTP: M01 receiving, exact scanner, atomic buyer/warranty cash sale, reload history, pure specimens, blind close and retrospective review", async () => {
  const { h, seller, second, owner } = await setup();
  try {
    await seller.openDrawer("daily-open-00000001", {
      store: "M01",
      id: shift,
      drawerId: "drawer1",
      opening: "20.00",
    });
    const states: string[] = [];
    const unsubscribe = seller.subscribe(() => states.push(seller.getSnapshot().state));
    await seller.receive({
      key: "daily-receive-000001",
      store: "M01",
      itemId: "model",
      quantity: 1,
      newSupplierName: "Actual synthetic source",
      phones: [
        {
          id: phone,
          barcode: "UNIT-1",
          imei1: "490154203237518",
          attributes: { condition: "USED" },
        },
      ],
    });
    expect((await seller.search("UNIT", true)).items).toHaveLength(0);
    expect((await seller.search("UNIT-1", true)).items[0]?.id).toBe(phone);
    expect((await seller.search("490154203237518", true)).items[0]?.id).toBe(phone);
    expect(
      await h.db
        .prepare("SELECT json_extract(attributes_json,'$.packaging') p FROM phones")
        .first("p"),
    ).toBe("UNKNOWN");
    const result = await second.checkout(sale("M01", "daily-checkout-000001"));
    expect(result.receipt.operator).toBe("s2");
    expect(result.receipt.shift).toBe(shift);
    expect(result.stock.items).toHaveLength(0);
    expect(result.customer?.customer.surname).toBe("Synthetic");
    const fresh = createDailyNativeController((await h.repository("s1")).repository, "M01");
    const customerId = result.receipt.customerId;
    if (!customerId) throw new Error("CUSTOMER_REQUIRED");
    expect((await fresh.customerHistory(customerId)).sales).toHaveLength(1);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(result.receipt.soldAt));
    expect(
      (
        await fresh.history({
          from: today,
          to: today,
          imei: "490154203237518",
          sellerId: "s2",
          tender: "Cash",
          customerId,
        })
      ).sales,
    ).toHaveLength(1);
    const before = [
      await count(h, "audit_events"),
      await count(h, "cash_movements"),
      await count(h, "sales"),
    ];
    expect(
      projectNativeSpecimens(await fresh.specimen(result.receipt.saleId)).warranties[0]?.months,
    ).toBe(3);
    expect(projectNativeSpecimens(await fresh.specimen(result.receipt.saleId)).invoice.fiscal).toBe(
      false,
    );
    expect([
      await count(h, "audit_events"),
      await count(h, "cash_movements"),
      await count(h, "sales"),
    ]).toEqual(before);
    await seller.closeDrawer("daily-close-0000001", {
      store: "M01",
      shiftId: shift,
      counted: "119.00",
    });
    const closed = (await seller.cash()).shifts[0];
    expect(closed).toMatchObject({
      state: "CLOSED",
      expectedMinor: 12000,
      countedMinor: 11900,
      reviewState: "PENDING",
    });
    await owner.reviewClose("daily-review-000001", {
      store: "M01",
      shiftId: shift,
      outcome: "FLAGGED",
      note: "Synthetic recount requested",
    });
    expect((await seller.cash()).shifts[0]).toMatchObject({ ...closed, reviewOutcome: "FLAGGED" });
    expect(states).toContain("LOADING");
    unsubscribe();
    expect(h.calls).toContain("/api/native/checkout");
  } finally {
    await h.dispose();
  }
}, 60000);

it("M02 quantity receiving uses variant SKU and per-receipt supplier; anonymous Bank sale has no customer, warranty or cash movement", async () => {
  const { h, manager } = await setup();
  try {
    await manager.openDrawer("daily-m2-open-00001", {
      store: "M02",
      id: shift,
      drawerId: "drawer2",
      opening: "0.00",
    });
    await manager.receive({
      key: "daily-m2-receive-01",
      store: "M02",
      itemId: accessory,
      quantity: 2,
      newSupplierName: "Source one",
    });
    await manager.receive({
      key: "daily-m2-receive-02",
      store: "M02",
      itemId: accessory,
      quantity: 1,
    });
    expect((await manager.search("CABLE-1", true)).items[0]).toMatchObject({
      quantity: 3,
      variant: "USB-C",
    });
    const result = await manager.checkout(sale("M02", "daily-m2-sale-00001", false));
    expect(result.receipt).toMatchObject({ buyer: null, payment: "Bank", warranties: [] });
    expect(projectNativeSpecimens(result.receipt).warranties).toEqual([]);
    expect(result.stock.items[0]?.quantity).toBe(2);
    expect(await count(h, "customers")).toBe(0);
    expect(await count(h, "cash_movements")).toBe(0);
    expect(
      (
        await h.db.prepare("SELECT supplier_id FROM standalone_receipts ORDER BY quantity").all()
      ).results.map((r: Record<string, unknown>) => r["supplier_id"]),
    ).toEqual([null, expect.any(String)]);
    await manager.closeDrawer("daily-m2-close-0001", {
      store: "M02",
      shiftId: shift,
      counted: "0.00",
    });
    expect((await manager.cash()).shifts[0]).toMatchObject({
      state: "CLOSED",
      countedMinor: 0,
      expectedMinor: 0,
      reviewState: "OPTIONAL",
    });
  } finally {
    await h.dispose();
  }
}, 60000);

it("lost committed checkout response locks UI actions and reconciles same key without reposting", async () => {
  const { h, seller } = await setup();
  try {
    await seller.openDrawer("daily-loss-open-001", {
      store: "M01",
      id: shift,
      drawerId: "drawer1",
      opening: "0.00",
    });
    await seller.receive({
      key: "daily-loss-receive1",
      store: "M01",
      itemId: "model",
      quantity: 1,
      phones: [{ id: phone, barcode: "LOSS-1", serial: "SERIAL-LOSS" }],
    });
    h.loseNextResponse();
    await expect(seller.checkout(sale("M01", "daily-loss-sale-001"))).rejects.toMatchObject({
      code: "OUTCOME_UNKNOWN",
    });
    expect(seller.getSnapshot()).toEqual({ state: "OUTCOME_UNKNOWN", key: "daily-loss-sale-001" });
    await expect(seller.checkout(sale("M01", "daily-loss-sale-002"))).rejects.toMatchObject({
      code: "ACTION_LOCKED",
    });
    expect(await seller.reconcile()).toHaveProperty("receipt");
    expect(seller.getSnapshot().state).toBe("READY");
    expect(await count(h, "sales")).toBe(1);
    expect(h.calls.filter((c) => c.endsWith("/checkout"))).toHaveLength(1);
  } finally {
    await h.dispose();
  }
}, 60000);

it("revoked actor is denied before receiving or selling; controller never yields fake success", async () => {
  const { h, seller } = await setup();
  try {
    await h.db.prepare("UPDATE sessions SET revoked=1 WHERE id='s1'").run();
    await expect(
      seller.receive({ key: "daily-revoked-0001", store: "M01", itemId: accessory, quantity: 2 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(seller.checkout(sale("M01", "daily-revoked-0002"))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(seller.getSnapshot().state).toBe("UNAUTHORIZED");
    expect(await count(h, "standalone_receipts")).toBe(0);
    expect(await count(h, "sales")).toBe(0);
    expect(await count(h, "customers")).toBe(0);
    expect(await count(h, "audit_events")).toBe(0);
  } finally {
    await h.dispose();
  }
}, 60000);

it("closed shared drawer denies stale checkout atomically including new buyer; second open and owner review by seller denied", async () => {
  const { h, seller, second } = await setup();
  try {
    await seller.openDrawer("daily-stale-open001", {
      store: "M01",
      id: shift,
      drawerId: "drawer1",
      opening: "0.00",
    });
    await expect(
      second.openDrawer("daily-stale-open002", {
        store: "M01",
        id: "second-shift",
        drawerId: "drawer1",
        opening: "0.00",
      }),
    ).rejects.toMatchObject({ code: "REJECTED" }); // 2026-11-09 batch 1d: constraint rejection is not retryable
    await seller.receive({
      key: "daily-stale-rcv001",
      store: "M01",
      itemId: "model",
      quantity: 1,
      phones: [{ id: phone, barcode: "STALE-1", serial: "STALE-SERIAL" }],
    });
    await seller.closeDrawer("daily-stale-close01", {
      store: "M01",
      shiftId: shift,
      counted: "0.00",
    });
    const before = await count(h, "audit_events");
    const stale = createDailyNativeController((await h.repository("s2")).repository, "M01");
    await expect(stale.checkout(sale("M01", "daily-stale-sale001"))).rejects.toMatchObject({
      code: "SHIFT_CLOSED",
    });
    expect(await count(h, "sales")).toBe(0);
    expect(await count(h, "customers")).toBe(0);
    expect(await count(h, "cash_movements")).toBe(0);
    expect(await count(h, "audit_events")).toBe(before);
    expect(await h.db.prepare("SELECT state FROM phones").first("state")).toBe("AVAILABLE");
    await expect(
      seller.reviewClose("daily-stale-review1", {
        store: "M01",
        shiftId: shift,
        outcome: "NO_ISSUE",
        note: "Denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await count(h, "shift_reviews")).toBe(0);
  } finally {
    await h.dispose();
  }
}, 60000);

it("2026-11-09 owner cash in/out evidence stays policy blocked and never becomes physical cash", async () => {
  const { h, owner: seller } = await setup();
  try {
    await seller.openDrawer("daily-evidence-open", {
      store: "M01",
      id: shift,
      drawerId: "drawer1",
      opening: "0.00",
    });
    expect(
      await seller.cashEvidence("daily-evidence-in01", {
        store: "M01",
        shiftId: shift,
        direction: "IN",
        amount: "12.00",
        reference: "Reason supplied",
      }),
    ).toHaveProperty("status", "POLICY_BLOCKED");
    expect(
      await seller.cashEvidence("daily-evidence-out1", {
        store: "M01",
        shiftId: shift,
        direction: "OUT",
        amount: "5.00",
        reference: "Reason supplied",
      }),
    ).toHaveProperty("status", "POLICY_BLOCKED");
    expect(await count(h, "cash_movements")).toBe(0);
    expect(await count(h, "cash_evidence")).toBe(2);
  } finally {
    await h.dispose();
  }
}, 60000);

it("phone checkout requires deliberate warranty Yes/No and Yes accepts only 1/3/6/12 months", () => {
  const payload = sale("M01", "daily-rule-key-0001").payload;
  expect(nativeCheckoutPayload.safeParse({ ...payload, warranties: [] }).success).toBe(false);
  expect(
    nativeCheckoutPayload.safeParse({
      ...payload,
      warranties: [{ itemId: phone, requested: true }],
    }).success,
  ).toBe(false);
  for (const months of [1, 3, 6, 12])
    expect(
      nativeCheckoutPayload.safeParse({
        ...payload,
        warranties: [{ itemId: phone, requested: true, months }],
      }).success,
    ).toBe(true);
  expect(
    nativeCheckoutPayload.safeParse({
      ...payload,
      warranties: [{ itemId: phone, requested: true, months: 2 }],
    }).success,
  ).toBe(false);
  expect(
    nativeCheckoutPayload.safeParse({
      ...payload,
      warranties: [{ itemId: phone, requested: false, months: 3 }],
    }).success,
  ).toBe(false);
});

it("phone requires surname and given name; anonymous accessory checkout never prompts warranty", () => {
  const payload = sale("M01", "daily-rule-key-0002").payload;
  expect(nativeCheckoutPayload.safeParse({ ...payload, buyer: undefined }).success).toBe(false);
  expect(
    nativeCheckoutPayload.safeParse({ ...payload, buyer: { surname: "Buyer", givenName: "" } })
      .success,
  ).toBe(false);
  expect(
    nativeCheckoutPayload.safeParse(sale("M02", "daily-rule-key-0003", false).payload).success,
  ).toBe(true);
});

it("real controller sale with explicit NO creates no warranty specimen; duplicate/oversell stays atomic", async () => {
  const { h, seller } = await setup();
  try {
    await seller.openDrawer("daily-no-open-00001", {
      store: "M01",
      id: shift,
      drawerId: "drawer1",
      opening: "0.00",
    });
    await seller.receive({
      key: "daily-no-receive001",
      store: "M01",
      itemId: "model",
      quantity: 1,
      phones: [{ id: phone, barcode: "NO-1", serial: "SERIAL-NO" }],
    });
    const request = sale("M01", "daily-no-sale-00001");
    request.payload.warranties = [{ itemId: phone, requested: false }];
    const result = await seller.checkout(request);
    expect(projectNativeSpecimens(result.receipt).warranties).toEqual([]);
    expect(await seller.checkout(request)).toEqual(result);
    const audit = await count(h, "audit_events");
    await expect(
      seller.checkout({ ...request, idempotencyKey: "daily-no-sale-00002" }),
    ).rejects.toMatchObject({ code: "PHONE_NOT_AVAILABLE" });
    expect(await count(h, "sales")).toBe(1);
    expect(await count(h, "customers")).toBe(1);
    expect(await count(h, "audit_events")).toBe(audit);
    expect(await h.db.prepare("SELECT sum(amount_minor) n FROM cash_movements").first("n")).toBe(
      10000,
    );
  } finally {
    await h.dispose();
  }
}, 60000);
