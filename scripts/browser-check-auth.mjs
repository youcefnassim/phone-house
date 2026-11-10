// Real-browser check of the 2.2b screens through `wrangler dev` (installed Google Chrome, headless).
// Usage: node browser-auth.mjs <repoDir> <outDir>
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
const [repo, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const require = createRequire(join(repo, "package.json"));
const puppeteer = require("puppeteer-core");
const B = "http://localhost:8787";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const problems = [];
async function page(lang, theme = "light", width = 1440) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width, height: 900 });
  await p.evaluateOnNewDocument(
    (l, t) => {
      localStorage.setItem("ph-lang", l);
      localStorage.setItem("ph-theme", t);
    },
    lang,
    theme,
  );
  p.on("console", (m) => m.type() === "error" && problems.push(`[${lang}] console: ${m.text()}`));
  p.on("response", (r) => {
    if (r.status() === 404 || (r.url().includes("/api/") && r.status() >= 500))
      problems.push(`[${lang}] ${r.status()} ${r.url()}`);
  });
  return { ctx, p };
}
const shot = (p, name) => p.screenshot({ path: join(out, `${name}.png`), fullPage: false });
const text = async (p, t, timeout = 20000) => {
  try {
    await p.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t);
  } catch (e) {
    await p.screenshot({ path: join(out, "FAIL.png") });
    console.log(
      "FAIL waiting for",
      t,
      "\nBODY:",
      (await p.evaluate(() => document.body.innerText)).slice(0, 600),
    );
    console.log("INPUT VALUES:", await p.$$eval("input", (els) => els.map((e) => e.value.length)));
    throw e;
  }
};
async function login(p, email, password) {
  await p.waitForSelector('input[type="email"]');
  await p.type('input[type="email"]', email);
  await p.type('input[type="password"]', password);
  await p.click('button[type="submit"]');
}
async function pin(p, digits) {
  const input = await p.waitForSelector("input[inputmode=numeric]");
  await input.click({ clickCount: 3 });
  await input.type(digits);
  await input.press("Enter");
}
const report = [];
// ---------- FR: seller first login on the shop PC: change password, then PIN ----------
{
  const { ctx, p } = await page("fr-DZ");
  await p.goto(B + "/", { waitUntil: "networkidle0" });
  await text(p, "Connexion");
  await shot(p, "fr-1-login");
  await login(p, "hana@local.test", "Provisoire-Magasin-02");
  await text(p, "Choisissez votre mot de passe");
  await shot(p, "fr-2-change-password");
  const pw = await p.$$('input[type="password"]');
  await pw[0].type("Provisoire-Magasin-02");
  await pw[1].type("Vendeuse-Hana-Secret-26");
  await pw[2].type("Vendeuse-Hana-Secret-26");
  // First a password containing her name: the server policy must refuse it with a clear message.
  await p.click('button[type="submit"]');
  await text(p, "contient votre nom");
  await shot(p, "fr-2b-password-policy-message");
  // Reload: the forced-change screen must come back from the cookie session, with empty fields.
  await p.reload({ waitUntil: "networkidle0" });
  await text(p, "Choisissez votre mot de passe");
  const fresh = await p.$$('input[type="password"]');
  await fresh[0].type("Provisoire-Magasin-02");
  await fresh[1].type("Vendeuse-Magasin-Secret-26");
  await fresh[2].type("Vendeuse-Magasin-Secret-26");
  await p.click('button[type="submit"]');
  await text(p, "Choisissez votre code PIN");
  await shot(p, "fr-3-set-pin");
  await pin(p, "4825");
  await text(p, "Confirmer le code PIN");
  await pin(p, "4825");
  await p.waitForSelector('[data-testid="active-seller"]');
  await new Promise((r) => setTimeout(r, 1500));
  report.push(
    `FR active name: ${await p.$eval('[data-testid="active-seller"]', (e) => e.textContent)}`,
  );
  report.push(
    `FR shows not-connected text: ${(await p.evaluate(() => document.body.innerText)).includes("non connecté")}`,
  );
  await shot(p, "fr-4-app-after-first-login");
  await ctx.close();
}
// ---------- AR: owner on the M01 PC, alerts, switch seller with PIN pad ----------
{
  const { ctx, p } = await page("ar-DZ");
  await p.goto(B + "/", { waitUntil: "networkidle0" });
  await text(p, "تسجيل الدخول");
  report.push(`AR dir: ${await p.evaluate(() => document.documentElement.dir)}`);
  await shot(p, "ar-1-login");
  // wrong password -> generic message
  await login(p, "owner@local.test", "Mot-De-Passe-Faux-1");
  await text(p, "غير صحيحة");
  await shot(p, "ar-2-login-error");
  await p.reload({ waitUntil: "networkidle0" });
  await login(p, "owner@local.test", "Proprietaire-Definitif-2026");
  await p.waitForSelector('[data-testid="active-seller"]');
  await new Promise((r) => setTimeout(r, 2000));
  await shot(p, "ar-3-owner-bar");
  const alertsButton = await p.waitForSelector("xpath/.//button[contains(., 'تنبيهات أمنية')]");
  await alertsButton.click();
  await new Promise((r) => setTimeout(r, 500));
  await shot(p, "ar-4-owner-alerts");
  await alertsButton.click();
  const sw = await p.waitForSelector("xpath/.//button[contains(., 'تغيير البائع')]");
  await sw.click();
  await text(p, "اختر اسمك");
  await new Promise((r) => setTimeout(r, 800));
  await shot(p, "ar-5-choose-seller");
  const karim = await p.waitForSelector(
    "xpath/.//div[@role='dialog']//button[contains(., 'Karim')]",
  );
  await karim.click();
  await text(p, "أدخل رمزك السري");
  await shot(p, "ar-6-pin-pad");
  await pin(p, "4071");
  await p.waitForFunction(
    () => document.querySelector('[data-testid="active-seller"]')?.textContent?.includes("Karim"),
    { timeout: 20000 },
  );
  await new Promise((r) => setTimeout(r, 1500));
  await shot(p, "ar-7-active-seller-karim");
  report.push(
    `AR active name after PIN: ${await p.$eval('[data-testid="active-seller"]', (e) => e.textContent)}`,
  );
  // Dark mode + reload: the session resumes from the HttpOnly cookie, Karim still active.
  await p.evaluate(() => localStorage.setItem("ph-theme", "dark"));
  await p.evaluateOnNewDocument(() => localStorage.setItem("ph-theme", "dark"));
  await p.reload({ waitUntil: "networkidle0" });
  await p.waitForFunction(
    () => document.querySelector('[data-testid="active-seller"]')?.textContent?.includes("Karim"),
    { timeout: 20000 },
  );
  await new Promise((r) => setTimeout(r, 1500));
  report.push(
    `AR after reload (cookie refresh): ${await p.$eval('[data-testid="active-seller"]', (e) => e.textContent)}, dark=${await p.evaluate(() => document.documentElement.classList.contains("dark"))}`,
  );
  report.push(
    `AR token in storage: ${await p.evaluate(() => JSON.stringify({ ...localStorage }).includes("eyJ"))}`,
  );
  await shot(p, "ar-8-dark-after-reload");
  await ctx.close();
}
// ---------- Mobile width (390px), FR login ----------
{
  const { ctx, p } = await page("fr-DZ", "light", 390);
  await p.goto(B + "/", { waitUntil: "networkidle0" });
  await text(p, "Connexion");
  report.push(
    `390px horizontal overflow: ${await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)}`,
  );
  await shot(p, "fr-9-login-390px");
  await ctx.close();
}
await browser.close();
console.log(report.join("\n"));
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no console errors, no 5xx");
