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
  for lang in ['fr-DZ','ar-DZ','en']:
   for theme in ['light','dark']:
    for width,height in [(390,844),(768,1024),(1440,1800)]:
     c=await b.new_context(viewport={'width':width,'height':height});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     await page.goto('http://localhost:8080');await page.evaluate("([l,t])=>{localStorage.setItem('ph-lang',l);localStorage.setItem('ph-theme',t);localStorage.setItem('ph-mode','PRODUCTION')}",[lang,theme])
     for route in ROUTES:
      await page.goto('http://localhost:8080'+route);await page.wait_for_function("([l,t])=>document.documentElement.lang===l && document.documentElement.classList.contains('dark')===(t==='dark')",arg=[lang,theme]);await page.wait_for_timeout(300);await page.locator('h1').first.wait_for()
      info=await page.evaluate("({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,dir:document.documentElement.dir,dark:document.documentElement.classList.contains('dark')})")
      title=await page.title();old=await page.get_by_role('button',name='Production',exact=True).count()
      ok=info['scroll']<=info['width']+2 and info['dir']==('rtl' if lang=='ar-DZ' else 'ltr') and info['dark']==(theme=='dark') and old==0 and not errors and 'Phone House' in title
      rec(f'route {route} {lang} {theme} {width}x{height}',ok,json.dumps(info)+(' errors:'+str(errors[:1]) if errors else ''))
      if route in ['/cash','/users','/pos']:
       await page.screenshot(path=str(SH/f'{lang}_{theme}_{width}_{route.strip("/") or "overview"}.png'))
     await c.close()
  await b.close()
 (ROOT/'route_results.json').write_text(json.dumps(R,ensure_ascii=False,indent=2));print('TOTAL',len(R),'PASS',sum(x['result']=='PASS' for x in R),'FAIL',sum(x['result']=='FAIL' for x in R));print('\n'.join(x['test']+' '+x['evidence'] for x in R if x['result']=='FAIL'))
asyncio.run(main())
