import { StockCount } from "./native-stock-count";
import { permits } from "@/domain/permissions";
import { useNativeTransport } from "./native-transport";
import { PosPaymentFields, emptyPosPayment, type PosPaymentValue } from "./pos-payment";
import { cents } from "@/domain/pos-settlement";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NativeDailyResources } from "@/domain/native-daily";
import type { NativePosSearchResult } from "@/domain/native-pos-search";
import type {
  NativeCashLedgerResult,
  NativeCustomerSummary,
  NativeSalesHistoryResult,
} from "@/domain/native-history";
import type { NativeReceipt } from "@/domain/native-documents";
import type { DailyNativeController, DailySaleReview } from "@/data/daily-native-controller";
import { nativeDailyText, nativeDailyError } from "@/locales/native-daily";
import { nativeReceiving } from "@/domain/native-receiving";
import { nativeCheckoutEnvelope } from "@/domain/native-checkout";
import { decimalValue } from "@/domain/erp";
import { formatMinor } from "@/domain/production-modules";
import { useErp } from "./context";
import { useDailyNative } from "./use-daily-native";
import { warrantyRule } from "@/domain/warranty-documents";
import { NativeCashMovement } from "./native-cash-movement";
import { documentText } from "@/locales/warranty-documents";
import { NativeDocumentDialog } from "./native-documents";
import { BarcodeLabel } from "./barcode-label";
import { Scanner } from "./scanner";
import { phoneModelSku } from "@/domain/phone-model";
import {
  addBatchImei,
  batchReceiving,
  isBoxTracked,
  lowStock,
  lowerBatchTarget,
  packagingFor,
  resolveSettings,
  type AppSettings,
  type BoxState,
  type ImeiBatch,
  type ImeiBatchError,
} from "@/domain/intake";
import { BoxStatePicker, VerifyButton, useIntakeText } from "./fast-intake";
import { IntakeProgress, SuccessCheck } from "./visual-feedback";

type Store = "M01" | "M02";
type Item = NativePosSearchResult["items"][number];
type P = ReturnType<typeof useLabels>;
const key = () => `daily-${crypto.randomUUID()}`;
function useLabels() {
  const { lang } = useErp();
  return (k: Parameters<typeof nativeDailyText>[1]) => nativeDailyText(lang, k);
}
function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="form-label min-w-0">
      {name}
      {children}
    </label>
  );
}

