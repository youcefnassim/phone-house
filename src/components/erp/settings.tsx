import { DocumentSettingsForm } from "./document-settings";
import { documentText } from "@/locales/warranty-documents";
import { useState } from "react";
import { LocalReviewSettings } from "./local-review-settings";
import { Moon, Sun, LockKeyhole, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { languages, type Language } from "@/i18n";
import { IntakeSettingsForm, useIntakeText } from "./fast-intake";
import {
  reviewActor,
  saveTestSetting,
  testSettings,
  useTestWorkspace,
} from "@/data/test-workspace";
// Document status stays an approval gate; no fiscal configuration is invented.
export function SettingsPage() {
  const { dark, toggleTheme, lang, setLang, scope, setScope, t } = useErp();
  const [tab, setTab] = useState("workspace");
  const [saved, setSaved] = useState(false);
  const workspace = useTestWorkspace();
  const x = useIntakeText();
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("set.eyebrow")}</div>
          <h1>
            {t("set.title")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t("set.subtitle")}</p>
        </div>
      </div>
      <details className="retail-details settings-local">
        <summary>{t("retail.about")}</summary>
        <LocalReviewSettings />
      </details>
      <div className="module-tabs">
        {(
          [
            ["workspace", t("set.tabWorkspace")],
            ["policies", t("set.tabPolicies")],
            ["devices", t("set.tabDevices")],
            ["intake", x("section")],
            ["documents", documentText[lang].section],
          ] as const
        ).map(([value, label]) => (
          <Button
            variant="ghost"
            className={tab === value ? "tab-active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "workspace" ? (
        <div className="settings-sections">
          <section>
            <h2>{t("set.appearance")}</h2>
            <p>{t("set.appearanceText")}</p>
            <Button variant="outline" onClick={toggleTheme}>
              {dark ? <Sun /> : <Moon />}
              {dark ? t("set.useLight") : t("set.useDark")}
            </Button>
          </section>
          <section>
            <h2>{t("set.environment")}</h2>
            <dl className="detail-list">
              <dt>{t("set.workspace")}</dt>
              <dd>Phone House Maghnia · Track B</dd>
              <dt>{t("set.data")}</dt>
              <dd>{t("set.dataValue")}</dd>
              <dt>{t("set.backend")}</dt>
              <dd>{t("set.backendValue")}</dd>
              <dt>{t("set.authentication")}</dt>
              <dd>{t("set.authValue")}</dd>
              <dt>{t("set.timezone")}</dt>
              <dd>Africa/Algiers</dd>
              <dt>{t("set.currency")}</dt>
              <dd>{t("set.currencyValue")}</dd>
            </dl>
          </section>
          <section>
            <h2>{t("set.preferences")}</h2>
            <form
              className="draft-form"
              onSubmit={(e) => {
                e.preventDefault();
                setSaved(true);
              }}
            >
              <label>
                {t("set.interfaceLanguage")}
                <select
                  aria-label={t("set.interfaceLanguage")}
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Language)}
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("set.defaultStore")}
                <select
                  aria-label={t("set.defaultStore")}
                  value={scope === "ALL" ? "M01" : scope}
                  onChange={(e) => setScope(e.target.value as "M01" | "M02")}
                >
                  <option value="M01">{t("shell.store1")}</option>
                  <option value="M02">{t("shell.store2")}</option>
                </select>
              </label>
              <Button type="submit">{t("set.apply")}</Button>
              {saved && <p role="status">{t("set.applied")}</p>}
            </form>
          </section>
        </div>
      ) : tab === "documents" ? (
        <div className="settings-sections">
          <DocumentSettingsForm
            settings={testSettings(workspace)}
            canEdit={reviewActor(workspace)?.role === "SUPER_ADMIN"}
            onSave={async (key, value) => {
              saveTestSetting(key, value as never);
            }}
          />
        </div>
      ) : tab === "intake" ? (
        <div className="settings-sections">
          <IntakeSettingsForm
            settings={testSettings(workspace)}
            canEdit={reviewActor(workspace)?.role === "SUPER_ADMIN"}
            onSave={(key, value) => saveTestSetting(key, value)}
          />
        </div>
      ) : tab === "policies" ? (
        <div className="settings-sections">
          <section>
            <h2>{t("set.policiesPending")}</h2>
            <div className="safety-notice">{t("set.policiesNotice")}</div>
            <dl className="detail-list">
              {(
                ["discount", "rounding", "credit", "warranty", "offline", "tax", "zakat"] as const
              ).map((p) => (
                <div className="policy-row" key={p}>
                  <dt>{t(`be.policy.${p}`)}</dt>
                  <dd>
                    <LockKeyhole size={13} />
                    {t("set.unconfigured")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : (
        <div className="settings-sections">
          <section>
            <h2>{t("set.devices")}</h2>
            <p>{t("set.devicesText")}</p>
            <div className="safety-notice">
              <Printer />
              {t("set.devicesNotice")}
            </div>
            <Button variant="outline" disabled>
              {t("set.registerDevice")}
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
