import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent; R=[]
def check(n,v):
 R.append({'name':n,'status':'PASS' if v else 'FAIL'});print(R[-1],flush=True)
async def snapshot(pg):
 await pg.wait_for_timeout(350)
 return await pg.evaluate("""()=>new Promise(res=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const a=tx.objectStore('kv').get('workspace'),b=tx.objectStore('kv').get('session');tx.oncomplete=()=>res({ws:a.result,session:b.result});}})""")
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for kind,months,tender in [('accessory',None,'Cash'),('accessory',None,'Bank'),('new',1,'Cash'),('new',3,'Bank'),('new',12,'Cash'),('existing',None,'Cash'),('mixed',None,'Cash'),('duplicate',None,'Cash')]:
   ctx=await b.new_context(viewport={'width':1280,'height':1800});pg=await ctx.new_page();tag=f'{kind}_{months}_{tender}'
   async def go(path):
    await pg.goto('http://localhost:8080'+path);await pg.wait_for_timeout(700)
   await go('/');await pg.evaluate("()=>localStorage.setItem('ph-lang','en')");await go('/cash')
   await pg.locator('[data-testid=drawer-M01] button').first.click();d=pg.get_by_role('dialog').last;await d.locator('[name=amount]').fill('0');await d.locator('button[type=submit]').click();await go('/pos')
   async def scan(code):
    await pg.locator('.scanner-field input').fill(code);await pg.locator('.scanner-field input').press('Enter')
   if kind=='accessory':
    data=await snapshot(pg);a=next(a for a in data['ws']['accessories'] if a['id']=='AC-001');await scan(a['code']);total=a['amount']
   else:
    await scan('PH000001');total='189000'
    if kind=='mixed':
     data=await snapshot(pg);a=next(a for a in data['ws']['accessories'] if a['id']=='AC-001');await scan(a['code']);total='190800'
   await pg.locator('.tender-options button').nth(1 if tender=='Bank' else 0).click();await pg.locator('.review-button').click();d=pg.get_by_role('dialog').last
   if kind=='accessory':check(tag+' no buyer/warranty controls',await d.locator('section.draft-form').count()==0)
   else:
    section=d.locator('section.draft-form').first
    if kind in ['existing','duplicate']:
     if kind=='duplicate':
      await section.locator('input').nth(1).fill('Demo');await section.locator('input').nth(2).fill('customer 001');await d.locator('form button[type=submit]').click();check(tag+' duplicate blocked with no new records',await d.get_by_role('alert').count()>0 and len((await snapshot(pg))['session']['customers'])==0)
     await section.locator('select').select_option('C-001')
    else:
     if kind=='mixed':
      await d.locator('form button[type=submit]').click();check(tag+' missing buyer blocks mixed sale',len((await snapshot(pg))['ws']['sales'])==0 and await d.get_by_role('alert').count()>0)
     await section.locator('input').nth(1).fill('Inline');await section.locator('input').nth(2).fill('Buyer')
    warranty=d.locator('section.draft-form').nth(1);await warranty.locator('.form-actions button').nth(1 if months else 0).click()
    if months:await warranty.locator('select').select_option(str(months))
   if tender=='Bank':await d.locator('input[name=reference]').fill('LOCAL-BANK-REF')
   await d.locator('form button[type=submit]').click();await d.get_by_role('button',name='Record sale',exact=True).click();await pg.wait_for_timeout(500);data=await snapshot(pg);sale=data['ws']['sales'][0]
   check(tag+' confirmed one sale',len(data['ws']['sales'])==1 and sale['tender']==tender)
   check(tag+' correct anonymous or linked buyer',sale['customerId']=='WALK-IN' if kind=='accessory' else sale['customerId']!='WALK-IN')
   check(tag+' customer count',len(data['session']['customers'])==(1 if kind in ['new','mixed'] else 0))
   check(tag+' cash only for cash tender',len([r for r in data['ws']['cash'] if r['kind']=='SALE'])==(1 if tender=='Cash' else 0))
   if kind!='accessory':check(tag+' exact warranty choice',sale['warranties'][0].get('months')==months and sale['warranties'][0]['status']==('DRAFT_PENDING' if months else 'NONE'))
   d=pg.get_by_role('dialog').last;check(tag+' certificate availability',await d.locator('.document-controls > button').nth(1).is_enabled()==bool(months));before=await snapshot(pg);await pg.evaluate('()=>{window.print=()=>{};}');await d.locator('.document-controls > button').last.click();check(tag+' invoice print pure',before==await snapshot(pg));await d.screenshot(path=str(ROOT/f'{tag}.png'));await pg.keyboard.press('Escape');await go('/sales');await pg.locator('tbody button').first.click();check(tag+' reprint linked history',sale['id'] in await pg.get_by_role('dialog').last.inner_text());check(tag+' history projection no ledger mutation',before==await snapshot(pg));await ctx.close()
  await b.close()
 ROOT.joinpath('scenarios-results.json').write_text(json.dumps(R,indent=2));print('TOTAL',len(R),'PASS',sum(r['status']=='PASS' for r in R))
asyncio.run(main())
