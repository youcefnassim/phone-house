import asyncio,json,itertools
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent
paths=['/','/pos','/stock/phones','/stock/accessories','/cash','/sales','/customers','/suppliers','/purchases','/transfers','/facility','/sav','/debts','/expenses','/catalog','/reports','/users','/audit','/settings']
async def main():
 results=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for lang,(w,h),dark in itertools.product(['fr-DZ','en','ar-DZ'],[(1440,1100),(768,1024),(390,844)],[False,True]):
   c=await b.new_context(viewport={'width':w,'height':h});pg=await c.new_page();err=[];pg.on('pageerror',lambda e:err.append(str(e)))
   await pg.goto('http://localhost:8080/');await pg.evaluate('l=>{localStorage.setItem("ph-lang",l);localStorage.setItem("ph-theme","light")}',lang);await pg.reload();await pg.wait_for_function("!document.documentElement.classList.contains('dark')");await pg.wait_for_timeout(400)
   await pg.evaluate('d=>localStorage.setItem("ph-theme",d?"dark":"light")',dark);await pg.reload();await pg.wait_for_function('(d)=>document.documentElement.classList.contains("dark")===d',arg=dark)
   for path in paths:
    await pg.goto('http://localhost:8080'+path);await pg.wait_for_function('(d)=>document.documentElement.classList.contains("dark")===d',arg=dark);await pg.wait_for_timeout(500)
    main=pg.locator('main');ok=await main.is_visible() and len(await main.inner_text())>20 and await pg.evaluate('document.documentElement.scrollWidth<=innerWidth') and not err and await pg.evaluate('(d)=>document.documentElement.classList.contains("dark")===d',dark)
    results.append({'lang':lang,'width':w,'dark':dark,'path':path,'pass':ok,'errors':list(err)})
   await pg.goto('http://localhost:8080/');await pg.wait_for_timeout(500);await pg.screenshot(path=str(ROOT/f'{lang}-{w}-{dark}.png'));await c.close()
  await b.close()
 (ROOT/'results.json').write_text(json.dumps(results,indent=2));fails=[r for r in results if not r['pass']];print('TOTAL',len(results),'PASS',len(results)-len(fails),'FAIL',len(fails));print(fails);assert not fails
asyncio.run(main())
