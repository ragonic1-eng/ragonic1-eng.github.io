import json,subprocess
from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off
base='http://127.0.0.1:8000'
# The plan as saved before the schedule update (previous trip.json), plus a personal edit on 7 Dec.
old=json.loads(subprocess.run(['git','show','3cb0ce6:trip.json'],capture_output=True,text=True,check=True).stdout)
old['days'][0]['cards'].append({'id':'mine','title':'My own airport snack','notes':'','category':'food','duration':15,'optional':False})
new=json.load(open('trip.json'))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 # A first-time visitor gets the new plan directly, with no banner.
 google_off(page);page.goto(base);page.wait_for_selector('.activity');expect(page.locator('#scheduleUpdate')).to_be_hidden()
 page.locator('[data-day="1"]').click();expect(page.locator('#timeline')).to_contain_text('SUHU Café');expect(page.locator('#timeline')).to_contain_text('春大地火鍋城')
 # A device with the old plan saved is offered the update; applying replaces only 8–12 Dec.
 page.evaluate(f"localStorage.setItem('little-orbit-v1',JSON.stringify({json.dumps(old)}))");page.reload();page.wait_for_selector('.activity')
 expect(page.locator('#scheduleUpdate')).to_be_visible();expect(page.locator('#scheduleUpdate')).to_contain_text('8–12 Dec')
 page.locator('#applySchedule').click();expect(page.locator('#scheduleUpdate')).to_be_hidden()
 s=page.evaluate('state');assert s['scheduleVersion']==2
 assert [c['title'] for c in s['days'][0]['cards']][-1]=='My own airport snack' and s['days'][6]==old['days'][6]
 for i in range(1,6):assert [c['id'] for c in s['days'][i]['cards'] if c['category']!='break']==[c['id'] for c in new['days'][i]['cards']],i
 assert page.evaluate("JSON.parse(localStorage.getItem('little-orbit-v1')).scheduleVersion")==2
 page.locator('[data-day="2"]').click();expect(page.locator('#timeline')).to_contain_text('Lu Mama');expect(page.locator('#timeline')).to_contain_text('15:30')
 # Undo restores the old plan and offers the update again; "Not now" hides it for this session.
 page.evaluate('undoChange()');assert page.evaluate('state.scheduleVersion') is None;expect(page.locator('#scheduleUpdate')).to_be_visible()
 page.locator('#dismissSchedule').click();expect(page.locator('#scheduleUpdate')).to_be_hidden();page.reload();page.wait_for_selector('.activity');expect(page.locator('#scheduleUpdate')).to_be_hidden()
 # On a shared trip, applying saves to the shared copy.
 saves=[]
 def rpc(route):
  name=route.request.url.rsplit('/',1)[-1]
  if name=='orbit_load_trip':route.fulfill(json={'revision':1,'trip':old})
  else:saves.append(route.request.post_data_json);route.fulfill(json={'revision':len(saves)+1})
 ctx2=b.new_context(viewport={'width':1280,'height':900});ctx2.route('**/rest/v1/rpc/*',rpc);shared=ctx2.new_page();shared.on('pageerror',lambda e:errors.append(str(e)))
 shared.goto(base+'/#room=33333333-3333-3333-3333-333333333333&key='+'c'*64);shared.wait_for_selector('.activity');expect(shared.locator('#scheduleUpdate')).to_contain_text('everyone using this shared trip')
 shared.locator('#applySchedule').click();shared.wait_for_timeout(1200);assert saves and saves[-1]['p_trip']['scheduleVersion']==2,saves
 for width in [320,390,768]:
  shared.set_viewport_size({'width':width,'height':800});assert shared.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;b.close();print('PASS: new visitors get the new plan, saved plans are offered the update, only 8–12 Dec replaced, own edits kept, undo and Not now, shared trip saves, layouts')
