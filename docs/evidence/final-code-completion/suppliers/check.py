import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent;R=[]
def ck(n,v):R.append({'name':n,'status':'PASS' if v else 'FAIL'});print(R[-1],flush=True)
async def data(pg):
 await pg.wait_for_timeout(400)
 return await pg.evaluate("""()=>new Promise(res=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const a=tx.objectStore('kv').get('workspace'),b=tx.objectStore('kv').get('session');tx.oncomplete=()=>res({ws:a.result,session:b.result});}})""")
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for lang,w,h,store,actor in [('en',1440,1000,'M01','U-S01'),('fr-DZ',768,1024,'M02','U-M02'),('ar-DZ',390,844,'M01','U-S03')]:
   ctx=await b.new_context(viewport={'width':w,'height':h});pg=await ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   async def go(path):await pg.goto('http://localhost:8080'+path);await pg.wait_for_timeout(750)
   await go('/');await pg.evaluate('l=>localStorage.setItem("ph-lang",l)',lang);await go('/stock/phones');await pg.locator('.topbar select').nth(1).select_option(actor);await pg.wait_for_timeout(500);await go('/stock/phones');await pg.locator('.topbar select').nth(1).select_option(actor);await pg.wait_for_timeout(1000);
   for retry in range(3):
    if await pg.locator('.topbar select').nth(1).input_value()==actor:break
    await pg.locator('.topbar select').nth(1).select_option(actor);await pg.wait_for_timeout(600)
   await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog').last
   for name,val in [('brand','Source'),('name','Supplier Phone'),('salePrice','100'),('imei1','490154203237518')]:await d.locator(f'[name={name}]').fill(val)
   await d.locator('[name=store]').select_option(store);await d.locator('[name=condition]').select_option('NEW');det=d.locator('details').filter(has=pg.locator('[name=supplierId]'));await det.locator('summary').click();await d.locator('[name=newSupplierName]').fill('Supplier A Local');await d.locator('form button[type=submit]').click();await pg.wait_for_timeout(500);print('PHONE ACTOR',await pg.locator('.topbar select').nth(1).input_value(),flush=True);a=await data(pg);phone=next(x for x in a['ws']['phones'] if x['name']=='Supplier Phone');sid=a['session']['suppliers'][0]['id'];ck(lang+' phone supplier/store/operator',phone['supplierId']==sid and phone['store']==store and phone['receivedBy']==actor);ck(lang+' receiver owner history hidden',await pg.get_by_role('dialog').last.locator('form').count()==0);await pg.keyboard.press('Escape')
   await pg.locator('.topbar select').nth(1).select_option('U-OWN');await go('/stock/phones');await pg.locator('tbody tr').filter(has_text='Supplier Phone').get_by_role('button').click();d=pg.get_by_role('dialog').last;ck(lang+' owner source visible','Supplier A Local' in await d.inner_text());await d.screenshot(path=str(ROOT/f'{lang}_phone.png'));await pg.keyboard.press('Escape')
   await go('/stock/accessories')
   for idx in [1,2]:
    await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog').last;sku='AC-001' if store=='M01' else 'AC-003';await d.locator('select').first.select_option(sku);await d.locator('[name=store]').select_option(store);await d.locator('[name=quantity]').fill(str(idx));det=d.locator('details').filter(has=pg.locator('[name=supplierId]'));await det.locator('summary').click()
    if idx==1:await d.locator('[name=supplierId]').select_option(sid)
    else:await d.locator('[name=newSupplierName]').fill('Supplier B Local')
    await d.locator('form button[type=submit]').click();await pg.wait_for_timeout(500);await pg.keyboard.press('Escape')
   a=await data(pg);receipts=[m for m in a['ws']['movements'] if m['sku']==sku and m['reason']=='RECEIVING'];ck(lang+' two separate supplier receipt lots',len(receipts)==2 and len(set(m['supplierId'] for m in receipts))==2 and [m['quantity'] for m in receipts]==[2,1]);await pg.locator('tbody tr').filter(has=pg.locator('button')).filter(has_text=sku).count()
   await pg.locator(f'button[aria-label*="{sku}"]').click();d=pg.get_by_role('dialog').last;ck(lang+' owner both receipt names','Supplier A Local' in await d.inner_text() and 'Supplier B Local' in await d.inner_text());await d.screenshot(path=str(ROOT/f'{lang}_receipts.png'));await pg.keyboard.press('Escape');await pg.reload();await pg.wait_for_timeout(750);ck(lang+' reload retains both receipts',len([m for m in (await data(pg))['ws']['movements'] if m['sku']==sku and m['reason']=='RECEIVING'])==2);ck(lang+' no overflow',await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'));ck(lang+' no runtime errors',not errors);await ctx.close()
  await b.close()
 ROOT.joinpath('results.json').write_text(json.dumps(R,indent=2));print('TOTAL',len(R),'PASS',sum(r['status']=='PASS' for r in R))
asyncio.run(main())
