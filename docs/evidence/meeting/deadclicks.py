import asyncio,json,sys,hashlib
from playwright.async_api import async_playwright
routes=sys.argv[1].split(',')
SEL="button:visible, [role=tab]:visible, a[href]:visible, select:visible"
B="http://localhost:8080"
async def snap(pg):return await pg.evaluate("document.body.innerHTML.length+':'+location.pathname+':'+document.querySelectorAll('[role=dialog],[role=alert],[role=status]').length+':'+(document.activeElement&&document.activeElement.outerHTML.slice(0,80))+':'+document.body.innerText.length")
async def main():
  out={}
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={"width":1440,"height":1000});pg=await c.new_page()
    pg.on("dialog",lambda d:asyncio.ensure_future(d.dismiss()))
    errs=[];pg.on("pageerror",lambda e:errs.append(str(e)[:120]))
    await pg.goto(B+"/");await pg.evaluate("localStorage.setItem('ph-lang','en')")
    for r in routes:
      await pg.goto(B+r);await pg.wait_for_timeout(1500)
      ctl=pg.locator(SEL)
      n=min(await ctl.count(),60);dead=[];tested=0
      for i in range(n):
        await pg.goto(B+r) if pg.url!=B+r else None
        el=pg.locator(SEL).nth(i)
        try:
          if not await el.count():continue
          name=((await el.get_attribute("aria-label")) or (await el.inner_text())).strip()[:50]
          if await el.is_disabled():continue
          before=await snap(pg)
          await el.click(timeout=2000);await pg.wait_for_timeout(250);tested+=1
          after=await snap(pg)
          if before==after:dead.append(name)
          if await pg.locator("[role=dialog]").count():await pg.keyboard.press("Escape");await pg.wait_for_timeout(150)
        except Exception as e:dead.append(f"ERR {name if 'name' in dir() else i}: {str(e)[:60]}")
      out[r]={"controls":n,"tested":tested,"dead":dead}
      print(r,n,tested,dead,flush=True)
    print("ERRORS",errs[:5])
    await b.close()
  open(f"/tmp/browser/qa/dead_{routes[0].replace('/','_')}.json","w").write(json.dumps(out))
asyncio.run(main())
