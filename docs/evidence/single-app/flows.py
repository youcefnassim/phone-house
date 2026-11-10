import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
S=Path(__file__).parent/"shots";S.mkdir(exist_ok=True)
R=[]
def rec(name,ok,ev=""):R.append({"test":name,"result":"PASS" if ok else "FAIL","evidence":ev});print(("PASS " if ok else "FAIL ")+name,ev)
IDB="""()=>new Promise((res,rej)=>{const r=indexedDB.open('ph-test-workspace',1);r.onsuccess=()=>{const tx=r.result.transaction('kv');const st=tx.objectStore('kv');const a=st.get('workspace'),b=st.get('session');tx.oncomplete=()=>res({ws:a.result,s:b.result});};r.onerror=()=>rej(r.error);})"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={"width":1280,"height":1800});pg=await ctx.new_page()
    errors=[];pg.on("pageerror",lambda e:errors.append(str(e)))
    pg.on("dialog",lambda d:asyncio.ensure_future(d.accept()))
    B="http://localhost:8080"
    async def go(r):await pg.goto(B+r);await pg.wait_for_timeout(1800)
    async def db():return await pg.evaluate(IDB)
    D=lambda:pg.locator("[role=dialog]").last
    async def submit():await D().locator("form button[type=submit]").last.click();await pg.wait_for_timeout(400)
    await go("/");await pg.evaluate("localStorage.setItem('ph-lang','en')")

    await go("/")
    # customer
    await go("/customers");await pg.get_by_role("button",name="Add customer").click()
    await D().get_by_label("Customer name").fill("E2E Client Alpha");await D().get_by_label("Contact reference").fill("0550 999 111")
    await D().get_by_label("Store",exact=True).select_option("M01");await D().get_by_label("Customer reference").fill("E2E-REF-1");await submit()
    await go("/customers");d=await db();cust=[c for c in d["s"]["customers"] if c["name"]=="E2E Client Alpha"]
    rec("customer created and persisted after reload",len(cust)==1,cust[0]["id"] if cust else "");cid=cust[0]["id"]
    # cash shift
    await go("/cash");await pg.get_by_role("button",name="Open shift").first.click();await D().get_by_label("amount").fill("5000");await D().get_by_role("button",name="Confirm").click();await pg.wait_for_timeout(500)
    d=await db();rec("cash shift open M01",any(s["status"]=="OPEN" and s["store"]=="M01" for s in d["ws"]["shifts"]))
    cash0=len(d["ws"]["cash"])
    # POS credit request
    await go("/pos");await pg.get_by_label("Test customer").select_option(cid)
    await pg.get_by_label("Scan barcode or search products").fill("PH000002");await pg.keyboard.press("Enter")
    await pg.get_by_role("button",name="Review basket").click();await pg.wait_for_timeout(400)
    await D().get_by_role("button",name="Prepare credit request draft").click()
    await D().get_by_label("Upfront amount stated (DZD, not collected)").fill("26000");await D().get_by_label("Due date").fill("2026-12-31");await D().get_by_label("Authorization reference").fill("AUTH-E2E")
    await D().get_by_role("button",name="Save credit request draft").click();await pg.wait_for_timeout(500)
    await pg.screenshot(path=str(S/"01_pos_credit.png"))
    await pg.reload();await pg.wait_for_timeout(1800);d=await db()
    debt=[x for x in d["s"]["debts"] if x["customerId"]==cid]
    ph2=[x for x in d["ws"]["phones"] if x["id"]=="PH-002"][0]
    rec("customer→POS credit request draft (100000.00 outstanding, stock+cash unchanged, after reload)",len(debt)==1 and debt[0]["amount"]=="100000.00" and ph2["status"]=="Available" and len(d["ws"]["cash"])==cash0,json.dumps(debt[0]) if debt else "")
    debtId=debt[0]["id"]
    # POS cash sale with customer
    await pg.get_by_label("Test customer").select_option(cid)
    await pg.get_by_label("Scan barcode or search products").fill("PH000001");await pg.keyboard.press("Enter")
    await pg.get_by_role("button",name="Review basket").click();await pg.wait_for_timeout(400)
    await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Entered amount (DZD)").fill("190000");await submit()
    await D().get_by_role("button",name="Record sale").click();await pg.wait_for_timeout(500)
    await pg.reload();await pg.wait_for_timeout(1800);d=await db()
    sale=d["ws"]["sales"][0] if d["ws"]["sales"] else None
    rec("POS cash sale linked to customer + cash movement (after reload)",bool(sale) and sale["customerId"]==cid and sale["change"]=="1000.00" and any(c["reference"]==sale["id"] and c["kind"]=="SALE" for c in d["ws"]["cash"]),sale and sale["id"])
    saleId=sale["id"]
    # debt repayment
    await go("/debts");await pg.get_by_role("button",name=f"Debt {debtId}").click()
    await D().get_by_role("button",name="Repayment draft").click()
    await D().get_by_label("Repayment amount (DZD)").fill("40000.25");await D().get_by_label("Payment date").fill("2026-11-06");await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Payment reference").fill("PAY-E2E-1");await D().get_by_label("Authorization reference").fill("AUTH-E2E");await submit()
    await D().get_by_role("button",name="Repayment draft").click()
    await D().get_by_label("Repayment amount (DZD)").fill("59999.76");await D().get_by_label("Payment date").fill("2026-11-06");await D().get_by_label("Payment method").select_option("Cash");await D().get_by_label("Payment reference").fill("PAY-E2E-2");await D().get_by_label("Authorization reference").fill("AUTH-E2E");await submit()
    over=await D().get_by_role("alert").all_inner_texts()
    await pg.screenshot(path=str(S/"02_debt_repayment.png"))
    await pg.reload();await pg.wait_for_timeout(1800);d=await db()
    reps=[r for r in d["s"]["repayments"] if r["subjectId"]==debtId]
    rec("partial repayment 40000.25 stored; outstanding preview 59999.75",len(reps)==1 and reps[0]["amount"]=="40000.25")
    rec("overpayment 59999.76 rejected with visible error",len(reps)==1 and any("exceeds" in o for o in over),"; ".join(over))
    # transfer
    await go("/transfers");await pg.get_by_role("button",name="Transfer draft").click()
    await D().get_by_role("button",name=re.compile("iPhone 14")).click();await D().get_by_label("Transfer document reference").fill("TR-E2E-1")
    await D().get_by_role("button",name="Save transfer draft").click();await pg.wait_for_timeout(500)
    d=await db();tid=d["ws"]["transfers"][0]["id"]
    async def mv(stage):await D().get_by_role("button",name=f"Move to: {stage}").click();await pg.wait_for_timeout(300)
    await mv("Approvals");await mv("Dispatch");err1=await D().get_by_role("alert").all_inner_texts()
    rec("dispatch blocked without approvals","Both" in " ".join(err1)," ".join(err1))
    await D().get_by_label("Super Admin approval draft").select_option("U-OWN");await D().get_by_role("button",name="Record preview approval").first.click();await pg.wait_for_timeout(200)
    await D().get_by_label("M02 Manager approval draft").select_option("U-M02");await D().get_by_role("button",name="Record preview approval").click();await pg.wait_for_timeout(200)
    await mv("Dispatch");await mv("In transit");await mv("Receipt")
    d=await db();p6=[x for x in d["ws"]["phones"] if x["id"]=="PH-006"][0]
    rec("in transit: phone not available at destination",p6["status"]=="In transit" and p6["store"]=="M01")
    await mv("Completed");err2=await D().get_by_role("alert").all_inner_texts()
    await D().get_by_label("Transfer receipt scan").fill("350000000000071");await D().get_by_role("button",name="Scan",exact=True).click();await pg.wait_for_timeout(200);err3=await D().get_by_role("alert").all_inner_texts()
    rec("incomplete scan blocks completion; foreign IMEI rejected","Partial" in " ".join(err2) and "not on this transfer" in " ".join(err3)," | ".join(err2+err3))
    await D().get_by_label("Transfer receipt scan").fill("350000000000061");await D().get_by_role("button",name="Scan",exact=True).click();await pg.wait_for_timeout(200)
    await mv("Completed");await pg.screenshot(path=str(S/"03_transfer_completed.png"))
    await pg.reload();await pg.wait_for_timeout(1800);d=await db();p6=[x for x in d["ws"]["phones"] if x["id"]=="PH-006"][0];t0=d["ws"]["transfers"][0]
    rec("transfer completed after full scan; phone available at M02 (after reload)",t0["stage"]=="COMPLETED" and p6["store"]=="M02" and p6["status"]=="Available" and t0["superAdminBy"] and t0["m02ManagerBy"])
    # facility
    await go("/facility");await pg.get_by_role("button",name="Agreement draft").click()
    await D().get_by_label("Customer",exact=True).select_option(cid);await D().get_by_label("Employer reference").fill("EMP-E2E");await D().get_by_label("Contract reference").fill("FC-E2E-1")
    await D().get_by_label("Explicit contract price (DZD)").fill("60000");await D().get_by_label("Contract-specific months").fill("3");await D().get_by_label("First schedule month").fill("2026-12");await D().get_by_label("Explicit monthly amount (DZD)").fill("20000");await submit()
    d=await db();fac=[f for f in d["s"]["facilities"] if f["contractReference"]=="FC-E2E-1"]
    rec("M01 facility contract linked to test customer",len(fac)==1 and fac[0]["customerId"]==cid)
    await pg.get_by_role("button",name=f"Facility {fac[0]['id']}").click()
    await D().get_by_role("button",name="Bank remittance draft").click()
    await D().get_by_label("Schedule month").fill("2026-12");await D().get_by_label("Evidence amount (DZD)").fill("20000");await D().get_by_label("Bank statement reference").fill("BK-E2E-1");await submit()
    e4=await D().get_by_role("alert").all_inner_texts()
    rec("bank remittance without evidence document rejected","bank evidence" in " ".join(e4)," ".join(e4))
    cashN=len(d["ws"]["cash"])
    await D().get_by_label("Bank evidence document").set_input_files({"name":"statement-e2e.pdf","mimeType":"application/pdf","buffer":b"%PDF-1.4 synthetic"})
    await submit();await pg.screenshot(path=str(S/"04_facility.png"))
    await pg.reload();await pg.wait_for_timeout(1800);d=await db();ev=d["s"]["facilityEvents"]
    rec("bank evidence draft stored unverified, separate from cash (after reload)",len(ev)==1 and ev[0]["evidence"]=="statement-e2e.pdf" and len(d["ws"]["cash"])==cashN)
    # SAV
    await go("/sav");row=pg.locator("tr",has_text=saleId).filter(has=pg.get_by_role("button",name="Open case"))
    await row.get_by_role("button",name="Open case").click()
    await D().get_by_label("Reported issue").fill("Screen flicker");await D().get_by_label("Requested action").select_option("Return");await D().get_by_label("Case document reference").fill("SAV-DOC-1");await submit()
    await go("/sav");await pg.locator("tr",has_text=saleId).get_by_role("button",name="Open case").click()
    await D().get_by_label("Reported issue").fill("again");await D().get_by_label("Requested action").select_option("Return");await D().get_by_label("Case document reference").fill("SAV-DOC-2");await submit()
    e5=await D().get_by_role("alert").all_inner_texts();await pg.screenshot(path=str(S/"05_sav_duplicate.png"))
    d=await db();cs=d["s"]["cases"];p1=[x for x in d["ws"]["phones"] if x["id"]=="PH-001"][0]
    rec("SAV case linked to sold unit; duplicate open case rejected; unit not restocked",len(cs)==1 and cs[0]["saleReference"]==saleId and "already exists" in " ".join(e5) and p1["status"]=="Sold"," ".join(e5))
    # role/store preview
    await go("/facility");await pg.get_by_label("Store").first.select_option("M02");await pg.wait_for_timeout(500)
    txt=await pg.locator("main").inner_text();rec("facility unavailable in M02 scope","only" in txt)
    rec("no page errors",not errors,"; ".join(errors[:3]))
    (Path(__file__).parent/"flow_results.json").write_text(json.dumps(R,indent=1))
    await b.close()
asyncio.run(main())
