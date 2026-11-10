/** Sellable phone model key = brand + model + storage + condition (NEW | USED); safe catalog SKU. */
export function phoneModelSku(brand: string, model: string, storage: string, condition: string) {
  const part = (v: string) =>
    v
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase();
  return `PM-${[brand, model, storage, condition].map(part).join("-")}`.slice(0, 80);
}
