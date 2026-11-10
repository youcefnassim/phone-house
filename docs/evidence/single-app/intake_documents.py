import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

S = Path(__file__).parent / "shots"
S.mkdir(exist_ok=True)
R = []
def rec(name, ok, ev=""):
    R.append({"test": name, "result": "PASS" if ok else "FAIL", "evidence": str(ev)[:300]})
    print(("PASS " if ok else "FAIL ") + name, str(ev)[:200], flush=True)

IDB = """()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const st=tx.objectStore('kv');const a=st.get('workspace'),b=st.get('session');tx.oncomplete=()=>res({ws:a.result,s:b.result});};r.onerror=()=>rej(r.error);})"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800})
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        B = "http://localhost:8080"
        async def go(r):
            await pg.goto(B + r); await pg.wait_for_timeout(1800)
        async def db():
            return await pg.evaluate(IDB)
        D = lambda: pg.locator("[role=dialog]").last

        # fresh deterministic reset, French
        await go("/")
        await pg.evaluate("localStorage.setItem('ph-lang','fr')")
    
        await go("/")

        # open shift M01
        await go("/cash")
        await pg.get_by_role("button", name="Ouvrir une session").first.click()
        await D().get_by_label("montant").fill("5000")
        await D().get_by_role("button", name="Confirmer").click()
        await pg.wait_for_timeout(500)

        await go('/stock/phones')
        await pg.get_by_role('button',name='Ajouter un téléphone',exact=True).click()
        for label,value in [('Nom du modèle','Local Review Phone'),('Marque','Review'),('IMEI1','359876543210991'),('IMEI2','359876543210992'),('Couleur','Noir'),('Stockage','128 GB'),('Prix de vente (DZD)','45000'),('Référence code-barres','REVIEWPHONE991')]:
            await D().get_by_label(label,exact=True).fill(value)
        await D().get_by_label('État du téléphone',exact=True).select_option('NEW')
        await D().get_by_label('État de la boîte',exact=True).select_option('SEALED')
        await D().locator('form button[type=submit]').click()
        await pg.wait_for_timeout(500)
        # named cash sale via POS (phone PH000001)
        await go("/pos")
        await pg.get_by_label("Scanner un code-barres ou rechercher").fill("REVIEWPHONE991")
        await pg.keyboard.press("Enter")
        await pg.get_by_role("button", name="Vérifier le panier").click()
        await pg.wait_for_timeout(400)
        await D().get_by_label("Nom de famille").fill("Benali")
        await D().get_by_label("Prénom").fill("Amine")
        await D().get_by_label("Mode de paiement").select_option("Cash")
        await D().get_by_label("Montant saisi (DZD)").fill("190000")
        await D().locator("form button[type=submit]").last.click()
        await pg.wait_for_timeout(400)
        await D().get_by_role("button", name="Enregistrer la vente").click()
        await pg.wait_for_timeout(800)

        # automatic invoice preview after named sale
        dlg = D()
        auto = await dlg.locator("[data-testid=document-sheet]").count()
        rec("automatic invoice preview opens after named test sale", auto >= 1, f"sheets={auto}")
        await pg.screenshot(path=str(S / "print_01_auto_invoice.png"))

        # specimen banner visible
        spec = await dlg.locator(".document-specimen").inner_text()
        rec("SPECIMEN banner on invoice", "SPECIMEN" in spec.upper() or "SPÉCIMEN" in spec.upper(), spec[:80])

        # buyer name on document
        body = await dlg.locator("[data-testid=document-sheet]").inner_text()
        rec("buyer surname+given on invoice", "Benali" in body and "Amine" in body, "")

        # mock window.print with counter, then print invoice
        await pg.evaluate("window.__printCount=0;window.print=()=>{window.__printCount++;};void 0;")
        before = json.dumps(await db())
        await dlg.get_by_role("button", name="Imprimer").click()
        await pg.wait_for_timeout(300)
        n = await pg.evaluate("window.__printCount")
        rec("print button invokes window.print exactly once", n == 1, f"count={n}")

        # print root exists in DOM with sheet
        pr = await pg.locator(".test-document-print-root [data-testid=document-sheet]").count()
        rec("dedicated print root renders the sheet", pr == 1, f"print-root sheets={pr}")

        # print CSS rules present
        css = await pg.evaluate("""()=>{let t='';for(const s of document.styleSheets){try{for(const r of s.cssRules){t+=r.cssText+'\\n'}}catch(e){}}return t}""")
        rec("@media print hides app chrome", "@media print" in css and "printing-test-document" in css, "")

        # body class toggled off after print (finally block)
        cls = await pg.evaluate("document.body.classList.contains('printing-test-document')")
        rec("printing class removed after print", cls is False, "")

        # reprint x3: no ledger mutation
        for _ in range(3):
            await dlg.get_by_role("button", name="Imprimer").click()
            await pg.wait_for_timeout(200)
        n = await pg.evaluate("window.__printCount")
        after = json.dumps(await db())
        rec("4 prints total, zero ledger mutation (stock/cash/sales/debts/audit)", n == 4 and before == after, f"count={n} mutated={before != after}")

        # warranty tab + print
        await dlg.get_by_role("button", name="Spécimen garantie").click()
        await pg.wait_for_timeout(300)
        wbody = await dlg.locator("[data-testid=document-sheet]").inner_text()
        rec("warranty sheet shows item + IMEI", "IMEI1" in wbody, "")
        await dlg.get_by_role("button", name="Imprimer").click()
        await pg.wait_for_timeout(200)
        n = await pg.evaluate("window.__printCount")
        after2 = json.dumps(await db())
        rec("warranty print invokes print, still no mutation", n == 5 and before == after2, f"count={n}")
        await pg.screenshot(path=str(S / "print_02_warranty.png"))

        # close, reopen from SAV sale-document history, reprint
        await dlg.get_by_role("button", name="Fermer").click()
        await pg.wait_for_timeout(400)
        await go("/sav")
        await pg.wait_for_timeout(600)
        reopen = pg.get_by_role("button", name=re.compile("Rouvrir les documents"))
        cnt = await reopen.count()
        rec("sale document history lists the sale in SAV", cnt >= 1, f"rows={cnt}")
        await reopen.first.click()
        await pg.wait_for_timeout(600)
        await pg.evaluate("window.__printCount=0;window.print=()=>{window.__printCount++;};void 0;")
        await D().get_by_role("button", name="Imprimer").click()
        await pg.wait_for_timeout(300)
        n = await pg.evaluate("window.__printCount")
        after3 = json.dumps(await db())
        rec("reopen from history + reprint: print invoked, no mutation", n == 1 and before == after3, f"count={n}")
        await pg.screenshot(path=str(S / "print_03_reopen_history.png"))

        await D().get_by_role('button',name='Fermer').click()
        await go('/')
        dashboard=await pg.locator('.metrics-grid').inner_text()
        rec('dashboard reads named phone sale total and cash balance after reload', '45' in dashboard and '50' in dashboard, dashboard)
        await go('/pos')
        await pg.get_by_label('Scanner un code-barres ou rechercher').fill('AC000001')
        await pg.keyboard.press('Enter')
        await pg.get_by_role('button',name='Vérifier le panier',exact=True).click()
        await D().get_by_label('Mode de paiement').select_option('Cash')
        await D().get_by_label('Montant saisi (DZD)').fill('1800')
        await D().locator('form button[type=submit]').last.click()
        await D().get_by_role('button',name='Enregistrer la vente',exact=True).click()
        await pg.reload();await pg.wait_for_timeout(1500)
        accessory=await db()
        rec('accessory sale persists quantity decrement and separate cash movement', next(x for x in accessory['ws']['accessories'] if x['id']=='AC-001')['quantity']==19 and len(accessory['ws']['sales'])==2 and accessory['ws']['sales'][0]['total']=='1800.00')
        # Arabic RTL document rendering
        await pg.evaluate("localStorage.setItem('ph-lang','ar-DZ')")
        await go("/sav")
        await pg.get_by_role("button", name=re.compile("إعادة فتح مستندات")).first.click()
        await pg.wait_for_timeout(600)
        dirv = await D().locator("[data-testid=document-sheet]").get_attribute("dir")
        rec("Arabic document renders dir=rtl", dirv == "rtl", f"dir={dirv}")
        await pg.screenshot(path=str(S / "print_04_arabic_rtl.png"))

        rec("no page errors during print flows", len(errors) == 0, ";".join(errors[:3]))

        Path(__file__).parent / "print_results.json"
        with open(Path(__file__).parent / "print_results.json", "w") as f:
            json.dump(R, f, indent=1, ensure_ascii=False)
        p_ = sum(r["result"] == "PASS" for r in R)
        print(f"TOTAL {len(R)} PASS {p_} FAIL {len(R) - p_}")
        await b.close()

asyncio.run(main())
