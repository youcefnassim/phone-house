import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import {
  addBatchImei,
  batchComplete,
  batchReceiving,
  buildCheckUrl,
  defaultSettings,
  isBoxTracked,
  labelContent,
  lowStock,
  lowerBatchTarget,
  packagingFor,
  resolveSettings,
} from "@/domain/intake";
import {
  getTestState,
  receiveTestAccessory,
  resetTestWorkspace,
  saveTestAccessoryMeta,
  saveTestSetting,
  setReviewActor,
  testAccessoryAlert,
  testSettings,
} from "@/data/test-workspace";
import { ErpProvider } from "@/components/erp/context";
import { VerifyButton } from "@/components/erp/fast-intake";
import { BarcodeLabel } from "@/components/erp/barcode-label";

// Owner decisions 2026-11-09 (batch 2a): fast intake, owner settings.
const luhn = (body14: string) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body14[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body14 + String((10 - (sum % 10)) % 10);
};
const imeis = Array.from({ length: 6 }, (_, i) => luhn(`3567890000000${i}`.slice(0, 14)));

let h: ReturnType<typeof sqliteHarness>;
beforeEach(() => {
  resetTestWorkspace();
  h = sqliteHarness();
  h.db.exec(`INSERT INTO accounts VALUES('owner',1),('m1',1),('s1',1),('s2',1);
INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('m1','M01','MANAGER'),('s1','M01','SELLER'),('s2','M02','SELLER');
INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;`);
});
afterEach(() => {
  h.db.close();
  cleanup();
});
const service = () =>
  createNativeService(
    h.port,
    { verify: async (userId) => ({ userId, sessionId: userId, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
let n = 0;
const k = () => `batch2a-key-${String(++n).padStart(6, "0")}`;
const cmd = (operation: string, payload: unknown) => ({
  version: "native-2026-11-06",
  key: k(),
  operation,
  payload,
});
const saveModel = (user: string, store: string, id: string, attributes: Record<string, string>) =>
  service().execute(
    user,
    cmd("catalog.save", { store, id, kind: "phone", sku: id, name: id, attributes }),
  );

describe("0) owner settings", () => {
  it.each(["s1", "m1"])("settings.save is forbidden for staff (%s)", async (user) => {
    await expect(
      service().execute(
        user,
        cmd("settings.save", {
          store: "M01",
          key: "intake.checkUrlTemplate",
          value: "https://check.example/{serial}",
        }),
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(h.db.prepare("SELECT count(*) n FROM app_settings").get()).toEqual({ n: 0 });
  });
  it("owner saves (audited with before_json); staff read the non-sensitive keys", async () => {
    await service().execute(
      "owner",
      cmd("settings.save", {
        store: "M01",
        key: "labels.sizeMm",
        value: { width: 50, height: 30 },
      }),
    );
    await service().execute(
      "owner",
      cmd("settings.save", {
        store: "M01",
        key: "labels.sizeMm",
        value: { width: 60, height: 40 },
      }),
    );
    const audit = h.db
      .prepare("SELECT operation,before_json FROM audit_events ORDER BY at,rowid")
      .all() as { operation: string; before_json: string | null }[];
    expect(audit.map((a) => a.operation)).toEqual(["settings.save", "settings.save"]);
    expect(audit[0]?.before_json).toBeNull();
    expect(JSON.parse(audit[1]?.before_json ?? "{}")).toMatchObject({
      key: "labels.sizeMm",
      value: { width: 50, height: 30 },
    });
    h.db.exec(`INSERT INTO app_settings VALUES('owner.secret','"x"',1)`);
    const staff = (await service().settings("s1", { store: "M01" })) as {
      settings: Record<string, unknown>;
    };
    expect(staff.settings["labels.sizeMm"]).toEqual({ width: 60, height: 40 });
    expect(staff.settings["intake.checkUrlTemplate"]).toBe("");
    expect(Object.keys(staff.settings)).not.toContain("owner.secret");
  });
  it("invalid setting values are rejected before writing", async () => {
    await expect(
      service().execute(
        "owner",
        cmd("settings.save", {
          store: "M01",
          key: "intake.checkUrlTemplate",
          value: "http://no-placeholder",
        }),
      ),
    ).rejects.toThrow();
  });
  it("demo: same keys in the workspace; settings save is owner-only", () => {
    setReviewActor("U-S01");
    expect(() => saveTestSetting("intake.checkUrlTemplate", "https://x.example/{imei}")).toThrow(
      "Owner access required.",
    );
    setReviewActor("U-OWN");
    saveTestSetting("intake.checkUrlTemplate", "https://x.example/{imei}");
    expect(getTestState().settings?.["intake.checkUrlTemplate"]).toBe("https://x.example/{imei}");
    expect(testSettings()["labels.sizeMm"]).toBeNull();
  });
  it("defaults come from the owner's answers; unknown values stay empty", () => {
    const s = resolveSettings({});
    expect(s["intake.checkUrlTemplate"]).toBe("");
    expect(s["labels.sizeMm"]).toBeNull();
    expect(s["intake.accessoryCategories"]).toEqual([
      "Pochettes",
      "Incassables",
      "Kitman",
      "Chargeurs",
      "Câbles",
      "Powerbank",
      "Lens caméra",
    ]);
  });
});

describe("1) iPhone one at a time", () => {
  it("check URL replaces {serial}/{imei}; empty template hides the button", () => {
    expect(buildCheckUrl("https://c.example/?sn={serial}", { serial: "F2LX 1" })).toBe(
      "https://c.example/?sn=F2LX%201",
    );
    expect(buildCheckUrl("https://c.example/{imei}", { imei: imeis[0]! })).toBe(
      `https://c.example/${imeis[0]}`,
    );
    expect(buildCheckUrl("", { serial: "A" })).toBeNull();
    render(
      <ErpProvider>
        <VerifyButton template="" serial="ABC" />
      </ErpProvider>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTestId("verify-hint")).toBeTruthy();
    cleanup();
    render(
      <ErpProvider>
        <VerifyButton template="https://c.example/{serial}" serial="ABC" />
      </ErpProvider>,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://c.example/ABC");
    expect(link.getAttribute("target")).toBe("_blank");
  });
  it("records IMEI1 + serial with optional battery and remark", async () => {
    await saveModel("s1", "M01", "iphone-15", { brand: "Apple", model: "iPhone 15" });
    await service().receive("s1", {
      key: k(),
      store: "M01",
      itemId: "iphone-15",
      quantity: 1,
      phones: [
        {
          id: "u1",
          imei1: imeis[0],
          serial: "F2LXABC",
          barcode: "PH-u1",
          attributes: {
            condition: "USED",
            packaging: "OPEN_BOX",
            battery: "88",
            remark: "piece replaced",
          },
        },
      ],
    });
    const row = h.db.prepare("SELECT serial,attributes_json FROM phones").get() as {
      serial: string;
      attributes_json: string;
    };
    expect(row.serial).toBe("F2LXABC");
    expect(JSON.parse(row.attributes_json)).toMatchObject({
      battery: "88",
      remark: "piece replaced",
    });
  });
});

describe("2) Android sealed box", () => {
  it("refuses bad checksum and duplicate IMEI inside one box; counter and lowering N", () => {
    let b = { target: 3, imeis: [] as string[] };
    expect(addBatchImei(b, "123456789012345").error).toBe("INVALID_IMEI");
    b = addBatchImei(b, imeis[0]!).batch;
    expect(addBatchImei(b, imeis[0]!).error).toBe("DUPLICATE_IMEI");
    expect(addBatchImei(b, imeis[1]!, new Set([imeis[1]!])).error).toBe("IN_STOCK");
    b = addBatchImei(b, imeis[1]!).batch;
    expect(b.imeis.length).toBe(2);
    expect(batchComplete(b)).toBe(false);
    b = lowerBatchTarget(b, 2);
    expect(batchComplete(b)).toBe(true);
    expect(addBatchImei(b, imeis[2]!).error).toBe("BATCH_FULL");
    expect(lowerBatchTarget(b, 5)).toBe(b);
  });
  it("EAN on the model; N IMEIs -> N units in ONE receiving command at the model's store price", async () => {
    await saveModel("s1", "M01", "a15", {
      brand: "Samsung",
      model: "Galaxy A15",
      ean: "8806095467801",
    });
    await service().execute(
      "s1",
      cmd("price.set", { store: "M01", itemId: "a15", amount: "25000" }),
    );
    const res = (await service().dailyResources("s1", { store: "M01" })) as {
      catalog: { id: string; ean?: string; amountMinor: number | null }[];
    };
    const hit = res.catalog.find((c) => c.ean === "8806095467801");
    expect(hit).toMatchObject({ id: "a15", amountMinor: 2500000 });
    let b = { target: 3, imeis: [] as string[] };
    for (const v of imeis.slice(0, 3)) b = addBatchImei(b, v).batch;
    let id = 0;
    const command = batchReceiving({
      key: k(),
      store: "M01",
      itemId: "a15",
      batch: b,
      condition: "NEW",
      packaging: packagingFor(false, ""),
      newId: () => `box-${++id}`,
    });
    await service().receive("s1", command);
    expect(h.db.prepare("SELECT count(*) n FROM phones WHERE catalog_id='a15'").get()).toEqual({
      n: 3,
    });
    expect(h.db.prepare("SELECT count(*) n FROM standalone_receipts").get()).toEqual({ n: 1 });
    expect(
      h.db
        .prepare("SELECT DISTINCT json_extract(attributes_json,'$.packaging') p FROM phones")
        .all(),
    ).toEqual([{ p: "NOT_TRACKED" }]);
  });
  it("a duplicate IMEI inside one box never posts any unit", async () => {
    await saveModel("s1", "M01", "a15", { brand: "Samsung", model: "Galaxy A15" });
    const dup = {
      key: k(),
      store: "M01",
      itemId: "a15",
      quantity: 2,
      phones: [
        { id: "d1", imei1: imeis[3], barcode: "PH-d1", attributes: {} },
        { id: "d2", imei1: imeis[3], barcode: "PH-d2", attributes: {} },
      ],
    };
    await expect(service().receive("s1", dup)).rejects.toThrow();
    expect(h.db.prepare("SELECT count(*) n FROM phones").get()).toEqual({ n: 0 });
  });
});

describe("3) box state", () => {
  const list = defaultSettings["intake.boxTrackedModels"];
  it.each([
    ["Apple", "iPhone 13", true],
    ["apple", "iPad", true],
    ["Samsung", "Galaxy S24 Ultra", true],
    ["Samsung", "Galaxy A15", false],
    ["Xiaomi", "Redmi 13", false],
  ])("%s %s tracked=%s", (brand, model, tracked) => {
    expect(isBoxTracked(list, brand, model)).toBe(tracked);
  });
  it("untracked brands store NOT_TRACKED; tracked values have no 'unknown'", () => {
    expect(packagingFor(false, "SEALED")).toBe("NOT_TRACKED");
    expect(packagingFor(true, "SEALED")).toBe("SEALED");
  });
});

describe("4) accessories", () => {
  it("low-stock alert when quantity <= owner threshold; none without threshold", () => {
    expect(lowStock(3, 3)).toBe(true);
    expect(lowStock(4, 3)).toBe(false);
    expect(lowStock(0, undefined)).toBe(false);
  });
  it("demo: category from owner list, optional photo, threshold alert", () => {
    setReviewActor("U-OWN");
    const r = receiveTestAccessory({
      name: "Pochette X",
      store: "M01",
      category: "Cases",
      quantity: "2",
      sku: "ACC-POCH-X",
    } as never);
    saveTestAccessoryMeta(r.sku, {
      category: "Pochettes",
      photo: "data:image/png;base64,AAAA",
      lowStockThreshold: 2,
    });
    expect(testAccessoryAlert(r.sku)).toBe(true);
    expect(() => saveTestAccessoryMeta(r.sku, { category: "Invented" })).toThrow(
      "Unknown category.",
    );
  });
  it("native: only a photo-pending flag and threshold are stored on the product", async () => {
    await service().execute(
      "s1",
      cmd("catalog.save", {
        store: "M01",
        id: "acc-1",
        kind: "accessory",
        sku: "acc-1",
        name: "Câble USB-C",
        attributes: { category: "Câbles", lowStockThreshold: "5", photoPending: "1" },
      }),
    );
    const res = (await service().dailyResources("s1", { store: "M01" })) as {
      catalog: Record<string, unknown>[];
    };
    expect(res.catalog.find((c) => c["id"] === "acc-1")).toMatchObject({
      category: "Câbles",
      lowStockThreshold: "5",
      photoPending: "1",
    });
  });
});

describe("5) labels", () => {
  it("content = code + model + store, never price", () => {
    const c = labelContent({ code: "PH-1", model: "Galaxy A15", store: "M01" });
    expect(Object.keys(c)).toEqual(["code", "model", "store"]);
  });
  it("shows the store; while size is empty it keeps the layout and shows the Settings hint", () => {
    render(
      <ErpProvider>
        <BarcodeLabel value="PH-1" name="Galaxy A15" store="M01" />
      </ErpProvider>,
    );
    expect(screen.getByTestId("label-store").textContent).toBe("M01");
    expect(screen.getByRole("note")).toBeTruthy();
    cleanup();
    render(
      <ErpProvider>
        <BarcodeLabel
          value="PH-1"
          name="Galaxy A15"
          store="M01"
          sizeMm={{ width: 50, height: 30 }}
        />
      </ErpProvider>,
    );
    expect(screen.getByTestId("label-size").textContent).toContain("50");
    expect(screen.queryByRole("note")).toBeNull();
  });
});
