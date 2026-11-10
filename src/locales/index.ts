// Per-module dictionaries merged into src/i18n.ts. Each module file exports
// {en, fr, ar} with identical keys (fr/ar typed against en). Key prefix = module name.
import * as testws from "./testws";
import * as suppliers from "./suppliers";
import * as expenses from "./expenses";
import * as facility from "./facility";
import * as service from "./service";
import * as catalog from "./catalog";
import * as users from "./users";
import * as reports from "./reports";
import * as audit from "./audit";
import * as flows from "./flows";
import * as backend from "./backend";
import * as native from "./native";
import * as a11y from "./a11y";
import * as documents from "./documents";
import * as review from "./review";
import * as retail from "./retail";
import * as sales from "./sales";
import * as provenance from "./provenance";
import * as cashCredit from "./cash-credit";
import * as posCorrection from "./pos-correction";
export const moduleEn = {
  ...cashCredit.en,
  ...posCorrection.en,
  ...testws.en,
  ...suppliers.en,
  ...expenses.en,
  ...facility.en,
  ...service.en,
  ...catalog.en,
  ...users.en,
  ...reports.en,
  ...audit.en,
  ...flows.en,
  ...backend.en,
  ...native.en,
  ...a11y.en,
  ...documents.en,
  ...review.en,
  ...retail.en,
  ...sales.en,
  ...provenance.en,
};
export const moduleFr: Record<keyof typeof moduleEn, string> = {
  ...cashCredit.fr,
  ...posCorrection.fr,
  ...testws.fr,
  ...suppliers.fr,
  ...expenses.fr,
  ...facility.fr,
  ...service.fr,
  ...catalog.fr,
  ...users.fr,
  ...reports.fr,
  ...audit.fr,
  ...flows.fr,
  ...backend.fr,
  ...native.fr,
  ...a11y.fr,
  ...documents.fr,
  ...review.fr,
  ...retail.fr,
  ...sales.fr,
  ...provenance.fr,
};
export const moduleAr: Record<keyof typeof moduleEn, string> = {
  ...cashCredit.ar,
  ...posCorrection.ar,
  ...testws.ar,
  ...suppliers.ar,
  ...expenses.ar,
  ...facility.ar,
  ...service.ar,
  ...catalog.ar,
  ...users.ar,
  ...reports.ar,
  ...audit.ar,
  ...flows.ar,
  ...backend.ar,
  ...native.ar,
  ...a11y.ar,
  ...documents.ar,
  ...review.ar,
  ...retail.ar,
  ...sales.ar,
  ...provenance.ar,
};
