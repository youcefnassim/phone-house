// Accessible names for icon-only controls.
export const en = {
  "a11y.preview": "Preview {name}",
  "a11y.expense": "Expense {id}",
  "a11y.purchase": "Purchase {id}",
  "a11y.supplier": "Supplier {id}",
  "a11y.search": "Search {name}",
  "a11y.barcode": "Barcode {value}",
  "a11y.reference": "Reference",
} as const;
type K = keyof typeof en;
export const fr: Record<K, string> = {
  "a11y.preview": "Aperçu {name}",
  "a11y.expense": "Dépense {id}",
  "a11y.purchase": "Achat {id}",
  "a11y.supplier": "Fournisseur {id}",
  "a11y.search": "Rechercher {name}",
  "a11y.barcode": "Code-barres {value}",
  "a11y.reference": "Référence",
};
export const ar: Record<K, string> = {
  "a11y.preview": "معاينة {name}",
  "a11y.expense": "مصروف {id}",
  "a11y.purchase": "شراء {id}",
  "a11y.supplier": "مورّد {id}",
  "a11y.search": "بحث {name}",
  "a11y.barcode": "رمز شريطي {value}",
  "a11y.reference": "المرجع",
};
