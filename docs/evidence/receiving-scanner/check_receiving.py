import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent;R=[]
def check(name,value):
 R.append({'name':name,'status':'PASS' if value else 'FAIL'});print(R[-1])
async def snapshot(page):
 return await page.evaluate('''async()=>{const db=await new Promise((r,j)=>{let q=indexedDB.open('ph-test-workspace',1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});return await new Promise(r=>{let q=db.transaction('kv').objectStore('kv').get('workspace');q.onsuccess=()=>r(q.result)})}''')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for lang,theme,w,h in [('fr-DZ','light',1440,1000),('ar-DZ','dark',390,844),('en','dark',768,1024)]:
   c=await b.new_context(viewport={'width':w,'height':h});pg=await c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));tag=f'{lang}_{w}'
   await pg.goto('http://localhost:8080');await pg.evaluate('([l,t])=>{localStorage.setItem("ph-lang",l);localStorage.setItem("ph-theme",t)}',[lang,theme]);await pg.goto('http://localhost:8080/stock/phones');await pg.wait_for_timeout(1200)
   await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog').last
   check(tag+' compact packaging collapsed',not await d.locator('details').first.evaluate('e=>e.open'))
   await d.locator('[name=store]').select_option('M01');await d.locator('[name=brand]').fill('PH Review');await d.locator('[name=name]').fill('Scan Phone');await d.locator('[name=condition]').select_option('NEW');await d.locator('[name=salePrice]').fill('1000.01')
   await d.locator('.scan-field-heading button').first.click();scan=pg.get_by_role('dialog').last
   await pg.evaluate('''()=>Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>Promise.reject(new DOMException('denied','NotAllowedError'))},configurable:true})''')
   await scan.locator('.form-actions button').first.click();await scan.get_by_role('alert').wait_for();check(tag+' denied camera manual fallback',await scan.locator('input').is_enabled())
   await scan.locator('input').fill('IMEI1:490154203237518;IMEI2:356938035643809');await scan.locator('form button').click();await scan.locator('button').filter(has_text={'fr-DZ':'Attribuer les identifiants','ar-DZ':'تعيين المعرفات','en':'Assign identifiers'}[lang]).click()
   d=pg.get_by_role('dialog').last;check(tag+' explicit QR fields',await d.locator('[name=imei1]').input_value()=='490154203237518' and await d.locator('[name=imei2]').input_value()=='356938035643809')
   await d.locator('form button[type=submit]').click();await pg.wait_for_timeout(500);d=pg.get_by_role('dialog').last;await d.locator('.encoded-label button').wait_for();await pg.wait_for_timeout(200)
   state=await snapshot(pg);phone=next(x for x in state['phones'] if x['name']=='Scan Phone');check(tag+' omitted packaging unknown',phone['packaging']=='UNKNOWN');check(tag+' unit code',phone['code'].startswith('PHU-M01-'))
   await pg.evaluate('''()=>{window.__prints=[];window.print=()=>{window.__prints.push({text:document.querySelector('.barcode-print-root').innerText,svg:!!document.querySelector('.barcode-print-root svg'),hidden:getComputedStyle(document.querySelector('.erp-layout')).display});return void 0}}''')
   before=await snapshot(pg);await pg.emulate_media(media='print');await d.locator('.encoded-label button').evaluate('e=>e.click()');await d.locator('.encoded-label button').evaluate('e=>e.click()');await pg.emulate_media(media='screen');after=await snapshot(pg)
   check(tag+' label print twice no mutation',before==after and await pg.evaluate('window.__prints.length')==2);check(tag+' isolated label CODE128',await pg.evaluate('window.__prints.every(p=>p.svg&&p.text.includes("PHONE HOUSE")&&p.hidden==="none")'))
   # real decoder on encoded label SVG
   decoded=await d.locator('.encoded-label svg[role=img]').evaluate('''async svg=>{const {BrowserBarcodeReader}=await import('/node_modules/@zxing/library/esm/index.js');const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await img.decode();return new BrowserBarcodeReader().decode(img).getText()}''')
   check(tag+' real CODE128 ZXing roundtrip',decoded==phone['code']);await d.screenshot(path=str(ROOT/f'{tag}_phone_label.png'));await pg.keyboard.press('Escape')
   await pg.goto('http://localhost:8080/stock/accessories');await pg.wait_for_timeout(1200);await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog').last
   await d.locator('[name=name]').fill('Scan Cable');await d.locator('[name=store]').select_option('M01');await d.locator('[name=quantity]').fill('5');await d.locator('[name=salePrice]').fill('300.50');await d.locator('form button[type=submit]').click();await pg.wait_for_timeout(400)
   state=await snapshot(pg);a=next(x for x in state['accessories'] if x['name']=='Scan Cable');check(tag+' generated SKU barcode',a['code'].startswith('PHA-') and a['quantity']==5);await pg.get_by_role('dialog').last.screenshot(path=str(ROOT/f'{tag}_accessory_label.png'));await pg.keyboard.press('Escape')
   await pg.locator('.heading-actions button').last.click();d=pg.get_by_role('dialog').last;await d.locator('select').first.select_option(a['id']);await d.locator('[name=quantity]').fill('5');await d.locator('form button[type=submit]').click();await pg.wait_for_timeout(400);state=await snapshot(pg);a=next(x for x in state['accessories'] if x['id']==a['id']);check(tag+' same SKU +5 price preserved',a['quantity']==10 and a['amount']=='300.50');await pg.keyboard.press('Escape')
   await pg.goto('http://localhost:8080/pos');await pg.wait_for_timeout(1500);inp=pg.locator('.scanner-field input');await inp.fill(phone['code']);await inp.press('Enter');await pg.wait_for_timeout(300);check(tag+' own-store phone scan Enter',await pg.locator('.basket-line').count()==1)
   await inp.fill(a['code']);await inp.press('Enter');await pg.wait_for_timeout(300);check(tag+' own-store accessory scan Enter',await pg.locator('.basket-line').count()==2)
   await pg.locator('.basket .section-header button').click();await pg.locator('.pos-store-controls select').select_option('M02');await inp.fill(phone['code']);await inp.press('Enter');await pg.wait_for_timeout(300);check(tag+' cross-store phone excluded',await pg.locator('.basket-line').count()==0);await inp.fill(a['code']);await inp.press('Enter');await pg.wait_for_timeout(300);check(tag+' cross-store accessory excluded',await pg.locator('.basket-line').count()==0)
   await pg.reload();await pg.wait_for_timeout(700);state=await snapshot(pg);check(tag+' reload retained receiving',any(x['id']==phone['id'] for x in state['phones']) and next(x for x in state['accessories'] if x['id']==a['id'])['quantity']==10)
   check(tag+' direction',await pg.locator('html').get_attribute('dir')==('rtl' if lang=='ar-DZ' else 'ltr'));check(tag+' no horizontal overflow',await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'));check(tag+' no runtime errors',not errors);await pg.screenshot(path=str(ROOT/f'{tag}_pos.png'));await c.close()
  await b.close()
 ROOT.joinpath('results.json').write_text(json.dumps(R,indent=2));print('TOTAL',len(R),'PASS',sum(r['status']=='PASS' for r in R),'FAIL',sum(r['status']=='FAIL' for r in R))
asyncio.run(main())
