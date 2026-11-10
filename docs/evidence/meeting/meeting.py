import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
S=Path('/tmp/browser/meet/shots');R=[]
def rec(n,ok,ev=""):R.append({"test":n,"result":"PASS" if ok else "FAIL","evidence":str(ev)[:200]});print(("PASS " if ok else "FAIL ")+n,str(ev)[:160])
routes=['/','/pos','/cash','/stock/phones','/stock/accessories','/catalog','/transfers','/customers','/debts','/suppliers','/purchases','/expenses','/facility','/sav','/reports','/users','/audit','/settings']
B="http://localhost:8080"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True)
    c=await b.new_context(viewport={"width":1280,"height":1800});pg=await c.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(B+"/");await pg.wait_for_timeout(1500)
    rec("French is default when language unset",await pg.evaluate("document.documentElement.lang")=="fr-DZ")
    await pg.evaluate("localStorage.setItem('ph-lang','en')");await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('ph-test-workspace');q.onsuccess=q.onerror=q.onblocked=()=>r(0);})")
    await pg.goto(B+"/pos");await pg.wait_for_timeout(1800)
    txt=await pg.locator("main").inner_text()
    rec("POS without open shift shows cash-blocked notice","No open test cash shift" in txt)
    await pg.get_by_label("Scan barcode or search products").fill("PH000001");await pg.keyboard.press("Enter")
    await pg.get_by_role("button",name="Review test basket").click();await pg.wait_for_timeout(400)
    D=pg.locator("[role=dialog]").last
    await D.get_by_label("Payment method").select_option("Cash");await D.get_by_label("Entered amount (DZD)").fill("999999")
    await D.locator("form button[type=submit]").last.click();await pg.wait_for_timeout(400)
    rec_btn=D.get_by_role("button",name="Record local test sale")
    blocked=(await rec_btn.count()==0) or (await rec_btn.is_disabled())
    if not blocked:
      await rec_btn.click();await pg.wait_for_timeout(400)
    sales=await pg.evaluate("""()=>new Promise(res=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('workspace');g.onsuccess=()=>res((g.result&&g.result.sales||[]).length)};r.onerror=()=>res(-1)})""")
    rec("cash sale without open shift records nothing",sales in (0,-1),f"sales={sales}")
    await pg.screenshot(path=str(S/"pos_no_shift.png"))
    await pg.keyboard.press("Escape")
    # cross-store: M02 scope must not find M01 phone PH000001
    await pg.goto(B+"/pos");await pg.wait_for_timeout(1500)
    await pg.locator('select:has(option[value="M02"])').first.select_option("M02");await pg.wait_for_timeout(500)
    await pg.get_by_label("Scan barcode or search products").fill("PH000001");await pg.keyboard.press("Enter");await pg.wait_for_timeout(400)
    review=pg.get_by_role("button",name="Review test basket")
    t2=await pg.locator("main").inner_text()
    rec("M01 phone cannot be added to M02 basket",(await review.count()==0 or await review.is_disabled()) ,t2[-200:])
    await pg.screenshot(path=str(S/"pos_cross_store.png"))
    rec("no page errors (negative flows)",not errs,errs[:2])
    await c.close()
    # renders
    for w,h in [(390,844),(768,1024),(1440,900)]:
      for lang,theme in [('fr-DZ','light'),('ar-DZ','dark'),('en','dark')]:
        c=await b.new_context(viewport={"width":w,"height":h});pg=await c.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto(B+"/");await pg.evaluate(f"()=>{{localStorage.setItem('ph-lang','{lang}');localStorage.setItem('ph-theme','{theme}');localStorage.setItem('ph-mode','TEST')}}")
        bad=[]
        for r in routes:
          await pg.goto(B+r,wait_until="networkidle");await pg.wait_for_timeout(250)
          info=await pg.evaluate("({o:document.documentElement.scrollWidth>window.innerWidth+1,t:document.querySelector('main')?.innerText.trim().length||0})")
          if info['o'] or info['t']<40: bad.append((r,info))
          if r in ('/','/pos','/stock/phones') : await pg.screenshot(path=str(S/f"{w}_{lang}_{theme}{r.replace('/','_') or '_home'}.png"))
        rec(f"18 routes {w}px {lang} {theme}: content, no overflow, no errors",not bad and not errs,bad[:3]+errs[:2])
        await c.close()
    Path('/tmp/browser/meet/meeting.json').write_text(json.dumps(R,indent=1))
    await b.close()
asyncio.run(main())
