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
 # Drives show as slim travel rows; flights, airport transfers and pick-ups stay full cards.
 page.locator('[data-day="0"]').click()
 legs=page.evaluate("[...document.querySelectorAll('.timeline-row.is-leg')].map(r=>state.days[0].cards.find(c=>c.id===r.dataset.id).title)");assert legs==[],legs
 page.locator('[data-day="1"]').click()
 legs=page.evaluate("[...document.querySelectorAll('.timeline-row.is-leg')].map(r=>state.days[1].cards.find(c=>c.id===r.dataset.id).title)")
 assert legs==['Depart 潮旅館 (Taoyuan) → Dahu','Drive Dahu → Puli (~1 h)','Drive up to Cingjing (Highway 14A, ~50 min)'],legs
 assert page.locator('.timeline-row.is-leg .activity').first.bounding_box()['height']<70
 # A travel row that's too short shows the real drive (26 min + 10 min for the kids → 40) and grows in one tap; Undo reverts.
 day=[card('t-a','Farm A','kids',60,place('Farm A',24.00,121.00)),card('t-leg','Drive to Farm B','travel',15),card('t-b','Farm B','kids',60,place('Farm B',24.10,121.00)),
      card('t-gap','A little breathing room','break',15),card('t-c','Farm C','kids',60,place('Farm C',24.20,121.00)),card('t-lunch','Lunch','food',45),card('t-guess','Schokolake Country House (Dahu)','kids',60),card('t-far','Far Away Garden','kids',30)]
 page.evaluate("d=>{state.days[2].cards=d;state.days[2].start=540;day=2;render()}",day)
 info=page.locator('.timeline-row[data-id="t-leg"] .leg-info');expect(info).to_contain_text('26 min drive · 14 km');expect(info).to_contain_text('only 15 min planned')
 expect(info.locator('[data-fix-drive]')).to_have_text('Make it 40 min')
 # Without a travel row, a connector offers to add one; the day header totals the driving and offers to fix all.
 conn=page.locator('.leg-connector').first;expect(conn).to_contain_text('only 15 min planned');expect(conn.locator('[data-fix-drive]')).to_have_text('＋ Add 40 min drive')
 expect(page.locator('#dayDriving')).to_contain_text('drives don’t fit')
 info.locator('[data-fix-drive]').click();assert page.evaluate("state.days[2].cards.find(c=>c.id==='t-leg').duration")==40
 page.locator('#mobileUndo').click();assert page.evaluate("state.days[2].cards.find(c=>c.id==='t-leg').duration")==15
 page.locator('#dayDriving [data-fix-drive="all"]').click()
 cards=page.evaluate("state.days[2].cards.map(c=>[c.title,c.duration,c.leg||false])")
 assert cards[1]==['Drive to Farm B',40,False] and cards[3]==['Drive to Farm C',40,True] and 'A little breathing room' not in [c[0] for c in cards],cards
 expect(page.locator('#dayDriving')).not_to_contain_text('fit');expect(page.locator('.timeline-row.is-leg')).to_have_count(2)
 # Stops without a place are pinned from a real-looking name (marked as a guess); "Lunch" isn't looked up; far-off guesses are dropped.
 assert any('Schokolake' in q for q in looked_up) and not any(q.strip()=='Lunch' for q in looked_up),looked_up
 page.locator('#mapToggle').click();expect(page.locator('#mapUnpinned')).to_contain_text('Far Away Garden');expect(page.locator('#mapUnpinned')).not_to_contain_text('Schokolake');page.locator('#mapClose').click()
 expect(page.locator('.leg-guess').first).to_contain_text('guessed from the title')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;b.close()
print('travel row tests passed')
