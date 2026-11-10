import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  checks=[]
  for lang,width in [('fr-DZ',1440),('en',768),('ar-DZ',390)]:
   for theme in ['light','dark']:
    ctx=await browser.new_context(viewport={'width':width,'height':1800})
    page=await ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto('http://localhost:8080/',wait_until='domcontentloaded')
    await page.evaluate('([lang,theme])=>{localStorage.setItem("ph-lang",lang);localStorage.setItem("ph-theme",theme)}',[lang,theme])
    await page.reload(wait_until='domcontentloaded');await page.wait_for_timeout(1000)
    for route in ['/','/pos','/sales','/settings','/']:
     if route=='/' and page.url.endswith('/settings') and width==1440:
      await page.locator('a.brand').click()
     else: await page.goto('http://localhost:8080'+route,wait_until='domcontentloaded')
     await page.wait_for_timeout(600)
     assert await page.locator('h1').count()>0,(lang,theme,route,'blank')
     assert not errors,errors
     assert await page.locator('html').get_attribute('dir')==('rtl' if lang=='ar-DZ' else 'ltr')
     overflow=await page.evaluate('document.documentElement.scrollWidth>window.innerWidth+2')
     assert not overflow,(lang,theme,route,'overflow')
     checks.append({'language':lang,'theme':theme,'width':width,'route':route,'checks':4,'pass':True})
     if route in ['/','/pos']:
      await page.screenshot(path=str(OUT/f'{lang}-{theme}-{width}-{route.strip("/") or "dashboard"}.png'))
    await ctx.close()
  # Asset-slot replacement: intercept ONLY localhost asset with a synthetic non-logo PNG.
  ctx=await browser.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page()
  from PIL import Image
  import io
  image=Image.new('RGB',(180,60),'white');buf=io.BytesIO();image.save(buf,format='PNG')
  await page.route('**/assets/phonehouse-logo-original.png',lambda route:route.fulfill(content_type='image/png',body=buf.getvalue()))
  await page.goto('http://localhost:8080/',wait_until='domcontentloaded')
  await page.locator('img.official-brand-logo').wait_for()
  assert await page.locator('img.official-brand-logo').get_attribute('src')=='/assets/phonehouse-logo-original.png'
  assert await page.locator('img.official-brand-logo').evaluate('(i)=>i.naturalWidth')==180
  checks.append({'asset_slot':'synthetic non-logo intercepted only','checks':2,'pass':True})
  await ctx.close();await browser.close()
  (OUT/'results.json').write_text(json.dumps({'assertions':sum(c['checks'] for c in checks),'checks':checks},indent=2))
  print('PASS',sum(c['checks'] for c in checks),'assertions; isolated contexts; no owner storage accessed')
asyncio.run(main())
