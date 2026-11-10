import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "1_dashboard.png"))
        print("dashboard title:", await page.title())
        await page.goto("http://localhost:8080/pos", wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "2_pos.png"))
        await page.goto("http://localhost:8080/sales", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SHOTS / "3_sales.png"))
        print("pageerrors:", errors)
        await browser.close()

asyncio.run(main())
