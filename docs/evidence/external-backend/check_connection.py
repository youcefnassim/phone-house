import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/external-backend')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/settings',wait_until='networkidle')
  await page.get_by_role('heading',name='Base de développement externe').wait_for()
  await page.get_by_text('Non connectée',exact=True).wait_for()
  await page.screenshot(path=str(OUT/'settings-fr.png'))
  print('PASS live server status: Non connectée')
  result=await page.evaluate('''async()=>{
   const {createProductionOutbox}=await import('/src/data/production-outbox.ts');
   const {transactionVersion}=await import('/src/domain/transaction-contracts.ts');
   const id='00000000-0000-4000-8000-000000000001';
   const binding={projectRef:'abcdefghijklmnopqrst',userId:id,deviceId:id,store:'M01'};
   const request={contractVersion:transactionVersion,idempotencyKey:'browser-outbox-key-0001',clientRequestId:id,payload:{store:'M01',shiftId:id,lines:[{kind:'accessory',itemId:id,quantity:'1'}],tender:'Cash',tenderedAmount:'100.00'}};
   const q=createProductionOutbox('phonehouse-browser-acceptance-isolated');
   await q.enqueue(binding,'pos.checkout',request);await q.enqueue(binding,'pos.checkout',request);
   const rows=await q.list(binding);let calls=0;
   const blocked=await q.replay(request.idempotencyKey,binding,{authorize:async()=>({authenticated:true,devicePolicyApproved:false}),execute:async()=>{calls++;throw new Error('must not execute');}});
   await q.close();return {count:rows.length,state:blocked.state,calls};
  }''')
  assert result=={'count':1,'state':'POLICY_BLOCKED','calls':0},result
  await page.goto('http://localhost:8080/settings',wait_until='networkidle')
  rows=await page.evaluate('''async()=>{const {createProductionOutbox}=await import('/src/data/production-outbox.ts');const q=createProductionOutbox('phonehouse-browser-acceptance-isolated');const rows=await q.list({projectRef:'abcdefghijklmnopqrst',userId:'00000000-0000-4000-8000-000000000001',deviceId:'00000000-0000-4000-8000-000000000001',store:'M01'});await q.close();return rows.map(r=>({key:r.key,state:r.state,transactionId:r.transactionId}));}''')
  assert rows==[{'key':'browser-outbox-key-0001','state':'POLICY_BLOCKED','transactionId':None}],rows
  print('PASS browser IndexedDB duplicate prevention, policy stop, persisted readback after refresh (no server posting)')
  await page.evaluate("localStorage.setItem('ph-lang','ar-DZ');localStorage.setItem('ph-theme','dark')")
  await page.set_viewport_size({'width':390,'height':844});await page.goto('http://localhost:8080/settings',wait_until='networkidle')
  await page.get_by_role('heading',name='قاعدة بيانات التطوير الخارجية').wait_for()
  await page.get_by_text('غير متصلة',exact=True).wait_for()
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.screenshot(path=str(OUT/'settings-ar-mobile-dark.png'))
  print('PASS Arabic dark mobile status and no horizontal overflow')
  await page.set_viewport_size({'width':1280,'height':1800})
  await page.evaluate("localStorage.setItem('ph-lang','en');localStorage.setItem('ph-theme','light')")
  await page.goto('http://localhost:8080/settings',wait_until='networkidle');await page.get_by_text('Not connected',exact=True).wait_for()
  await page.screenshot(path=str(OUT/'settings-en.png'))
  assert not errors,errors
  (OUT/'results.json').write_text(json.dumps({'status':'PASS','checks':['FR server connection status','IndexedDB duplicate prevention','policy-blocked no dispatch','reload persisted readback','AR dark mobile no overflow','EN status'],'pageErrors':errors,'databaseExecution':'NOT RUN','hostedAuth':'NOT RUN'},indent=2))
  await browser.close()
asyncio.run(main())
