import json,copy
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from ui_helpers import expand_card,open_extras
base='http://127.0.0.1:8000'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 errors=[]
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.wait_for_selector('.activity')
 # Actual editor saves custom Chinese and driver link opens with current share fragment.
 expand_card(page.locator('.activity').first);page.locator('.activity').first.get_by_label('Edit activity',exact=True).click();open_extras(page)
 page.locator('#driverTitle').fill('家門口集合，前往樟宜機場');page.locator('#driverNotes').fill('請於大廳等候。');page.locator('#saveActivity').click()
 with page.expect_popup() as popup:page.locator('#driverView').click()
 local=popup.value;local.wait_for_selector('.driver-card');expect(local.locator('h2').first).to_have_text('家門口集合，前往樟宜機場');expect(local.locator('#copy')).to_be_disabled();local.locator('summary').first.click();expect(local.locator('.driver-card').first).to_contain_text('請於大廳等候。');local.close()
 trip=page.evaluate('state');server={'trip':copy.deepcopy(trip),'revision':1};offline=False;saves=[]
 def rpc(route):
  global offline
  if offline:route.abort();return
  data=route.request.post_data_json
  if route.request.url.endswith('orbit_save_trip'):
   saves.append(data)
   if data['p_revision']!=server['revision']:route.fulfill(json={'conflict':True,**server});return
   server['trip']=data['p_trip'];server['revision']+=1;route.fulfill(json={'revision':server['revision']})
  else:route.fulfill(json=server)
 ctx.route('**/rest/v1/rpc/*',rpc)
 editor=ctx.new_page();editor.goto(base+'/#room=test&key=test');expect(editor.locator('#saveStatus')).to_have_text('● Shared · saved')
 driver=ctx.new_page();driver.on('pageerror',lambda e:errors.append(str(e)));driver.goto(base+'/driver.html#room=test&key=test');expect(driver.locator('#sync')).to_contain_text('已同步');expect(driver.locator('#copy')).to_be_enabled()
 # A shared reorder updates Chinese titles and recalculated times without manual reload.
 editor.evaluate("mutate(()=>{const c=state.days[0].cards;c.splice(2,0,c.splice(0,1)[0])})")
 expect(driver.locator('h2').first).to_have_text('機場報到及親子遊玩時間',timeout=10000)
 assert driver.locator('.driver-times strong').first.inner_text()=='12:30'
 assert len(saves)==1
 # Changed/custom English never reuses a stale original Chinese destination.
 server['trip']['days'][0]['cards'][0]['title']='New meeting place <script>alert(1)</script>';server['revision']+=1
 driver.locator('#refresh').click();expect(driver.locator('h2').first).to_contain_text('尚無中文翻譯');assert driver.locator('h2 script').count()==0
 # Connection failure leaves last verified schedule with a stale-data warning, then recovers.
 offline=True;driver.locator('#refresh').click();expect(driver.locator('#sync')).to_contain_text('可能不是最新版本');assert driver.locator('.driver-card').count()>0
 offline=False;driver.locator('#refresh').click();expect(driver.locator('#sync')).to_contain_text('已同步')
 # Simultaneous revisions reject stale editor changes rather than overwriting the remote plan.
 editor.evaluate("mutate(()=>state.days[0].cards[0].title='Unsynced local draft')")
 expect(editor.locator('#conflictActions')).to_be_visible(timeout=10000)
 assert server['trip']['days'][0]['cards'][0]['title'].startswith('New meeting')
 assert editor.evaluate('state.days[0].cards[0].title')=='Unsynced local draft'
 editor.locator('#loadLatest').click();expect(editor.locator('#conflictActions')).to_be_hidden()
 assert 'Unsynced local draft' in editor.evaluate("localStorage.getItem('little-orbit-unsynced-backup')")
 # All shipped activity names and notes have translations, all days switch, mobile sizes fit.
 language=json.loads(Path('driver-zh.json').read_text());seed=json.loads(Path('trip.json').read_text())
 for d in seed['days']:
  for c in d['cards']:
   assert c['title'] in language or c.get('driverTitle'),c['id']
   assert not c['notes'] or c['notes'] in language or c.get('driverNotes'),c['id']
 for i in range(7):driver.locator(f'[data-day="{i}"]').click();expect(driver.locator('#date')).not_to_be_empty()
 for width in [320,390,430,768,1440]:
  driver.set_viewport_size({'width':width,'height':844});assert driver.evaluate('document.documentElement.scrollWidth<=innerWidth')
 driver.set_viewport_size({'width':390,'height':844});driver.locator('[data-day="0"]').click();driver.screenshot(path='/tmp/orbit-driver.png')
 assert not errors,errors
 b.close();print('PASS: Chinese editor fields, local preview, shared live reorder, timing, safe untranslated fallback, offline recovery, revision conflict and backup, all translations, responsive driver view')
