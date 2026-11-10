import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ErpProvider } from "@/components/erp/context";
import { Scanner } from "@/components/erp/scanner";
import { parseScanPayload, stopScanTracks } from "@/domain/scan-payload";
import { phoneDraftSchema, accessoryDraftSchema } from "@/domain/operations";
import {
  addTestPhone,
  receiveTestAccessory,
  getTestState,
  resetTestWorkspace,
  migrateReviewWorkspace,
  nextAccessoryBarcode,
  setReviewActor,
  previewTestSale,
} from "@/data/test-workspace";
import { BarcodeLabel } from "@/components/erp/barcode-label";
const cameraMock = vi.hoisted(() => ({
  callback: undefined as undefined | ((result: { getText: () => string }) => void),
  reset: vi.fn(),
}));
vi.mock("@zxing/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@zxing/library")>()),
  BrowserMultiFormatReader: class {
    reset = cameraMock.reset;
    async decodeFromStream(
      _stream: MediaStream,
      _video: HTMLVideoElement,
      callback: (result: { getText: () => string }) => void,
    ) {
      cameraMock.callback = callback;
    }
  },
}));
const phone = () =>
  phoneDraftSchema.parse({
    name: "Review Phone",
    brand: "PH",
    store: "M01",
    condition: "NEW",
    salePrice: "1000.01",
    imei1: "490154203237518",
  });
const accessory = (o: Record<string, string> = {}) =>
  accessoryDraftSchema.parse({
    name: "Cable",
    store: "M01",
    quantity: "5",
    salePrice: "300.50",
    ...o,
  });