/** Real mounted native daily surface. No local-workspace import or fallback. */
export function NativeDailyPage({
  route,
  store,
  owner = false,
}: {
  route: string;
  store: Store;
  owner?: boolean;
}) {
  const { controller, state } = useDailyNative(store);
  const p = useLabels();
  const { t, lang } = useErp();
  const [resources, setResources] = useState<NativeDailyResources | null>(null);
  const [receipt, setReceipt] = useState<NativeReceipt | null>(null);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [recovered, setRecovered] = useState(0);
  const busy = state.state === "LOADING";
  const locked = state.state === "OUTCOME_UNKNOWN";
  const retryable = state.state === "NOT_RECORDED";
  const denied = ["FORBIDDEN", "UNAUTHORIZED", "NOT_CONNECTED"].includes(state.state);
  const disabled = busy || locked || retryable || denied;
  useEffect(() => {
    let active = true;
    void controller
      .resources()
      .then((r) => {
        if (active) setResources(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [controller]);
  const action = async (work: () => Promise<unknown>) => {
    if (disabled) return;
    setNotice("");
    try {
      const result = await work();
      if (result && typeof result === "object" && "receipt" in result)
        setReceipt((result as DailySaleReview).receipt);
      setRevision((r) => r + 1);
      setNotice(p("recorded"));
    } catch {
      /* controller publishes authoritative failure; validation is never success */
    }
  };
  const title =
    route === "/pos"
      ? "nav.pos"
      : route === "/cash"
        ? "nav.cash"
        : route === "/sales"
          ? "sale.title"
          : route === "/stock/phones"
            ? "nav.phones"
            : "nav.accessories";
  return (
    <section className="page-enter native-daily" data-testid="native-daily-page" aria-busy={busy}>
      <div className="page-heading">
        <h1>{t(title)}</h1>
      </div>
      {busy && (
        <p role="status" className="loading-state">
          {p("loading")}
        </p>
      )}
      {notice && !busy && !locked && <p role="status">{notice}</p>}
      {denied && (
        <p role="alert">{"code" in state ? nativeDailyError(lang, state.code) : p("denied")}</p>
      )}
      {state.state === "ERROR" && (
        <div role="alert">
          <p>{nativeDailyError(lang, state.code)}</p>
          <Button variant="outline" disabled={busy} onClick={() => controller.cancel()}>
            {p("cancel")}
          </Button>
        </div>
      )}
      {retryable && (
        <div role="alert">
          <p>{p("NOT_RECORDED")}</p>
          <code className="break-all">{state.key}</code>
          <Button
            disabled={busy}
            onClick={() => {
              void controller
                .retryNotRecorded()
                .then((result) => {
                  if (result && "receipt" in result) setReceipt(result.receipt);
                  setRecovered((r) => r + 1);
                  setRevision((r) => r + 1);
                  setNotice(p("recorded"));
                })
                .catch(() => {});
            }}
          >
            {p("retry")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => controller.cancel()}>
            {p("cancel")}
          </Button>
        </div>
      )}
      {locked && (
        <div role="alert">
          <p>{p("pending")}</p>
          <code className="break-all">{state.key}</code>
          <Button
            disabled={busy}
            onClick={() => {
              void controller
                .reconcile()
                .then((result) => {
                  if (result && "receipt" in result) setReceipt(result.receipt);
                  if (result) {
                    setRecovered((r) => r + 1);
                    setRevision((r) => r + 1);
                    setNotice(p("recorded"));
                  }
                })
                .catch(() => {});
            }}
          >
            {p("recovery")}
          </Button>
        </div>
      )}
      {resources && (
        <>
          {route === "/pos" && (
            <NativePos
              key={recovered}
              controller={controller}
              disabled={disabled}
              action={action}
              revision={revision}
              p={p}
            />
          )}
          {(route === "/stock/phones" || route === "/stock/accessories") && (
            <NativeReceiving
              key={recovered}
              controller={controller}
              resources={resources}
              owner={owner}
              kind={route === "/stock/phones" ? "phone" : "accessory"}
              disabled={disabled}
              action={action}
              revision={revision}
              p={p}
            />
          )}
          {route === "/cash" && (
            <NativeCash
              key={recovered}
              controller={controller}
              resources={resources}
              owner={owner}
              disabled={disabled}
              action={action}
              revision={revision}
              p={p}
            />
          )}
          {route === "/sales" && (
            <NativeSales
              controller={controller}
              disabled={disabled}
              revision={revision}
              p={p}
              onReceipt={setReceipt}
            />
          )}
        </>
      )}
      {receipt && (
        <NativeDocumentDialog
          key={receipt.saleId}
          receipt={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
    </section>
  );
}

function NativePos({
  controller,
  disabled,
  action,
  revision,
  p,
}: {
  controller: DailyNativeController;
  disabled: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
  revision: number;
  p: P;
}) {
  const { lang, t } = useErp();
  const x = documentText[lang];
  const [posSettings, setPosSettings] = useState<AppSettings>(() => resolveSettings({}));
  const [providers, setProviders] = useState<Record<string, "SHOP" | "MANUFACTURER">>({});
  const [items, setItems] = useState<Item[]>([]);
  const [basket, setBasket] = useState<{ item: Item; quantity: number }[]>([]);
  const [search, setSearch] = useState("");
  const scanInput = useRef<HTMLInputElement>(null);
  const [scanner, setScanner] = useState(false);
  const [shift, setShift] = useState("");
  const [surname, setSurname] = useState("");
  const [givenName, setGivenName] = useState("");
  const [contact, setContact] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<NativeCustomerSummary[]>([]);
  const [warranties, setWarranties] = useState<Record<string, string>>({});
  const [paymentValue, setPaymentValue] = useState<PosPaymentValue>(emptyPosPayment);
  const [parked, setParked] = useState<
    {
      id: string;
      basket: typeof basket;
      payment: PosPaymentValue;
      surname: string;
      givenName: string;
      contact: string;
      customerId: string;
      warranties: typeof warranties;
      providers: typeof providers;
    }[]
  >([]);
  const tender = paymentValue.mode;
  const [invalid, setInvalid] = useState(false);
  const [requestKey, setRequestKey] = useState(key);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      void controller
        .settings()
        .then((settings) => {
          if (active) setPosSettings(settings);
        })
        .catch(() => {});
      const cash = await controller.cash();
      const found = await controller.search("");
      if (active) {
        setShift(cash.shifts.find((s) => s.state === "OPEN")?.id ?? "");
        setItems(found.items);
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [controller, revision]);
  const add = (item: Item) => {
    setBasket((old) => {
      const existing = old.find((l) => l.item.id === item.id);
      if (existing)
        return old.map((l) =>
          l === existing
            ? {
                ...l,
                quantity: Math.min(item.quantity, l.quantity + (item.kind === "phone" ? 0 : 1)),
              }
            : l,
        );
      return [...old, { item, quantity: 1 }];
    });
    setCompleted(false);
    scanInput.current?.focus();
  };
  const lookup = async (value: string, exact: boolean) => {
    if (disabled) return;
    try {
      const found = await controller.search(value, exact);
      setItems(found.items);
      if (exact && found.items.length === 1) {
        const item = found.items[0];
        if (item) add(item);
      }
    } catch {
      setItems([]);
    }
  };
  const phones = basket.filter((l) => l.item.kind === "phone");
  const total = basket.reduce((n, l) => n + (l.item.amountMinor ?? 0) * l.quantity, 0);
  const pay = () =>
    action(async () => {
      const selected = phones.map((l) => {
        const value = warranties[l.item.id];
        return value === "NO"
          ? { itemId: l.item.id, requested: false }
          : {
              itemId: l.item.id,
              requested: true,
              provider: providers[l.item.id] ?? "SHOP",
              ...(value && value !== "YES" ? { months: Number(value) } : {}),
            };
      });
      const parsed = nativeCheckoutEnvelope.safeParse({
        contractVersion: "native-pos-2026-11-07",
        idempotencyKey: requestKey,
        clientRequestId,
        payload: {
          store: controller.store,
          shiftId: shift,
          lines: basket.map((l) => ({
            itemId: l.item.id,
            kind: l.item.kind,
            quantity: String(l.quantity),
          })),
          tender,
          tenderedAmount:
            tender === "Bank"
              ? decimalValue(
                  BigInt(total) -
                    cents(paymentValue.discount || "0") -
                    cents(paymentValue.credit || "0"),
                )
              : paymentValue.received ||
                decimalValue(
                  BigInt(total) -
                    cents(paymentValue.discount || "0") -
                    cents(paymentValue.credit || "0"),
                ),
          creditAmount: paymentValue.credit || undefined,
          dueDate: paymentValue.dueDate || undefined,
          cashAmount: paymentValue.cash || undefined,
          bankAmount: paymentValue.bank || undefined,
          bankMethod: paymentValue.method || undefined,
          discountAmount: paymentValue.discount || undefined,
          warranties: selected,

          ...(phones.length || Number(paymentValue.credit) > 0
            ? { buyer: { surname, givenName, contact }, ...(customerId ? { customerId } : {}) }
            : {}),
        },
      });
      if (
        phones.some((l) => !warranties[l.item.id]) ||
        !parsed.success ||
        !Number.isSafeInteger(total) ||
        basket.some((l) => !l.item.amountMinor) ||
        (tender !== "Cash" && !paymentValue.method)
      ) {
        setInvalid(true);
        throw new Error("BAD_REQUEST");
      }
      setInvalid(false);
      const review = await controller.checkout(parsed.data);
      setBasket([]);
      setPaymentValue(emptyPosPayment);
      setWarranties({});
      setSurname("");
      setGivenName("");
      setContact("");
      setCustomerId("");
      setCustomers([]);
      setRequestKey(key());
      setClientRequestId(crypto.randomUUID());
      setCompleted(true);
      return review;
    });
  return (
    <div className="native-pos-layout grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
      <div className="min-w-0">
        <form
          className="scanner-field flex flex-wrap gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(search, true);
          }}
        >
          <Input
            ref={scanInput}
            autoFocus
            aria-label={p("search")}
            value={search}
            maxLength={80}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
            className="flex-1 min-w-0"
          />
          <Button
            variant="outline"
            type="button"
            aria-label={p("search")}
            onClick={() => void lookup(search, false)}
            disabled={disabled}
          >
            <Search />
          </Button>
          <Button
            variant="outline"
            type="button"
            aria-label={p("camera")}
            onClick={() => setScanner(true)}
            disabled={disabled}
          >
            <Camera />
          </Button>
        </form>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              className="h-auto min-w-0 justify-between whitespace-normal text-start p-3"
              disabled={disabled || !item.amountMinor}
              onClick={() => add(item)}
            >
              <span className="min-w-0 break-words">
                {item.name}
                <small className="block">
                  <bdi>{item.barcode}</bdi> · {item.quantity}
                </small>
              </span>
              <bdi>{item.amountMinor ? formatMinor(item.amountMinor) : p("unpriced")}</bdi>
            </Button>
          ))}
        </div>
      </div>
      <div className="native-basket min-w-0">
        {basket.map((l) => (
          <div key={l.item.id} className="flex items-center gap-2 mb-3">
            <span className="flex-1 min-w-0 break-words">{l.item.name}</span>
            <Input
              type="number"
              aria-label={`${p("quantity")} ${l.item.barcode}`}
              className="w-20"
              value={l.quantity}
              min={1}
              max={l.item.kind === "phone" ? 1 : l.item.quantity}
              disabled={disabled}
              onChange={(e) =>
                setBasket((old) =>
                  old.map((b) =>
                    b.item.id === l.item.id ? { ...b, quantity: Number(e.target.value) } : b,
                  ),
                )
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={`${p("remove")} ${l.item.barcode}`}
              disabled={disabled}
              onClick={() => setBasket((old) => old.filter((b) => b.item.id !== l.item.id))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {(phones.length > 0 || Number(paymentValue.credit) > 0) && (
          <div className="grid gap-3 mb-4">
            <div className="flex gap-2">
              <Input
                aria-label={p("customer")}
                value={surname}
                onChange={(e) => {
                  setSurname(e.target.value);
                  setCustomerId("");
                }}
                disabled={disabled}
              />
              <Button
                variant="outline"
                aria-label={p("customer")}
                disabled={disabled}
                onClick={() => {
                  void controller
                    .customers(surname)
                    .then((r) => setCustomers(r.customers))
                    .catch(() => setCustomers([]));
                }}
              >
                <Search />
              </Button>
            </div>
            {customers.map((c) => (
              <Button
                variant="outline"
                key={c.id}
                disabled={disabled}
                onClick={() => {
                  setCustomerId(c.id);
                  setSurname(c.surname ?? c.name);
                  setGivenName(c.givenName ?? "");
                  setContact(c.contact ?? "");
                  setCustomers([]);
                }}
              >
                {c.name}
              </Button>
            ))}
            {customerId && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  setCustomerId("");
                  setSurname("");
                  setGivenName("");
                  setContact("");
                }}
              >
                {p("newBuyer")}
              </Button>
            )}
            <Field name={p("surname")}>
              <Input
                aria-label={p("surname")}
                value={surname}
                disabled={disabled || !!customerId}
                onChange={(e) => setSurname(e.target.value)}
              />
            </Field>
            <Field name={p("givenName")}>
              <Input
                aria-label={p("givenName")}
                value={givenName}
                disabled={disabled || !!customerId}
                onChange={(e) => setGivenName(e.target.value)}
              />
            </Field>
            <Field name={p("contact")}>
              <Input
                value={contact}
                disabled={disabled || !!customerId}
                onChange={(e) => setContact(e.target.value)}
              />
            </Field>
            {phones.map((l) => {
              const rule = warrantyRule(posSettings, {
                brand: l.item.brand ?? "",
                model: l.item.model ?? l.item.name,
                condition: l.item.condition ?? "",
              });
              return (
                <Field key={l.item.id} name={`${p("warranty")} · ${l.item.name}`}>
                  {!warranties[l.item.id] && rule && (
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        setWarranties((v) => ({ ...v, [l.item.id]: String(rule.months) }));
                        setProviders((v) => ({ ...v, [l.item.id]: rule.provider }));
                      }}
                    >
                      {x.confirm} · {rule.provider === "SHOP" ? x.shop : x.manufacturer} ·{" "}
                      {rule.months} {p("months")}
                    </Button>
                  )}
                  <select
                    aria-label={`${p("warranty")} ${l.item.barcode}`}
                    value={warranties[l.item.id] ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                      setWarranties((v) => ({ ...v, [l.item.id]: e.target.value }));
                      setProviders((v) => ({
                        ...v,
                        [l.item.id]: v[l.item.id] ?? rule?.provider ?? "SHOP",
                      }));
                    }}
                  >
                    <option value="">{p("choose")}</option>
                    <option value="NO">{p("no")}</option>
                    <option value="YES">
                      {p("yes")} — {p("choose")}
                    </option>
                    {[1, 3, 6, 12].map((m) => (
                      <option key={m} value={m}>
                        {p("yes")} · {m} {p("months")}
                      </option>
                    ))}
                  </select>
                  {warranties[l.item.id] && warranties[l.item.id] !== "NO" && (
                    <label>
                      {x.provider}
                      <select
                        aria-label={`${x.provider} ${l.item.barcode}`}
                        value={providers[l.item.id] ?? "SHOP"}
                        onChange={(e) =>
                          setProviders((v) => ({
                            ...v,
                            [l.item.id]: e.target.value as "SHOP" | "MANUFACTURER",
                          }))
                        }
                      >
                        <option value="SHOP">{x.shop}</option>
                        <option value="MANUFACTURER">{x.manufacturer}</option>
                      </select>
                    </label>
                  )}
                </Field>
              );
            })}
          </div>
        )}
        <PosPaymentFields
          value={paymentValue}
          onChange={setPaymentValue}
          limit={posSettings["pos.discountLimitDzd"]}
          disabled={disabled}
        />
        <Button
          disabled={disabled || !basket.length}
          variant="outline"
          onClick={() => {
            setParked((v) => [
              ...v,
              {
                id: key(),
                basket,
                payment: paymentValue,
                surname,
                givenName,
                contact,
                customerId,
                warranties,
                providers,
              },
            ]);
            setBasket([]);
            setPaymentValue(emptyPosPayment);
            setSurname("");
            setGivenName("");
            setContact("");
            setCustomerId("");
            setWarranties({});
            setProviders({});
            setRequestKey(key());
          }}
        >
          {t("pc.park")}
        </Button>
        {parked.map((v) => (
          <Button
            disabled={disabled || !!basket.length}
            variant="outline"
            key={v.id}
            onClick={() => {
              setBasket(v.basket);
              setPaymentValue(v.payment);
              setSurname(v.surname);
              setGivenName(v.givenName);
              setContact(v.contact);
              setCustomerId(v.customerId);
              setWarranties(v.warranties);
              setProviders(v.providers);
              setParked((rows) => rows.filter((r) => r.id !== v.id));
            }}
          >
            {t("pc.resume")} · {v.basket.length}
          </Button>
        ))}
        {parked.length > 0 && <p>{t("pc.noReserve")}</p>}
        {!shift && <p role="status">{p("open")}</p>}
        {invalid && <p role="alert">{p("invalid")}</p>}
        {completed && <SuccessCheck>{p("sold")}</SuccessCheck>}
        <div className="encaisser-bar">
          <Button
            className="checkout-button"
            disabled={disabled || !shift || !basket.length}
            onClick={() => void pay()}
          >
            {p("confirm")}
          </Button>
          <span className="encaisser-total">
            <span className="sr-only">{p("total")} </span>
            <bdi>{formatMinor(total)}</bdi>
          </span>
        </div>
      </div>
      {scanner && (
        <Scanner
          target="barcode"
          onClose={() => setScanner(false)}
          onAssign={(values) => {
            const value = values.barcode ?? values.imei1 ?? values.imei2 ?? values.serial;
            if (value) {
              setSearch(value);
              void lookup(value, true);
            }
          }}
        />
      )}
    </div>
  );
}

function NativeReceiving({
  controller,
  resources,
  owner,
  kind,
  disabled,
  action,
  revision,
  p,
}: {
  controller: DailyNativeController;
  resources: NativeDailyResources;
  owner: boolean;
  kind: "phone" | "accessory";
  disabled: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
  revision: number;
  p: P;
}) {
  const [catalog, setCatalog] = useState(resources.catalog);
  const [itemId, setItemId] = useState("");
  const [stock, setStock] = useState<Item[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [imei1, setImei1] = useState("");
  const [imei2, setImei2] = useState("");
  const [serial, setSerial] = useState("");
  const [barcode, setBarcode] = useState(() => `PH-${crypto.randomUUID()}`);
  const [condition, setCondition] = useState("NEW");
  const x = useIntakeText();
  const [settings, setSettings] = useState<AppSettings>(() => resolveSettings({}));
  const [mode, setMode] = useState<"single" | "box">("single");
  const [boxState, setBoxState] = useState<BoxState | "">("");
  const [remark, setRemark] = useState("");
  const [ean, setEan] = useState("");
  const [eanMiss, setEanMiss] = useState(false);
  const [batch, setBatch] = useState<ImeiBatch>({ target: 0, imeis: [] });
  const [boxCount, setBoxCount] = useState("");
  const [imeiInput, setImeiInput] = useState("");
  const [batchError, setBatchError] = useState<ImeiBatchError | "">("");
  const [category, setCategory] = useState("");
  const [threshold, setThreshold] = useState("");
  const [photoPending, setPhotoPending] = useState(false);
  const [color, setColor] = useState("");
  const [battery, setBattery] = useState("");
  const [reference, setReference] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [scanner, setScanner] = useState<
    "imei1" | "barcode" | "serial" | "box-imei" | "ean" | null
  >(null);
  const [label, setLabel] = useState<{ name: string; value: string } | null>(null);
  const [requestKey, setRequestKey] = useState(key);
  const [phoneId, setPhoneId] = useState(() => crypto.randomUUID());
  const [newProduct, setNewProduct] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState(() => `SKU-${crypto.randomUUID()}`);
  const [variant, setVariant] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [modelCondition, setModelCondition] = useState("NEW");
  const [price, setPrice] = useState("");
  const [createdId, setCreatedId] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await controller.resources();
      const found = await controller.search("");
      const sources = await controller.suppliers();
      const owned = await controller.settings();
      if (active) {
        setSettings(owned);
        setCatalog(r.catalog);
        setStock(found.items.filter((i) => i.kind === kind));
        setSuppliers(sources);
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [controller, kind, revision]);
  const selected = catalog.find((c) => c.id === itemId);
  const tracked =
    kind === "phone" &&
    !!selected &&
    isBoxTracked(
      settings["intake.boxTrackedModels"],
      selected.brand ?? selected.name.split(" ")[0] ?? "",
      selected.model ?? selected.name.split(" ").slice(1).join(" "),
    );
  const packaging = packagingFor(tracked, boxState);
  const knownImeis = new Set(stock.flatMap((i) => [i.imei1 ?? ""]).filter(Boolean));
  const thresholds = new Map(
    catalog
      .filter((c) => c.lowStockThreshold !== undefined)
      .map((c) => [c.id, Number(c.lowStockThreshold)]),
  );
  const addImei = () => {
    const r = addBatchImei(batch, imeiInput, knownImeis);
    setBatch(r.batch);
    setBatchError(r.error ?? "");
    if (!r.error) setImeiInput("");
  };
  const receiveBox = () =>
    action(async () => {
      if (!selected || (tracked && !boxState)) {
        setInvalid(true);
        throw new Error("BAD_REQUEST");
      }
      const command = batchReceiving({
        key: requestKey,
        store: controller.store,
        itemId: selected.id,
        batch,
        condition: selected.condition ?? "NEW",
        packaging,
        newId: () => crypto.randomUUID(),
      });
      const parsed = nativeReceiving.safeParse(command);
      if (!parsed.success) {
        setInvalid(true);
        throw new Error("BAD_REQUEST");
      }
      setInvalid(false);
      const result = await controller.receive(parsed.data);
      setLabel({ name: selected.name, value: parsed.data.phones[0]?.barcode ?? selected.barcode });
      setRequestKey(key());
      setBatch({ target: 0, imeis: [] });
      setBoxCount("");
      setEan("");
      return result;
    });
  const receive = () =>
    action(async () => {
      const product = catalog.find((c) => c.id === itemId);
      const parsed = nativeReceiving.safeParse({
        key: requestKey,
        store: controller.store,
        itemId,
        quantity: kind === "phone" ? 1 : Number(quantity),
        ...(supplierId ? { supplierId } : newSupplierName.trim() ? { newSupplierName } : {}),
        reference,
        phones:
          kind === "phone"
            ? [
                {
                  id: phoneId,
                  barcode,
                  ...(imei1 ? { imei1 } : {}),
                  ...(imei2 ? { imei2 } : {}),
                  ...(serial ? { serial } : {}),
                  attributes: {
                    condition,
                    packaging,
                    color,
                    ...(battery ? { battery } : {}),
                    ...(remark.trim() ? { remark: remark.trim() } : {}),
                  },
                },
              ]
            : [],
      });
      if (
        !parsed.success ||
        !product ||
        (kind === "phone" && (!color.trim() || !["NEW", "USED"].includes(condition))) ||
        (tracked && !boxState) ||
        remark.length > 200 ||
        (battery && (!/^\d+$/.test(battery) || Number(battery) > 100))
      ) {
        setInvalid(true);
        throw new Error("BAD_REQUEST");
      }
      setInvalid(false);
      const result = await controller.receive(parsed.data);
      setLabel({ name: product.name, value: kind === "phone" ? barcode : product.barcode });
      setRequestKey(key());
      setPhoneId(crypto.randomUUID());
      setBarcode(`PH-${crypto.randomUUID()}`);
      setImei1("");
      setImei2("");
      setSerial("");
      setReference("");
      setRemark("");
      setBoxState("");
      return result;
    });
  return (
    <div className="native-receiving grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <IntakeProgress
          current={
            !itemId
              ? 0
              : kind === "phone" &&
                  !(mode === "box"
                    ? batch.imeis.length === batch.target && batch.target > 0
                    : imei1)
                ? 1
                : 2
          }
          labels={[p("product"), kind === "phone" ? "IMEI" : p("quantity"), p("receive")]}
        />
        {kind === "phone" && (
          <div className="grid grid-cols-2 gap-2 mb-4" role="group" aria-label={x("section")}>
            {(["single", "box"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="lg"
                aria-pressed={mode === m}
                variant={mode === m ? "default" : "outline"}
                disabled={disabled}
                onClick={() => setMode(m)}
              >
                {x(m === "single" ? "modeSingle" : "modeBox")}
              </Button>
            ))}
          </div>
        )}
        {kind === "phone" && mode === "box" ? (
          <form
            className="grid gap-3"
            aria-label={x("modeBox")}
            onSubmit={(e) => {
              e.preventDefault();
              void receiveBox();
            }}
          >
            <Field name={x("ean")}>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  value={ean}
                  disabled={disabled}
                  onChange={(e) => setEan(e.target.value.trim())}
                />
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={disabled || !ean}
                  onClick={() => {
                    const hit = catalog.find((c) => c.kind === "phone" && c.ean === ean);
                    setEanMiss(!hit);
                    if (hit) setItemId(hit.id);
                    else setNewProduct(true);
                  }}
                >
                  {x("findEan")}
                </Button>
              </div>
            </Field>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={disabled}
              onClick={() => setScanner("ean")}
            >
              <Camera />
              {p("camera")}
            </Button>
            {eanMiss && <p role="alert">{x("eanUnknown")}</p>}
            <Field name={p("product")}>
              <select
                value={itemId}
                required
                disabled={disabled}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">{p("choose")}</option>
                {catalog
                  .filter((c) => c.kind === "phone")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.variant ?? c.sku}
                    </option>
                  ))}
              </select>
            </Field>
            <Field name={x("count")}>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={boxCount}
                  disabled={disabled}
                  onChange={(e) => setBoxCount(e.target.value)}
                />
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={disabled || !/^\d+$/.test(boxCount) || Number(boxCount) < 1}
                  onClick={() => {
                    const n = Math.min(100, Number(boxCount));
                    setBatch((b) =>
                      b.target === 0 || n > b.target
                        ? { target: n, imeis: b.imeis.slice(0, n) }
                        : lowerBatchTarget(b, n),
                    );
                    setBatchError("");
                  }}
                >
                  {batch.target ? x("lowerN") : x("add")}
                </Button>
              </div>
            </Field>
            {tracked && (
              <BoxStatePicker value={boxState} onChange={setBoxState} disabled={disabled} />
            )}
            {batch.target > 0 && (
              <>
                <Field name={x("scanImei")}>
                  <div className="flex gap-2">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      autoFocus
                      value={imeiInput}
                      disabled={disabled || batch.imeis.length >= batch.target}
                      onChange={(e) => setImeiInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addImei();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      disabled={disabled || batch.imeis.length >= batch.target}
                      onClick={addImei}
                    >
                      {x("add")}
                    </Button>
                  </div>
                </Field>
                <p role="status" className="text-2xl font-semibold" data-testid="batch-counter">
                  {batch.imeis.length} / {batch.target}
                </p>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={disabled || batch.imeis.length >= batch.target}
                  onClick={() => setScanner("box-imei")}
                >
                  <Camera />
                  {p("camera")}
                </Button>
                {batchError && <p role="alert">{x(batchError)}</p>}
                <ol className="text-sm" dir="ltr">
                  {batch.imeis.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ol>
              </>
            )}
            {invalid && <p role="alert">{p("invalid")}</p>}
            <Button
              type="submit"
              size="lg"
              disabled={disabled || batch.target < 1 || batch.imeis.length !== batch.target}
            >
              {x("receiveBox")}
            </Button>
          </form>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void receive();
            }}
          >
            <Field name={p("product")}>
              <select
                value={itemId}
                required
                disabled={disabled}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">{p("choose")}</option>
                {catalog
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.variant ?? c.sku}
                    </option>
                  ))}
              </select>
            </Field>
            {kind === "accessory" && (
              <Field name={p("quantity")}>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={quantity}
                  disabled={disabled}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
            )}
            {kind === "phone" && (
              <>
                <Field name="IMEI 1">
                  <Input
                    value={imei1}
                    dir="ltr"
                    disabled={disabled}
                    onChange={(e) => setImei1(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setScanner("imei1")}
                >
                  <Camera />
                  {p("camera")}
                </Button>
                <Field name="IMEI 2">
                  <Input
                    value={imei2}
                    dir="ltr"
                    disabled={disabled}
                    onChange={(e) => setImei2(e.target.value)}
                  />
                </Field>
                <Field name="Serial">
                  <Input
                    value={serial}
                    dir="ltr"
                    disabled={disabled}
                    onChange={(e) => setSerial(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setScanner("serial")}
                >
                  <Camera />
                  {p("camera")} · Serial
                </Button>
                <Field name="Code128">
                  <Input
                    value={barcode}
                    dir="ltr"
                    required
                    disabled={disabled}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </Field>
                <Field name={p("condition")}>
                  <select
                    value={condition}
                    disabled={disabled}
                    onChange={(e) => setCondition(e.target.value)}
                  >
                    <option value="NEW">NEW</option>
                    <option value="USED">USED</option>
                  </select>
                </Field>
                {tracked && (
                  <div className="sm:col-span-2">
                    <BoxStatePicker value={boxState} onChange={setBoxState} disabled={disabled} />
                  </div>
                )}
                <Field name={x("remark")}>
                  <Input
                    value={remark}
                    maxLength={200}
                    disabled={disabled}
                    onChange={(e) => setRemark(e.target.value)}
                  />
                </Field>
                <VerifyButton
                  template={settings["intake.checkUrlTemplate"]}
                  serial={serial}
                  imei={imei1}
                />
                <Field name={p("color")}>
                  <Input
                    required
                    value={color}
                    disabled={disabled}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </Field>
                <Field name={p("battery")}>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={battery}
                    disabled={disabled}
                    onChange={(e) => setBattery(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field name={p("supplier")}>
              <select
                disabled={disabled}
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setNewSupplierName("");
                }}
              >
                <option value="">{p("unknown")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {!supplierId && (
              <Field name={p("newSupplier")}>
                <Input
                  value={newSupplierName}
                  disabled={disabled}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                />
              </Field>
            )}
            <Field name={p("reference")}>
              <Input
                value={reference}
                disabled={disabled}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            {invalid && <p role="alert">{p("invalid")}</p>}
            <Button type="submit" disabled={disabled}>
              {p("receive")}
            </Button>
          </form>
        )}
        {/* Inline model creation + store sale price: SUPER_ADMIN, MANAGER and SELLER of this store (server enforces). Never cost. */}
        {
          <>
            <Button
              className="mt-4"
              size="lg"
              variant="outline"
              disabled={disabled}
              onClick={() => setNewProduct((v) => !v)}
            >
              {p(kind === "phone" ? "newModel" : "newSku")}
            </Button>
            {newProduct && (
              <form
                className="grid gap-3 mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    if (!createdId) {
                      if (kind === "phone") {
                        const modelKey = phoneModelSku(brand, model, storage, modelCondition);
                        const existing = catalog.find(
                          (c) => c.kind === "phone" && c.sku === modelKey,
                        );
                        if (existing) {
                          setCreatedId(existing.id);
                          setItemId(existing.id);
                          setCondition(modelCondition);
                          return;
                        }
                        const id = crypto.randomUUID();
                        await controller.catalogCommand("catalog.save", key(), {
                          store: controller.store,
                          id,
                          kind,
                          sku: modelKey,
                          name: `${brand.trim()} ${model.trim()}`,
                          attributes: {
                            brand: brand.trim(),
                            model: model.trim(),
                            storage: storage.trim(),
                            condition: modelCondition,
                            variant: `${storage.trim()} · ${modelCondition}`,
                            ...(mode === "box" && ean ? { ean } : {}),
                          },
                        });
                        setCreatedId(id);
                        setItemId(id);
                        setCondition(modelCondition);
                        return;
                      }
                      const id = crypto.randomUUID();
                      await controller.catalogCommand("catalog.save", key(), {
                        store: controller.store,
                        id,
                        kind,
                        sku,
                        name,
                        attributes: {
                          barcode: `PH-${id}`,
                          variant,
                          ...(category ? { category } : {}),
                          ...(/^\d+$/.test(threshold) ? { lowStockThreshold: threshold } : {}),
                          // Real upload comes with private storage later: flag only.
                          ...(photoPending ? { photoPending: "1" } : {}),
                        },
                      });
                      setCreatedId(id);
                      setItemId(id);
                    }
                  });
                }}
              >
                {kind === "phone" && (
                  <>
                    <Field name={p("brand")}>
                      <Input
                        required
                        value={brand}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setBrand(e.target.value)}
                      />
                    </Field>
                    <Field name={p("model")}>
                      <Input
                        required
                        value={model}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    </Field>
                    <Field name={p("storage")}>
                      <Input
                        required
                        value={storage}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setStorage(e.target.value)}
                      />
                    </Field>
                    <div
                      className="grid grid-cols-2 gap-2"
                      role="group"
                      aria-label={p("condition")}
                    >
                      {(["NEW", "USED"] as const).map((c) => (
                        <Button
                          key={c}
                          type="button"
                          size="lg"
                          aria-pressed={modelCondition === c}
                          variant={modelCondition === c ? "default" : "outline"}
                          disabled={disabled || !!createdId}
                          onClick={() => setModelCondition(c)}
                        >
                          {p(c === "NEW" ? "conditionNew" : "conditionUsed")}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
                {kind === "accessory" && (
                  <>
                    <Field name={p("name")}>
                      <Input
                        required
                        value={name}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field name={p("sku")}>
                      <Input
                        required
                        value={sku}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setSku(e.target.value)}
                      />
                    </Field>
                    <Field name={p("variant")}>
                      <Input
                        value={variant}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setVariant(e.target.value)}
                      />
                    </Field>
                    <Field name={x("category")}>
                      <select
                        value={category}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">{p("choose")}</option>
                        {settings["intake.accessoryCategories"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field name={x("threshold")}>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={threshold}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setThreshold(e.target.value)}
                      />
                    </Field>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={photoPending}
                        disabled={disabled || !!createdId}
                        onChange={(e) => setPhotoPending(e.target.checked)}
                      />
                      {x("photoPending")}
                    </label>
                  </>
                )}
                <Button size="lg" disabled={disabled || !!createdId} type="submit">
                  {p(kind === "phone" ? "newModel" : "newSku")}
                </Button>
                {createdId && (
                  <>
                    <Field name={p(kind === "phone" ? "salePrice" : "price")}>
                      <Input
                        value={price}
                        disabled={disabled}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </Field>
                    <Button
                      type="button"
                      size="lg"
                      disabled={disabled}
                      onClick={() => {
                        void action(async () => {
                          const result = await controller.catalogCommand("price.set", key(), {
                            store: controller.store,
                            itemId: createdId,
                            amount: price,
                          });
                          setNewProduct(false);
                          setCreatedId("");
                          setName("");
                          setVariant("");
                          setBrand("");
                          setModel("");
                          setStorage("");
                          setSku(`SKU-${crypto.randomUUID()}`);
                          setCategory("");
                          setThreshold("");
                          setPhotoPending(false);
                          setEanMiss(false);
                          return result;
                        });
                      }}
                    >
                      {p(kind === "phone" ? "salePrice" : "price")}
                    </Button>
                  </>
                )}
              </form>
            )}
          </>
        }
      </div>
      <div className="min-w-0">
        <StockCount native store={controller.store} />
        <h2 className="font-semibold mb-3">{p("inventory")}</h2>
        {stock.map((i) => (
          <div className="flex gap-2 items-center border-b border-border py-3" key={i.id}>
            <span className="flex-1 min-w-0 break-words">
              {i.name} · {i.quantity}
              {kind === "accessory" && lowStock(i.quantity, thresholds.get(i.id)) && (
                <strong role="status" className="block text-destructive">
                  {x("lowStock")}
                </strong>
              )}
              <small className="block">
                <bdi>{i.imei1 ?? i.serial ?? i.barcode}</bdi>
              </small>
            </span>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => setLabel({ name: i.name, value: i.barcode })}
            >
              Code128
            </Button>
          </div>
        ))}
        {label && (
          <BarcodeLabel
            value={label.value}
            name={label.name}
            store={controller.store}
            sizeMm={settings["labels.sizeMm"]}
          />
        )}
      </div>
      {scanner && (
        <Scanner
          target={scanner === "ean" || scanner === "box-imei" ? "barcode" : scanner}
          onClose={() => setScanner(null)}
          onAssign={(values) => {
            if (scanner === "ean") {
              setEan(values.barcode ?? "");
              return;
            }
            if (scanner === "box-imei") {
              const r = addBatchImei(batch, values.imei1 ?? values.barcode ?? "", knownImeis);
              setBatch(r.batch);
              setBatchError(r.error ?? "");
              return;
            }
            if (values.imei1) setImei1(values.imei1);
            if (values.imei2) setImei2(values.imei2);
            if (values.serial) setSerial(values.serial);
            if (values.barcode) setBarcode(values.barcode);
          }}
        />
      )}
    </div>
  );
}

