import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).parent; SH=ROOT/'screenshots';SH.mkdir(exist_ok=True)
ROUTES=['/','/pos','/cash','/stock/phones','/stock/accessories','/catalog','/transfers','/customers','/debts','/suppliers','/purchases','/expenses','/facility','/sav','/reports','/users','/audit','/settings','/auth'];R=[]
IDB="""()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const a=tx.objectStore('kv').get('workspace'),b=tx.objectStore('kv').get('session');tx.oncomplete=()=>{r.result.close();res({ws:a.result,s:b.result})}};r.onerror=()=>rej(r.error)})"""
def rec(name,ok,ev=''):R.append(dict(test=name,result='PASS' if ok else 'FAIL',evidence=ev))
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await c.new_page();await page.goto('http://localhost:8080');await page.wait_for_timeout(1000)
  await page.evaluate("localStorage.setItem('ph-mode','PRODUCTION');localStorage.setItem('ph-lang','en')")
  await page.reload();await page.wait_for_timeout(1000)
  before=await page.evaluate(IDB)
  rec('obsolete saved PRODUCTION preference ignored; working dashboard shown',await page.locator('.metrics-grid').count()==1 and await page.get_by_role('button',name='Production',exact=True).count()==0)
  await page.goto('http://localhost:8080/settings');await page.wait_for_timeout(1000)
  rec('Settings local privacy and unconnected services disclosure',await page.get_by_role('heading',name='Local review workspace',exact=False).count()==1 and 'multi-device' in await page.locator('main').inner_text())
  async with page.expect_download() as d:await page.get_by_role('button',name='Download local review data').click()
  downloaded=await d.value;await downloaded.save_as(ROOT/'isolated-export.json');exp=json.loads((ROOT/'isolated-export.json').read_text());rec('explicit download contains only local workspace/session records',exp['localOnly'] and exp['workspace']['phones']==before['ws']['phones'] and 'access_token' not in json.dumps(exp))
  await page.get_by_role('button',name='Start with empty ledger and catalog',exact=True).click()
  rec('empty preparation cannot delete without typed confirmation and acknowledgement',await page.get_by_role('button',name='Confirm browser-local deletion').is_disabled())
  await page.get_by_label('Type the exact confirmation').fill('WRONG')
  await page.get_by_label('I understand all provisional').check()
  rec('wrong confirmation still blocks deletion',await page.get_by_role('button',name='Confirm browser-local deletion').is_disabled())
  await page.screenshot(path=str(SH/'settings_empty_preview.png'));await page.get_by_role('button',name='Cancel',exact=True).click()
  await page.get_by_role('button',name='Restore fictional fixtures for rehearsal',exact=True).click();rec('rehearsal requires different exact confirmation','RESTORE FICTIONAL FIXTURES' in await page.locator('main').inner_text());await page.get_by_role('button',name='Cancel',exact=True).click()
  await page.reload();await page.wait_for_timeout(1000);after=await page.evaluate(IDB);rec('preparation/export/cancel/navigation/reload preserves all local records',before==after)
  await c.close()
  for lang in ['fr-DZ','ar-DZ','en']:
   for theme in ['light','dark']:
    for width,height in [(390,844),(768,1024),(1280,1800)]:
     c=await b.new_context(viewport={'width':width,'height':height});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     await page.goto('http://localhost:8080');await page.evaluate("([l,t])=>{localStorage.setItem('ph-lang',l);localStorage.setItem('ph-theme',t);localStorage.setItem('ph-mode','PRODUCTION')}",[lang,theme])
     for route in ROUTES:
      await page.goto('http://localhost:8080'+route);await page.wait_for_function("([l,t])=>document.documentElement.lang===l && document.documentElement.classList.contains('dark')===(t==='dark')",arg=[lang,theme]);await page.wait_for_timeout(300);await page.locator('h1').first.wait_for()
      info=await page.evaluate("({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,dir:document.documentElement.dir,dark:document.documentElement.classList.contains('dark')})")
      title=await page.title();old=await page.get_by_role('button',name='Production',exact=True).count()
      ok=info['scroll']<=info['width']+2 and info['dir']==('rtl' if lang=='ar-DZ' else 'ltr') and info['dark']==(theme=='dark') and old==0 and not errors and 'Phone House' in title
      rec(f'route {route} {lang} {theme} {width}x{height}',ok,json.dumps(info)+(' errors:'+str(errors[:1]) if errors else ''))
      if route in ['/','/settings','/pos']:
       await page.screenshot(path=str(SH/f'{lang}_{theme}_{width}_{route.strip("/") or "overview"}.png'))
     await c.close()
  await b.close()
 (ROOT/'route_results.json').write_text(json.dumps(R,ensure_ascii=False,indent=2));print('TOTAL',len(R),'PASS',sum(x['result']=='PASS' for x in R),'FAIL',sum(x['result']=='FAIL' for x in R));print('\n'.join(x['test']+' '+x['evidence'] for x in R if x['result']=='FAIL'))
asyncio.run(main())
