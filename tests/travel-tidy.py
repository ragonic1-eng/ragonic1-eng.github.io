from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off
base='http://127.0.0.1:8000'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
 for host in ['https://router.project-osrm.org/**','https://photon.komoot.io/**','https://tile.openstreetmap.org/**']:ctx.route(host,lambda r:r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));google_off(page,tidy=True);page.goto(base);page.wait_for_selector('.activity')
 # A personal edit like the one on the live plan: a placeholder drive card before Schokolake.
 page.evaluate("()=>{const d=state.days[1],i=d.cards.findIndex(c=>/Schokolake/.test(c.title));d.cards.splice(i,0,{id:'my-from-x',title:'From x to x',notes:'',category:'travel',duration:15});render()}")
 slot=lambda title,d=0:page.evaluate("([t,d])=>{const day=state.days[d];let s=day.start;for(const c of day.cards){if(c.title.includes(t))return [s,c.duration];s+=c.duration}return null}",[title,d])
 flight_before=slot('EVA Air BR 216')
 tidy=page.locator('#travelTidy');expect(tidy).to_be_visible();expect(tidy).to_contain_text('Travel tidy-up: 5 changes ready')
 expect(tidy).to_contain_text('Monterey Park Condo');expect(tidy).to_contain_text('Drive to Schokolake Country House')
 # Untick the Taoyuan evening drives; apply the rest.
 tidy.locator('.tidy-list>summary').click();tidy.locator('[data-tidy="taoyuan"]').uncheck();tidy.locator('#applyTidy').click();expect(tidy).to_be_hidden()
 rows=page.evaluate("state.days[0].cards.map(c=>[c.title,c.category,c.duration,c.leg||false,c.mode||''])")
 assert [r[0] for r in rows[:6]]==['Home · Monterey Park Condo','Drive to Changi Airport T3','Changi Airport T3 · drop-off','Walk to T3 Departure Hall','Airport check-in & playtime with the kids','EVA Air BR 216 · Singapore → Taipei'],rows
 assert rows[1][3:]==[True,'drive'] and rows[3][3:]==[True,'walk'] and rows[5][3:]==[True,'flight'],rows
 assert slot('EVA Air BR 216')==flight_before,'the flight keeps its time';assert slot('Airport check-in & playtime')[1]==155-35
 assert not any('7-Eleven' in r[0] for r in rows),'unticked change is not applied'
 assert page.evaluate("state.days[0].cards[0].place.name")=='Monterey Park Condominium' and page.evaluate("state.days[0].cards[2].place.name")=='Changi Airport Terminal 3'
 last=page.evaluate("Object.fromEntries(state.days[6].cards.map(c=>[c.title,[c.category,c.leg||false]]))")
 assert last['Wake up & final bag checks'][0]=='hotel' and last['Private airport transfer']==['travel',True] and last['Airport check-in · EVA Air BR 215'][0]=='travel',last
 renamed=page.evaluate("state.days[1].cards.find(c=>c.id==='my-from-x')");assert renamed['title']=='Drive to Schokolake Country House' and renamed['leg'] is True,renamed
 # The page shows the new rows: drive and walk icons on day 1, the flight as a slim row.
 page.locator('[data-day="0"]').click();expect(page.locator('.timeline-row.is-leg')).to_have_count(3);expect(page.locator('.timeline-row.mode-walk')).to_have_count(1);expect(page.locator('.timeline-row.mode-flight')).to_have_count(1)
 # One Undo reverts everything; after re-applying, the banner stays gone after a reload.
 page.locator('#mobileUndo').click();assert page.evaluate("state.days[0].cards[0].title")=='Leave home → Changi Airport';expect(tidy).to_be_visible()
 tidy.locator('#applyTidy').click();page.reload();page.wait_for_selector('.activity');expect(page.locator('#travelTidy')).to_be_hidden()
 assert page.evaluate("window.travelTidy.proposals(state).map(p=>p.id)")==[],'everything was applied the second time'
 # The Taoyuan evening drives went in around the convenience-store stop.
 titles=page.evaluate("state.days[0].cards.map(c=>c.title)");i=titles.index('Meet your private driver');assert titles[i+1:i+5]==['Drive to a Taoyuan 7-Eleven / FamilyMart','Bento boxes & bedtime milk','Drive to Chao Motels','A little breathing room'] and titles[i+5]=='Chao Motels · check-in',titles
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;b.close()
print('travel tidy tests passed')
