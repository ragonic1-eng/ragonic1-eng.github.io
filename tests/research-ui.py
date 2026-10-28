from playwright.sync_api import sync_playwright,expect
from ui_helpers import use_previous_plan,google_off
base='http://127.0.0.1:8000'
planning={'category':'food','visitMinutes':105,'tips':'Book the observatory online to skip the queue.','tipsZh':''}
place={'name':'Taipei 101','nameZh':'台北101','address':'臺北市信義區信義路五段7號','description':'A city landmark with an observation deck.','descriptionZh':'設有觀景台的城市地標。','openingHours':'Daily 10:00–21:00','openingHoursZh':'每日 10:00–21:00','source':'https://www.taipei-101.com.tw/','bookingUrl':'https://www.taipei-101.com.tw/','bookingNote':'Check the observatory ticket and visit date.','bookingNoteZh':'請確認觀景台門票及日期。','bookingLabel':'Official tickets & booking','research':'Orbit','checked':'2026-10-26','sources':[{'title':'Visitor information','url':'https://www.taipei-101.com.tw/'}]}
verdict={'evaluation':{'verdict':'tight','headline':'Doable if you leave on time.','reasons':['26 min drive to the hotel'],'suggestion':'Shorten the visit by 15 minutes.'}}
feature={'type':'Feature','geometry':{'type':'Point','coordinates':[121.565,25.033]},'properties':{'osm_type':'W','osm_id':101,'name':'Taipei 101','city':'Taipei','country':'Taiwan','osm_value':'attraction'}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 ctx.route('https://photon.komoot.io/**',lambda r:r.fulfill(json={'features':[{**feature,'geometry':{'type':'Point','coordinates':[121.52,25.06]}} if '101' not in r.request.url else feature]}));ctx.route('https://router.project-osrm.org/**',lambda r:r.fulfill(json={'routes':[{'distance':5200,'duration':900}]}))
 calls=[];guides=[]
 GUIDE={'guide':{'kids':['Ride the fast lift to the 89th floor'],'costs':['Observatory about NT$600 for adults'],'checked':'2026-10-28','verified':True,'sources':[]}}
 def respond(route):
  body=route.request.post_data_json
  # Family guides are requested separately and tracked on their own.
  if body.get('action')=='guide':guides.append(body);return route.fulfill(json=GUIDE)
  calls.append(body)
  route.fulfill(json=verdict if body.get('action')=='evaluate' else {'places':[{**place,'planning':planning}],'message':'Researched by Orbit.'})
 ctx.route('**/functions/v1/research-place',respond)
 google_off(page);page.goto(base);page.wait_for_selector('.activity');use_previous_plan(page)
 def open_at(time='16:30'):
  page.evaluate("openEditor()");page.locator('#activityDay').select_option('5')
  if time:page.locator('#activityStart').fill(time);page.locator('#activityStart').dispatch_event('input')
 # Without a private shared link, Orbit explains the prerequisite and sends nothing.
 open_at();page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-ask-orbit]')).to_contain_text('Ask Orbit');page.locator('[data-ask-orbit]').click();expect(page.locator('#placeMessage')).to_be_visible();expect(page.locator('#placeMessage')).to_contain_text('shared trip');expect(page.locator('#placeResults')).to_be_hidden();expect(page.locator('#orbitStatus')).to_be_visible();assert not calls
 page.locator('#activityCancel').click();page.evaluate("window.history.replaceState(null,'','/#room=11111111-1111-1111-1111-111111111111&key='+'a'.repeat(64))")
 # Choosing a map result researches it and checks the plan behind a loading screen, sending only what each step needs.
 open_at();page.locator('#title').fill('');page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click()
 expect(page.locator('#form')).not_to_have_attribute('aria-busy','true');expect(page.locator('#placeSelected')).to_contain_text('Daily 10:00–21:00');expect(page.locator('#placeSelected')).to_contain_text('台北101');expect(page.locator('#orbitAdvice')).to_contain_text('Tight but doable')
 research,check=calls[0],calls[1];assert set(research)=={'query','country','roomId','roomKey'} and research['query'].startswith('Taipei 101');assert set(check)=={'action','plan','roomId','roomKey'} and check['plan']['start']=='16:30' and check['plan']['next']['travelMinutes']==15 and check['plan']['next']['place']=='Jolley Hotel'
 assert 'notes' not in str(check['plan']) and page.locator('#researchPlace').count()==0;assert page.locator('#title').input_value()=='Taipei 101'
 # Changing the time marks Orbit's verdict stale; re-checking sends one new plan check.
 page.locator('#durationMore').click();expect(page.locator('.orbit-stale')).to_be_visible();page.locator('[data-orbit-check]').click();expect(page.locator('.orbit-stale')).to_have_count(0);assert len(calls)==3 and calls[2]['action']=='evaluate'
 page.locator('#saveActivity').click();assert page.evaluate("state.days[5].cards.find(c=>c.title==='Taipei 101').place.research")=='Orbit';assert page.evaluate("state.days[5].cards.find(c=>c.title==='Taipei 101').place.openingHours")=='Daily 10:00–21:00'
 # Research with Orbit from the search box offers sourced candidates; an already researched choice is only checked, not researched again.
 calls.clear();open_at(None);page.locator('#placeQuery').fill('Taipei 101 observatory');expect(page.locator('[data-ask-orbit]')).to_be_visible();page.locator('[data-ask-orbit]').click();expect(page.locator('.combo-heading')).to_have_text('Orbit found');page.locator('[data-place-result]').first.click()
 expect(page.locator('#form')).not_to_have_attribute('aria-busy','true');expect(page.locator('#orbitAdvice')).to_contain_text('Tight');assert [c.get('action') for c in calls]==[None,'evaluate'],calls
 page.locator('#activityCancel').click()
 # Quota errors are explained; the map result stays selected and the form stays usable.
 ctx.unroute('**/functions/v1/research-place');ctx.route('**/functions/v1/research-place',lambda r:r.fulfill(status=429,json={'error':'Daily research limit reached.'}))
 open_at();page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#placeMessage')).to_contain_text('Daily research limit');expect(page.locator('#placeSelected')).to_contain_text('Taipei 101');expect(page.locator('#researchPlace')).to_be_visible();expect(page.locator('#saveActivity')).to_be_enabled();page.locator('#activityCancel').click()
 # Skip stops waiting; a late response after skipping or closing never changes the form.
 ctx.unroute('**/functions/v1/research-place');pending=[];ctx.route('**/functions/v1/research-place',lambda r:pending.append(r))
 open_at();page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#orbitLoading')).to_be_visible();expect(page.locator('#orbitSteps [data-state=active]')).to_contain_text('Orbit is searching the web')
 page.locator('#orbitSkip').click();expect(page.locator('#form')).not_to_have_attribute('aria-busy','true');expect(page.locator('#placeMessage')).to_contain_text('Skipped')
 for r in pending:
  try:r.fulfill(json={'places':[{**place,'name':'Late result'}]})
  except Exception:pass
 page.wait_for_timeout(300);expect(page.locator('#placeSelected')).not_to_contain_text('Late result');expect(page.locator('#placeSelected')).to_contain_text('Taipei 101');page.locator('#activityCancel').click()
 # Orbit fills empty fields only, says what it filled, and never overwrites what the person typed.
 ctx.unroute('**/functions/v1/research-place');ctx.route('**/functions/v1/research-place',respond)
 open_at();expect(page.locator('#orbitStatus')).to_be_hidden();page.locator('#title').fill('');page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#form')).not_to_have_attribute('aria-busy','true')
 # Your notes stay yours: Orbit's research shows in its guide on the place instead.
 assert page.locator('#notes').input_value()=='';expect(page.locator('#placeSelected .place-guide')).to_contain_text('Ride the fast lift');assert guides and guides[-1]['query'].startswith('台北101') and guides[-1]['date']=='2026-12-12';assert page.locator('#driverTitle').input_value()=='台北101';assert page.locator('#category').input_value()=='food';assert page.locator('#duration').input_value()=='105'
 expect(page.locator('#orbitFilled')).to_contain_text('Food & treats');expect(page.locator('#orbitFilled')).to_contain_text('1 h 45 min')
 page.locator('#removePlace').click();assert page.locator('#notes').input_value()=='' and page.locator('#driverTitle').input_value()=='';expect(page.locator('#orbitFilled')).to_be_hidden();page.locator('#activityCancel').click()
 open_at();page.locator('#title').fill('Sunset at 101');page.locator('#durationMore').click();page.locator('#activityExtras>summary').click();page.locator('#notes').fill('Meet Grandma at the north door');page.locator('#category').select_option('shopping')
 page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#form')).not_to_have_attribute('aria-busy','true')
 assert page.locator('#title').input_value()=='Sunset at 101' and page.locator('#notes').input_value()=='Meet Grandma at the north door' and page.locator('#category').input_value()=='shopping' and page.locator('#duration').input_value()!='105';assert page.locator('#driverTitle').input_value()=='台北101';page.locator('#activityCancel').click()
 # Relay mode (no web search): unverified AI details fill gaps, keep the map address, and are clearly labelled.
 unverified={**{k:v for k,v in place.items() if k not in ('source','bookingUrl','sources')},'address':'AI guessed address','source':'','bookingUrl':'','research':'Orbit (AI knowledge)','verified':False,'planning':planning}
 ctx.unroute('**/functions/v1/research-place');ctx.route('**/functions/v1/research-place',lambda r:r.fulfill(json=verdict if r.request.post_data_json.get('action')=='evaluate' else {'places':[unverified],'message':'Filled in by Orbit from AI knowledge.'}))
 open_at();page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#form')).not_to_have_attribute('aria-busy','true')
 expect(page.locator('#placeSelected .place-unverified')).to_be_visible();expect(page.locator('#placeSelected .place-address')).not_to_contain_text('AI guessed');expect(page.locator('#placeSelected')).to_contain_text('Daily 10:00–21:00');expect(page.locator('#placeSelected')).to_contain_text('A city landmark');assert page.locator('#driverTitle').input_value()=='台北101'
 page.locator('#saveActivity').click();assert page.evaluate("state.days[5].cards.find(c=>c.place?.verified===false).place.lat")>0
 ctx.unroute('**/functions/v1/research-place');ctx.route('**/functions/v1/research-place',respond)
 # Find with Orbit shows the loading screen at once, and "nothing found" is visible rather than hidden behind the list.
 ctx.unroute('**/functions/v1/research-place');held=[];ctx.route('**/functions/v1/research-place',lambda r:held.append(r))
 open_at(None);page.locator('#placeQuery').fill('紅色琉璃瓦草莓園');expect(page.locator('[data-ask-orbit]')).to_be_visible();page.locator('[data-ask-orbit]').click()
 expect(page.locator('#orbitLoading')).to_be_visible(timeout=200);expect(page.locator('#orbitSteps')).to_contain_text('up to a minute')
 page.wait_for_function('n=>true',arg=None);held[0].fulfill(json={'places':[],'message':'Orbit didn’t recognise this place.'});expect(page.locator('#orbitLoading')).to_be_hidden()
 expect(page.locator('#placeResults')).to_be_hidden();expect(page.locator('#placeMessage')).to_be_visible();expect(page.locator('#placeMessage')).to_contain_text('didn’t recognise')
 # A message while the list is open appears inside the list.
 page.evaluate("()=>{document.getElementById('placeQuery').value='Taipei 101';document.getElementById('placeQuery').dispatchEvent(new Event('input'))}");expect(page.locator('[data-place-result]')).to_have_count(1)
 page.locator('#activityCancel').click();ctx.unroute('**/functions/v1/research-place');ctx.route('**/functions/v1/research-place',respond)
 # Mobile layout during loading and after a verdict.
 ctx.unroute('**/functions/v1/research-place');ctx.route('**/functions/v1/research-place',respond)
 for width in [320,390,430,740]:
  page.set_viewport_size({'width':width,'height':844});open_at();page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#orbitAdvice')).to_contain_text('Tight')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('#editor').evaluate('e=>e.scrollWidth<=e.clientWidth');page.locator('#activityCancel').click()
 assert page.locator('input[type=password]').count()==0;assert not errors,errors;b.close();print('PASS: Orbit private-link prerequisite, research and plan check with minimal payloads, loading steps, stale verdict re-check, Research with Orbit candidates, quota recovery, skip and late-response protection, mobile layouts')
