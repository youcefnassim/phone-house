import type { Language } from "@/i18n";
import { localizeMessage } from "./messages";

// Display-only localization of SEEDED synthetic names (stable internal values
// are unchanged). User-entered records never match these patterns exactly and
// are therefore never translated.
const roles: Record<string, [string, string]> = {
  seller: ["Vendeur test", "بائع اختبار"],
  manager: ["Gérant test", "مدير اختبار"],
  owner: ["Propriétaire test", "مالك اختبار"],
  customer: ["Client test", "زبون اختبار"],
  supplier: ["Fournisseur test", "مورّد اختبار"],
  operator: ["Opérateur test", "مشغّل اختبار"],
};
const fixed: Record<string, [string, string]> = {
  "M02 POS, receiving, shared drawer open and direct close, transfer approval; no owner costs": [
    "Vente et réception M02, ouverture et clôture directe de la caisse, approbation des transferts ; aucun coût propriétaire",
    "بيع واستلام M02، فتح وإغلاق الصندوق مباشرة، موافقة التحويلات؛ دون تكاليف المالك",
  ],
  "M01 POS, receiving, shared drawer open and direct close, customers; no costs, no approvals": [
    "Vente et réception M01, ouverture et clôture directe de la caisse partagée, clients ; aucun coût ni approbation",
    "بيع واستلام M01، فتح وإغلاق الصندوق المشترك مباشرة، الزبائن؛ دون تكاليف ولا موافقات",
  ],
  "Synthetic utilities entry": ["Écriture de charges de test", "قيد مصاريف اختباري"],
  "Historical synthetic phone": ["Téléphone historique de test", "هاتف تاريخي اختباري"],
  "Synthetic battery inspection": ["Contrôle de batterie de test", "فحص بطارية اختباري"],
  "Demo employer": ["Employeur test", "صاحب عمل اختباري"],
  "Demo utilities": ["Charges de test", "مصاريف اختبارية"],
  "Demo intake draft": ["Brouillon d’entrée de test", "مسودة إدخال اختبارية"],
  "Demo transfer requested": ["Transfert de test demandé", "طُلب تحويل اختباري"],
  "Demo seller handoff preview": [
    "Aperçu de passation vendeur (test)",
    "معاينة تسليم البائع (اختبار)",
  ],
  "Not a real account": ["Pas un vrai compte", "ليس حسابًا حقيقيًا"],
  "Synthetic fixture": ["Donnée de test", "بيانات اختبار"],
  "Sales receipt": ["Ticket de vente", "وصل البيع"],
  "Customer proof of sale after POS checkout": [
    "Preuve d’achat remise au client après l’encaissement",
    "إثبات شراء للزبون بعد إتمام البيع",
  ],
  "Transfer dispatch note": ["Bon d’expédition de transfert", "إشعار إرسال التحويل"],
  "Accompanies physical inter-store dispatch": [
    "Accompagne l’envoi physique entre magasins",
    "يرافق الإرسال الفعلي بين المتاجر",
  ],
  "Facility schedule": ["Échéancier de facilité", "جدول التسهيل"],
  "M01 installment schedule with bank remittance evidence": [
    "Échéancier M01 avec justificatifs de virement bancaire",
    "جدول أقساط M01 مع إثباتات التحويل البنكي",
  ],
  "Blind count sheet": ["Fiche de comptage à l’aveugle", "ورقة العدّ الأعمى"],
  "Drawer closing count without expected totals": [
    "Comptage de clôture du tiroir sans totaux attendus",
    "عدّ إغلاق الدرج دون المجاميع المتوقعة",
  ],
  "Fiscal information not approved": [
    "Informations fiscales non approuvées",
    "المعلومات الجبائية غير معتمدة",
  ],
  "Warranty terms not approved (OD-08)": [
    "Conditions de garantie non approuvées (OD-08)",
    "شروط الضمان غير معتمدة (OD-08)",
  ],
  "Legal wording not approved": ["Mentions légales non approuvées", "الصيغة القانونية غير معتمدة"],
  "Numbering sequences not configured": [
    "Séquences de numérotation non configurées",
    "تسلسلات الترقيم غير مُهيّأة",
  ],
  "Printer hardware unverified": ["Imprimante non vérifiée", "الطابعة غير مُتحقَّق منها"],
  Sales: ["Ventes", "المبيعات"],
  "Cost coverage": ["Couverture des coûts", "تغطية التكاليف"],
  "Zakat worksheet": ["Feuille de calcul de la zakat", "ورقة حساب الزكاة"],
  Bank: ["Banque", "بنك"],
  Cash: ["Espèces", "نقدًا"],
  "Refund review": ["Examen de remboursement", "مراجعة استرداد"],
  SUPER_ADMIN: ["Super Admin", "المدير العام"],
  MANAGER: ["Gérant", "مدير"],
  SELLER: ["Vendeur", "بائع"],
  "Test owner (Super Admin)": ["Propriétaire test (Super Admin)", "مالك اختبار (المدير العام)"],
  "Test manager M02": ["Gérant test M02", "مدير اختبار M02"],
  "Synthetic phone model": ["Modèle de téléphone de test", "طراز هاتف اختباري"],
  "Synthetic USB-C cable batch": ["Lot de câbles USB-C de test", "دفعة كابلات USB-C اختبارية"],
  "Synthetic fixture · Not a real account": [
    "Donnée de test · Pas un vrai compte",
    "بيانات اختبار · ليس حسابًا حقيقيًا",
  ],
  "Assigned store only": ["Magasin affecté uniquement", "المتجر المُسند فقط"],
  "All modules incl. owner purchase costs, facility remittance evidence, transfer approval": [
    "Tous les modules, y compris coûts d’achat propriétaire, justificatifs de facilité et approbation des transferts",
    "جميع الأقسام بما فيها تكاليف شراء المالك وإثباتات التسهيلات والموافقة على التحويلات",
  ],
  "Operational drafts, receiving, transfer approval (M02), blind-count verification; no owner costs":
    [
      "Brouillons opérationnels, réception, approbation des transferts (M02), vérification du comptage à l’aveugle ; aucun coût propriétaire",
      "مسودات تشغيلية، استلام، موافقة التحويل (M02)، التحقق من العدّ الأعمى؛ دون تكاليف المالك",
    ],
  "POS drafts, own drawer movements, customer drafts; no costs, no approvals": [
    "Brouillons de caisse, mouvements de son tiroir, fiches clients ; aucun coût, aucune approbation",
    "مسودات نقطة البيع، حركات درجه، مسودات الزبائن؛ دون تكاليف ولا موافقات",
  ],
  Phone: ["Téléphone", "هاتف"],
  Accessory: ["Accessoire", "إكسسوار"],
};
export function displayName(lang: Language, name: string): string {
  if (lang === "en") return name.replace(/^Demo /, "Test ");
  const i = lang === "fr-DZ" ? 0 : 1;
  const f = fixed[name];
  if (f) return f[i];
  const m = /^(?:Demo|Test) (seller|manager|owner|customer|supplier|operator)(?: (\d{3}))?$/.exec(
    name,
  );
  if (m) {
    const r = roles[m[1]!]![i];
    return m[2] ? `${r} ${m[2]}` : r;
  }
  return name;
}

/** Display-only localization of seeded fixture text, segment by segment (" · "). Technical codes are kept. */
export function displayText(lang: Language, text: string): string {
  if (lang === "en")
    return text
      .split(" · ")
      .map((p) => displayName(lang, p))
      .join(" · ");
  const i = lang === "fr-DZ" ? 0 : 1;
  return text
    .split(" · ")
    .map((p) => {
      const f = fixed[p];
      if (f) return f[i];
      const l = /^Linked to (\S+)$/.exec(p);
      if (l) return (lang === "fr-DZ" ? "Lié à " : "مرتبط بـ ") + l[1];
      const n = displayName(lang, p);
      return n !== p ? n : localizeMessage(lang, p);
    })
    .join(" · ");
}
