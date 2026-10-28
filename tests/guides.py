from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off,expand_card
base='http://127.0.0.1:8000'
ROOM='/#room=11111111-1111-1111-1111-111111111111&key='+'a'*64
def guide(name,verified=True):return {'guide':{'kids':[f'Feed the animals at {name}','Small playground by the café'],'adults':['Good coffee and photo spots'],'costs':['Entry NT$150, kids under 3 free','Feed cup NT$50'],'watchOut':['Souvenir shop prices are high'],'timing':['Avoid weekends after 11:00'],'sources':[{'url':'https://example.com/review','title':'Visitor review'}] if verified else [],'checked':'2026-10-28','verified':verified}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
 for host in ['https://router.project-osrm.org/**','https://photon.komoot.io/**','https://tile.openstreetmap.org/**']:ctx.route(host,lambda r:r.abort())
 asked=[];fail_after=[None]
 def orbit(route):
  body=route.request.post_data_json
  if body.get('action')=='guide':
   asked.append(body['query'])
   if fail_after[0] is not None and len(asked)>fail_after[0]:return route.fulfill(status=429,json={'error':'Daily research limit reached.'})
   return route.fulfill(json=guide(body['query'].split(',')[0],verified=len(asked)!=2))
  route.fulfill(json={'evaluation':{'verdict':'good','headline':'Fits well.','reasons':[],'suggestion':''}})
 ctx.route('**/functions/v1/research-place',orbit)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));google_off(page);page.goto(base);page.wait_for_selector('.activity');page.evaluate(f"window.history.replaceState(null,'','{ROOM}')")
 page.evaluate("()=>{const d=state.days[2];d.cards=[{id:'g-a',title:'Farm A',notes:'Bring wet wipes',category:'kids',duration:60,place:{name:'Farm A',address:'Farm Road',lat:24.0,lon:121.0}},{id:'g-b',title:'Farm B',notes:'',category:'kids',duration:60,place:{name:'Farm B',address:'B Road',lat:24.1,lon:121.0}},{id:'g-leg',title:'Drive to Farm C',notes:'',category:'travel',duration:20},{id:'g-c',title:'Farm C',notes:'',category:'kids',duration:60,place:{name:'Farm C',address:'C Road',lat:24.2,lon:121.0}}];day=2;render()}")
 # One card: a button gets Orbit's guide; your notes stay separate and untouched.
 a=page.locator('.activity').filter(has=page.get_by_role('heading',name='Farm A',exact=True));expand_card(a)
 expect(a.locator('.card-details>summary')).to_have_text('✎ Your notes');expect(a.locator('.card-notes')).to_have_text('Bring wet wipes')
 a.locator('[data-guide]').click();expect(a.locator('.place-guide')).to_contain_text('Feed the animals at Farm A')
 for label in ['For the kids','For you two','Costs & tickets','Watch out','Best time']:expect(a.locator('.place-guide')).to_contain_text(label)
 expect(a.locator('.place-guide .guide-meta a')).to_have_text('Visitor review ↗');assert page.evaluate("state.days[2].cards[0].notes")=='Bring wet wipes'
 assert page.evaluate("state.days[2].cards[0].place.guide.costs[0]")=='Entry NT$150, kids under 3 free'
 page.locator('#mobileUndo').click();assert page.evaluate("state.days[2].cards[0].place.guide") is None
 # The whole day: one button researches every place still missing a guide (drives are skipped); a mid-way failure keeps what was found.
 asked.clear();fail_after[0]=2;expect(page.locator('#dayGuides')).to_contain_text('3 places today');page.locator('#dayGuides button').click()
 expect(page.locator('#toast')).to_contain_text('Added 2 guides');expect(page.locator('#toast')).to_contain_text('Daily research limit')
 got=page.evaluate("state.days[2].cards.map(c=>!!c.place?.guide)");assert got==[True,True,False,False],got
 assert len(asked)==3 and not any('Drive' in q for q in asked),asked
 b_card=page.locator('.activity').filter(has=page.get_by_role('heading',name='Farm B',exact=True));expand_card(b_card);expect(b_card.locator('.place-guide')).to_contain_text('not checked online')
 expect(page.locator('#dayGuides')).to_contain_text('1 place today')
 # The driver view (Chinese) stays short: no guide there.
 assert 'Orbit’s guide' not in page.evaluate("PlaceCore.html(state.days[2].cards[0].place,true)")
 # Unsafe stored guide links are refused.
 assert page.evaluate("(()=>{const s=structuredClone(state);s.days[2].cards[0].place.guide.sources=[{url:'javascript:alert(1)',title:'x'}];try{validate(s);return false}catch{return true}})()")
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;b.close()
print('guide tests passed')
