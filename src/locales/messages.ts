import type { Language } from "@/i18n";

// Runtime localization for domain validation messages and status values that
// originate in locale-neutral domain code (zod schemas, test workspace rules).
// Domain code keeps English as the canonical message; the UI translates here.
const M: Record<string, [string, string]> = {
  CREDIT_CUSTOMER_REQUIRED: [
    "Nom, prénom, téléphone et échéance sont obligatoires pour le crédit.",
    "الاسم واللقب والهاتف وتاريخ الاستحقاق مطلوبة للدين.",
  ],
  OVERPAYMENT: ["Le remboursement dépasse le solde.", "السداد يتجاوز الرصيد."],
  SHIFT_CLOSED: ["Caisse clôturée.", "الصندوق مغلق."],
  "Unknown supplier.": ["Fournisseur inconnu.", "مورد غير معروف."],
  "Select the existing supplier.": [
    "Sélectionnez le fournisseur existant.",
    "اختر المورد الموجود.",
  ],
  "Owner access required.": ["Accès propriétaire requis.", "يلزم وصول المالك."],
  UNKNOWN: ["Non précisé", "غير محدد"],
  "This operator cannot operate this store.": [
    "Choisissez un opérateur autorisé pour ce magasin.",
    "اختر مشغّلًا مخوّلًا لهذا المتجر.",
  ],
  "Select your own active operator.": ["Choisissez votre profil actif.", "اختر ملفك النشط."],
  "Select an active operator.": ["Choisissez un opérateur actif.", "اختر مشغّلًا نشطًا."],
  "This cash session is closed or changed.": [
    "La caisse a changé ou a été clôturée. Recommencez avec la caisse actuelle.",
    "تغيّرت جلسة الصندوق أو أُغلقت. ابدأ مجددًا بالجلسة الحالية.",
  ],
  "This cash movement was already recorded.": [
    "Ce mouvement est déjà enregistré.",
    "سُجّلت هذه الحركة مسبقًا.",
  ],
  "Only Super Admin may review a closed drawer.": [
    "Seul le propriétaire peut contrôler une clôture.",
    "المالك فقط يمكنه مراجعة الإغلاق.",
  ],
  "Close the drawer before owner review.": [
    "Clôturez la caisse avant le contrôle propriétaire.",
    "أغلق الصندوق قبل مراجعة المالك.",
  ],
  "This close was already reviewed.": [
    "Cette clôture a déjà été contrôlée.",
    "تمت مراجعة هذا الإغلاق مسبقًا.",
  ],
  "Explain the flagged discrepancy.": [
    "Ajoutez une note sur l’anomalie signalée.",
    "أضف ملاحظة عن المشكلة المُبلّغ عنها.",
  ],
  "Open a test cash shift on this drawer before a cash sale.": [
    "Ouvrez une caisse pour encaisser en espèces.",
    "افتح جلسة الصندوق لتحصيل الدفع نقدًا.",
  ],
  "No open test shift on this drawer.": [
    "Ouvrez d’abord une caisse pour ce magasin.",
    "افتح جلسة صندوق لهذا المتجر أولاً.",
  ],
  "Cash out exceeds the drawer balance.": [
    "Le retrait dépasse le solde de caisse. Réduisez le montant.",
    "السحب يتجاوز رصيد الصندوق. خفّض المبلغ.",
  ],
  "A shift is already open on this drawer. Close it with a blind count first.": [
    "Cette caisse est déjà ouverte. Clôturez-la avant d’en ouvrir une nouvelle.",
    "الصندوق مفتوح بالفعل. أغلق الجلسة قبل فتح جلسة جديدة.",
  ],
  "This catalog variant already exists.": [
    "Cette variante du catalogue existe déjà.",
    "هذه النسخة موجودة في الكتالوج.",
  ],
  "Use a non-zero whole quantity.": [
    "Saisissez une quantité entière non nulle.",
    "أدخل كمية صحيحة غير صفرية.",
  ],
  "This document reference was already used.": [
    "Cette référence de document est déjà utilisée.",
    "مرجع المستند مستخدم مسبقاً.",
  ],
  ADJUSTMENT: ["Ajustement de test", "تعديل اختباري"],
  RECEIVING: ["Réception de test", "استلام اختباري"],
  SALE: ["Vente de test", "بيع اختباري"],
  TRANSFER_IN: ["Entrée de transfert", "دخول تحويل"],
  TRANSFER_OUT: ["Sortie de transfert", "خروج تحويل"],
  "In service": ["En réparation", "قيد الإصلاح"],
  Ready: ["Prêt", "جاهز"],
  "Closed draft": ["Clôturé (brouillon)", "مغلق (مسودة)"],
  Repair: ["Réparation", "إصلاح"],
  Return: ["Retour", "إرجاع"],
  Exchange: ["Échange", "استبدال"],
  "Refund review": ["Examen de remboursement", "مراجعة استرداد"],
  "Select at least one item to transfer.": [
    "Sélectionnez au moins un article à transférer.",
    "اختر صنفًا واحدًا على الأقل للتحويل.",
  ],
  "Each item may appear only once in a transfer.": [
    "Chaque article ne peut figurer qu’une fois dans un transfert.",
    "لا يظهر كل صنف إلا مرة واحدة في التحويل.",
  ],
  "Item is not in the source store.": [
    "L’article n’est pas dans le magasin source.",
    "الصنف ليس في المتجر المُرسِل.",
  ],
  "This phone is already on another active transfer.": [
    "Ce téléphone figure déjà sur un autre transfert actif.",
    "هذا الهاتف مدرج مسبقًا في تحويل نشط آخر.",
  ],
  "Transfer not found.": ["Transfert introuvable.", "التحويل غير موجود."],
  "Source and destination stores must differ.": [
    "Les magasins source et destination doivent être différents.",
    "يجب أن يختلف المتجر المُرسِل عن المستلِم.",
  ],
  "Approvals are only possible at the approval stage.": [
    "Les approbations ne sont possibles qu’à l’étape d’approbation.",
    "لا تُمنح الموافقات إلا في مرحلة الموافقات.",
  ],
  "This identity cannot give this approval.": [
    "Cette identité ne peut pas donner cette approbation.",
    "لا يمكن لهذه الهوية منح هذه الموافقة.",
  ],
  "This approval was already recorded.": [
    "Cette approbation est déjà enregistrée.",
    "سُجّلت هذه الموافقة مسبقًا.",
  ],
  "Both Super Admin and M02 Manager approvals are required.": [
    "Les approbations du Super Admin et du gérant M02 sont toutes deux requises.",
    "تلزم موافقة المدير العام وموافقة مدير M02 معًا.",
  ],
  "Every item must be scanned before completion. Partial receipt is blocked (OD unresolved).": [
    "Chaque article doit être scanné avant la clôture. La réception partielle est bloquée (décision ouverte).",
    "يجب مسح كل صنف قبل الإكمال. الاستلام الجزئي محظور (قرار غير محسوم).",
  ],
  "Already complete": ["Déjà terminé", "مكتمل مسبقًا"],
  "Scanned code is not on this transfer manifest.": [
    "Le code scanné ne figure pas sur ce bordereau de transfert.",
    "الرمز الممسوح غير موجود في بيان هذا التحويل.",
  ],
  "Excess scan rejected: this line is already complete.": [
    "Scan excédentaire refusé : cette ligne est déjà complète.",
    "رُفض مسح زائد: هذا السطر مكتمل.",
  ],
  "A registered customer is required for a credit request.": [
    "Un client enregistré est requis pour une demande de crédit.",
    "يلزم زبون مسجّل لطلب البيع بالدَّين.",
  ],
  "Customer must belong to the selected store.": [
    "Le client doit appartenir au magasin sélectionné.",
    "يجب أن ينتمي الزبون إلى المتجر المحدد.",
  ],
  "Nothing remains unpaid; record a normal test sale instead.": [
    "Rien ne reste à payer ; enregistrez plutôt une vente de test normale.",
    "لا يتبقى مبلغ غير مدفوع؛ سجّل بيع اختبار عاديًا بدلًا من ذلك.",
  ],
  "This sale is fully paid; converting it to credit is blocked.": [
    "Cette vente est entièrement payée ; la convertir en crédit est bloqué.",
    "هذا البيع مدفوع بالكامل؛ تحويله إلى دَين محظور.",
  ],
  "Original sale not found for this customer and store.": [
    "Vente d’origine introuvable pour ce client et ce magasin.",
    "البيع الأصلي غير موجود لهذا الزبون والمتجر.",
  ],
  "A debt already exists for this sale.": [
    "Une dette existe déjà pour cette vente.",
    "يوجد دَين مسجّل لهذا البيع مسبقًا.",
  ],
  "Debt amount exceeds the original sale amount.": [
    "Le montant de la dette dépasse celui de la vente d’origine.",
    "مبلغ الدَّين يتجاوز مبلغ البيع الأصلي.",
  ],
  "Debt not found.": ["Dette introuvable.", "الدَّين غير موجود."],
  "This payment reference was already used.": [
    "Cette référence de paiement est déjà utilisée.",
    "مرجع الدفع هذا مستخدم مسبقًا.",
  ],
  "M01 customer required.": ["Client M01 requis.", "يلزم زبون من M01."],
  "Explicit schedule total must match the stated contract price. No rounding or final-installment formula is inferred.":
    [
      "Le total de l’échéancier doit égaler le prix du contrat. Aucun arrondi ni formule de dernière échéance n’est déduit.",
      "يجب أن يساوي مجموع الجدول سعر العقد المذكور. لا يُستنتج أي تقريب أو صيغة للقسط الأخير.",
    ],
  "Contract reference already exists.": [
    "Cette référence de contrat existe déjà.",
    "مرجع العقد موجود مسبقًا.",
  ],
  "Month is outside this contract schedule.": [
    "Ce mois est hors de l’échéancier du contrat.",
    "هذا الشهر خارج جدول العقد.",
  ],
  "Bank remittance requires an attached bank evidence document.": [
    "Un virement bancaire exige un justificatif bancaire joint.",
    "يتطلب التحويل البنكي إرفاق مستند إثبات بنكي.",
  ],
  "This evidence reference was already recorded.": [
    "Cette référence de justificatif est déjà enregistrée.",
    "مرجع الإثبات هذا مسجّل مسبقًا.",
  ],
  "Evidence exceeds the scheduled installment for this month.": [
    "Le justificatif dépasse l’échéance prévue pour ce mois.",
    "الإثبات يتجاوز القسط المجدول لهذا الشهر.",
  ],
  "Original sale not found for this customer, store and IMEI.": [
    "Vente d’origine introuvable pour ce client, ce magasin et cet IMEI.",
    "البيع الأصلي غير موجود لهذا الزبون والمتجر وIMEI.",
  ],
  "This unit is not in sold state.": [
    "Cette unité n’est pas à l’état vendu.",
    "هذه الوحدة ليست في حالة مباعة.",
  ],
  "An open service case already exists for this sold unit.": [
    "Un dossier SAV ouvert existe déjà pour cette unité vendue.",
    "يوجد ملف خدمة مفتوح لهذه الوحدة المبيعة مسبقًا.",
  ],
  "Synthetic fixtures are read-only; create a test case to track events.": [
    "Les données de référence sont en lecture seule ; créez un dossier de test.",
    "البيانات المرجعية للقراءة فقط؛ أنشئ ملف اختبار.",
  ],
  "This case is closed.": ["Ce dossier est clôturé.", "هذا الملف مغلق."],
  "Original sale unavailable.": ["Vente d’origine indisponible.", "البيع الأصلي غير متاح."],
  "This refund reference was already used.": [
    "Cette référence de remboursement est déjà utilisée.",
    "مرجع الاسترداد هذا مستخدم مسبقًا.",
  ],
  "Not found": ["Introuvable", "غير موجود"],
  Required: ["Obligatoire", "إلزامي"],
  "Select an option": ["Choisissez une option", "اختر خيارًا"],
  "A basket must belong to one store.": [
    "Un panier doit appartenir à un seul magasin.",
    "يجب أن تنتمي السلة إلى متجر واحد.",
  ],
  "Amount exceeds outstanding balance": [
    "Le montant dépasse le reste dû",
    "المبلغ يتجاوز الرصيد المتبقي",
  ],
  "Amount exceeds outstanding balance.": [
    "Le montant dépasse le reste dû.",
    "المبلغ يتجاوز الرصيد المتبقي.",
  ],
  "Amount must be a non-negative decimal with up to two decimal places.": [
    "Le montant doit être un décimal positif avec au plus deux décimales.",
    "يجب أن يكون المبلغ عددًا عشريًا موجبًا بخانتين عشريتين على الأكثر.",
  ],
  "An identifier is already present in the demo inventory.": [
    "Cet identifiant existe déjà dans le stock de test.",
    "هذا المعرّف موجود مسبقًا في مخزون الاختبار.",
  ],
  "Approvals or complete validated receipt required": [
    "Approbations ou réception complète validée requises",
    "تلزم الموافقات أو استلام كامل موثّق",
  ],
  "Bank preview must match the basket total; allocation policy is unconfigured.": [
    "Le paiement bancaire doit égaler le total du panier ; la règle de répartition n’est pas configurée.",
    "يجب أن يساوي الدفع البنكي إجمالي السلة؛ سياسة التوزيع غير مهيأة.",
  ],
  "Bank reference required for this draft": ["Référence bancaire requise", "المرجع البنكي إلزامي"],
  "Choose a different destination": ["Choisissez une autre destination", "اختر وجهة مختلفة"],
  "Demo stock quantity reached.": [
    "Quantité en stock atteinte.",
    "تم بلوغ الكمية المتوفرة في المخزون.",
  ],
  "Duplicate phone identity.": ["Identité de téléphone en double.", "هوية هاتف مكررة."],
  "Entered amount is below the basket total. Credit and partial-payment policies are unconfigured.":
    [
      "Montant insuffisant. Saisissez au moins le total du panier.",
      "المبلغ المُدخل أقل من إجمالي السلة. سياسات الائتمان والدفع الجزئي غير مهيأة.",
    ],
  "Explicit first month required": [
    "Premier mois explicite requis",
    "يلزم تحديد الشهر الأول صراحةً",
  ],
  "IMEI2 must be 15 digits and differ from IMEI1.": [
    "L’IMEI2 doit comporter 15 chiffres et différer de l’IMEI1.",
    "يجب أن يتكون IMEI2 من 15 رقمًا وأن يختلف عن IMEI1.",
  ],
  "IMEI check digit is invalid": [
    "Le chiffre de contrôle de l’IMEI est invalide. Vérifiez la saisie.",
    "رقم التحقق في IMEI غير صحيح. تحقق من الإدخال.",
  ],
  "Enter IMEI1 before IMEI2": ["Saisissez l’IMEI 1 avant l’IMEI 2.", "أدخل IMEI 1 قبل IMEI 2."],
  "Enter the IMEI, or the serial number if this phone has no IMEI": [
    "Saisissez l’IMEI, ou le n° de série si le téléphone n’a pas d’IMEI.",
    "أدخل IMEI، أو الرقم التسلسلي إذا لم يكن للهاتف IMEI.",
  ],
  "Price must be greater than zero": [
    "Le prix doit être supérieur à zéro.",
    "يجب أن يكون السعر أكبر من صفر.",
  ],
  "A phone is always exactly one unit": [
    "Un téléphone compte toujours pour une seule unité.",
    "الهاتف وحدة واحدة دائمًا.",
  ],
  "Choose the store": ["Choisissez le magasin.", "اختر المتجر."],
  "Choose the box condition": ["Choisissez l’état de la boîte.", "اختر حالة العلبة."],
  "Choose New or Used": ["Choisissez Neuf ou Occasion.", "اختر جديد أو مستعمل."],
  "IMEI2 must differ from IMEI1": [
    "L’IMEI2 doit différer de l’IMEI1",
    "يجب أن يختلف IMEI2 عن IMEI1",
  ],
  "IMEI1 and IMEI2 must differ.": [
    "L’IMEI1 et l’IMEI2 doivent être différents.",
    "يجب أن يختلف IMEI1 عن IMEI2.",
  ],
  "Invalid date": ["Date invalide", "تاريخ غير صالح"],
  "Payment below total": ["Paiement inférieur au total", "الدفع أقل من الإجمالي"],
  "Payment is lower than the total.": [
    "Le paiement est inférieur au total.",
    "الدفع أقل من الإجمالي.",
  ],
  "Receipt exceeds ordered quantity.": [
    "La réception dépasse la quantité commandée.",
    "الاستلام يتجاوز الكمية المطلوبة.",
  ],
  "Receipt stage required": ["Étape de réception requise", "مرحلة الاستلام إلزامية"],
  "Receive one serialized phone with a 15-digit IMEI1.": [
    "Réceptionnez un téléphone sérialisé avec un IMEI1 à 15 chiffres.",
    "استلم هاتفًا واحدًا بمعرّف IMEI1 من 15 رقمًا.",
  ],
  "SKU or barcode conflicts with an existing demo product. Select the existing SKU to receive it.":
    [
      "Le SKU ou le code-barres existe déjà. Sélectionnez le SKU existant pour le réceptionner.",
      "SKU أو الباركود موجود مسبقًا. اختر SKU الموجود لاستلامه.",
    ],
  "Schedule too large to display": [
    "Échéancier trop long pour être affiché",
    "الجدول أطول من أن يُعرض",
  ],
  "This demo unit is not available.": [
    "Cette unité n’est pas disponible.",
    "هذه الوحدة غير متاحة.",
  ],
  "Use 0–100": ["Entre 0 et 100", "من 0 إلى 100"],
  "Use YYYY-MM": ["Format AAAA-MM", "الصيغة YYYY-MM"],
  "Use YYYY-MM-DD": ["Format AAAA-MM-JJ", "الصيغة YYYY-MM-DD"],
  "Use a non-negative decimal, at most two decimal places": [
    "Décimal positif, deux décimales maximum",
    "عدد عشري موجب بخانتين عشريتين كحد أقصى",
  ],
  "Use a positive amount": ["Montant positif requis", "أدخل مبلغًا موجبًا"],
  "Use a positive whole quantity": ["Quantité entière positive requise", "أدخل كمية صحيحة موجبة"],
  "Use exactly 15 digits": ["Exactement 15 chiffres", "15 رقمًا بالضبط"],
  "Whole quantity required": ["Quantité entière requise", "يلزم إدخال كمية صحيحة"],
  "Basket is empty.": ["Le panier est vide.", "السلة فارغة."],
  "Quantity must be a positive whole number.": [
    "La quantité doit être un entier positif.",
    "يجب أن تكون الكمية عددًا صحيحًا موجبًا.",
  ],
  "SKU already exists.": ["Ce SKU existe déjà.", "هذا SKU موجود مسبقًا."],
  "Barcode already exists.": ["Ce code-barres existe déjà.", "هذا الباركود موجود مسبقًا."],
  "This test identity is not a member of this store.": [
    "Cette identité de test n’est pas affectée à ce magasin.",
    "هوية الاختبار هذه ليست عضوًا في هذا المتجر.",
  ],
  // statuses
  Available: ["Disponible", "متاح"],
  "Low stock": ["Stock bas", "مخزون منخفض"],
  Sold: ["Vendu", "مباع"],
  "In transit": ["En transit", "قيد النقل"],
  Pending: ["En attente", "قيد الانتظار"],
  Paid: ["Payé", "مدفوع"],
  Open: ["Ouvert", "مفتوح"],
  Overdue: ["En retard", "متأخر"],
  Inspection: ["Diagnostic", "قيد الفحص"],
  Draft: ["Brouillon", "مسودة"],
  Closed: ["Clôturé", "مغلق"],
  NEW: ["NEUF", "جديد"],
  USED: ["OCCASION", "مستعمل"],
  SEALED: ["SCELLÉ", "مختوم"],
  OPEN_BOX: ["BOÎTE OUVERTE", "علبة مفتوحة"],
  NO_BOX: ["SANS BOÎTE", "بدون علبة"],
  Cash: ["Espèces", "نقدًا"],
  Bank: ["Banque", "بنك"],
  "Some items on this transfer are no longer available. Review and revalidate the transfer first.":
    [
      "Certains articles de ce transfert ne sont plus disponibles. Vérifiez et revalidez d’abord le transfert.",
      "بعض عناصر هذا التحويل لم تعد متاحة. راجع التحويل وأعد التحقق منه أولًا.",
    ],
  "No conflict to resolve on this transfer.": [
    "Aucun conflit à résoudre sur ce transfert.",
    "لا يوجد تعارض لحله في هذا التحويل.",
  ],
  "No available items remain on this transfer.": [
    "Aucun article disponible ne reste sur ce transfert.",
    "لم يتبقَّ أي عنصر متاح في هذا التحويل.",
  ],
};
const patterns: [RegExp, [string, string]][] = [
  [
    /^IMEI (\d+) already exists in test stock\.$/,
    ["L’IMEI $1 existe déjà dans le stock de test.", "IMEI $1 موجود مسبقًا في مخزون الاختبار."],
  ],
  [
    /^Phone (\S+) is no longer available\.$/,
    ["Le téléphone $1 n’est plus disponible.", "الهاتف $1 لم يعد متاحًا."],
  ],
  [/^Insufficient stock for (\S+)\.$/, ["Stock insuffisant pour $1.", "المخزون غير كافٍ لـ $1."]],
  [/^Invalid enum value/, ["Choisissez une option", "اختر خيارًا"]],
  [/^String must contain at least/, ["Obligatoire", "إلزامي"]],
];
export function localizeMessage(lang: Language, text: string): string {
  if (lang === "en") {
    return /^Invalid enum value/.test(text)
      ? "Select an option"
      : /^String must contain at least/.test(text)
        ? "Required"
        : text;
  }
  const i = lang === "fr-DZ" ? 0 : 1;
  const hit = M[text];
  if (hit) return hit[i];
  for (const [re, tr] of patterns) if (re.test(text)) return text.replace(re, tr[i]);
  return text;
}
