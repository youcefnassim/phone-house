import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent
IDB="""()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const st=tx.objectStore('kv');const a=st.get('workspace');tx.oncomplete=()=>res(a.result);};r.onerror=()=>rej(r.error);})"""
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def go(path):await page.goto('http://localhost:8080'+path);await page.wait_for_timeout(750)
  async def ws():await page.wait_for_timeout(350);return await page.evaluate(IDB)
  await go('/');await page.evaluate('localStorage.setItem("ph-lang","en")');await page.reload();await page.wait_for_timeout(900)
  await page.locator('.topbar select').nth(1).select_option('U-S01');await go('/cash')
  await page.get_by_role('button',name='Open shift',exact=True).click();d=page.get_by_role('dialog');await d.locator('[name=amount]').fill('0');await d.locator('button[type=submit]').click()
  await go('/pos');scan=page.locator('.scanner-field input');await scan.fill('PH000001');await scan.press('Enter')
  await page.get_by_role('button',name='Review basket',exact=True).click();d=page.get_by_role('dialog')
  await d.get_by_label('Surname',exact=True).fill('Synthetic');await d.get_by_label('Given name',exact=True).fill('DailyBuyer')
  print('buttons',await d.get_by_role('button').all_text_contents())
  await d.get_by_role('button',name='Yes',exact=True).click();await d.locator('select').filter(has=page.locator('option[value="3"]')).select_option('3')
  await d.get_by_label('Entered amount (DZD)').fill('189000');await d.locator('form button[type=submit]').click();await d.get_by_role('button',name='Record sale',exact=True).click();await page.wait_for_timeout(600)
  assert await d.locator('[data-testid=document-sheet]').count()==1
  before=await ws();assert len(before['sales'])==1;assert before['sales'][0]['buyer']['surname']=='Synthetic'
  await page.evaluate('window.print=()=>{window.__printed=(window.__printed||0)+1};void 0;')
  await d.get_by_role('button',name='Print / Save as PDF',exact=True).click();await d.get_by_role('button',name='Warranty specimen',exact=True).click();await d.get_by_role('button',name='Print / Save as PDF',exact=True).click()
  assert before==await ws();assert await page.evaluate('window.__printed')==2
  await page.screenshot(path=str(OUT/'warranty.png'));await go('/sales');assert 'Synthetic' in await page.locator('main').inner_text()
  await page.reload();await page.wait_for_timeout(900);assert len((await ws())['sales'])==1
  await go('/cash');await page.get_by_role('button',name='Close drawer',exact=True).click();d=page.get_by_role('dialog');assert await d.locator('[name=amount]').input_value()=='';await d.locator('[name=amount]').fill('189000');await d.locator('button[type=submit]').click();assert (await ws())['shifts'][0]['status']=='CLOSED'
  await page.screenshot(path=str(OUT/'closed.png'));assert not errors,errors
  (OUT/'results.json').write_text(json.dumps({'phone_sale_inline_buyer':True,'deliberate_3_month_warranty':True,'invoice_warranty_print_no_mutation':True,'sales_reload':True,'blind_direct_close':True,'page_errors':errors},indent=2));print('PASS actual local sale/print/history/close')
  await b.close()
asyncio.run(main())
