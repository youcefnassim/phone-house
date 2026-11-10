import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for lang,w,theme in [('fr-DZ',1440,'light'),('en',768,'light'),('ar-DZ',390,'dark')]:
   c=await b.new_context(viewport={'width':w,'height':1800});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080');await page.evaluate('([l,t])=>{localStorage.setItem("ph-lang",l);localStorage.setItem("ph-theme",t)}',[lang,theme])
   for route in ['/pos','/stock/phones','/stock/accessories','/cash','/sales','/']:
    await page.goto('http://localhost:8080'+route);await page.wait_for_timeout(900)
    assert await page.locator('h1').count(),(lang,route,'blank')
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(lang,route,'overflow')
    assert await page.locator('html').get_attribute('dir')==('rtl' if lang=='ar-DZ' else 'ltr')
    if route=='/pos':await page.screenshot(path=str(OUT/f'{lang}-responsive.png'))
   assert not errors,errors
   results.append({'language':lang,'width':w,'theme':theme,'routes':6,'headings_direction_overflow':'PASS','errors':errors});await c.close()
  await b.close()
 (OUT/'responsive-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
asyncio.run(main())
