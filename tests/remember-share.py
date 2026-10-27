import json
from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off
base='http://127.0.0.1:8000'
trip=json.load(open('trip.json'))
ROOM={'id':'22222222-2222-2222-2222-222222222222','key':'b'*64}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 state={'exists':True,'loads':0}
 def rpc(route):
  name=route.request.url.rsplit('/',1)[-1]
  if name=='orbit_create_trip':route.fulfill(json={**ROOM,'revision':1})
  elif name=='orbit_load_trip':
   state['loads']+=1
   route.fulfill(json={'revision':1,'trip':trip} if state['exists'] else {'error':'Trip unavailable or private link is incomplete.'})
  else:route.fulfill(json={'revision':2})
 ctx.route('**/rest/v1/rpc/*',rpc)
 # Without a shared trip, Orbit is off and the plain address stays local.
 google_off(page);page.goto(base);page.wait_for_selector('.activity');page.evaluate('openEditor()');expect(page.locator('#orbitStatus')).to_be_visible()
 # "Turn on Orbit" opens sharing; creating a shared trip switches this page on and remembers it.
 page.locator('#orbitTurnOn').click();expect(page.locator('#shareEditor')).to_be_visible();page.locator('#createShare').click();expect(page.locator('#shareLinkArea')).to_be_visible()
 assert ROOM['key'] in page.url;assert json.loads(page.evaluate("localStorage.getItem('little-orbit-shared-trip')"))==ROOM;page.locator('#shareClose').click()
 # The plain address on this device reopens the shared trip with Orbit on.
 google_off(page);page.goto(base);page.wait_for_selector('.activity');expect(page.locator('#saveStatus')).to_contain_text('Shared');assert ROOM['key'] in page.url and state['loads']==1
 page.evaluate('openEditor()');expect(page.locator('#orbitStatus')).to_be_hidden();page.locator('#activityCancel').click()
 # "Stop opening it automatically" forgets it on this device only.
 page.evaluate("document.getElementById('share').click()");page.locator('#forgetShare').click();page.wait_for_selector('.activity');assert page.evaluate("localStorage.getItem('little-orbit-shared-trip')") is None;assert 'room=' not in page.url
 google_off(page);page.goto(base);page.wait_for_selector('.activity');assert 'room=' not in page.url and state['loads']==1
 # A remembered trip that no longer exists is forgotten and the device falls back to its own plan.
 page.evaluate(f"localStorage.setItem('little-orbit-shared-trip',JSON.stringify({json.dumps(ROOM)}))");state['exists']=False
 google_off(page);page.goto(base);page.wait_for_selector('.activity');expect(page.locator('#collaborationStatus')).to_contain_text('no longer available');assert page.evaluate("localStorage.getItem('little-orbit-shared-trip')") is None;assert not page.locator('#mobileAdd').is_disabled()
 assert not errors,errors;b.close();print('PASS: Turn on Orbit opens sharing, created trip remembered, plain address reopens it with Orbit on, forget on this device, unavailable remembered trip falls back to local')
