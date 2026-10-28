from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off,expand_card
base='http://127.0.0.1:8000'
def osrm(route):
 pts=route.request.url.split('/driving/')[1].split('?')[0].split(';')
 route.fulfill(json={'code':'Ok','routes':[{'legs':[{'distance':14000,'duration':1560} for _ in pts[1:]],'geometry':{'type':'LineString','coordinates':[list(map(float,p.split(','))) for p in pts]}}]})
looked_up=[]
def photon(route):
 q=parse_qs(urlparse(route.request.url).query)['q'][0];looked_up.append(q)
 far='Far Away' in q
 route.fulfill(json={'features':[{'type':'Feature','geometry':{'type':'Point','coordinates':[[121.02,24.01],[125.0,30.0]][far],},'properties':{'osm_type':'N','osm_id':7,'name':q,'country':'Taiwan','osm_value':'attraction'}}]})
place=lambda name,lat,lon:{'name':name,'address':name+' Road','lat':lat,'lon':lon}
card=lambda id,title,cat,dur,p=None,**k:{'id':id,'title':title,'notes':'','category':cat,'duration':dur,'optional':False,**({'place':p} if p else {}),**k}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');ctx.route('https://router.project-osrm.org/**',osrm);ctx.route('https://photon.komoot.io/**',photon);ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));google_off(page);page.goto(base);page.wait_for_selector('.activity')
 # Drives aren't cards: each is a small "🚗 … to …" line on the stop before; flights, transfers and pick-ups stay cards.
 page.locator('[data-day="0"]').click();expect(page.locator('.travel-line')).to_have_count(0)
 page.locator('[data-day="1"]').click()
 legs=page.evaluate("[...document.querySelectorAll('.travel-line')].map(n=>state.days[1].cards.find(c=>c.id===n.dataset.legLine).title)")
 assert legs==['Depart 潮旅館 (Taoyuan) → Dahu','Drive Dahu → Puli (~1 h)','Drive up to Cingjing (Highway 14A, ~50 min)'],legs
 expect(page.locator('.timeline-row.is-leg')).to_have_count(0);expect(page.locator('.timeline-row')).to_have_count(6)
 # The day's first stop says how long it takes to get there; the others say where you drive next.
 expect(page.locator('.travel-line').first).to_contain_text('1h 30m to get here · leave 09:15')
 expect(page.locator('.timeline-row').filter(has=page.get_by_role('heading',name='Schokolake Country House (Dahu)',exact=True)).locator('.travel-line')).to_contain_text('1h to Puli')
 # The example from the family: 13:30–14:00, then a 1 h 30 min drive, so the next stop simply starts at 15:30.
 page.evaluate("()=>{state.days[3].start=810;state.days[3].cards=[{id:'w-a',title:'Snack stop',notes:'',category:'food',duration:30},{id:'w-leg',title:'Drive to Sun Moon Lake',notes:'Via Highway 21.',category:'travel',leg:true,mode:'drive',duration:90},{id:'w-b',title:'Sun Moon Lake ropeway',notes:'',category:'kids',duration:60},{id:'w-c',title:'Dinner',notes:'',category:'food',duration:60}];day=3;render()}")
 rows=page.locator('.timeline-row');expect(rows).to_have_count(3);expect(rows.nth(0).locator('.card-timing')).to_contain_text('13:30');expect(rows.nth(0).locator('.card-timing')).to_contain_text('14:00')
 expect(rows.nth(0).locator('.travel-line')).to_contain_text('1h 30m to Sun Moon Lake');expect(rows.nth(1).locator('.card-start')).to_have_text('15:30')
 expect(rows.nth(0).locator('[data-next]')).to_contain_text('Up next · 15:30 · Sun Moon Lake ropeway')
 # Earlier/Later move a stop together with the drive to it; deleting a stop also removes the drive to it.
 expand_card(rows.nth(1));rows.nth(1).get_by_label('Move later',exact=True).click()
 assert page.evaluate("state.days[3].cards.map(c=>c.id)")==['w-a','w-c','w-leg','w-b'];page.locator('#mobileUndo').click()
 # Tapping the line opens the travel time to change or remove it.
 page.locator('[data-leg="w-leg"]').click();expect(page.locator('#editorTitle')).to_have_text('Edit travel time');expect(page.locator('#activityDelete')).to_have_text('🗑 Remove travel time')
 page.locator('#activityDelete').click();expect(page.locator('#deleteDialog')).to_contain_text('Delete “Drive to Sun Moon Lake”?');page.locator('#deleteChoices input[value=close]').check();page.locator('#confirmDelete').click()
 assert page.evaluate("state.days[3].cards.map(c=>c.id)")==['w-a','w-b','w-c'];expect(page.locator('.travel-line')).to_have_count(0);page.locator('#mobileUndo').click()
 expand_card(page.locator('.timeline-row').nth(1));page.locator('.timeline-row').nth(1).locator('[data-action=remove]').click();expect(page.locator('#deleteWhat')).to_contain_text('includes the 1h 30m of travel to it');page.locator('#confirmDelete').click()
 assert [c for c in page.evaluate("state.days[3].cards.map(c=>c.title)")]==['Snack stop','A little breathing room','Dinner'] and page.evaluate("state.days[3].cards[1].duration")==150
 # Between stops, the live status says you're on the road and when you arrive.
 page.locator('#mobileUndo').click();page.evaluate("()=>{const d=state.days[3];updateTripClock(tripMidnight(d)+(14*60+40)*60000)}")
 expect(page.locator('#liveHeading')).to_have_text('On the way · 🚗 to Sun Moon Lake');expect(page.locator('#liveDetail')).to_contain_text('Arrive about 15:30 · 50m to go')
 # Travel time that's too short shows the real drive (26 min + 10 min for the kids → 40) and grows in one tap; Undo reverts.
 day=[card('t-a','Farm A','kids',60,place('Farm A',24.00,121.00)),card('t-leg','Drive to Farm B','travel',15),card('t-b','Farm B','kids',60,place('Farm B',24.10,121.00)),
      card('t-gap','A little breathing room','break',15),card('t-c','Farm C','kids',60,place('Farm C',24.20,121.00)),card('t-lunch','Lunch','food',45),card('t-guess','Schokolake Country House (Dahu)','kids',60),card('t-far','Far Away Garden','kids',30)]
 page.evaluate("d=>{state.days[2].cards=d;state.days[2].start=540;day=2;render()}",day)
 info=page.locator('.travel-line[data-leg-line="t-leg"] .leg-info');expect(info).to_contain_text('26 min drive · 14 km');expect(info).to_contain_text('only 15 min planned')
 expect(info.locator('[data-fix-drive]')).to_have_text('Make it 40 min')
 # Without travel time, a line on the stop before offers to add one; the day header totals the driving and offers to fix all.
 conn=page.locator('.leg-connector').first;expect(conn).to_contain_text('only 15 min planned');expect(conn.locator('[data-fix-drive]')).to_have_text('＋ Add 40 min drive')
 expect(page.locator('#dayDriving')).to_contain_text('drives don’t fit')
 info.locator('[data-fix-drive]').click();assert page.evaluate("state.days[2].cards.find(c=>c.id==='t-leg').duration")==40
 page.locator('#mobileUndo').click();assert page.evaluate("state.days[2].cards.find(c=>c.id==='t-leg').duration")==15
 page.locator('#dayDriving [data-fix-drive="all"]').click()
 cards=page.evaluate("state.days[2].cards.map(c=>[c.title,c.duration,c.leg||false])")
 assert cards[1]==['Drive to Farm B',40,False] and cards[3]==['Drive to Farm C',40,True] and 'A little breathing room' not in [c[0] for c in cards],cards
 expect(page.locator('#dayDriving')).not_to_contain_text('fit');expect(page.locator('.travel-line')).to_have_count(2)
 # Stops without a place are pinned from a real-looking name (marked as a guess); "Lunch" isn't looked up; far-off guesses are dropped.
 assert any('Schokolake' in q for q in looked_up) and not any(q.strip()=='Lunch' for q in looked_up),looked_up
 page.locator('#mapToggle').click();expect(page.locator('#mapUnpinned')).to_contain_text('Far Away Garden');expect(page.locator('#mapUnpinned')).not_to_contain_text('Schokolake');page.locator('#mapClose').click()
 expect(page.locator('.leg-guess').first).to_contain_text('guessed from the title')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;b.close()
print('travel line tests passed')
