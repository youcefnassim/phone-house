import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for lang,w,h in [('fr-DZ',1440,1000),('ar-DZ',390,844),('en',768,1024)]:
   ctx=await b.new_context(viewport={'width':w,'height':h});pg=await ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   await pg.goto('http://localhost:8080/');await pg.evaluate('l=>localStorage.setItem("ph-lang",l)',lang);await pg.reload();await pg.wait_for_timeout(1000)
   for path in ['/pos','/cash','/sales','/stock/phones','/stock/accessories','/customers','/suppliers','/']:
    await pg.evaluate('p=>{const a=document.querySelector(`a[href="${p}"]`);if(a)a.click();}',path);await pg.wait_for_timeout(800)
    if pg.url!='http://localhost:8080'+path:await pg.goto('http://localhost:8080'+path)
    await pg.reload();await pg.wait_for_timeout(800)
    ok=await pg.locator('main').is_visible() and len(await pg.locator('main').inner_text())>20 and not errors
    results.append({'language':lang,'path':path,'status':'PASS' if ok else 'FAIL'})
   await pg.screenshot(path=str(ROOT/f'{lang}_dashboard.png'));await ctx.close()
  await b.close()
 (ROOT/'results.json').write_text(json.dumps(results,indent=2));print('TOTAL',len(results),'PASS',sum(r['status']=='PASS' for r in results));assert all(r['status']=='PASS' for r in results)
asyncio.run(main())
