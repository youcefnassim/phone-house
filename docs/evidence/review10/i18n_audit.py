import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
S=Path(__file__).parent/"matrix";S.mkdir(exist_ok=True)
ROUTES=["/","/pos","/cash","/stock/phones","/stock/accessories","/customers","/debts","/suppliers","/purchases","/expenses","/transfers","/facility","/sav","/catalog","/reports","/users","/audit","/settings"]
EN=re.compile(r"\b(the|draft|drafts|customer|store|amount|required|unavailable|only|session|demo|pending|approval|stock|sale|sales|payment|receipt|not|and|with|record|records|missing|evidence|owner|seller|manager|role|user|test|history|details|transfer|month|months|explicit)\b",re.I)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);out={};errs=[]
    for lang in ["fr-DZ","ar-DZ","en"]:
      for theme in ["light","dark"]:
        ctx=await b.new_context(viewport={"width":1440,"height":900});pg=await ctx.new_page();pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto("http://localhost:8080/");await pg.evaluate(f"localStorage.setItem('ph-lang','{lang}');localStorage.setItem('ph-theme','{theme}')")
        for r in ROUTES:
          await pg.goto("http://localhost:8080"+r);await pg.wait_for_timeout(1300)
          name=f"{lang}_{theme}_{r.strip('/').replace('/','-') or 'home'}.png";await pg.screenshot(path=str(S/name))
          if theme=="light" and lang!="en":
            texts=await pg.evaluate("""()=>{const w=document.createTreeWalker(document.querySelector('main')||document.body,NodeFilter.SHOW_TEXT);const o=[];let n;while(n=w.nextNode()){const t=n.textContent.trim();if(t&&n.parentElement.offsetParent!==null)o.push(t)}return o}""")
            opts=await pg.evaluate("()=>[...document.querySelectorAll('main option, main input[placeholder]')].map(e=>e.textContent||e.placeholder)")
            leaks=sorted({t for t in texts+opts if EN.search(t) and not re.search(r"[À-ÿ\u0600-\u06FF]",t) and len(t)>3})
            if leaks:out[f"{lang}{r}"]=leaks
        await ctx.close()
    Path("i18n_leaks.json").write_text(json.dumps(out,indent=1,ensure_ascii=False));print(json.dumps(out,ensure_ascii=False)[:6000]);print("errors",errs[:3])
    await b.close()
asyncio.run(main())
