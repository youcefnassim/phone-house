import { PosPaymentFields, emptyPosPayment, type PosPaymentValue } from "./pos-payment";
import { cents, settleSale } from "@/domain/pos-settlement";
import { testSettings } from "@/data/test-workspace";
import { displayText } from "@/locales/display";
import { transfersListing } from "@/data/test-workflows";
import { localizeMessage } from "@/locales/messages";
import { useState, useRef, useEffect } from "react";
import {
  Search,
  ScanLine,
  Smartphone,
  Headphones,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  LockKeyhole,
  UserRound,
  ArrowRightLeft,
  Wallet,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoAreas } from "@/data/demo";
import {
  useTestWorkspace,
  recordTestSale,
  setTestSeller,
  sellersFor,
  openShiftFor,
  reviewActor,
  WALK_IN,
} from "@/data/test-workspace";
import { useSession } from "@/data/session-store";
import { useErp } from "./context";
import {
  addToCart,
  cartTotal,
  formatMoney,
  storeLabel,
  type CartLine,
  type StockItem,
  type StoreId,
} from "@/domain/erp";
import { OperationDialog, OperationDraftForm } from "./operation-ui";
import {
  paymentDraftSchema,
  validatePaymentDraft,
  paymentChange,
  type PaymentDraft,
} from "@/domain/operations";
import { ReceiptPreview } from "./receipt-preview";
import { testBuyerSchema } from "@/domain/test-documents";
import { TestSaleDocuments } from "./test-documents";
import { PosBuyer, PhoneWarrantyChoices } from "./pos-buyer";
import { Scanner } from "./scanner";
import { projectSnapshot } from "@/data/business-demo";
import { findBuyer } from "@/data/pos-customers";
import { warrantyChoiceSchema, type WarrantyChoice } from "@/domain/sales-review";
import { SuccessCheck } from "./visual-feedback";

