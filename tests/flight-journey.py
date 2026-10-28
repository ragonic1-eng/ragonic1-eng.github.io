import math
from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off
base='http://127.0.0.1:8000'
# Picking Taoyuan Airport for the arrival card: travel is measured from the flight's arrival airport, never as a drive
# from Changi, and an impossible "drive" is never added or allowed to break saving.
TPE={'id':'google-tpe','googleId':'tpe','name':'Taiwan Taoyuan International Airport','nameZh':'臺灣桃園國際機場','address':'Dayuan District, Taoyuan City, Taiwan','lat':25.0797,'lon':121.2342,'checked':'2026-10-28'}
place=lambda n,lat,lon:{'name':n,'address':n,'lat':lat,'lon':lon}
day=[{'id':'j-check','title':'Airport check-in & playtime with the kids','notes':'','category':'travel','duration':120,'place':place('Changi Airport Terminal 3',1.3554,103.9864)},
 {'id':'j-fly','title':'EVA Air BR 216 · Singapore → Taipei','notes':'','category':'travel','duration':280,'leg':True,'mode':'flight'},
 {'id':'j-arr','title':'Taoyuan airport arrival','notes':'','category':'travel','duration':40},
 {'id':'j-drv','title':'Meet your private driver','notes':'','category':'travel','duration':15}]
def osrm(route):
 pts=[list(map(float,p.split(','))) for p in route.request.url.split('/driving/')[1].split('?')[0].split(';')]
 legs=[]
 for (lon1,lat1),(lon2,lat2) in zip(pts,pts[1:]):
  km=6371*2*math.asin(math.sqrt(math.sin(math.radians(lat2-lat1)/2)**2+math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(math.radians(lon2-lon1)/2)**2))*1.3
  legs.append({'distance':km*1000,'duration':km/40*3600})
 route.fulfill(json={'code':'Ok','routes':[{'distance':sum(l['distance'] for l in legs),'duration':sum(l['duration'] for l in legs),'legs':legs}]})
def google(route):
 if route.request.method=='GET':return route.fulfill(json={'available':True})
 body=route.request.post_data_json
 if body['action']=='autocomplete':return route.fulfill(json={'suggestions':[{'placeId':'tpe','name':'Taiwan Taoyuan International Airport','address':'Taoyuan'}]})
 if body['action']=='details':return route.fulfill(json={'place':TPE})
 route.fulfill(json={'point':None})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 plans=[]
 def research(r):
  body=r.request.post_data_json
  if body.get('action')=='evaluate':plans.append(body['plan'])
  r.fulfill(json={'evaluation':{'verdict':'good','headline':'Fits well.','reasons':[],'suggestion':''}})
 ctx.route('**/functions/v1/google-places',google);ctx.route('**/functions/v1/research-place',research);ctx.route('https://router.project-osrm.org/**',osrm)
 ctx.route('https://photon.komoot.io/**',lambda r:r.abort());ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
 page.goto(base);page.wait_for_selector('.activity')
 page.evaluate("window.history.replaceState(null,'','/#room=11111111-1111-1111-1111-111111111111&key='+'a'.repeat(64))")
 def pick(cards):
  page.evaluate("d=>{state.days[0].cards=d;state.days[0].start=720;day=0;render();openEditor(state.days[0].cards.find(c=>c.id==='j-arr'))}",cards)
  page.locator('#placeQuery').press_sequentially('Taoyuan airport',delay=10);page.locator('[data-place-result]').filter(has_text='Taiwan Taoyuan International Airport').first.click();expect(page.locator('#placeSelected')).to_contain_text('臺灣桃園國際機場')
  expect(page.locator('#journey .leg').first).not_to_contain_text('Calculating')
 # With the flight in between: measured from where the flight lands, so nothing to drive and no drive added.
 pick(day)
 first=page.locator('#journey .leg').first;expect(first).to_contain_text('lands at Taiwan Taoyuan International Airport');expect(first).not_to_contain_text('4201');expect(first).to_contain_text('Same place')
 expect(page.locator('.drive-chip')).to_have_count(0);expect(page.locator('#journey')).not_to_contain_text('105')
 page.wait_for_function("()=>document.querySelector('#orbitAdvice')?.textContent.includes('Fits well')")
 assert plans and 'a flight' in plans[-1]['previous']['title'] and plans[-1]['previous']['place']=='Taiwan Taoyuan International Airport',plans[-1:]
 page.locator('#saveActivity').click();expect(page.locator('#editor')).to_be_hidden()
 cards=page.evaluate("state.days[0].cards.map(c=>[c.id,c.duration])");assert [c[0] for c in cards]==['j-check','j-fly','j-arr','j-drv'] and dict(cards)['j-arr']==40,cards
 # Without the flight card: 4,000+ km is "too far to drive" — explained, nothing added, and saving still works.
 pick([c for c in day if c['id']!='j-fly'])
 expect(page.locator('#journey .leg').first).to_contain_text('too far to drive');expect(page.locator('#journey')).to_contain_text('Put the flight (or ferry) between these stops')
 expect(page.locator('.drive-chip')).to_have_count(0);expect(page.locator('[data-add-transfer]')).to_have_count(0)
 page.locator('#saveActivity').click();expect(page.locator('#editor')).to_be_hidden()
 assert page.evaluate("state.days[0].cards.map(c=>c.id)")==['j-check','j-arr','j-drv']
 # If a change still can't be saved, the reason is specific (not "200 activities").
 page.evaluate("()=>{mutate(()=>{state.days[0].cards[0].duration=6000})}");expect(page.locator('#toast')).to_contain_text('a card can be at most 24 hours')
 assert not errors,errors;b.close()
print('flight journey tests passed')
