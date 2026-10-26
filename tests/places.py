import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from ui_helpers import expand_card
base='http://127.0.0.1:8000'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.wait_for_selector('.activity');page.locator('[data-day="1"]').click()
 farm=page.locator('.activity').filter(has=page.get_by_role('heading',name='Flying Cow Ranch',exact=True));expand_card(farm);farm.locator('[data-place-edit]').click();expect(page.locator('#placeResults')).to_contain_text('苗栗縣通霄鎮南和里166號');page.locator('.place-result').first.click();expect(page.locator('#placeSelected')).to_contain_text('Admission ticket')
 page.locator('#saveActivity').click();expect(farm.locator('.place-info')).to_contain_text('Flying Cow Ranch');assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place.id")=='flying-cow'
 page.reload();page.wait_for_selector('.activity');farm=page.locator('.activity').filter(has=page.get_by_role('heading',name='Flying Cow Ranch',exact=True));expand_card(farm);expect(farm.locator('.place-address')).to_contain_text('166號')
 # Saved place is automatically available in the Chinese driver preview.
 driver=ctx.new_page();driver.goto(base+'/driver.html');driver.wait_for_selector('.driver-card');driver.locator('[data-day="1"]').click();expect(driver.locator('.place-info')).to_contain_text('飛牛牧場');expect(driver.locator('.place-info')).to_contain_text('需購買入園門票');driver.close()
 # Removing then cancelling leaves the saved place untouched.
 farm.locator('[data-place-edit]').click();page.locator('#removePlace').click();page.locator('#activityCancel').click();assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place.id")=='flying-cow'
 farm.locator('[data-place-edit]').click();page.locator('#removePlace').click();page.locator('#saveActivity').click();assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place===undefined")
 # Ambiguous mentions remain suggestions, never auto-attached.
 farm.locator('[data-place-edit]').click();page.locator('#title').fill('Flying Cow Ranch or Qingjing Farm');expect(page.locator('.place-result')).to_have_count(2);assert page.locator('#placeSelected').inner_text()==''
 # Search is explicit, never sends card notes. Remote data is escaped and does not invent bookings.
 requests=[]
 def search(route):
  requests.append(route.request.url)
  route.fulfill(json=[{'osm_type':'way','osm_id':100,'name':'Taipei 101 <script>bad()</script>','display_name':'7 Xinyi Road, Taipei, Taiwan','type':'attraction','lat':'25.033','lon':'121.565','address':{'city':'Taipei'},'namedetails':{'name:zh':'台北101'},'extratags':{'website':'javascript:alert(1)'}}])
 ctx.route('https://nominatim.openstreetmap.org/**',search)
 page.locator('#placeQuery').fill('Taipei 101');assert not requests;page.locator('#placeSearch').click();expect(page.locator('.place-result')).to_have_count(1);assert len(requests)==1;assert 'Flying' not in requests[0]
 page.locator('.place-result').click();expect(page.locator('#placeSelected')).to_contain_text('Booking requirement not confirmed');assert page.locator('#placeSelected script').count()==0;assert page.locator('#placeSelected a[href^="javascript:"]').count()==0
 page.locator('#placeFinder>summary').click();page.locator('#placeQuery').fill('Taipei 101');page.locator('#placeSearch').click();expect(page.locator('.place-result')).to_have_count(1);assert len(requests)==1
 # Manual input validation, correction, saved URL, and failure recovery.
 page.locator('#placeQuery').fill('No map service');ctx.unroute('https://nominatim.openstreetmap.org/**');ctx.route('https://nominatim.openstreetmap.org/**',lambda r:r.abort());page.wait_for_timeout(1250);page.locator('#placeSearch').click();expect(page.locator('#placeMessage')).to_contain_text('unavailable');expect(page.locator('#placeSelected')).to_contain_text('Taipei 101')
 page.locator('#correctPlace').click();page.locator('#manualPlaceName').fill('Meet at the north entrance');page.locator('#manualPlaceBooking').fill('javascript:alert(1)');page.locator('#useManualPlace').click();expect(page.locator('#manualPlaceMessage')).to_contain_text('https://');page.locator('#manualPlaceBooking').fill('https://example.com/tickets');page.locator('#useManualPlace').click();expect(page.locator('#placeSelected')).to_contain_text('Meet at the north entrance')
 page.locator('#title').fill('Flying Cow Ranch');page.locator('#saveActivity').click();page.reload();page.wait_for_selector('.activity');assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place.name")=='Meet at the north entrance'
 # A superseded network request cannot overwrite a new local choice; Enter cannot duplicate a pending lookup.
 farm=page.locator('.activity').filter(has=page.get_by_role('heading',name='Flying Cow Ranch',exact=True));expand_card(farm);farm.locator('[data-place-edit]').click();page.locator('#placeFinder>summary').click()
 ctx.unroute('https://nominatim.openstreetmap.org/**');pending=[];ctx.route('https://nominatim.openstreetmap.org/**',lambda r:pending.append(r))
 page.locator('#placeQuery').fill('Slow place');page.locator('#placeSearch').click();expect(page.locator('#placeSearch')).to_be_disabled();page.locator('#placeQuery').press('Enter');assert len(pending)==1
 page.locator('#placeQuery').fill('Flying Cow');expect(page.locator('.place-result')).to_have_count(1);page.locator('.place-result').click();pending[0].fulfill(json=[]);expect(page.locator('#placeSelected')).to_contain_text('飛牛牧場');page.locator('#activityCancel').click()
 # Malicious imported place fields rejected, ordinary existing trips stay valid.
 assert page.evaluate("(()=>{const s=structuredClone(state);s.days[0].cards[0].place={name:'Bad',bookingUrl:'javascript:alert(1)'};try{validate(s);return false}catch{return true}})()")
 # Confirm layout of the picker and reachable footer across mobile widths.
 for width in [320,390,430,740]:
  page.set_viewport_size({'width':width,'height':844});farm=page.locator('.activity').filter(has=page.get_by_role('heading',name='Flying Cow Ranch',exact=True));expand_card(farm);farm.locator('[data-place-edit]').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('#editor').evaluate('el=>el.scrollWidth<=el.clientWidth');page.locator('#activityCancel').click()
 page.set_viewport_size({'width':390,'height':844});farm.locator('[data-place-edit]').click();page.screenshot(path='/tmp/orbit-place-selected.png');page.set_viewport_size({'width':390,'height':360});box=page.locator('#saveActivity').bounding_box();assert box['y']+box['height']<=361
 assert not errors,errors;b.close();print('PASS: detected and ambiguous locations, saved addresses/links, Chinese driver places, persistence, cancel/remove, explicit cached online lookup, escaping, offline/manual recovery, validation, mobile picker and reachable Save')
