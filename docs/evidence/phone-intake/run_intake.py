import asyncio,sys
from pathlib import Path
from playwright.async_api import async_playwright
S=Path('/tmp/browser/intake/shots');S.mkdir(parents=True,exist_ok=True)
R=[]
def ok(name,cond):R.append((name,bool(cond)));print(('PASS' if cond else 'FAIL'),name)
CASES=[('fr-DZ','light',1440,900,'353918058491230'),('ar-DZ','dark',390,844,'356938035643809'),('en','dark',768,1024,'490154203237518')]
async def run(p,lang,theme,w,h,imei):
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':w,'height':h});pg=await c.new_page();errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  await pg.goto('http://localhost:8080');await pg.evaluate("([l,t])=>{localStorage.setItem('ph-lang',l);localStorage.setItem('ph-theme',t)}",[lang,theme])
  await pg.goto('http://localhost:8080/stock/phones');await pg.wait_for_timeout(1500)
  tag=f'{lang}_{w}_{theme}'
  await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog')
  await d.wait_for();store=d.locator('[name=store]')
  ok(f'{tag} ALL scope store empty',await store.input_value()=='')
  ok(f'{tag} store labels',set(await store.locator('option').all_inner_texts())>={'Magasin 1 (M01)','Magasin 2 (M02)'})
  ok(f'{tag} no quantity input',await d.locator('[name=quantity]').count()==0)
  ok(f'{tag} More details collapsed',not await d.locator('details').first.evaluate('e=>e.open'))
  await d.locator('button[type=submit]').click();await pg.wait_for_timeout(300)
  await pg.screenshot(path=str(S/f'{tag}_1_empty_errors.png'))
  ok(f'{tag} empty submit shows errors',await d.get_by_role('alert').count()>0)
  await store.select_option('M01');await d.locator('[name=brand]').fill('NovaBrand');await d.locator('[name=name]').fill('Nova X1');await d.locator('[name=condition]').select_option('USED')
  await d.locator('[name=salePrice]').fill('0');await d.locator('[name=imei1]').fill(imei[:14]+str((int(imei[14])+1)%10))
  await d.locator('button[type=submit]').click();await pg.wait_for_timeout(300)
  await pg.screenshot(path=str(S/f'{tag}_2_price_imei_errors.png'))
  ok(f'{tag} price 0 rejected',await d.locator('[name=salePrice]').get_attribute('aria-invalid')=='true')
  ok(f'{tag} bad checksum rejected',await d.locator('[name=imei1]').get_attribute('aria-invalid')=='true')
  await d.locator('[name=salePrice]').fill('25000.50');await d.locator('[name=imei1]').fill(imei)
  await d.locator('button[type=submit]').click();await pg.wait_for_timeout(300)
  ok(f'{tag} packaging missing expands More details',await d.locator('details').first.evaluate('e=>e.open'))
  await pg.screenshot(path=str(S/f'{tag}_3_more_details_expanded.png'))
  await d.locator('[name=packaging]').select_option('OPEN_BOX')
  await d.locator('button[type=submit]').dblclick();await pg.wait_for_timeout(800)
  note=await pg.locator('.session-notice').inner_text() if await pg.locator('.session-notice').count() else ''
  ok(f'{tag} success notice with PHU code','PHU-M01-' in note)
  await pg.screenshot(path=str(S/f'{tag}_4_added.png'))
  search=pg.locator('.search-field input');await search.fill(imei);await pg.wait_for_timeout(300)
  ok(f'{tag} double-click created one unit',await pg.locator('tbody tr').count()==1)
  await pg.reload();await pg.wait_for_timeout(1800);await pg.locator('.search-field input').fill(imei);await pg.wait_for_timeout(300)
  ok(f'{tag} persists after reload',await pg.locator('tbody tr').count()==1)
  code=note.split('PHU-')[1].split()[0] if 'PHU-' in note else ''
  await pg.locator('.search-field input').fill('PHU-'+code);await pg.wait_for_timeout(300)
  ok(f'{tag} search by unit barcode',await pg.locator('tbody tr').count()==1)
  await pg.screenshot(path=str(S/f'{tag}_5_after_reload_search.png'))
  await pg.goto('http://localhost:8080/pos');await pg.wait_for_timeout(1500)
  bs=pg.locator('select').filter(has=pg.locator('option[value=M02]')).first
  scan=pg.locator('input[placeholder]').first
  await scan.fill(imei);await pg.wait_for_timeout(400)
  body=await pg.locator('main').inner_text()
  ok(f'{tag} POS finds phone in M01','Nova X1' in body)
  await pg.screenshot(path=str(S/f'{tag}_6_pos_scan.png'))
  ok(f'{tag} no page errors',not errs)
  await b.close()
async def main():
  async with async_playwright() as p:
    for cse in CASES:await run(p,*cse)
  print('TOTAL',sum(r[1] for r in R),'PASS',sum(not r[1] for r in R),'FAIL')
asyncio.run(main())
