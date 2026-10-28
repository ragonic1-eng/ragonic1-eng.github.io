import math
from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off
base='http://127.0.0.1:8000'
osrm_calls=[]
def osrm(route):
 osrm_calls.append(route.request.url);pts=route.request.url.split('/driving/')[1].split('?')[0].split(';')
 route.fulfill(json={'code':'Ok','routes':[{'legs':[{'distance':20000,'duration':1800} for _ in pts[1:]],'geometry':{'type':'LineString','coordinates':[list(map(float,p.split(','))) for p in pts]}}]})
place=lambda n,lat,lon:{'name':n,'address':n,'lat':lat,'lon':lon}
day=[{'id':'f-home','title':'Home · Monterey Park Condo','notes':'','category':'hotel','duration':10,'place':place('Monterey Park Condominium',1.3125,103.7653)},
 {'id':'f-drive','title':'Drive to Changi Airport T3','notes':'','category':'travel','duration':40,'leg':True,'mode':'drive'},
 {'id':'f-t3','title':'Changi Airport T3 · drop-off','notes':'','category':'travel','duration':10,'place':place('Changi Airport Terminal 3',1.3554,103.9864)},
 {'id':'f-fly','title':'EVA Air BR 216 · Singapore → Taipei','notes':'','category':'travel','duration':270,'leg':True,'mode':'flight'},
 {'id':'f-arr','title':'Taoyuan airport arrival','notes':'','category':'travel','duration':60,'place':place('Taoyuan Airport T2',25.0777,121.2328)},
 {'id':'f-hotel','title':'Chao Motels · check-in','notes':'','category':'hotel','duration':90,'place':place('Chao Motels',24.9936,121.3010)}]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def open_page(vp,mobile):
  ctx=b.new_context(viewport=vp,is_mobile=mobile,has_touch=mobile,reduced_motion='reduce');ctx.route('https://router.project-osrm.org/**',osrm);ctx.route('https://photon.komoot.io/**',lambda r:r.abort());ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));google_off(page);page.goto(base);page.wait_for_selector('.activity')
  page.evaluate("d=>{state.days[0].cards=d;day=0;render()}",day);return ctx,page,errors
 near=lambda v,lat,lon,tol:abs(v['lat']-lat)<tol and abs(v['lon']-lon)<tol
 # Desktop: the flight is an arc between the airports; road routes are worked out on each side, never across the sea.
 ctx,page,errors=open_page({'width':1440,'height':900},False)
 expect(page.locator('.map-plane')).to_have_count(1);expect(page.locator('.map-airport')).to_have_count(2);expect(page.locator('.map-pin')).to_have_count(4)
 assert len(osrm_calls)==2 and not any('103.9' in u and '121.2' in u for u in osrm_calls),osrm_calls
 assert page.evaluate("orbitMap.current().flights.map(f=>f.from.code+'-'+f.to.code)")==['SIN-TPE']
 expect(page.locator('.leg-connector')).to_have_count(1);expect(page.locator('.leg-connector')).not_to_contain_text('Taoyuan')
 # Tapping a card flies the map to it, opens its label and marks the card.
 page.locator('.timeline-row[data-id="f-hotel"] .activity h3').click()
 page.wait_for_function("()=>{const v=orbitMap.view();return Math.abs(v.lat-24.9936)<0.01&&Math.abs(v.lon-121.301)<0.01&&v.zoom>=14}")
 expect(page.locator('.leaflet-popup')).to_contain_text('Chao Motels');expect(page.locator('.timeline-row[data-id="f-hotel"]')).to_have_class(__import__('re').compile('is-map-selected'))
 # The flight frames the whole arc.
 page.locator('.timeline-row[data-id="f-fly"] .activity h3').click();page.wait_for_function("()=>orbitMap.view().zoom<8")
 v=page.evaluate("orbitMap.view()");assert 5<v['lat']<22 and 105<v['lon']<120,v
 page.locator('.timeline-row[data-id="f-home"] .activity h3').click();page.wait_for_function("()=>{const v=orbitMap.view();return v.lat>1.2&&v.lat<1.45&&v.lon>103.7&&v.lon<104.05}")
 # The drive isn't a card: it's a small line on Home that opens its travel time.
 expect(page.locator('.timeline-row[data-id="f-drive"]')).to_have_count(0);line=page.locator('[data-leg="f-drive"]');expect(line).to_contain_text('40m to Changi Airport T3')
 line.click();expect(page.locator('#editorTitle')).to_have_text('Edit travel time');page.locator('#activityCancel').click()
 # Controls on a card don't move the map; the desktop map needs no extra button.
 expect(page.locator('.map-focus').first).to_be_hidden()
 assert not errors,errors;ctx.close()
 # Phone: pinned cards get a 📍 Map button that opens the map already showing the place.
 ctx,page,errors=open_page({'width':390,'height':844},True)
 row=page.locator('.timeline-row[data-id="f-t3"]');row.locator('.activity-more>summary').click();btn=row.locator('[data-map-focus]');expect(btn).to_be_visible();btn.click()
 expect(page.locator('body')).to_have_class(__import__('re').compile('map-open'))
 page.wait_for_function("()=>{const v=orbitMap.view();return v&&Math.abs(v.lat-1.3554)<0.01&&Math.abs(v.lon-103.9864)<0.01}")
 expect(page.locator('.leaflet-popup')).to_contain_text('Changi Airport T3')
 # The return flight is recognised from the check-in card on the last day.
 page.locator('#mapClose').click();page.evaluate("()=>{state.days[6].cards=[{id:'r-ci',title:'Airport check-in · EVA Air BR 215',notes:'',category:'travel',duration:125}];day=6;render()}")
 page.wait_for_function("()=>orbitMap.current()?.day===6");assert page.evaluate("orbitMap.current().flights.map(f=>f.from.code+'-'+f.to.code)")==['TPE-SIN']
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;b.close()
print('map focus tests passed')
