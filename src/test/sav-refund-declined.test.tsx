// 3b (owner-approved 2026-11-10): a plain SAV return with money due must state either a refund
// amount or "refund declined" with a mandatory reason, approved by MANAGER or SUPER_ADMIN.
// Never a silent zero.
import { beforeEach, afterEach, it, expect, describe, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { SavActions } from "@/components/erp/sav-actions";
import { ErpProvider } from "@/components/erp/context";
import { resetTestWorkspace } from "@/data/test-workspace";

let h: ReturnType<typeof sqliteHarness>,
  n = 0;
const now = Date.parse("2026-11-10T12:00:00Z");
const phone = "11111111-1111-4111-8111-111111111111",
  acc = "33333333-3333-4333-8333-333333333333",
  shift = "44444444-4444-4444-8444-444444444444";
const svc = () =>
  createNativeService(
    h.port,
    { verify: async (u) => ({ userId: u, sessionId: u, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const send = (operation: string, payload: Record<string, unknown>, actor = "manager") =>
  svc().execute(actor, {
    version: "native-2026-11-06",
    key: `sav-decline-command-${++n}`,
    operation,
    payload: { store: "M01", ...payload },
  });
const one = (sql: string) => {
  const row = h.db.prepare(sql).get() as Record<string, unknown> | undefined;
  return row ? Object.values(row)[0] : undefined;
};
const count = (table: string) => one(`SELECT count(*) FROM ${table}`);
async function sellAndOpen(patch: Record<string, unknown>) {
  await svc().checkout("owner", {
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: `sav-decline-checkout-${++n}`,
    clientRequestId: crypto.randomUUID(),
    payload: {
      store: "M01",
      shiftId: shift,
      buyer: { surname: "Buyer", givenName: "Name", contact: "0555555555" },
      lines: [
        { kind: "phone", itemId: phone, quantity: "1" },
        { kind: "accessory", itemId: acc, quantity: "1" },
      ],
      tender: "Cash",
      warranties: [{ itemId: phone, requested: false }],
      ...patch,
    },
  });
  const sale = h.db.prepare("SELECT id,customer_id FROM sales").get() as Record<string, string>;
  await send("sav.open", {
    id: "case",
    saleId: sale["id"],
    phoneId: phone,
    customerId: sale["customer_id"],
    imei: "490154203237518",
    issue: "Screen",
  });
  return sale;
}
const ret = (extra: Record<string, unknown> = {}, actor = "manager") =>
  send("sav.outcome", { caseId: "case", outcome: "REFUND", note: "Return", ...extra }, actor);
const nothingRecorded = () => {
  expect(count("sav_outcomes")).toBe(0);
  expect(count("sav_refunds")).toBe(0);
  expect(count("sav_refund_declines")).toBe(0);
  expect(one(`SELECT state FROM phones WHERE id='${phone}'`)).toBe("SOLD");
};

beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1),('m2',1);
     INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M01','MANAGER'),('m2','M02','MANAGER');
     INSERT INTO sessions SELECT id,id,${now + 100000},0 FROM accounts;
     INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{"condition":"NEW"}'),('${acc}','accessory','ACC','Charger','{}');
     INSERT INTO accessory_balances VALUES('M01','${acc}',5);
     INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','UNIT','AVAILABLE','{}','SN');
     INSERT INTO phone_identifiers VALUES('490154203237518','${phone}',1);
     INSERT INTO drawers VALUES('d','M01');
     INSERT INTO shifts VALUES('${shift}','M01','d','seller','OPEN',0,NULL);`,
  );
});
afterEach(() => cleanup());
const cashSale = async () => {
  h.db.exec(`INSERT INTO prices VALUES('M01','model',30000),('M01','${acc}',100000)`);
  return sellAndOpen({ tenderedAmount: "1300" });
};
const absorbedCreditSale = async () => {
  h.db.exec(`INSERT INTO prices VALUES('M01','model',30000),('M01','${acc}',70000)`);
  return sellAndOpen({ tenderedAmount: "200", creditAmount: "800", dueDate: "2026-12-10" });
};

describe("server: never a silent zero", () => {
  it("money due and neither amount nor decline: REJECTED, nothing recorded", async () => {
    await cashSale();
    await expect(ret()).rejects.toThrow("REJECTED");
    nothingRecorded();
  });

  it("decline needs a non-blank reason and cannot carry payment fields", async () => {
    await cashSale();
    await expect(ret({ refundDeclined: true })).rejects.toThrow("VALIDATION");
    await expect(ret({ refundDeclined: true, declineReason: "   " })).rejects.toThrow("VALIDATION");
    await expect(
      ret({
        refundDeclined: true,
        declineReason: "Customer keeps store credit",
        amount: "300",
        method: "Cash",
        shiftId: shift,
      }),
    ).rejects.toThrow("VALIDATION");
    await expect(ret({ declineReason: "No flag" })).rejects.toThrow("VALIDATION");
    nothingRecorded();
  });

  it("seller cannot decline; manager decline is recorded with the waived amount, no money moves", async () => {
    await cashSale();
    const declined = { refundDeclined: true, declineReason: "Phone damaged by customer" };
    await expect(ret(declined, "seller")).rejects.toThrow("FORBIDDEN");
    await expect(ret(declined, "m2")).rejects.toThrow("FORBIDDEN");
    nothingRecorded();
    await ret(declined);
    const row = h.db.prepare("SELECT * FROM sav_refund_declines").get() as Record<string, unknown>;
    expect(row).toMatchObject({
      case_id: "case",
      declined_minor: 30000,
      reason: "Phone damaged by customer",
      actor_id: "manager",
    });
    expect(count("sav_refunds")).toBe(0);
    expect(one(`SELECT state FROM phones WHERE id='${phone}'`)).toBe("RETURN_BLOCKED");
    expect(one("SELECT count(*) FROM cash_adjustments")).toBe(0);
  });

  it("owner (SUPER_ADMIN) may decline", async () => {
    await cashSale();
    await ret({ refundDeclined: true, declineReason: "Owner decision" }, "owner");
    expect(one("SELECT actor_id FROM sav_refund_declines")).toBe("owner");
  });

  it("debt absorbs the return: no amount is fine, and a decline is refused (nothing to waive)", async () => {
    await absorbedCreditSale();
    await expect(ret({ refundDeclined: true, declineReason: "Nothing due" })).rejects.toThrow(
      "REJECTED",
    );
    nothingRecorded();
    await ret();
    expect(count("sav_outcomes")).toBe(1);
    expect(count("sav_refund_declines")).toBe(0);
    expect(one("SELECT balance_minor FROM credit_balances")).toBe(50000);
  });
});

describe("SQL: decline ledger is enforced without the server", () => {
  async function rawOutcome() {
    await cashSale();
    h.db.exec("PRAGMA foreign_keys=OFF");
    h.db.exec(`INSERT INTO sav_outcomes VALUES('case','raw-outcome','REFUND','raw','manager',0)`);
  }
  const decline = (actor: string, minor: number, reason = "Reason") =>
    h.db.exec(
      `INSERT INTO sav_refund_declines VALUES('case','raw-decline',${minor},'${reason}','${actor}',0)`,
    );
  it("seller actor, wrong waived amount, blank reason and later refund are refused; rows are append-only", async () => {
    await rawOutcome();
    expect(() => decline("seller", 30000)).toThrow("APPROVER_ROLE");
    expect(() => decline("m2", 30000)).toThrow("APPROVER_ROLE");
    expect(() => decline("manager", 29999)).toThrow("REJECTED");
    expect(() => decline("manager", 30000, " ")).toThrow();
    decline("manager", 30000);
    expect(() => h.db.exec("UPDATE sav_refund_declines SET reason='x'")).toThrow("APPEND_ONLY");
    expect(() => h.db.exec("DELETE FROM sav_refund_declines")).toThrow("APPEND_ONLY");
    const saleId = one("SELECT id FROM sales");
    expect(() =>
      h.db.exec(
        `INSERT INTO sav_refunds VALUES('raw','raw-refund','case','${saleId}',100,'Bank','VIREMENT',NULL,'manager',0)`,
      ),
    ).toThrow("REJECTED");
  });
});

describe("UI: refund declined needs a reason", () => {
  it("sends refundDeclined + reason and no payment fields; blocks without a reason", async () => {
    resetTestWorkspace();
    localStorage.setItem("ph-lang", "en");
    const onCommand = vi.fn(async () => {});
    render(
      <ErpProvider>
        <SavActions approve manufacturer={false} closed={false} onCommand={onCommand} />
      </ErpProvider>,
    );
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Return" } });
    fireEvent.change(screen.getByLabelText("Approve outcome", { selector: "select" }), {
      target: { value: "REFUND" },
    });
    fireEvent.click(screen.getByLabelText("Refund declined"));
    const approve = screen.getByRole("button", { name: "Approve outcome" });
    expect(approve.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Decline reason"), {
      target: { value: "Phone damaged by customer" },
    });
    expect(approve.hasAttribute("disabled")).toBe(false);
    fireEvent.click(approve);
    expect(onCommand).toHaveBeenCalledWith("sav.outcome", {
      outcome: "REFUND",
      note: "Return",
      refundDeclined: true,
      declineReason: "Phone damaged by customer",
    });
  });
});
