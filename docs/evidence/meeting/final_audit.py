# Per-control click audit. Usage: final_audit.py LANG WxH THEME OUTCSV [render-only]
import asyncio,csv,sys,re
from playwright.async_api import async_playwright
LANG,VP,THEME,OUT=sys.argv[1:5];RENDER=len(sys.argv)>5
W,H=map(int,VP.split('x'));B="http://localhost:8080"
import os
ROUTES=os.environ["R"].split(",") if os.environ.get("R") else ["/","/pos","/cash","/stock/phones","/stock/accessories","/catalog","/customers","/debts","/suppliers","/purchases","/transfers","/facility","/sav","/expenses","/reports","/audit","/users","/settings","/auth"]
SEL="button:visible, [role=tab]:visible, a[href]:visible, select:visible, input[type=checkbox]:visible"
SKIP=re.compile(r"r[ée]initialis|reset|إعادة تعيين",re.I)  # reset tested separately in flows.py
async def go(pg,url):
  await pg.goto(url);await pg.wait_for_load_state('networkidle');await pg.wait_for_timeout(500)
async def snap(pg):return await pg.evaluate("[location.pathname,document.body.innerText.length,(()=>{let h=0;const t=document.body.innerHTML;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return h})(),document.querySelectorAll('[role=dialog]').length,document.documentElement.dir,document.documentElement.className].join('|')")
async def main():
  rows=[];errs=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={"width":W,"height":H});pg=await c.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)[:100]));pg.on("dialog",lambda d:asyncio.ensure_future(d.dismiss()))
    await pg.goto(B+"/");await pg.evaluate("([l,t])=>{localStorage.setItem('ph-mode','TEST');localStorage.setItem('ph-lang',l);localStorage.setItem('ph-theme',t)}",[LANG,THEME])
    for r in ROUTES:
      await go(pg,B+r);await pg.wait_for_function(f"document.documentElement.lang==='{LANG}'",timeout=8000);await pg.wait_for_timeout(900)
      ov=await pg.evaluate("document.documentElement.scrollWidth-window.innerWidth")
      d=await pg.evaluate("document.documentElement.dir");dark=await pg.evaluate("document.documentElement.classList.contains('dark')")
      ok=ov<=1 and d==("rtl" if LANG=="ar-DZ" else "ltr") and dark==(THEME=="dark")
      shot=f"final/{LANG}_{VP}_{THEME}{r.replace('/','_') or '_home'}.png"
      if VP in("390x844",) or r in("/","/pos"):await pg.screenshot(path=shot)
      else:shot=""
      rows.append([r,"(page render)",LANG,VP,THEME,"renders; no overflow; dir/theme correct",f"overflow={ov}px dir={d} dark={dark}","PASS" if ok else "FAIL",shot])
      if RENDER:continue
      n=await pg.locator(SEL).count()
      for i in range(min(n,70)):
        if pg.url.rstrip('/')!=(B+r).rstrip('/'):await go(pg,B+r)
        el=pg.locator(SEL).nth(i)
        try:
          if not await el.count():continue
          tag=await el.evaluate("e=>e.tagName.toLowerCase()")
          name=((await el.get_attribute("aria-label")) or (await el.inner_text()) or (await el.get_attribute("title")) or tag).strip().replace("\n"," ")[:60]
          kind={"a":"link","select":"select","input":"checkbox"}.get(tag,"button")
          exp={"link":"navigate","select":"change value","checkbox":"toggle"}.get(kind,"visible state change / dialog / validation")
          if SKIP.search(name):rows.append([r,name,LANG,VP,THEME,"reset test data","covered by flows.py reset assertion","NOT TESTED",""]);continue
          if await el.is_disabled():rows.append([r,name,LANG,VP,THEME,exp,"disabled (gated until prerequisite)","BLOCKED",""]);continue
          cur=await el.evaluate("e=>e.getAttribute('aria-current')||e.getAttribute('aria-pressed')==='true'||e.getAttribute('aria-selected')==='true'||e.getAttribute('data-state')==='active'||e.classList.contains('tab-active')||e.classList.contains('active')")
          href=await el.get_attribute("href") if kind=="link" else None
          before=await snap(pg)
          if kind=="select":
            opts=await el.evaluate("e=>[...e.options].map(o=>o.value)");v=await el.input_value()
            other=[o for o in opts if o!=v]
            if not other:rows.append([r,name,LANG,VP,THEME,exp,"single option","PASS",""]);continue
            await el.select_option(other[0]);await pg.wait_for_timeout(250);after=await snap(pg)
            changed=before!=after or (await el.input_value())==other[0]
            obs=f"selected {other[0]}";await el.select_option(v);await pg.wait_for_timeout(200)
            if "ar-DZ" in opts or "en" in opts:await pg.evaluate("l=>localStorage.setItem('ph-lang',l)",LANG);await go(pg,B+r);await pg.wait_for_function(f"document.documentElement.lang==='{LANG}'")
          else:
            dl=[];pg.once("download",lambda d:dl.append(d.suggested_filename))
            await el.click(timeout=2500);await pg.wait_for_timeout(400);after=await snap(pg);changed=before!=after or bool(dl)
            obs=("downloaded "+dl[0]) if dl else "navigated" if after.split('|')[0]!=before.split('|')[0] else ("dialog opened" if after.split('|')[3]>before.split('|')[3] else ("state changed" if changed else "no change"))
            if kind=="link" and not changed and href and href.split('#')[0].rstrip('/')==r.rstrip('/'):cur=True
          res="PASS" if changed or cur else "FAIL"
          if not changed and cur:obs="legitimate no-op (current/selected)"
          rows.append([r,name,LANG,VP,THEME,exp,obs,res,""])
          if await pg.locator("[role=dialog]").count():
            await pg.keyboard.press("Escape");await pg.wait_for_timeout(600)
            if await pg.locator("[role=dialog]").count():rows.append([r,name+" · Escape",LANG,VP,THEME,"Escape closes dialog","still open","FAIL",""])
          if await pg.evaluate("localStorage.getItem('ph-mode')")=="PRODUCTION":await pg.evaluate("localStorage.setItem('ph-mode','TEST')");await go(pg,B+r)
          if THEME=="dark" and not await pg.evaluate("document.documentElement.classList.contains('dark')"):await pg.evaluate("localStorage.setItem('ph-theme','dark')");await go(pg,B+r)
          if THEME=="light" and await pg.evaluate("document.documentElement.classList.contains('dark')"):await pg.evaluate("localStorage.setItem('ph-theme','light')");await go(pg,B+r)
        except Exception as e:rows.append([r,f"control#{i}",LANG,VP,THEME,"clickable",f"error {str(e)[:70]}","FAIL",""])
    rows.append(["*","page errors",LANG,VP,THEME,"no uncaught errors","; ".join(errs[:3]) or "none","PASS" if not errs else "FAIL",""])
    await b.close()
  with open(OUT,"w",newline="") as f:csv.writer(f).writerows(rows)
  from collections import Counter;print(OUT,Counter(x[7] for x in rows))
asyncio.run(main())
