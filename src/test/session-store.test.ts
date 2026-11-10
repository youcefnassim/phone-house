import { describe, it, expect, beforeEach } from "vitest";
import { addDraft, recordAudit, getSession, resetSession } from "@/data/session-store";
import { businessDemo, projectSnapshot } from "@/data/business-demo";
import { demoRepository } from "@/data/demo-repository";

beforeEach(() => resetSession());

describe("shared synthetic session", () => {
  it("customer drafted in Customers becomes selectable for a Debt draft in the same session", async () => {
    await demoRepository.saveCustomerDraft({
      name: "Session customer",
      contact: "0550 999 999",
      store: "M01",
      reference: "SESSION-C1",
      address: "",
      notes: "",
    });
    const snapshot = await businessDemo.read("M01", "SELLER");
    expect(
      snapshot.customers.some((c) => c.name === "Session customer" && c.source === "Session draft"),
    ).toBe(true);
  });
  it("session drafts respect store scope", async () => {
    await demoRepository.saveCustomerDraft({
      name: "M02 customer",
      contact: "0550 888 888",
      store: "M02",
      reference: "SESSION-C2",
      address: "",
      notes: "",
    });
    const m01 = await businessDemo.read("M01", "SELLER");
    const all = await businessDemo.read("ALL", "SELLER");
    expect(m01.customers.some((c) => c.reference === "SESSION-C2")).toBe(false);
    expect(all.customers.some((c) => c.reference === "SESSION-C2")).toBe(true);
  });
  it("repayment drafts merge with fixture repayments for outstanding previews", async () => {
    await demoRepository.saveRepaymentDraft("D-001", {
      amount: "1000.00",
      date: "2026-11-06",
      method: "Cash",
      reference: "SESSION-PAY",
      authorizationReference: "DEMO-AUTH-001",
    });
    const snapshot = await businessDemo.read("M01", "SELLER");
    expect(snapshot.repayments.filter((p) => p.subjectId === "D-001")).toHaveLength(2);
  });
  it("every draft records an attributed audit event", async () => {
    await demoRepository.saveSupplierDraft({
      name: "Session supplier",
      contact: "Synthetic",
      store: "M01",
      documentReference: "SESSION-SUP",
      notes: "",
    });
    const audit = getSession().audit;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.area).toBe("suppliers");
    expect(audit[0]?.actor).toContain("unauthenticated");
  });
  it("fixtures are never mutated by session drafts", async () => {
    const before = projectSnapshot("ALL").customers.length;
    await demoRepository.saveCustomerDraft({
      name: "Another",
      contact: "1",
      store: "M01",
      reference: "SESSION-C3",
      address: "",
      notes: "",
    });
    expect(projectSnapshot("ALL").customers.length).toBe(before + 1);
    resetSession();
    expect(projectSnapshot("ALL").customers.length).toBe(before);
  });
  it("repository rejects invalid input and never posts", async () => {
    await expect(
      demoRepository.saveCustomerDraft({
        name: "",
        contact: "",
        store: "M01",
        reference: "",
        address: "",
        notes: "",
      }),
    ).rejects.toThrow();
    const receipt = await demoRepository.saveCustomerDraft({
      name: "Valid",
      contact: "1",
      store: "M01",
      reference: "SESSION-C4",
      address: "",
      notes: "",
    });
    expect(receipt.posted).toBe(false);
    expect(receipt.label).toBe("SYNTHETIC SESSION DRAFT");
  });
  it("empty and error read states still apply with session data present", async () => {
    addDraft(
      "customers",
      {
        id: "DRAFT-C-9",
        name: "Hidden",
        contact: "1",
        store: "M01",
        reference: "SESSION-C9",
        address: "",
        notes: "",
        source: "Session draft",
      },
      { area: "customers", action: "draft", detail: "", store: "M01" },
    );
    expect((await businessDemo.read("M01", "SELLER", "Empty")).customers).toHaveLength(0);
    await expect(businessDemo.read("M01", "SELLER", "Error")).rejects.toThrow();
  });
  it("standalone audit events can be recorded", () => {
    const event = recordAudit({
      area: "users",
      action: "Invitation draft saved",
      subjectId: "INV-1",
      detail: "Demo",
      store: "M01",
    });
    expect(event.id).toMatch(/^SEV-/);
    expect(getSession().audit[0]?.id).toBe(event.id);
  });
});
