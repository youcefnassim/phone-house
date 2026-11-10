import type { Language } from "@/i18n";
import { displayText } from "./display";

// Structured action-code → label mapping for audit/history display. Stored
// records keep their raw English action string as the provenance code; only
// the rendered label is localized. Unknown codes fall back to displayText,
// then to the raw value (never dropped).
type Tri = [en: string, fr: string, ar: string];
export const AUDIT_ACTIONS: Record<string, Tri> = {
  "Owner retrospective close review": [
    "Owner close review",
    "Contrôle propriétaire après clôture",
    "مراجعة المالك بعد الإغلاق",
  ],
  "Test catalog variant created": [
    "Test catalog variant created",
    "Variante du catalogue créée (test)",
    "إنشاء نسخة كتالوج (اختبار)",
  ],
  "Test quantity adjustment": [
    "Test quantity adjustment",
    "Ajustement de quantité (test)",
    "تعديل كمية (اختبار)",
  ],
  "Purchase draft saved": [
    "Purchase draft saved",
    "Brouillon d’achat enregistré",
    "حُفظت مسودة الشراء",
  ],
  "Purchase receipt preview saved": [
    "Purchase receipt preview saved",
    "Aperçu de réception enregistré",
    "حُفظت معاينة الاستلام",
  ],
  "Expense draft saved": [
    "Expense draft saved",
    "Brouillon de dépense enregistré",
    "حُفظت مسودة المصروف",
  ],
  "Expense category draft saved": [
    "Expense category draft saved",
    "Catégorie de dépense enregistrée",
    "حُفظت فئة المصروف",
  ],
  "Test phone intake": ["Test phone intake", "Entrée de téléphone (test)", "إدخال هاتف (اختبار)"],
  "Test receiving": [
    "Test accessory receiving",
    "Réception d’accessoires (test)",
    "استلام إكسسوارات (اختبار)",
  ],
  "Test selling price set": [
    "Test selling price set",
    "Prix de vente défini (test)",
    "تحديد سعر البيع (اختبار)",
  ],
  "Owner setting saved": [
    "Owner setting saved",
    "Réglage propriétaire enregistré",
    "تم حفظ إعداد المالك",
  ],
  "Local test sale": ["Local test sale", "Vente de test locale", "بيع اختباري محلي"],
  "Test shift opened": [
    "Test cash shift opened",
    "Ouverture de caisse (test)",
    "فتح وردية الصندوق (اختبار)",
  ],
  "Test blind close": ["Test blind close", "Clôture à l’aveugle (test)", "إغلاق أعمى (اختبار)"],
  "Test seller attribution changed (unauthenticated preview)": [
    "Seller attribution changed (unauthenticated preview)",
    "Vendeur attribué modifié (aperçu non authentifié)",
    "تغيير البائع المنسوب (معاينة غير موثّقة)",
  ],
  "Test transfer draft": ["Transfer draft", "Brouillon de transfert", "مسودة تحويل"],
  "Test approval preview (unauthenticated)": [
    "Approval preview (unauthenticated)",
    "Aperçu d’approbation (non authentifié)",
    "معاينة موافقة (غير موثّقة)",
  ],
  "Test transfer completed (local simulation)": [
    "Transfer completed (local simulation)",
    "Transfert terminé (simulation locale)",
    "اكتمال التحويل (محاكاة محلية)",
  ],
  "Test transfer revalidated": [
    "Transfer revalidated (unavailable items removed)",
    "Transfert revalidé (articles indisponibles retirés)",
    "إعادة تحقق التحويل (حذف العناصر غير المتاحة)",
  ],
  "Credit request draft (posting blocked)": [
    "Credit request draft (posting blocked)",
    "Brouillon de demande de crédit (comptabilisation bloquée)",
    "مسودة طلب ائتمان (الترحيل محظور)",
  ],
  "Customer draft saved": [
    "Customer draft saved",
    "Brouillon client enregistré",
    "حُفظت مسودة الزبون",
  ],
  "Debt draft saved": ["Debt draft saved", "Brouillon de créance enregistré", "حُفظت مسودة الدين"],
  "Repayment draft saved": [
    "Repayment draft saved",
    "Brouillon de remboursement enregistré",
    "حُفظت مسودة السداد",
  ],
  "Repayment preview draft": [
    "Unposted repayment draft",
    "Brouillon de remboursement non comptabilisé",
    "مسودة سداد غير مرحّلة",
  ],
  "Supplier draft saved": [
    "Supplier draft saved",
    "Brouillon fournisseur enregistré",
    "حُفظت مسودة المورّد",
  ],
  "Facility contract draft": [
    "Facility contract draft",
    "Brouillon de contrat de facilité",
    "مسودة عقد تسهيل",
  ],
  "Salary deduction evidence draft (unverified, no cash impact)": [
    "Salary deduction evidence draft (unverified, no cash impact)",
    "Justificatif de retenue sur salaire (non vérifié, sans effet caisse)",
    "مسودة إثبات اقتطاع من الراتب (غير متحقق، دون أثر على الصندوق)",
  ],
  "Bank remittance evidence draft (unverified, no cash impact)": [
    "Bank remittance evidence draft (unverified, no cash impact)",
    "Justificatif de virement bancaire (non vérifié, sans effet caisse)",
    "مسودة إثبات تحويل بنكي (غير متحقق، دون أثر على الصندوق)",
  ],
  "Service case draft": [
    "Service case draft",
    "Brouillon de dossier SAV",
    "مسودة ملف خدمة ما بعد البيع",
  ],
  "Service event draft": [
    "Service event draft",
    "Événement SAV (brouillon)",
    "حدث خدمة ما بعد البيع (مسودة)",
  ],
  "Refund review draft (no refund executed)": [
    "Refund review draft (no refund executed)",
    "Examen de remboursement (aucun remboursement effectué)",
    "مراجعة استرداد (لم يُنفَّذ أي استرداد)",
  ],
  "Attachment metadata (file not uploaded)": [
    "Attachment metadata (file not uploaded)",
    "Métadonnées de pièce jointe (fichier non téléversé)",
    "بيانات المرفق (لم يُرفع الملف)",
  ],
};
export const AUDIT_AREAS: Record<string, Tri> = {
  "All areas": ["All areas", "Tous les domaines", "كل المجالات"],
  Fixture: ["Fixture", "Référence", "مرجعي"],
  inventory: ["Inventory", "Stock", "المخزون"],
  pos: ["POS", "Caisse", "نقطة البيع"],
  cash: ["Cash", "Caisse", "الصندوق"],
  transfers: ["Transfers", "Transferts", "التحويلات"],
  debts: ["Debts", "Créances", "الديون"],
  customers: ["Customers", "Clients", "الزبائن"],
  suppliers: ["Suppliers", "Fournisseurs", "الموردون"],
  facility: ["Facility", "Facilité", "التسهيل"],
  service: ["After-sales", "SAV", "خدمة ما بعد البيع"],
  attachments: ["Attachments", "Pièces jointes", "المرفقات"],
  purchases: ["Purchases", "Achats", "المشتريات"],
  expenses: ["Expenses", "Dépenses", "المصاريف"],
};
const idx = (lang: Language) => (lang === "fr-DZ" ? 1 : lang === "ar-DZ" ? 2 : 0);
export function auditActionLabel(lang: Language, code: string): string {
  const m = AUDIT_ACTIONS[code];
  return m ? m[idx(lang)] : displayText(lang, code);
}
export function auditAreaLabel(lang: Language, area: string): string {
  const m = AUDIT_AREAS[area];
  return m ? m[idx(lang)] : area;
}
