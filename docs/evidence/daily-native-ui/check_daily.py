import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent; checks=[]
IDB="""()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const st=tx.objectStore('kv');const a=st.get('workspace');tx.oncomplete=()=>res(a.result);};r.onerror=()=>rej(r.error);})"""
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for lang,width,theme in [('fr-DZ',1440,'light'),('en',768,'dark'),('ar-DZ',390,'dark')]:
   c=await b.new_context(viewport={'width':width,'height':1800});page=await c.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080');await page.evaluate('([l,t])=>{localStorage.setItem("ph-lang",l);localStorage.setItem("ph-theme",t)}',[lang,theme])
   await page.goto('http://localhost:8080/stock/phones');await page.wait_for_timeout(1200)
   await page.locator('.heading-actions button').last.click();d=page.get_by_role('dialog');await d.wait_for()
   await d.locator('[name=store]').select_option('M01')
   for n,v in [('brand','DailyQA'),('name','Daily lifecycle phone'),('salePrice','12500.50'),('imei1','490154203237518')]:await d.locator(f'[name={n}]').fill(v)
   await d.locator('[name=condition]').select_option('USED')
   # Compact form now includes mandatory color. Older intake script predates it.
   if await d.locator('[name=color]').count():await d.locator('[name=color]').fill('Black')
   await d.locator('button[type=submit]').click();await page.wait_for_timeout(600)
   assert await d.locator('[name=salePrice]').count()==0,await d.inner_text()
   await d.locator('button').last.click()
   await page.locator('.search-field input').fill('490154203237518');await page.wait_for_timeout(250)
   assert await page.locator('tbody tr').count()==1
   await page.reload();await page.wait_for_timeout(1100);await page.locator('.search-field input').fill('490154203237518');await page.wait_for_timeout(200)
   assert await page.locator('tbody tr').count()==1
   ws=await page.evaluate(IDB);phone=next(x for x in ws['phones'] if x['name']=='Daily lifecycle phone')
   assert phone['packaging']=='UNKNOWN'
   await page.screenshot(path=str(OUT/f'{lang}-receiving.png'))
   await page.goto('http://localhost:8080/pos');await page.wait_for_timeout(850)
   await page.locator('main select').filter(has=page.locator('option[value=M01]')).first.select_option('M01');await page.wait_for_timeout(300)
   scan=page.locator('.pos-search input');
   if not await scan.count():scan=page.locator('input[placeholder]').first
   await scan.fill(phone['code']);await scan.press('Enter');await page.wait_for_timeout(300)
   assert 'Daily lifecycle phone' in await page.locator('main').inner_text()
   await page.screenshot(path=str(OUT/f'{lang}-pos.png'))
   for route in ['/sales','/cash','/customers','/settings','/']:
    await page.goto('http://localhost:8080'+route);await page.wait_for_timeout(500)
    assert await page.locator('h1').count()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+2'),(lang,route,'overflow')
    assert await page.locator('html').get_attribute('dir')==('rtl' if lang=='ar-DZ' else 'ltr')
   assert not errors,errors
   checks.append({'language':lang,'width':width,'theme':theme,'intake_reload_scanner':True,'route_checks':15,'page_errors':errors})
   await c.close()
  await b.close()
 (OUT/'results.json').write_text(json.dumps(checks,indent=2));print('PASS',json.dumps(checks))
asyncio.run(main())
