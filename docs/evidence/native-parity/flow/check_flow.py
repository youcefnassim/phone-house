import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent;R=[]
def check(n,v):
 R.append({'name':n,'status':'PASS' if v else 'FAIL'});print(R[-1],flush=True)
async def snapshot(pg):
 await pg.wait_for_timeout(350)
 return await pg.evaluate("""()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const st=tx.objectStore('kv');const a=st.get('workspace'),b=st.get('session');tx.oncomplete=()=>res({ws:a.result,session:b.result});};r.onerror=()=>rej(r.error);})""")
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for lang,theme,w,h,store,actor in [('en','light',768,1024,'M01','U-S01'),('fr-DZ','dark',1440,1000,'M02','U-M02'),('ar-DZ','dark',390,844,'M01','U-S03')]:
   ctx=await browser.new_context(viewport={'width':w,'height':h});pg=await ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));tag=f'{lang}_{w}'
   async def go(path):await pg.goto('http://localhost:8080'+path);await pg.wait_for_timeout(900)
   await go('/');await pg.evaluate('([l,t])=>{localStorage.setItem("ph-lang",l);localStorage.setItem("ph-theme",t)}',[lang,theme]);await go('/stock/phones');await pg.locator('.topbar select').nth(1).select_option(actor);await pg.wait_for_timeout(900);await pg.locator('.topbar select').nth(1).select_option(actor);await pg.wait_for_timeout(900)
   await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog').last
   await d.locator('[name=store]').select_option(store);await d.locator('[name=brand]').fill('Synthetic');await d.locator('[name=name]').fill('Wave Phone');await d.locator('[name=condition]').select_option('NEW');await d.locator('[name=salePrice]').fill('1000.01');await d.locator('[name=imei1]').fill('490154203237518');await d.locator('form button[type=submit]').click();await pg.wait_for_timeout(450);await pg.keyboard.press('Escape')
   data=await snapshot(pg);phone=next(x for x in data['ws']['phones'] if x['name']=='Wave Phone');check(tag+' intake own store',phone['store']==store)
   await go('/cash');await pg.locator(f'[data-testid=drawer-{store}] button').first.click();d=pg.get_by_role('dialog').last;await d.locator('[name=amount]').fill('10.00');await d.locator('button[type=submit]').click()
   await go('/pos');await pg.locator('.scanner-field input').fill(phone['code']);await pg.locator('.scanner-field input').press('Enter');await pg.wait_for_timeout(700);await pg.screenshot(path=str(ROOT/f'{tag}_scan.png'));print('SCAN',await pg.locator('main').inner_text(),flush=True);check(tag+' scanner Enter phone',await pg.locator('.basket-line').count()==1)
   await pg.locator('.review-button').click();d=pg.get_by_role('dialog').last
   await d.locator('input[name=amount]').fill('1000.01');await d.locator('form button[type=submit]').click();check(tag+' phone buyer blocked',await d.get_by_role('alert').count()>0 and len((await snapshot(pg))['ws']['sales'])==0)
   section=d.locator('section.draft-form').first
   await section.locator('input').nth(1).fill('Synthetic');await section.locator('input').nth(2).fill('Client')
   check(tag+' customer staged until confirmation',len((await snapshot(pg))['session']['customers'])==0)
   warranty=d.locator('section.draft-form').nth(1);check(tag+' warranty initially unchosen',await warranty.locator('[aria-pressed=true]').count()==0);await warranty.locator('.form-actions button').nth(1).click();await warranty.locator('select').select_option('3')
   await d.locator('form button[type=submit]').click();await d.locator('.form-actions').filter(has=pg.locator('button')).count()
   record={'en':'Record sale','fr-DZ':'Enregistrer la vente','ar-DZ':'تسجيل البيع'}[lang]
   print(tag,'buttons',await d.get_by_role('button').all_text_contents(),flush=True)
   await d.get_by_role('button',name=record,exact=True).click();await pg.wait_for_timeout(500);data=await snapshot(pg);sale=data['ws']['sales'][0]
   check(tag+' one sale sold phone buyer warranty',len(data['ws']['sales'])==1 and sale['customerId']==data['session']['customers'][0]['id'] and sale['warranties'][0]['status']=='DRAFT_PENDING' and next(x for x in data['ws']['phones'] if x['id']==phone['id'])['status']=='Sold')
   check(tag+' cash exact',next(c for c in data['ws']['cash'] if c['kind']=='SALE')['amount']=='1000.01')
   d=pg.get_by_role('dialog').last;await d.screenshot(path=str(ROOT/f'{tag}_invoice.png'))
   before=await snapshot(pg);await pg.evaluate("()=>{window.__prints=0;window.print=()=>{window.__prints++;};return void 0}");await d.locator('.document-controls > button').last.click();await d.locator('.document-controls > button').nth(1).click();await d.screenshot(path=str(ROOT/f'{tag}_warranty.png'));await d.locator('.document-controls > button').last.click();after=await snapshot(pg);print('PRINT_DIAG',tag,'counter',await pg.evaluate('window.__prints'),'equal',before==after,'versions',before['ws']['version'],after['ws']['version'],flush=True);check(tag+' print twice pure',before==after and await pg.evaluate('window.__prints')==2);await pg.keyboard.press('Escape')
   await go('/sales');check(tag+' dedicated history readback',await pg.locator('tbody tr').count()==1 and await pg.locator('tbody').inner_text() and sale['id'] in await pg.locator('tbody').inner_text());await pg.locator('tbody button').click();check(tag+' history reopen specimen',await pg.locator('[data-testid=document-sheet]').count()==2);await pg.keyboard.press('Escape');await pg.reload();await pg.wait_for_timeout(900);check(tag+' reload persisted',len((await snapshot(pg))['ws']['sales'])==1)
   await pg.screenshot(path=str(ROOT/f'{tag}_history.png'))
   await go('/customers');row=pg.locator('tbody tr').filter(has_text='Synthetic Client');await row.get_by_role('button').click();d=pg.get_by_role('dialog').last;check(tag+' customer purchase history',sale['id'] in await d.inner_text());await pg.keyboard.press('Escape')
   await go('/pos');await pg.locator('.scanner-field > button').last.click();d=pg.get_by_role('dialog').last;await pg.evaluate('()=>Object.defineProperty(navigator,"mediaDevices",{value:{getUserMedia:()=>Promise.reject(new DOMException("denied","NotAllowedError"))},configurable:true})');await d.locator('.form-actions button').first.click();await d.get_by_role('alert').wait_for();check(tag+' POS camera permission fallback',await d.locator('input').is_enabled());await pg.keyboard.press('Escape')
   inp=pg.locator('.scanner-field input');await inp.fill('PH000007' if store=='M01' else 'PH000001');await inp.press('Enter');check(tag+' own-store scanner rejects other store',await pg.locator('.basket-line').count()==0)
   check(tag+' direction',await pg.locator('html').get_attribute('dir')==('rtl' if lang=='ar-DZ' else 'ltr'));check(tag+' viewport no overflow',await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'));check(tag+' no runtime error',not errors);await ctx.close()
  await browser.close()
 ROOT.joinpath('results.json').write_text(json.dumps(R,indent=2));print('TOTAL',len(R),'PASS',sum(x['status']=='PASS' for x in R))
asyncio.run(main())