beforeEach(() => {
  resetTestWorkspace();
  localStorage.setItem("ph-lang", "en");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        measureText: (text: string) => ({ width: text.length * 8 }),
      }) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("receiving scan rules", () => {
  it("omitted and blank packaging mean UNKNOWN, never SEALED", () => {
    expect(phone().packaging).toBe("UNKNOWN");
    expect(phoneDraftSchema.parse({ ...phone(), packaging: "" }).packaging).toBe("UNKNOWN");
    expect(addTestPhone(phone()).packaging).toBe("UNKNOWN");
  });
  it("historical packaging and invalid sample IMEIs survive migration unchanged", () => {
    const s = getTestState();
    expect(migrateReviewWorkspace(structuredClone(s)).phones).toEqual(s.phones);
  });
  it("serial-only path does not fabricate IMEI", () => {
    const p = addTestPhone({ ...phone(), imei1: "", serial: "SN-REVIEW" });
    expect(p.imei).toBe("");
    expect(p.draft?.serial).toBe("SN-REVIEW");
  });
  it("cross-slot cross-store duplicate is rejected", () => {
    addTestPhone({ ...phone(), imei2: "356938035643809" });
    expect(() => addTestPhone({ ...phone(), store: "M02", imei1: "356938035643809" })).toThrow();
  });
  it("plain 1D content never invents model or a second IMEI", () => {
    expect(parseScanPayload("490154203237518")).toEqual({
      raw: "490154203237518",
      assignments: {},
      ambiguous: false,
    });
  });
  it("explicit QR tags assign only encoded identifiers", () => {
    expect(
      parseScanPayload("IMEI1:490154203237518;IMEI2:356938035643809;SN:ABC").assignments,
    ).toEqual({ imei1: "490154203237518", imei2: "356938035643809", serial: "ABC" });
  });
  it("JSON tags retain strings and ignore inferred specifications", () => {
    expect(
      parseScanPayload('{"imei1":"490154203237518","model":"X","battery":99}').assignments,
    ).toEqual({ imei1: "490154203237518" });
  });
  it("multiple untagged or conflicting tags stay ambiguous", () => {
    expect(parseScanPayload("490154203237518 356938035643809").ambiguous).toBe(true);
    expect(parseScanPayload("IMEI1:490154203237518;IMEI1:356938035643809").ambiguous).toBe(true);
  });
  it("generates persistent accessory SKU code distinct from unit namespace", () => {
    const r = receiveTestAccessory(accessory());
    const a = getTestState().accessories.find((a) => a.id === r.sku);
    expect(a?.code).toMatch(/^PHA-/);
    expect(a?.amount).toBe("300.50");
    expect(
      migrateReviewWorkspace(structuredClone(getTestState())).accessories.find(
        (a) => a.id === r.sku,
      )?.code,
    ).toBe(a?.code);
  });
  it("same barcode receives existing SKU without overwriting its price", () => {
    const r = receiveTestAccessory(accessory({ barcode: "MANUFACTURER-1" }));
    receiveTestAccessory(accessory({ barcode: "MANUFACTURER-1", salePrice: "999" }));
    const a = getTestState().accessories.find((a) => a.id === r.sku);
    expect(a?.quantity).toBe(10);
    expect(a?.amount).toBe("300.50");
    expect(getTestState().movements.filter((m) => m.sku === r.sku)).toHaveLength(2);
  });
  it("same receiving key posts exactly once", () => {
    const a = receiveTestAccessory(accessory(), { receivingKey: "R1" });
    const b = receiveTestAccessory(accessory(), { receivingKey: "R1" });
    expect(b).toEqual(a);
    expect(getTestState().movements).toHaveLength(1);
  });
  it("other-store barcode cannot add balance or change state", () => {
    receiveTestAccessory(accessory({ barcode: "MAN-2" }));
    const before = JSON.stringify(getTestState());
    expect(() => receiveTestAccessory(accessory({ store: "M02", barcode: "MAN-2" }))).toThrow();
    expect(JSON.stringify(getTestState())).toBe(before);
  });
  it("generation avoids phone namespace collisions", () => {
    const code = nextAccessoryBarcode();
    addTestPhone({ ...phone(), barcode: code });
    expect(nextAccessoryBarcode()).not.toBe(code);
    expect(() => receiveTestAccessory(accessory({ barcode: code }))).toThrow();
  });
  it("nonpositive/fraction quantity is rejected", () => {
    for (const quantity of ["0", "-1", "1.5"])
      expect(() => receiveTestAccessory({ ...accessory(), quantity })).toThrow();
  });
  it("M02 manager receives and own-store POS only", () => {
    setReviewActor("U-M02");
    const r = receiveTestAccessory(accessory({ store: "M02" }));
    const req = {
      lines: [{ id: r.sku, quantity: 1 }],
      customerId: "WALK-IN",
      customerName: "",
      tender: "Bank" as const,
      paid: "300.50",
    };
    expect(previewTestSale({ ...req, store: "M02" }).total).toBe("300.50");
    expect(() => previewTestSale({ ...req, store: "M01" })).toThrow();
  });
  it("stops every track", () => {
    const a = vi.fn(),
      b = vi.fn();
    stopScanTracks({
      getTracks: () => [{ stop: a }, { stop: b }] as unknown as MediaStreamTrack[],
    });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
  it("camera success stops tracks and presents encoded QR identifiers for human confirmation", async () => {
    const stop = vi.fn();
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
      configurable: true,
    });
    const assign = vi.fn();
    render(
      <ErpProvider>
        <Scanner target="imei1" onAssign={assign} onClose={vi.fn()} />
      </ErpProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open camera" }));
    await waitFor(() => expect(cameraMock.callback).toBeTypeOf("function"));
    cameraMock.callback?.({ getText: () => "IMEI1:490154203237518;IMEI2:356938035643809" });
    await waitFor(() => expect(stop).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Assign identifiers" }));
    expect(assign).toHaveBeenCalledWith({ imei1: "490154203237518", imei2: "356938035643809" });
  });
  it("unmount during permission request stops late media tracks", async () => {
    const stop = vi.fn();
    let resolve: ((s: unknown) => void) | undefined;
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
      configurable: true,
    });
    const { unmount } = render(
      <ErpProvider>
        <Scanner target="barcode" onAssign={vi.fn()} onClose={vi.fn()} />
      </ErpProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open camera" }));
    unmount();
    resolve?.({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });
  it("permission rejection keeps keyboard fallback available", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
      configurable: true,
    });
    render(
      <ErpProvider>
        <Scanner target="imei1" onAssign={vi.fn()} onClose={vi.fn()} />
      </ErpProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open camera" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied");
    expect(screen.getByRole("textbox")).toBeEnabled();
  });
  it("label print/reprint projects CODE128 without mutation", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <ErpProvider>
        <BarcodeLabel value="PHA-000099" name="Review cable" />
      </ErpProvider>,
    );
    const button = await screen.findByRole("button", { name: "Print label" });
    await waitFor(() => expect(button).toBeEnabled());
    const before = JSON.stringify(getTestState());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(getTestState())).toBe(before);
    expect(document.querySelector(".barcode-print-root")).toBeNull();
  });
});