function NativeCash({
  controller,
  resources,
  owner,
  disabled,
  action,
  revision,
  p,
}: {
  controller: DailyNativeController;
  resources: NativeDailyResources;
  owner: boolean;
  disabled: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
  revision: number;
  p: P;
}) {
  const [cash, setCash] = useState<NativeCashLedgerResult | null>(null);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<"NO_ISSUE" | "FLAGGED">("NO_ISSUE");
  const [requestKey, setRequestKey] = useState(key);
  const [shiftId, setShiftId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    void controller
      .cash()
      .then((r) => {
        if (active) setCash(r);
      })
      .catch(() => {
        if (active) setCash(null);
      });
    return () => {
      active = false;
    };
  }, [controller, revision]);
  const open = cash?.shifts.find((s) => s.state === "OPEN");
  const drawer = resources.drawers[0];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {open && (
        <NativeCashMovement
          store={controller.store}
          shiftId={open.id}
          onReadback={async () => {
            setCash(await controller.cash());
          }}
        />
      )}
      <div>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const result = open
                ? await controller.closeDrawer(requestKey, {
                    store: controller.store,
                    shiftId: open.id,
                    counted,
                  })
                : await controller.openDrawer(requestKey, {
                    store: controller.store,
                    id: shiftId,
                    drawerId: drawer?.id ?? "",
                    opening,
                  });
              setRequestKey(key());
              setShiftId(crypto.randomUUID());
              setCounted("");
              setOpening("");
              return result;
            });
          }}
        >
          <h2 className="font-semibold">
            {p("drawer")} · <bdi>{drawer?.id ?? "—"}</bdi>
          </h2>
          <Field name={p(open ? "counted" : "opening")}>
            <Input
              required
              value={open ? counted : opening}
              disabled={disabled}
              onChange={(e) => (open ? setCounted(e.target.value) : setOpening(e.target.value))}
            />
          </Field>
          <Button disabled={disabled || !drawer || !cash} type="submit">
            {p(open ? "close" : "open")}
          </Button>
        </form>
        <div className="mt-6">
          {cash?.movements.map((m) => (
            <p key={m.id} className="border-b border-border py-2">
              <bdi>{m.sellerId}</bdi> · {m.reason} · <bdi>{formatMinor(m.amountMinor)}</bdi>
            </p>
          ))}
        </div>
      </div>
      <div>
        {cash?.shifts.map((s) => (
          <div className="border-b border-border py-4" key={s.id}>
            <h3>
              <bdi>{s.id}</bdi> · {p(s.state === "OPEN" ? "opened" : "closed")}
            </h3>
            <p>
              {p("seller")} · <bdi>{s.sellerId}</bdi>
            </p>
            {s.state === "CLOSED" && (
              <>
                <p>
                  {p("counted")} · {formatMinor(s.countedMinor ?? 0)}
                </p>
                <p>
                  {p("total")} · {formatMinor(s.expectedMinor ?? 0)}
                </p>
                <p>
                  {s.reviewOutcome
                    ? p(s.reviewOutcome === "FLAGGED" ? "flagged" : "good")
                    : s.reviewState}
                </p>
                {owner && !s.reviewOutcome && (
                  <form
                    className="grid gap-2 mt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(() =>
                        controller
                          .reviewClose(requestKey, {
                            store: controller.store,
                            shiftId: s.id,
                            outcome,
                            note,
                          })
                          .then((r) => {
                            setRequestKey(key());
                            setNote("");
                            return r;
                          }),
                      );
                    }}
                  >
                    <Field name={p("review")}>
                      <select
                        value={outcome}
                        disabled={disabled}
                        onChange={(e) =>
                          setOutcome(e.target.value === "FLAGGED" ? "FLAGGED" : "NO_ISSUE")
                        }
                      >
                        <option value="NO_ISSUE">{p("good")}</option>
                        <option value="FLAGGED">{p("flagged")}</option>
                      </select>
                    </Field>
                    <Field name={p("note")}>
                      <Input
                        required
                        value={note}
                        disabled={disabled}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Field>
                    <Button type="submit" disabled={disabled}>
                      {p("review")}
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NativeSales({
  controller,
  disabled,
  revision,
  p,
  onReceipt,
}: {
  controller: DailyNativeController;
  disabled: boolean;
  revision: number;
  p: P;
  onReceipt: (r: NativeReceipt) => void;
}) {
  const { lang, t } = useErp();
  const [voidError, setVoidError] = useState("");
  const transport = useNativeTransport();
  const [canVoid, setCanVoid] = useState(false);
  useEffect(() => {
    void transport
      .status()
      .then((status) =>
        setCanVoid(
          status.memberships?.some((m) =>
            permits(m.role, m.store, controller.store, "sale.void"),
          ) === true,
        ),
      );
  }, [transport, controller]);
  const [sales, setSales] = useState<NativeSalesHistoryResult | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [imei, setImei] = useState("");
  const [seller, setSeller] = useState("");
  const [tender, setTender] = useState("");
  const [offset, setOffset] = useState(0);
  const load = (page = 0) =>
    controller
      .history({
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(imei ? { imei } : {}),
        ...(seller ? { sellerId: seller } : {}),
        ...(tender === "Cash" || tender === "Bank" ? { tender } : {}),
        offset: page,
        limit: 25,
      })
      .then((r) => {
        setSales(r);
        setOffset(page);
      })
      .catch(() => setSales(null));
  useEffect(() => {
    void controller
      .history({ limit: 25 })
      .then(setSales)
      .catch(() => setSales(null));
  }, [controller, revision]);
  return (
    <div>
      <form
        className="grid gap-3 sm:grid-cols-3 mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Field name={p("from")}>
          <Input
            type="date"
            value={from}
            disabled={disabled}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field name={p("to")}>
          <Input
            type="date"
            value={to}
            disabled={disabled}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field name="IMEI">
          <Input value={imei} disabled={disabled} onChange={(e) => setImei(e.target.value)} />
        </Field>
        <Field name={p("seller")}>
          <Input value={seller} disabled={disabled} onChange={(e) => setSeller(e.target.value)} />
        </Field>
        <Field name={p("cash")}>
          <select value={tender} disabled={disabled} onChange={(e) => setTender(e.target.value)}>
            <option value="">{p("all")}</option>
            <option value="Cash">{p("cash")}</option>
            <option value="Bank">{p("bank")}</option>
          </select>
        </Field>
        <Button disabled={disabled} type="submit">
          {p("search")}
        </Button>
      </form>
      {sales?.sales.map((s) => (
        <div className="border-b border-border py-4 flex flex-wrap gap-3 items-center" key={s.id}>
          <div className="flex-1 min-w-0">
            <strong>{s.customerName ?? "WALK_IN"}</strong>
            <p>
              {new Intl.DateTimeFormat(lang, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Algiers",
              }).format(s.soldAt)}{" "}
              · <bdi>{s.sellerId}</bdi>
            </p>
            {s.lines.map((l, i) => (
              <p key={i}>
                {l.name} × {l.quantity} · <bdi>{l.imei1 ?? l.serial}</bdi>
              </p>
            ))}
          </div>
          <span>
            {s.tender === "Split" ? t("pc.split") : p(s.tender === "Cash" ? "cash" : "bank")} ·{" "}
            {formatMinor(s.totalMinor)}
          </span>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              void controller
                .specimen(s.id)
                .then(onReceipt)
                .catch(() => {});
            }}
          >
            {p("print")}
          </Button>
          {canVoid && !s.voided && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const reason = window.prompt(t("pc.reason"));
                if (!reason) return;
                void controller
                  .voidSale(key(), s.id, reason)
                  .then(() => load())
                  .catch((e) =>
                    setVoidError(
                      e?.code === "USE_SAV"
                        ? t("pc.useSav")
                        : nativeDailyError(lang, e?.code ?? "REJECTED"),
                    ),
                  );
              }}
            >
              {t("pc.void")}
            </Button>
          )}
          {!!s.voided && <span>{t("pc.voided")}</span>}
        </div>
      ))}
      {voidError && <p role="alert">{voidError}</p>}
      <div className="flex gap-2 justify-end mt-4">
        <Button
          variant="outline"
          disabled={disabled || offset === 0}
          onClick={() => void load(Math.max(0, offset - 25))}
        >
          {p("previous")}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || !sales?.hasMore}
          onClick={() => void load(offset + 25)}
        >
          {p("next")}
        </Button>
      </div>
    </div>
  );
}
