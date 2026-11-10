import asyncio,json,re,traceback
from pathlib import Path
from playwright.async_api import async_playwright
S=Path(__file__).parent/"shots";S.mkdir(exist_ok=True)
R=[]
def rec(name,ok,ev=""):R.append({"test":name,"result":"PASS" if ok else "FAIL","evidence":str(ev)[:300]});print(("PASS " if ok else "FAIL ")+name,str(ev)[:200],flush=True)
IDB="""()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const st=tx.objectStore('kv');const a=st.get('workspace'),b=st.get('session');tx.oncomplete=()=>res({ws:a.result,s:b.result});};r.onerror=()=>rej(r.error);})"""
B="http://localhost:8080"
async def step(name,fn):
  try: await fn()
  except Exception as e: rec(name+" (script error)",False,repr(e)[:300])
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={"width":1280,"height":1800});pg=await ctx.new_page()
    errors=[];pg.on("pageerror",lambda e:errors.append(str(e)));pg.on("dialog",lambda d:asyncio.ensure_future(d.accept()))
    async def go(r):await pg.goto(B+r);await pg.wait_for_timeout(1500)
    async def db():return await pg.evaluate(IDB)
    D=lambda:pg.locator("[role=dialog]").last
    async def submit():await D().locator("form button[type=submit]").last.click();await pg.wait_for_timeout(400)
    await go("/");await pg.evaluate("localStorage.setItem('ph-lang','en');localStorage.setItem('ph-theme','light')")
    await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('ph-test-workspace');q.onsuccess=q.onerror=q.onblocked=()=>r(0);})")
    await go("/")
    st={}
    async def intake():
      await go("/stock/phones");await pg.get_by_role("button",name="Add phone unit").first.click()
      f=D()
      await f.get_by_label("Model name").fill("E2E Phone X");await f.get_by_label("Brand").fill("E2E")
      await f.get_by_label("Store",exact=True).select_option("M01")
      for lab in ["Phone condition","Box condition"]:
        opts=await f.get_by_label(lab).locator("option").evaluate_all("o=>o.map(x=>x.value).filter(Boolean)");await f.get_by_label(lab).select_option(opts[0])
      await f.get_by_label("IMEI1").fill("359111111111119");await f.get_by_label("IMEI2").fill("359111111111127")
      await f.get_by_label("Color").fill("Black");await f.get_by_label("Storage").fill("128 GB");await f.get_by_label("Sale price (DZD)").fill("45000.50");await f.get_by_label("Barcode reference").fill("E2EPH01")
      await submit();await pg.reload();await pg.wait_for_timeout(1500);d=await db()
      ph=[x for x in d["ws"]["phones"] if x["imei"]=="359111111111119"]
      rec("phone intake → stock persisted after reload (Available, M01, price 45000.50)",len(ph)==1 and ph[0]["status"]=="Available" and ph[0]["store"]=="M01" and ph[0]["amount"] in("45000.50","45000.5"),ph[0] if ph else d["ws"]["phones"][:1])
      st["ph"]=ph[0]
      await pg.get_by_role("button",name="Add phone unit").first.click();f=D()
      await f.get_by_label("Model name").fill("Dup");await f.get_by_label("Brand").fill("E2E");await f.get_by_label("IMEI1").fill("359111111111127")
      await f.get_by_label("Sale price (DZD)").fill("1000");await f.get_by_label("Barcode reference").fill("E2EDUP")
      for lab in ["Phone condition","Box condition"]:
        opts=await f.get_by_label(lab).locator("option").evaluate_all("o=>o.map(x=>x.value).filter(Boolean)");await f.get_by_label(lab).select_option(opts[0])
      await f.get_by_label("Color").fill("B");await f.get_by_label("Storage").fill("64 GB");await submit()
      al=" ".join(await D().get_by_role("alert").all_inner_texts()) if await pg.locator("[role=dialog]").count() else ""
      d=await db();rec("duplicate IMEI (IMEI2 reused as IMEI1) rejected; no record added",not any(x["name"]=="Dup" for x in d["ws"]["phones"]),al)
      await pg.keyboard.press("Escape")
    await step("phone intake",intake)
    async def shift():
      await go("/cash");await pg.get_by_role("button",name="Open test shift").first.click();await D().get_by_label("Opening amount (DZD)").fill("5000");await D().get_by_role("button",name="Confirm").click();await pg.wait_for_timeout(500)
      d=await db();rec("cash shift opened on M01 drawer",sum(1 for s in d["ws"]["shifts"] if s["status"]=="OPEN" and s["store"]=="M01")==1)
    await step("shift",shift)
    async def sale():
      await go("/pos");await pg.get_by_label("Scan barcode or search products").fill("E2EPH01");await pg.keyboard.press("Enter")
      await pg.get_by_role("button",name="Review test basket").click();await pg.wait_for_timeout(300)
      await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Entered amount (DZD)").fill("40000");await submit()
      under=" ".join(await D().get_by_role("alert").all_inner_texts())
      await D().get_by_label("Entered amount (DZD)").fill("50000");await submit()
      btn=D().get_by_role("button",name="Record local test sale")
      await btn.dblclick();await pg.wait_for_timeout(300)
      try: await btn.click(timeout=1500)
      except Exception: pass
      await pg.wait_for_timeout(500);await pg.reload();await pg.wait_for_timeout(1500);d=await db()
      sales=[s for s in d["ws"]["sales"] if any(l["id"]==st["ph"]["id"] for l in s["lines"])]
      ph=[x for x in d["ws"]["phones"] if x["id"]==st["ph"]["id"]][0]
      rec("invalid underpayment rejected",("below" in under) and True,under)
      rec("intake → POS → cash sale: exactly ONE sale after repeated submit, phone Sold, change 4999.50, cash movement linked (after reload)",len(sales)==1 and ph["status"]=="Sold" and sales[0]["change"]=="4999.50" and sum(1 for c in d["ws"]["cash"] if c["reference"]==sales[0]["id"])==1,sales[0]["id"] if sales else "")
      st["sale"]=sales[0]["id"] if sales else ""
    await step("sale",sale)
    async def acc():
      d=await db();a0=[a for a in d["ws"]["accessories"] if a["id"]=="AC-001"][0]
      await go("/stock/accessories");await pg.get_by_role("button",name="Receive accessories").first.click();f=D()
      sel=f.get_by_label("Receiving product");opts=await sel.locator("option").evaluate_all("o=>o.map(x=>[x.value,x.textContent])")
      v=[o[0] for o in opts if "AC-001" in o[0] or "AC-001" in (o[1] or "")]
      await sel.select_option(v[0] if v else opts[1][0]);await f.get_by_label("Receiving quantity").fill("5");await f.get_by_label("Receiving reference").fill("RCV-E2E-1");await submit()
      await pg.reload();await pg.wait_for_timeout(1500);d=await db();a1=[a for a in d["ws"]["accessories"] if a["id"]=="AC-001"][0]
      mv=[m for m in d["ws"]["movements"] if m["sku"]=="AC-001" and m["reason"]=="RECEIVING"]
      rec("accessory receive +5 with RECEIVING movement (after reload)",a1["quantity"]==a0["quantity"]+5 and len(mv)==1 and mv[0]["quantity"]==5,f'{a0["quantity"]}->{a1["quantity"]}')
      await go("/pos");await pg.get_by_label("Scan barcode or search products").fill(a1.get("code") or "AC-001");await pg.keyboard.press("Enter")
      await pg.get_by_role("button",name="Review test basket").click();await pg.wait_for_timeout(300)
      await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Entered amount (DZD)").fill(a1["amount"]);await submit()
      await D().get_by_role("button",name="Record local test sale").click();await pg.wait_for_timeout(500)
      await pg.reload();await pg.wait_for_timeout(1500);d=await db();a2=[a for a in d["ws"]["accessories"] if a["id"]=="AC-001"][0]
      smv=[m for m in d["ws"]["movements"] if m["sku"]=="AC-001" and m["reason"]=="SALE"]
      rec("accessory sell −1 with SALE movement matching sale (after reload)",a2["quantity"]==a1["quantity"]-1 and len(smv)==1 and smv[0]["quantity"]==-1 and any(s["id"]==smv[0]["reference"] for s in d["ws"]["sales"]),f'{a1["quantity"]}->{a2["quantity"]}')
    await step("accessory",acc)
    async def fin():
      await go("/customers");await pg.get_by_role("button",name="Add customer").click()
      await D().get_by_label("Customer name").fill("E2E Client Alpha");await D().get_by_label("Contact reference").fill("0550 999 111")
      await D().get_by_label("Store",exact=True).select_option("M01");await D().get_by_label("Customer reference").fill("E2E-REF-1");await submit()
      d=await db();cid=[c for c in d["s"]["customers"] if c["name"]=="E2E Client Alpha"][0]["id"]
      await go("/pos");await pg.get_by_label("Test customer").select_option(cid)
      await pg.get_by_label("Scan barcode or search products").fill("PH000002");await pg.keyboard.press("Enter")
      await pg.get_by_role("button",name="Review test basket").click();await pg.wait_for_timeout(300)
      await D().get_by_role("button",name="Prepare credit request draft").click()
      await D().get_by_label("Upfront amount stated (DZD, not collected)").fill("26000");await D().get_by_label("Due date").fill("2026-12-31");await D().get_by_label("Authorization reference").fill("AUTH-E2E")
      await D().get_by_role("button",name="Save credit request draft").click();await pg.wait_for_timeout(500)
      d=await db();debt=[x for x in d["s"]["debts"] if x["customerId"]==cid][0];did=debt["id"]
      await go("/debts");await pg.get_by_role("button",name=f"Debt {did}").click()
      await D().get_by_role("button",name="Repayment draft").click()
      await D().get_by_label("Repayment amount (DZD)").fill("40000.25");await D().get_by_label("Payment date").fill("2026-11-06");await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Payment reference").fill("PAY-E2E-1");await D().get_by_label("Authorization reference").fill("AUTH-E2E");await submit()
      await D().get_by_role("button",name="Repayment draft").click()
      await D().get_by_label("Repayment amount (DZD)").fill("59999.76");await D().get_by_label("Payment date").fill("2026-11-06");await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Payment reference").fill("PAY-E2E-2");await D().get_by_label("Authorization reference").fill("AUTH-E2E");await submit()
      over=" ".join(await D().get_by_role("alert").all_inner_texts())
      await pg.reload();await pg.wait_for_timeout(1500);await pg.get_by_role("button",name=f"Debt {did}").click();await pg.wait_for_timeout(300)
      g=lambda k:D().get_by_test_id(k).inner_text()
      vals={k:(await g(k)).replace("\u202f"," ").replace("\xa0"," ") for k in ["debt-obligation","debt-recorded-paid","debt-draft-repayments","debt-projected","debt-confirmed-outstanding"]}
      await D().screenshot(path=str(S/"fin_debt_figures_en.png"))
      num=lambda s:re.sub(r"[^\d.,]","",s)
      nv=lambda k:float(re.sub(r"[^\d.]","",vals[k].replace(",",".") if vals[k].count(",")==1 and "." not in vals[k] else vals[k]))
      rec("debt detail separates figures after reload: obligation 100000.00, confirmed paid 0.00, drafts 40000.25, projected 59999.75",all(abs(nv(k)-float(x))<0.001 for k,x in [("debt-obligation","100000.00"),("debt-recorded-paid","0.00"),("debt-draft-repayments","40000.25"),("debt-projected","59999.75"),("debt-confirmed-outstanding","100000.00")]),vals)
      rec("overpayment 59999.76 rejected",("exceeds" in over),over)
      await pg.keyboard.press("Escape")
    await step("financial",fin)
    async def conflict():
      await go("/transfers");await pg.get_by_role("button",name="Transfer draft").click()
      await D().get_by_role("button",name=re.compile("iPhone 14")).click();await D().get_by_label("Transfer document reference").fill("TR-CONFLICT");await D().get_by_role("button",name="Save transfer draft").click();await pg.wait_for_timeout(400)
      await D().get_by_role("button",name="Move to: Approvals").click();await pg.wait_for_timeout(200)
      await D().get_by_label("Super Admin approval draft").select_option("U-OWN");await D().get_by_role("button",name="Record preview approval").first.click();await pg.wait_for_timeout(200)
      await pg.keyboard.press("Escape")
      d=await db();t=d["ws"]["transfers"][0];pid=t["lines"][0]["id"];code=t["lines"][0]["code"]
      await go("/pos");await pg.get_by_label("Scan barcode or search products").fill(code);await pg.keyboard.press("Enter");await pg.wait_for_timeout(300)
      hint=await pg.locator(".pos-transfer-hint").count()
      await pg.get_by_role("button",name="Review test basket").click();await pg.wait_for_timeout(300)
      price=[x for x in d["ws"]["phones"] if x["id"]==pid][0]["amount"]
      await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Entered amount (DZD)").fill(price);await submit()
      await D().get_by_role("button",name="Record local test sale").click();await pg.wait_for_timeout(500)
      rec("POS shows warning when basket phone is on an undispatched transfer; sale still allowed",hint==1)
      await go("/transfers");badge=await pg.locator(".conflict-badge").count()
      await pg.get_by_role("button",name=f"Transfer {t['id']} details").or_(pg.get_by_role("button",name=re.compile(t['id']))).first.click();await pg.wait_for_timeout(300)
      alert=await D().locator(".conflict-notice").count();adv=D().get_by_role("button",name=re.compile("Move to"))
      dis=await adv.is_disabled()
      await D().get_by_role("button",name=re.compile("Revalidate")).click();await pg.wait_for_timeout(200)
      rv=" ".join(await D().get_by_role("alert").all_inner_texts())
      await D().screenshot(path=str(S/"transfer_conflict_en.png"))
      await pg.reload();await pg.wait_for_timeout(1500);d=await db();t2=[x for x in d["ws"]["transfers"] if x["id"]==t["id"]][0];ph=[x for x in d["ws"]["phones"] if x["id"]==pid][0]
      rec("transfer flagged (badge + alert), advance disabled, revalidation refuses empty, stage unchanged, phone Sold at M01, not at M02 (after reload)",badge>=1 and alert==1 and dis and "No available items" in rv and t2["stage"]=="APPROVALS" and ph["status"]=="Sold" and ph["store"]=="M01",f"badge={badge} alert={alert} disabled={dis} rv={rv} stage={t2['stage']}")
      await pg.keyboard.press("Escape")
    await step("conflict",conflict)
    async def blind():
      await go("/cash");d0=await db();sid=[x for x in d0["ws"]["shifts"] if x["store"]=="M01" and x["status"]=="OPEN"][0]["id"]
      await pg.get_by_role("button",name="Blind close").first.click();await pg.wait_for_timeout(300)
      txt=await D().inner_text();hidden="revealed only after" in txt and "Expected" not in txt.split("revealed")[0][-5:]
      await D().get_by_label("Blind counted total (DZD)").fill("1");await D().locator("button[type=submit]").click()
      await pg.wait_for_timeout(400);await pg.reload();await pg.wait_for_timeout(1500);d=await db()
      sh=[s for s in d["ws"]["shifts"] if s["store"]=="M01"]
      rec("blind close: expected hidden during count; M01 shift closed with counted 1.00 persisted",hidden and all(s["status"]!="OPEN" for s in sh) and any(s["id"]==sid and str(s.get("counted","")).startswith("1") for s in sh),json.dumps(sh)[:250])
    await step("blind close",blind)
    async def m02():
      await go("/stock/phones");await pg.get_by_label("Store").first.select_option("M02");await pg.wait_for_timeout(500)
      t=await pg.locator("main").inner_text();d=await db()
      m01=[x["imei"] for x in d["ws"]["phones"] if x["store"]=="M01"]
      await go("/facility");await pg.get_by_label("Store").first.select_option("M02");await pg.wait_for_timeout(400);ft=await pg.locator("main").inner_text()
      rec("M02 scope hides M01 phones; facility M01-only in M02 scope",not any(i in t for i in m01) and "only" in ft)
      await pg.get_by_label("Store").first.select_option("ALL")
    await step("m02",m02)
    async def audit():
      out={}
      for lang in ["fr-DZ","ar-DZ"]:
        await pg.evaluate(f"localStorage.setItem('ph-lang','{lang}')");await go("/audit");tx=await pg.locator("main").inner_text()
        await pg.screenshot(path=str(S/f"audit_{lang}.png"));out[lang]=tx
      en=["Test phone intake","Local test sale","Test receiving","Test shift opened","Test transfer draft","Credit request draft","Repayment preview draft","Customer draft saved","All stores"]
      leaks={l:[w for w in en if w in out[l]] for l in out}
      rec("audit actions localized in FR and AR (no raw English action codes)",not leaks["fr-DZ"] and not leaks["ar-DZ"] and "Entrée de téléphone (test)" in out["fr-DZ"] and "إدخال هاتف (اختبار)" in out["ar-DZ"],leaks)
      await pg.evaluate("localStorage.setItem('ph-lang','en')")
    await step("audit",audit)
    async def keyboard():
      res=[]
      for vw in [(1440,900),(768,1024),(390,844)]:
        await pg.set_viewport_size({"width":vw[0],"height":vw[1]})
        for route,name in [("/customers","Add customer"),("/transfers","Transfer draft"),("/debts","Debt draft")]:
          await go(route);trig=pg.get_by_role("button",name=name).first;await trig.focus();await pg.keyboard.press("Enter");await pg.wait_for_timeout(300)
          inside=[];
          for k in ["Tab"]*25+["Shift+Tab"]*25:
            await pg.keyboard.press(k);inside.append(await pg.evaluate("()=>!!document.activeElement.closest('[role=dialog]')"))
          await pg.keyboard.press("Escape");await pg.wait_for_timeout(300)
          closed=await pg.locator("[role=dialog]").count()==0
          ret=await pg.evaluate("()=>document.activeElement&&document.activeElement.tagName==='BUTTON'?document.activeElement.innerText.trim():'<'+document.activeElement.tagName+'>'")
          ok=all(inside) and closed and ret==name
          res.append((vw,route,ok,all(inside),closed,ret[:30]))
        # POS: keyboard scan + review dialog
        await go("/pos");await pg.get_by_label("Scan barcode or search products").focus();await pg.keyboard.type("PH000001");await pg.keyboard.press("Enter");await pg.wait_for_timeout(300)
        rb=pg.get_by_role("button",name="Review test basket");await rb.focus();await pg.keyboard.press("Enter");await pg.wait_for_timeout(300)
        op=await pg.locator("[role=dialog]").count()==1
        inside=[]
        for k in ["Tab"]*20+["Shift+Tab"]*20:
          await pg.keyboard.press(k);inside.append(await pg.evaluate("()=>!!document.activeElement.closest('[role=dialog]')"))
        await pg.keyboard.press("Escape");await pg.wait_for_timeout(300)
        ret=await pg.evaluate("()=>document.activeElement&&document.activeElement.tagName==='BUTTON'?document.activeElement.innerText.trim():'<'+document.activeElement.tagName+'>'")
        res.append((vw,"/pos review",op and all(inside) and ret=="Review test basket",all(inside),op,ret[:30]))
      await pg.set_viewport_size({"width":1280,"height":1800})
      for r in res: rec(f"keyboard focus trap + Escape + focus return {r[0][0]}x{r[0][1]} {r[1]}",r[2],r[3:])
    await step("keyboard",keyboard)
    async def matrix():
      routes=["/","/pos","/cash","/stock/phones","/stock/accessories","/catalog","/customers","/debts","/suppliers","/purchases","/expenses","/transfers","/facility","/sav","/reports","/users","/audit","/settings"]
      eng=re.compile(r"\b(Save|Cancel|Draft|Pending|Approval|Receive|Customer|Amount|Details|Search|Export|Close|Open)\b")
      leaks={};over=[];n=0
      for lang in ["ar-DZ","fr-DZ","en"]:
        for th in ["light","dark"]:
          await pg.evaluate(f"localStorage.setItem('ph-lang','{lang}');localStorage.setItem('ph-theme','{th}')")
          for r in routes:
            await go(r);n+=1
            if await pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1"):over.append(f"{lang}/{th}{r}")
            if lang!="en":
              tx=await pg.locator("main").inner_text();hits=sorted(set(eng.findall(tx)))
              if hits:leaks[f"{lang}{r}"]=hits
            if r in("/","/transfers","/debts","/audit"):await pg.screenshot(path=str(S/f"m_{lang}_{th}{r.replace('/','_') or '_home'}.png"))
      Path("leaks.json").write_text(json.dumps(leaks,indent=1,ensure_ascii=False))
      rec(f"{n} route renders (18 routes × 3 locales × 2 themes) with no horizontal overflow at 1280px",not over,over[:5])
      rec("no common English UI words in FR/AR route text (heuristic, not proof of full translation)",not leaks,json.dumps(leaks,ensure_ascii=False)[:280])
      await pg.evaluate("localStorage.setItem('ph-lang','ar-DZ');localStorage.setItem('ph-theme','light')")
      await pg.set_viewport_size({"width":390,"height":844});ov=[]
      for r in ["/pos","/transfers","/debts","/cash","/audit"]:
        await go(r)
        if await pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1"):ov.append(r)
      await go("/transfers");await pg.locator(".heading-actions button, .page-heading button").last.click();await pg.wait_for_timeout(300)
      dov=await pg.evaluate("()=>{const d=document.querySelector('[role=dialog]');return d?d.scrollWidth>d.clientWidth+1:true}")
      await pg.screenshot(path=str(S/"ar_mobile_transfer_dialog.png"))
      rec("AR mobile 390×844: no horizontal overflow on 5 routes or transfer dialog",not ov and not dov,ov)
      await pg.set_viewport_size({"width":1280,"height":1800});await pg.evaluate("localStorage.setItem('ph-lang','en')")
    await step("matrix",matrix)
    async def reset():
      await go("/settings");await pg.get_by_role("button",name="Reset test data").click();await pg.wait_for_timeout(800)
      await pg.reload();await pg.wait_for_timeout(1500);d=await db()
      rec("reset restores fixture: no sales/transfers/debts, intake phone gone, PH-002 Available",not d["ws"]["sales"] and not d["ws"]["transfers"] and not d["s"]["debts"] and not any(x["imei"]=="359111111111119" for x in d["ws"]["phones"]) and [x for x in d["ws"]["phones"] if x["id"]=="PH-002"][0]["status"]=="Available")
    await step("reset",reset)
    rec("no page errors",not errors,"; ".join(errors[:3]))
    Path("results.json").write_text(json.dumps(R,indent=1,ensure_ascii=False))
    p_=sum(r["result"]=="PASS" for r in R);print(f"TOTAL {len(R)} PASS {p_} FAIL {len(R)-p_}")
    await b.close()
asyncio.run(main())
