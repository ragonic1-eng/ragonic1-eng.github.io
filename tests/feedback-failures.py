from ui_helpers import open_options,close_options
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':2600})
 page.goto('http://127.0.0.1:8000');page.wait_for_selector('.activity')
 # Observe a real pending request; duplicate submissions are disabled until it finishes.
 pending=[];page.route('**/config.json',lambda r:r.fulfill(json={'provider':'server'}));page.route('**/api/rooms',lambda r:pending.append(r))
 open_options(page);page.locator('#share').click()
 with page.expect_request('**/api/rooms'):page.locator('#createShare').click()
 expect(page.locator('#createShare')).to_have_attribute('aria-busy','true');expect(page.locator('#createShare')).to_be_disabled();expect(page.locator('#createShare')).to_have_text('Creating shared trip…')
 pending[0].fulfill(status=503,json={'error':'Sharing is unavailable. Please retry.'});expect(page.locator('#createShare')).to_be_enabled();expect(page.locator('#shareStatus')).to_contain_text('retry');page.locator('#shareClose').click();close_options(page)
 # Native desktop drag animates a real reorder and supplies Undo.
 first=page.locator('.activity').first.get_attribute('data-id');page.locator('.activity').first.locator('h3').drag_to(page.locator('.activity').nth(2).locator('h3'))
 assert page.locator('.activity').first.get_attribute('data-id')!=first;expect(page.locator('#toast')).to_contain_text('Card moved');page.locator('#toast').get_by_role('button',name='Undo',exact=True).click();assert page.locator('.activity').first.get_attribute('data-id')==first
 # Browser-storage failure must remain an error, without a false success message.
 page.evaluate("Storage.prototype.setItem=function(key,value){if(key==='little-orbit-v1')throw new DOMException('Quota exceeded','QuotaExceededError')}")
 page.locator('#new').click();page.locator('#title').fill('Unsaved test activity');page.locator('#duration').fill('5');page.locator('#saveActivity').click();expect(page.locator('#editor')).not_to_be_visible()
 expect(page.locator('#toast')).to_contain_text('could not save');assert page.locator('#toast').get_attribute('data-kind')=='error';expect(page.locator('#toast').get_by_role('button',name='Export backup',exact=True)).to_be_visible()
 expect(page.locator('#saveStatus')).to_contain_text('Not saved')
 # Initial loading failures expose a retry rather than broken editing controls.
 failed=b.new_page();failed.route('**/trip.json',lambda r:r.abort());failed.goto('http://127.0.0.1:8000');expect(failed.locator('#retryTrip')).to_be_visible();expect(failed.locator('#new')).to_be_disabled();failed.unroute('**/trip.json');failed.locator('#retryTrip').click();failed.wait_for_selector('.activity');expect(failed.locator('#new')).to_be_enabled()
 b.close();print('PASS: pending network spinner and duplicate-submit prevention, native drag confirmation and Undo, persistent actionable storage failure without false success')
