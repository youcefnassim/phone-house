import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True)
    for (w,h,tag) in [(390,844,'m'),(768,1024,'t')]:
      pg=await (await b.new_context(viewport={"width":w,"height":h})).new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
      await pg.goto("http://localhost:8080/");await pg.evaluate("localStorage.setItem('ph-lang','ar-DZ');localStorage.setItem('ph-theme','dark')")
      await pg.goto("http://localhost:8080/transfers");await pg.wait_for_timeout(1800)
      await pg.get_by_role("button",name="مسودة تحويل").first.click() if await pg.get_by_role("button",name="مسودة تحويل").count() else None
      await pg.wait_for_timeout(500);await pg.screenshot(path=f"ar_{tag}_transfer_dialog.png")
      ov=await pg.evaluate("document.documentElement.scrollWidth>window.innerWidth");print(tag,"overflow",ov,errs)
      await pg.goto("http://localhost:8080/sav");await pg.wait_for_timeout(1500);await pg.screenshot(path=f"ar_{tag}_sav.png")
    await b.close()
asyncio.run(main())
