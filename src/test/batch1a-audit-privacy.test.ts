import { afterEach, beforeEach, expect, it } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { canonicalJson } from "@/backend/sqlite/checkout";
import { planRetailCheckout } from "@/backend/sqlite/retail-checkout";
import { planStandaloneReceiving } from "@/backend/sqlite/standalone-receiving";
import { nativeReceiving } from "@/domain/native-receiving";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeApiHandler } from "@/backend/native-api";

let h: ReturnType<typeof sqliteHarness>;
const at = Date.parse("2026-11-09T00:00:00Z");
const identity = { userId: "seller", sessionId: "seller", expiresAt: at + 10000 };
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(`INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1);
    INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M02','MANAGER');
    INSERT INTO sessions SELECT id,id,${at + 10000},0 FROM accounts;
    INSERT INTO drawers VALUES('drawer','M01');
    INSERT INTO shifts VALUES('33333333-3333-4333-8333-333333333333','M01','drawer','seller','OPEN',0,NULL);
    INSERT INTO catalog VALUES('model','phone','PHONE','Phone','{}'),('accessory','accessory','SKU','Accessory','{}');
    INSERT INTO prices VALUES('M01','model',100);
    INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('11111111-1111-4111-8111-111111111111','M01','model','BAR','AVAILABLE','{}','SERIAL');`);
});
afterEach(() => h.db.close());

it("pos.checkout audit keeps the linked customer ID but no buyer surname, given name or contact", () => {
  const request = {
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: "privacy-checkout-key-0001",
    clientRequestId: "44444444-4444-4444-8444-444444444444",
    payload: {
      store: "M01",
      shiftId: "33333333-3333-4333-8333-333333333333",
      buyer: { surname: "PrivateSurname", givenName: "PrivateGiven", contact: "PrivateContact" },
      lines: [{ itemId: "11111111-1111-4111-8111-111111111111", kind: "phone", quantity: "1" }],
      warranties: [{ itemId: "11111111-1111-4111-8111-111111111111", requested: false }],
      tender: "Cash",
      tenderedAmount: "1.00",
    },
  };
  h.run(planRetailCheckout(request, identity, "a".repeat(64), "sale", at));
  const audit = h.db.prepare("SELECT payload_json,at FROM audit_events").get();
  const raw = String(audit?.["payload_json"]);
  const customer = h.db.prepare("SELECT customer_id FROM sales").get()?.["customer_id"];
  expect(JSON.parse(raw).payload.customerId).toBe(customer);
  expect(raw).not.toMatch(
    /buyer|surname|givenName|contact|PrivateSurname|PrivateGiven|PrivateContact/,
  );
  expect(audit?.["at"]).toBe(at);
  expect(h.db.prepare("SELECT surname,given_name,contact FROM customer_details").get()).toEqual({
    surname: "PrivateSurname",
    given_name: "PrivateGiven",
    contact: "PrivateContact",
  });
});

it("audit read/export projection provides JSON only to SUPER_ADMIN and metadata to manager", async () => {
  h.db
    .exec(`INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,created_at)
    VALUES('audit-key','owner','M02','price.set','hash','DONE','audit-tx',${at});
    INSERT INTO audit_events(id,command_key,actor_id,store_id,operation,at,payload_json,before_json)
    VALUES('audit-tx','audit-key','owner','M02','price.set',${at},'{"private":"after"}','{"private":"before"}');`);
  const service = createNativeService(
    h.port,
    {
      verify: async (credential) => {
        const userId = credential.replace(/^audit-token-/, "");
        return { ...identity, userId, sessionId: userId };
      },
    },
    { get: async () => null, put: async () => {} },
    () => at,
  );
  const api = createNativeApiHandler(service, {
    enabled: true,
    allowedOrigin: "https://erp.invalid",
  });
  const read = async (user: string, store: string) =>
    api(
      new Request("https://erp.invalid/api/native/read", {
        method: "POST",
        headers: {
          Origin: "https://erp.invalid",
          "Content-Type": "application/json",
          Authorization: `Bearer audit-token-${user}`,
        },
        body: JSON.stringify({ module: "audit", store }),
      }),
    );
  // Direct projection is also the data source for generic UI/export consumers.
  const owner = await service.read("owner", "audit", "M02");
  expect(owner[0]).toMatchObject({
    payload_json: '{"private":"after"}',
    before_json: '{"private":"before"}',
    at,
  });
  const manager = await service.read("manager", "audit", "M02");
  expect(manager[0]).toEqual({
    id: "audit-tx",
    command_key: "audit-key",
    actor_id: "owner",
    store_id: "M02",
    operation: "price.set",
    at,
  });
  expect(JSON.stringify(manager)).not.toMatch(/payload_json|before_json|private/);
  const managerResponse = await read("manager", "M02");
  expect(managerResponse.status).toBe(200);
  expect((await managerResponse.json()).rows).toEqual(manager);
  const ownerResponse = await read("owner", "M02");
  expect(ownerResponse.status).toBe(200);
  expect((await ownerResponse.json()).rows).toEqual(owner);
  await expect(service.read("seller", "audit", "M01")).rejects.toThrow("FORBIDDEN");
  expect((await read("seller", "M01")).status).toBe(403);
});

it("standalone receiving audit serializes the complete parsed command with canonicalJson", () => {
  const input = {
    store: "M01",
    itemId: "accessory",
    quantity: 2,
    key: "canonical-receiving-key",
    reference: "Reference",
  };
  h.run(planStandaloneReceiving(input, identity, "b".repeat(64), "receipt", at));
  expect(h.db.prepare("SELECT payload_json,at FROM audit_events").get()).toEqual({
    payload_json: canonicalJson(nativeReceiving.parse(input)),
    at,
  });
});