export function Pos() {
  const { scope, t, lang } = useErp();
  const ws = useTestWorkspace();
  const session = useSession();
  const [store, setStore] = useState<StoreId>("M01");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [paymentValue, setPaymentValue] = useState<PosPaymentValue>(emptyPosPayment);
  const [parked, setParked] = useState<
    { id: string; cart: CartLine[]; value: PosPaymentValue; store: StoreId }[]
  >([]);
  const [tender, setTender] = useState("Cash");
  const [customer, setCustomer] = useState<string>(WALK_IN);
  const input = useRef<HTMLInputElement>(null);
  const selectedStore = scope === "ALL" ? store : scope;
  const [scan, setScan] = useState(false);
  const [warranties, setWarranties] = useState<WarrantyChoice[]>([]);
  const posting = useRef(false);
  const phoneCart = cart.filter((l) => l.item.kind === "phone");
  const message = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    return m === "Select the existing customer."
      ? t("sale.errorDuplicate")
      : m === "Select a customer in this store."
        ? t("sale.errorStore")
        : m === "Select a customer for a phone sale."
          ? t("sale.errorBuyer")
          : m.includes("warranty")
            ? t("sale.errorDates")
            : localizeMessage(lang, m);
  };
  const [documentSale, setDocumentSale] = useState("");
  const [surname, setSurname] = useState("");
  const [givenName, setGivenName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const seller = ws.sellers[selectedStore];
  const [nextSeller, setNextSeller] = useState("");
  const [handoffReason, setHandoffReason] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [notice, setNotice] = useState("");
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setNextSeller("");
    setPayment(null);
    setSaved(false);
    setNotice("");
  }, [selectedStore]);
  useEffect(() => {
    setPayment(null);
    setSaved(false);
  }, [cart, customer, tender, seller]);
  useEffect(() => {
    setCart([]);
    setCustomer(WALK_IN);
    setCheckout(false);
    setError("");
    setQuery("");
  }, [selectedStore]);
  const customerOptions = projectSnapshot(selectedStore).customers;
  const customerName =
    customer === WALK_IN
      ? t("pos.walkIn")
      : displayText(lang, customerOptions.find((c) => c.id === customer)?.name ?? customer);
  const [saleKey, setSaleKey] = useState("");
  const [checkoutShiftId, setCheckoutShiftId] = useState<string | undefined>();
  const discountLimit = testSettings(ws)["pos.discountLimitDzd"];
  const shiftOpen = !!openShiftFor(selectedStore, ws);
  const lastSale = ws.sales.find((x) => x.store === selectedStore);
  const available = [
    ...ws.phones,
    ...ws.accessories
      .filter((a) => a.amount !== undefined)
      .map((a) => ({ ...a, amount: a.amount ?? "0" })),
  ].filter(
    (item) => ["Available", "Low stock"].includes(item.status) && item.store === selectedStore,
  );
  const products = available.filter(
    (item) =>
      (type === "all" || (type === "phones" ? item.kind === "phone" : item.kind === "accessory")) &&
      [
        item.name,
        item.detail,
        item.code,
        item.kind === "phone"
          ? `${item.imei} ${item.imei2 ?? ""} ${item.draft?.serial ?? ""} ${item.category ?? ""}`
          : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const add = (item: StockItem) => {
    try {
      const next = addToCart(cart, item);
      setCart(next);
      setPayment(null);
      setSaved(false);
      setError("");
    } catch (e) {
      setError(localizeMessage(lang, e instanceof Error ? e.message : t("pos.cannotAdd")));
    }
  };
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("pos.eyebrow")}</div>
          <h1>
            {t("pos.title")}
            <span className="heading-dot">.</span>
          </h1>
          <details className="retail-details heading-details">
            <summary>{t("retail.details")}</summary>
            <p>{t("pos.subtitle")}</p>
          </details>
        </div>
        <Button variant="outline" onClick={() => setHandoff(true)}>
          <ArrowRightLeft />
          {t("pos.sellerHandoff")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          disabled={!cart.length}
          onClick={() => {
            setParked((p) => [
              ...p,
              { id: crypto.randomUUID(), cart, value: paymentValue, store: selectedStore },
            ]);
            setCart([]);
            setPaymentValue(emptyPosPayment);
            setCheckout(false);
          }}
        >
          {t("pc.park")}
        </Button>
        {parked
          .filter((p) => p.store === selectedStore)
          .map((p) => (
            <Button
              key={p.id}
              disabled={!!cart.length}
              variant="outline"
              onClick={() => {
                setCart(p.cart);
                setPaymentValue(p.value);
                setParked((rows) => rows.filter((r) => r.id !== p.id));
              }}
            >
              {t("pc.resume")} · {p.cart.length}
            </Button>
          ))}
      </div>
      {parked.length > 0 && <p className="field-hint">{t("pc.noReserve")}</p>}
      <div className="pos-store-controls">
        <label>
          {t("pos.basketStore")}{" "}
          <select
            aria-label={t("pos.basketStore")}
            value={selectedStore}
            disabled={scope !== "ALL" || cart.length > 0}
            onChange={(e) => setStore(e.target.value as StoreId)}
          >
            {(["M01", "M02"] as StoreId[]).map((value) => (
              <option value={value} key={value}>
                {storeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        {cart.length > 0 && <span className="field-hint">{t("pos.storeLocked")}</span>}
      </div>
      <div className="pos-shift" data-shift-open={shiftOpen}>
        <span>
          <span className="tiny-dot" />
          {shiftOpen ? localizeMessage(lang, "Open") : t("tw.cash.noShift")} ·{" "}
          {storeLabel(selectedStore)}
        </span>
        <span>
          <UserRound size={15} />
          {displayText(lang, seller)}{" "}
        </span>
      </div>
      <details className="retail-details">
        <summary>{t("retail.details")}</summary>
        <p className="field-hint" data-testid="shift-state">
          {shiftOpen ? t("tw.shiftOpen") : t("tw.shiftClosed")}
        </p>
        {lastSale && (
          <p className="field-hint" data-testid="last-sale">
            {t("tw.lastSale", { id: lastSale.id, total: lastSale.total })}
          </p>
        )}
      </details>
      {notice &&
        (saved ? (
          <SuccessCheck>{notice}</SuccessCheck>
        ) : (
          <p role="status" className="session-notice">
            {notice}
          </p>
        ))}
      <div className="pos-layout">
        <section className="pos-products">
          <form
            className="scanner-field"
            onSubmit={(e) => {
              e.preventDefault();
              const item = available.find(
                (item) =>
                  item.code === query.trim() ||
                  (item.kind === "phone" &&
                    (item.imei === query.trim() ||
                      item.imei2 === query.trim() ||
                      item.draft?.serial === query.trim())),
              );
              if (item) {
                add(item);
                setQuery("");
              } else setError(t("pos.noMatch"));
              input.current?.focus();
            }}
          >
            <ScanLine />
            <input
              ref={input}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pos.scanPlaceholder")}
              aria-label={t("pos.scanLabel")}
            />
            <Button variant="outline" type="submit">
              {t("pos.add")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setScan(true)}>
              <ScanLine />
              {t("scan.title")}
            </Button>
          </form>
          {scan && (
            <Scanner
              target="barcode"
              onClose={() => setScan(false)}
              onAssign={(values) => {
                const code = values.barcode ?? values.imei1 ?? values.serial ?? "";
                const item = available.find(
                  (i) =>
                    i.code === code ||
                    (i.kind === "phone" &&
                      (i.imei === code || i.imei2 === code || i.draft?.serial === code)),
                );
                if (item) {
                  add(item);
                  setQuery("");
                } else {
                  setQuery(code);
                  setError(t("pos.noMatch"));
                }
              }}
            />
          )}
          <div className="product-tabs">
            {(
              [
                ["all", t("pos.allProducts")],
                ["phones", t("pos.phones")],
                ["accessories", t("pos.accessories")],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant="ghost"
                className={value === type ? "tab-active" : ""}
                onClick={() => setType(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="product-grid">
            {products.map((item) => (
              <Button
                variant="outline"
                className="pos-product"
                key={item.id}
                onClick={() => add(item)}
              >
                <span className={`product-icon ${item.kind === "phone" ? "blue" : "teal"}`}>
                  {item.kind === "phone" ? <Smartphone size={32} /> : <Headphones size={32} />}
                </span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
                {item.kind === "phone" && (
                  <span className="serialized-id ltr">
                    IMEI {item.imei} · {localizeMessage(lang, item.condition)}
                  </span>
                )}
                <span className="ltr">{formatMoney(item.amount ?? "0")}</span>
                <span className="product-stock">
                  {item.kind === "phone"
                    ? t("pos.serializedUnit")
                    : `${item.quantity} ${t("pos.syntheticUnits")}`}{" "}
                  · {item.store}
                  <Plus size={15} />
                </span>
              </Button>
            ))}
          </div>
          {!products.length && (
            <div className="empty-state">
              <Search />
              <h3>{t("pos.noProducts")}</h3>
            </div>
          )}
        </section>
        <section className="basket">
          <div className="section-header">
            <h2>
              {t("pos.currentBasket")} <span className="count-chip">{cart.length}</span>
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("pos.clearBasket")}
              onClick={() => {
                setCart([]);
                setError("");
              }}
            >
              <Trash2 />
            </Button>
          </div>

          <div className="basket-lines">
            {!cart.length ? (
              <div className="empty-basket">
                <ShoppingBag size={38} />
                <h3>{t("pos.emptyBasket")}</h3>
                <p>{t("pos.emptyBasketSub")}</p>
              </div>
            ) : (
              cart.map((line) => (
                <div className="basket-line" key={line.item.id}>
                  <div>
                    <strong>{line.item.name}</strong>
                    <small className="ltr">
                      {line.item.kind === "phone" ? `IMEI ${line.item.imei}` : line.item.detail}
                    </small>
                    <b className="ltr">{formatMoney(cartTotal([line]))}</b>
                    {transfersListing(line.item.id).length > 0 && (
                      <p className="pos-transfer-hint" role="note">
                        {t("fl.posOnTransfer", {
                          ids: transfersListing(line.item.id)
                            .map((x) => x.id)
                            .join(", "),
                        })}
                      </p>
                    )}
                  </div>
                  <div className="quantity-stepper">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("pos.removeOne", { name: line.item.name })}
                      onClick={() =>
                        setCart((prev) =>
                          prev.flatMap((item) =>
                            item.item.id === line.item.id
                              ? item.quantity > 1
                                ? [{ ...item, quantity: item.quantity - 1 }]
                                : []
                              : [item],
                          ),
                        )
                      }
                    >
                      <Minus />
                    </Button>
                    <span>{line.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={line.item.kind === "phone"}
                      aria-label={t("pos.addOne", { name: line.item.name })}
                      onClick={() => add(line.item)}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <div className="basket-summary">
            <div>
              <span>{t("pos.subtotal")}</span>
              <span className="ltr">{formatMoney(cartTotal(cart))}</span>
            </div>
            <div className="basket-total">
              <strong>{t("pos.total")}</strong>
              <strong>{formatMoney(cartTotal(cart))}</strong>
            </div>
            <div className="encaisser-bar">
              <Button
                className="review-button"
                disabled={!cart.length}
                onClick={() => {
                  posting.current = false;
                  setNotice("");
                  setWarranties([]);
                  setCustomer(WALK_IN);
                  setSurname("");
                  setGivenName("");
                  setBuyerContact("");
                  setPayment(null);
                  setCheckout(true);
                  setCheckoutShiftId(openShiftFor(selectedStore)?.id);
                  setSaleKey(`K-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
                }}
              >
                {t("pos.reviewBasket")}
              </Button>
              <span className="encaisser-total" aria-hidden="true">
                <bdi>{formatMoney(cartTotal(cart))}</bdi>
              </span>
            </div>
          </div>
        </section>
      </div>
      <OperationDialog
        open={checkout}
        onClose={() => {
          setCheckout(false);
          input.current?.focus();
        }}
        title={t("pos.basketReview")}
      >
        {(phoneCart.length > 0 || Number(paymentValue.credit) > 0) && (
          <PosBuyer
            store={selectedStore}
            customer={customer}
            required
            onDraft={(b) => {
              setCustomer(WALK_IN);
              setSurname(b.surname);
              setGivenName(b.givenName);
              setBuyerContact(b.contact);
            }}
            onSelect={(id, buyer) => {
              setCustomer(id);
              setSurname(buyer?.surname ?? "");
              setGivenName(buyer?.givenName ?? "");
              setBuyerContact(buyer?.contact ?? "");
            }}
          />
        )}
        <PhoneWarrantyChoices
          phones={phoneCart.map((l) => {
            const phone = ws.phones.find((p) => p.id === l.item.id);
            return {
              id: l.item.id,
              name: l.item.name,
              brand: phone?.draft?.brand ?? phone?.category,
              model: phone?.draft?.name ?? phone?.name,
              condition: phone?.draft?.condition ?? phone?.condition,
            };
          })}
          choices={warranties}
          onChange={setWarranties}
        />
        {notice && (
          <p role="alert" className="error-text">
            {notice}
          </p>
        )}
        {payment ? (
          <>
            <ReceiptPreview
              cart={cart}
              store={selectedStore}
              customer={customerName}
              tender={payment.tender}
              seller={seller}
            />
            <dl className="detail-list">
              <dt>{t("pos.enteredAmount")}</dt>
              <dd className="ltr">{formatMoney(payment.amount)}</dd>
              <dt>{t("pos.changePreview")}</dt>
              <dd className="ltr">
                {formatMoney(
                  paymentValue.mode === "Bank"
                    ? "0"
                    : paymentChange(
                        payment,
                        paymentValue.mode === "Split" ? paymentValue.cash : cartTotal(cart),
                      ),
                )}
              </dd>
              <dt>{t("pos.reference")}</dt>
              <dd>{payment.reference || t("pos.cashDraft")}</dd>
              <dt>{t("pos.txState")}</dt>
              <dd>{saved ? t("pos.sessionDraft") : t("pos.reviewed")}</dd>
            </dl>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setPayment(null)}>
                {t("pos.editPayment")}
              </Button>
              <Button
                disabled={saved}
                onClick={() => {
                  if (posting.current) return;
                  posting.current = true;
                  try {
                    if (
                      (surname.trim() || givenName.trim()) &&
                      !testBuyerSchema.safeParse({
                        surname: surname.trim(),
                        givenName: givenName.trim(),
                        contact: buyerContact.trim(),
                      }).success
                    )
                      throw new Error(t("doc.namesRequired"));
                    const sale = recordTestSale({
                      key: saleKey,
                      store: selectedStore,
                      shiftId: checkoutShiftId,
                      warranties,
                      lines: cart.map((l) => ({ id: l.item.id, quantity: l.quantity })),
                      customerId: customer,
                      customerName,
                      ...((phoneCart.length > 0 || Number(paymentValue.credit) > 0) &&
                      customer === WALK_IN
                        ? {
                            newBuyer: {
                              surname: surname.trim(),
                              givenName: givenName.trim(),
                              contact: buyerContact.trim(),
                            },
                          }
                        : {}),
                      tender: paymentValue.mode,
                      paid: payment.amount,
                      creditAmount: paymentValue.credit || undefined,
                      dueDate: paymentValue.dueDate || undefined,
                      cashAmount: paymentValue.cash || undefined,
                      bankAmount: paymentValue.bank || undefined,
                      bankMethod: paymentValue.method || undefined,
                      discountAmount: paymentValue.discount || undefined,
                      ...(surname.trim() && givenName.trim()
                        ? {
                            buyer: {
                              surname: surname.trim(),
                              givenName: givenName.trim(),
                              contact: buyerContact.trim(),
                            },
                          }
                        : {}),
                    });
                    setDocumentSale(sale.id);
                    setSurname("");
                    setGivenName("");
                    setBuyerContact("");
                    setSaved(true);
                    setNotice(t("pos.sessionDraft"));
                    setCart([]);
                    setPaymentValue(emptyPosPayment);
                    setCheckout(false);
                    setPayment(null);
                  } catch (e) {
                    posting.current = false;
                    setNotice(message(e));
                  }
                }}
              >
                {t("tw.recordSale")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <dl className="detail-list">
              <dt>{t("pos.customer")}</dt>
              <dd>{customerName}</dd>
              <dt>{t("pos.sellerAttribution")}</dt>
              <dd>
                {displayText(lang, seller)} · {t("pos.notAuthenticated")}
              </dd>
              <dt>{t("pos.basketTotal")}</dt>
              <dd className="ltr">{formatMoney(cartTotal(cart))}</dd>
              <dt>{t("pos.state")}</dt>
              <dd>{t("pos.paymentEntry")}</dd>
            </dl>
            <PosPaymentFields
              value={paymentValue}
              onChange={setPaymentValue}
              limit={discountLimit}
            />
            <Button
              onClick={() => {
                try {
                  if (
                    phoneCart.length &&
                    (!testBuyerSchema.safeParse({ surname, givenName, contact: buyerContact })
                      .success ||
                      warranties.length !== phoneCart.length ||
                      warranties.some((c) => !warrantyChoiceSchema.safeParse(c).success))
                  )
                    throw new Error(t("sale.errorChoice"));
                  const net =
                    cents(cartTotal(cart)) -
                    cents(paymentValue.discount || "0") -
                    cents(paymentValue.credit || "0");
                  const received =
                    paymentValue.mode === "Bank"
                      ? `${net / 100n}.${String(net % 100n).padStart(2, "0")}`
                      : paymentValue.received || cartTotal(cart);
                  settleSale({
                    credit: paymentValue.credit || undefined,
                    subtotal: cartTotal(cart),
                    discount: paymentValue.discount,
                    limit: discountLimit,
                    owner: reviewActor(ws)?.role === "SUPER_ADMIN",
                    mode: paymentValue.mode,
                    cash: paymentValue.cash,
                    bank: paymentValue.bank,
                    received,
                    bankMethod: paymentValue.method || undefined,
                  });
                  setPayment({
                    tender: paymentValue.mode === "Bank" ? "Bank" : "Cash",
                    amount: received,
                    reference: "",
                  });
                  setNotice("");
                } catch (e) {
                  setNotice(
                    e instanceof Error && e.message === "DISCOUNT_REFUSED"
                      ? t("pc.refused")
                      : e instanceof Error && e.message === "PAYMENT_MISMATCH"
                        ? t("pc.mismatch")
                        : message(e),
                  );
                }
              }}
            >
              {t("pc.pay")}
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => setCheckout(false)}>
          {t("pos.returnToBasket")}
        </Button>
      </OperationDialog>
      <OperationDialog
        open={handoff}
        onClose={() => setHandoff(false)}
        title={t("pos.handoffTitle")}
      >
        <p className="field-hint">
          {selectedStore === "M01" ? t("pos.handoffM01") : t("pos.handoffM02")}
        </p>
        <dl className="detail-list">
          <dt>{t("pos.currentAttribution")}</dt>
          <dd>
            {displayText(lang, seller)} · {t("pos.notAuthenticated")}
          </dd>
          <dt>{t("pos.basket")}</dt>
          <dd>
            {cart.length} {t("pos.lines")} · {formatMoney(cartTotal(cart))}
          </dd>
        </dl>
        <form
          className="draft-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nextSeller || nextSeller === seller || !handoffReason.trim()) {
              setHandoffError(t("pos.handoffError"));
              return;
            }
            try {
              setTestSeller(selectedStore, nextSeller);
            } catch (err) {
              setHandoffError(
                localizeMessage(lang, err instanceof Error ? err.message : String(err)),
              );
              return;
            }
            setNotice(t("tw.sellerNow", { seller: nextSeller }));
            setHandoffReason("");
            setHandoff(false);
            setHandoffError("");
          }}
        >
          <label className="form-label">
            {t("pos.nextOperator")}
            <select
              aria-label={t("pos.nextOperator")}
              value={nextSeller}
              onChange={(e) => setNextSeller(e.target.value)}
            >
              <option value="">—</option>
              {sellersFor(selectedStore)
                .filter(
                  (u) =>
                    u.name !== seller &&
                    (reviewActor()?.role === "SUPER_ADMIN" || u.role === "SELLER"),
                )
                .map((u) => (
                  <option key={u.id} value={u.name}>
                    {displayText(lang, u.name)}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-label">
            {t("pos.handoffReason")}
            <input
              aria-label={t("pos.handoffReason")}
              value={handoffReason}
              onChange={(e) => setHandoffReason(e.target.value)}
            />
          </label>
          {handoffError && (
            <p role="alert" className="error-text">
              {handoffError}
            </p>
          )}
          <Button type="submit">{t("tw.handoffDo")}</Button>
        </form>
      </OperationDialog>
      <TestSaleDocuments activeSaleId={documentSale} onClose={() => setDocumentSale("")} />
    </div>
  );
}
