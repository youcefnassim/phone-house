import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent
async def main():
 out=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for lang,w,h,dark in [('fr-DZ',1440,1100,False),('en',768,1024,False),('ar-DZ',390,844,True)]:
   ctx=await browser.new_context(viewport={'width':w,'height':h});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080/');await page.evaluate('l=>localStorage.setItem("ph-lang",l)',lang);await page.reload();await page.wait_for_timeout(1200)
   if dark:await page.get_by_role('button',name='السمة الداكنة').click() if await page.get_by_role('button',name='السمة الداكنة').count() else await page.locator('.topbar-actions button').filter(has=page.locator('svg.lucide-moon')).click()
   await page.wait_for_timeout(400);await page.screenshot(path=str(ROOT/f'{lang}-dashboard.png'))
   out.append({'lang':lang,'check':'dashboard-visible','pass':await page.locator('main h1').count()==1 and await page.locator('.ledger-line-chart svg').count()>0})
   out.append({'lang':lang,'check':'no-overflow','pass':await page.evaluate('document.documentElement.scrollWidth<=innerWidth')})
   for path in ['/pos','/cash','/sales','/stock/phones','/stock/accessories','/customers','/suppliers','/purchases','/transfers','/facility','/sav','/debts','/expenses','/catalog','/reports','/users','/audit','/settings','/']:
    await page.goto('http://localhost:8080'+path);await page.wait_for_timeout(350);await page.reload();await page.wait_for_timeout(350)
    out.append({'lang':lang,'check':path+' reload','pass':await page.locator('main').is_visible() and len(await page.locator('main').inner_text())>20 and not errors})
   await page.locator('.toolbar-search input').fill('iPhone');await page.wait_for_timeout(100);out.append({'lang':lang,'check':'global-search','pass':await page.locator('.search-results a').count()>0});await page.locator('.search-results a').first.click();await page.wait_for_timeout(500);out.append({'lang':lang,'check':'search-navigation','pass':'stock/phones' in page.url})
   await page.goto('http://localhost:8080/');await page.wait_for_timeout(500);await page.screenshot(path=str(ROOT/f'{lang}-final.png'))
   print(lang,'errors',errors);await ctx.close()
  await browser.close()
 (ROOT/'results.json').write_text(json.dumps(out,indent=2));print('TOTAL',len(out),'PASS',sum(r['pass'] for r in out));assert all(r['pass'] for r in out)
asyncio.run(main())
