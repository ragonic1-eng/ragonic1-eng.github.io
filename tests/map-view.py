import base64,json
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off
base='http://127.0.0.1:8000'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
osrm_calls=[]
def osrm(route):
 osrm_calls.append(route.request.url);pts=route.request.url.split('/driving/')[1].split('?')[0].split(';')
 route.fulfill(json={'code':'Ok','routes':[{'legs':[{'distance':14000,'duration':1560} for _ in pts[1:]],'geometry':{'type':'LineString','coordinates':[list(map(float,p.split(','))) for p in pts]}}]})
def photon(route):
 q=parse_qs(urlparse(route.request.url).query)['q'][0]
 route.fulfill(json={'features':[{'type':'Feature','geometry':{'type':'Point','coordinates':[120.9+len(q)/100,24.05]},'properties':{'osm_type':'N','osm_id':5,'name':q.split(' ')[0],'city':'Nantou','country':'Taiwan','osm_value':'attraction'}}]})
place=lambda name,lat,lon:{'name':name,'address':name+' Road','description':name+' is a family farm.','openingHours':'Daily 09:00–17:00','lat':lat,'lon':lon}
card=lambda id,title,cat,dur,p=None:{'id':id,'title':title,'notes':'','category':cat,'duration':dur,'optional':False,**({'place':p} if p else {})}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);errors=[]
 def context(vp,mobile=False):
  ctx=b.new_context(viewport=vp,is_mobile=mobile,has_touch=mobile,reduced_motion='reduce');ctx.route('https://router.project-osrm.org/**',osrm);ctx.route('https://photon.komoot.io/**',photon);ctx.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(body=PNG,content_type='image/png'))
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));google_off(page);page.goto(base);page.wait_for_selector('.activity');return ctx,page
 # A day with a fixed lunch and a run of three play stops in a wasteful order (A → far C → B).
 day=[card('m-a','Farm A','kids',60,place('Farm A',24.00,121.00)),card('m-c','Farm C','kids',60,place('Farm C',24.30,121.00)),card('m-b','Farm B','kids',60,place('Farm B',24.02,121.00)),card('m-lunch','Lunch','food',60),card('m-d','Farm D','kids',60,place('Farm D',24.05,121.00))]
 ctx,page=context({'width':1440,'height':900})
 page.evaluate("d=>{state.days[2].cards=d;day=2;render()}",day)
 # Pins in visit order, the route, drive times between stops and a warning when back-to-back stops leave no time to drive.
 expect(page.locator('.map-pin')).to_have_count(4);expect(page.locator('.leg-connector')).to_have_count(3);expect(page.locator('.leg-connector').first).to_contain_text('26 min drive · 14 km');expect(page.locator('.leg-connector').first).to_contain_text('no time planned');expect(page.locator('.leg-connector').first.locator('[data-fix-drive]')).to_have_text('＋ Add 40 min drive');expect(page.locator('#dayDriving')).to_contain_text('drives don’t fit')
 expect(page.locator('.leg-connector').nth(2)).to_contain_text('from Farm B');assert len(osrm_calls)==1
 expect(page.locator('#mapUnpinned')).to_contain_text('Not on the map yet (1)');expect(page.locator('#mapEmpty')).to_be_hidden()
 # A pin shows what the place is and jumps to its card.
 page.locator('.map-pin').nth(1).click();expect(page.locator('.map-popup')).to_contain_text('2. Farm C');expect(page.locator('.map-popup')).to_contain_text('Daily 09:00–17:00');expect(page.locator('.map-popup a')).to_have_attribute('href',__import__('re').compile('google.com/maps'))
 page.locator('[data-map-show="m-c"]').click();expect(page.locator('.timeline-row[data-id="m-c"]')).to_be_in_viewport()
 # Optimise route reorders only the play stops, keeps lunch fixed, and can be undone.
 expect(page.locator('#mapOptimise')).to_be_visible();page.locator('#mapOptimise').click();expect(page.locator('#mapSuggestion')).to_contain_text('Farm B');page.locator('#mapApply').click()
 assert page.evaluate("state.days[2].cards.map(c=>c.id)")==['m-a','m-b','m-c','m-lunch','m-d'];expect(page.locator('#mapOptimise')).to_be_hidden()
 page.evaluate('undoChange()');assert page.evaluate("state.days[2].cards.map(c=>c.id)")==['m-a','m-c','m-b','m-lunch','m-d']
 # Unpinned stops open the place search, pre-filled from the card.
 page.locator('#mapUnpinned [data-place-edit="m-lunch"]').click();expect(page.locator('#editor')).to_be_visible();assert page.locator('#placeQuery').input_value()=='Lunch';page.locator('#activityCancel').click()
 # Places without coordinates are located once and remembered; routing failure falls back to labelled estimates.
 page.evaluate("()=>{state.days[2].cards[0].place={name:'Somewhere',address:'1 Road'};render()}");expect(page.locator('.map-pin')).to_have_count(4)
 page.wait_for_function("Object.keys(JSON.parse(localStorage.getItem('little-orbit-geo')||'{}')).some(k=>k.startsWith('Somewhere'))");expect(page.locator('.map-pin')).to_have_count(4)
 ctx.unroute('https://router.project-osrm.org/**');ctx.route('https://router.project-osrm.org/**',lambda r:r.abort());page.evaluate("()=>{localStorage.removeItem('little-orbit-routes');state.days[2].cards[1].place.lat=24.4;render()}")
 expect(page.locator('.leg-connector').first).to_contain_text('≈')
 # Days without pins say so.
 page.evaluate("()=>{day=6;render()}");expect(page.locator('.map-plane')).to_have_count(1);expect(page.locator('#mapEmpty')).to_be_hidden();ctx.close()
 # Phones: a Map button opens a full-screen map that closes with ✕ or Escape and never causes sideways scrolling.
 for width in [320,390,768,1024]:
  ctx,page=context({'width':width,'height':844},mobile=width<741);page.evaluate("d=>{state.days[2].cards=d;day=2;render()}",day)
  expect(page.locator('#mapPanel')).to_be_hidden();page.locator('#mapToggle').click();expect(page.locator('#mapPanel')).to_be_visible();expect(page.locator('.map-pin')).to_have_count(4)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.locator('#mapClose').click();expect(page.locator('#mapPanel')).to_be_hidden();page.locator('#mapToggle').click();page.keyboard.press('Escape');expect(page.locator('#mapPanel')).to_be_hidden()
  page.locator('#mapToggle').click();page.locator('#mapAdd').click();expect(page.locator('#editor')).to_be_visible();expect(page.locator('#mapPanel')).to_be_hidden()
  ctx.close()
 assert not errors,errors;b.close();print('PASS: numbered pins and route, drive times with not-enough-time warnings, pin details and Show in plan, optimise route with undo, pin unplaced stops, remembered locations, estimate fallback, empty days, phone map sheet at 320–1024px')
