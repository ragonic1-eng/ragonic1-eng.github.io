from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from ui_helpers import expand_card
base='http://127.0.0.1:8000'
PHOTON='https://photon.komoot.io/**';OSRM='https://router.project-osrm.org/**'
def feature(name,lon,lat,**props):return {'type':'Feature','geometry':{'type':'Point','coordinates':[lon,lat]},'properties':{'osm_type':'W','osm_id':100,'name':name,'city':'Taipei','country':'Taiwan','osm_value':'attraction',**props}}
photon_calls=[]
def photon(route):
 q=parse_qs(urlparse(route.request.url).query);photon_calls.append(q)
 text=q['q'][0]
 if 'Taipei 101' in text:route.fulfill(json={'features':[feature('Taipei 101 <script>bad()</script>',121.565,25.033,street='Xinyi Road',housenumber='7')]})
 else:route.fulfill(json={'features':[feature(text.split(' ')[0],121.5+len(text)/1000,25.0)]})
route_calls=[]
def osrm(route):route_calls.append(route.request.url);route.fulfill(json={'code':'Ok','routes':[{'distance':14300,'duration':1560}]})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 orbit=[];ctx.route('**/functions/v1/research-place',lambda r:(orbit.append(r.request.url),r.abort()))
 ctx.route(PHOTON,photon);ctx.route(OSRM,osrm)
 page.goto(base);page.wait_for_selector('.activity');page.locator('[data-day="1"]').click()
 farm=lambda:page.locator('.activity').filter(has=page.get_by_role('heading',name='Flying Cow Ranch',exact=True))
 # Known places are suggested from the activity, chosen explicitly, then pinned and measured.
 expand_card(farm());farm().locator('[data-place-edit]').click();expect(page.locator('#placeResults')).to_contain_text('苗栗縣通霄鎮南和里166號');assert page.locator('#placeSelected').inner_text()==''
 page.locator('.place-option').first.click();expect(page.locator('#placeSelected')).to_contain_text('Admission ticket');expect(page.locator('#orbitLoading')).to_be_hidden()
 expect(page.locator('#placeSelected .maps-button')).to_have_attribute('href',__import__('re').compile(r'^https://www\.google\.com/maps/search/\?api=1&query='))
 expect(page.locator('#orbitAdvice')).to_contain_text('shared trip link');assert not orbit,'Orbit must not be called without a private shared trip'
 page.locator('#saveActivity').click();expect(farm().locator('.place-info')).to_contain_text('Flying Cow Ranch')
 saved=page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place");assert saved['id']=='flying-cow' and 'aliases' not in saved and isinstance(saved['lat'],(int,float))
 page.reload();page.wait_for_selector('.activity');expand_card(farm());expect(farm().locator('.place-address')).to_contain_text('166號')
 # Saved place is automatically available in the Chinese driver preview.
 driver=ctx.new_page();driver.goto(base+'/driver.html');driver.wait_for_selector('.driver-card');driver.locator('[data-day="1"]').click();expect(driver.locator('.place-info').first).to_contain_text('飛牛牧場');expect(driver.locator('.place-info').first).to_contain_text('需購買入園門票');expect(driver.locator('.place-info .maps-button').first).to_contain_text('Google 地圖');driver.close()
 # Removing then cancelling leaves the saved place untouched; removing then saving clears it.
 farm().locator('[data-place-edit]').click();page.locator('#removePlace').click();page.locator('#activityCancel').click();assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place.id")=='flying-cow'
 farm().locator('[data-place-edit]').click();page.locator('#removePlace').click();page.locator('#saveActivity').click();assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place===undefined")
 # Ambiguous mentions remain suggestions, never auto-attached.
 farm().locator('[data-place-edit]').click();page.locator('#title').fill('Flying Cow Ranch or Qingjing Farm');page.locator('#placeQuery').fill('');page.locator('#placeQuery').dispatch_event('input');expect(page.locator('[data-place-result]')).to_have_count(2);assert page.locator('#placeSelected').inner_text()==''
 # Live suggestions wait for typing to pause, send only the search text, are cached, and render remote text safely.
 photon_calls.clear();page.locator('#placeQuery').press_sequentially('Taipei 101',delay=20);expect(page.locator('[data-place-result]')).to_have_count(1);assert len(photon_calls)==1,photon_calls;q=photon_calls[0];assert q['q']==['Taipei 101'] and 'bbox' in q and not any('Flying' in v for vs in q.values() for v in vs)
 assert page.locator('#placeResults script').count()==0;expect(page.locator('#placeResults')).to_contain_text('<script>')
 page.locator('#placeQuery').fill('');page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.wait_for_timeout(450);assert len(photon_calls)==1
 # Keyboard: arrow to the option and press Enter; the activity name fills from an empty title, and travel legs appear.
 page.locator('#title').fill('');page.locator('#placeQuery').press('ArrowDown');page.locator('#placeQuery').press('Enter');expect(page.locator('#placeSelected')).to_contain_text('Booking requirement not confirmed');assert page.locator('#placeSelected script').count()==0
 assert page.locator('#title').input_value().startswith('Taipei 101');expect(page.locator('#journey')).to_contain_text('km');assert route_calls
 # Routing failure falls back to a labelled estimate.
 ctx.unroute(OSRM);ctx.route(OSRM,lambda r:r.abort());page.locator('#changePlace').click();page.locator('#placeQuery').fill('Elsewhere park');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('#journey')).to_contain_text('rough estimate')
 # Map outage keeps local suggestions and explains the fallback.
 ctx.unroute(PHOTON);ctx.route(PHOTON,lambda r:r.abort());page.locator('#changePlace').click();page.locator('#placeQuery').fill('No map service');expect(page.locator('#placeMessage')).to_contain_text('unavailable');expect(page.locator('#placeSelected')).to_contain_text('Elsewhere')
 # Manual input validation and correction.
 page.locator('[data-manual-place]').click();expect(page.locator('#manualPlaceName')).to_have_value('No map service');page.locator('#manualPlaceName').fill('Meet at the north entrance');page.locator('#manualPlaceBooking').fill('javascript:alert(1)');page.locator('#useManualPlace').click();expect(page.locator('#manualPlaceMessage')).to_contain_text('https://');page.locator('#manualPlaceBooking').fill('https://example.com/tickets');page.locator('#useManualPlace').click();expect(page.locator('#placeSelected')).to_contain_text('Meet at the north entrance')
 page.locator('#title').fill('Flying Cow Ranch');page.locator('#saveActivity').click();page.reload();page.wait_for_selector('.activity');assert page.evaluate("state.days[1].cards.find(c=>c.id==='activity-2-1').place.name")=='Meet at the north entrance'
 # A superseded suggestion request cannot overwrite a newer local choice.
 ctx.unroute(PHOTON);pending=[];ctx.route(PHOTON,lambda r:pending.append(r))
 expand_card(farm());farm().locator('[data-place-edit]').click();page.locator('#placeQuery').fill('Slow place');page.wait_for_timeout(450);assert sum('q=Slow+place' in r.request.url for r in pending)==1
 page.locator('#placeQuery').fill('Flying Cow');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').first.click()
 for r in pending:
  try:r.fulfill(json={'features':[feature('Slow place',121,25)]})
  except Exception:pass
 expect(page.locator('#placeSelected')).to_contain_text('飛牛牧場');page.wait_for_timeout(300);expect(page.locator('#placeSelected')).to_contain_text('飛牛牧場');page.locator('#activityCancel').click()
 ctx.unroute(PHOTON);ctx.route(PHOTON,photon);ctx.unroute(OSRM);ctx.route(OSRM,osrm)
 # A short connection offers a drive card, which is previewed and saved as its own "Getting around" card.
 page.locator('[data-day="5"]').click();page.evaluate("openEditor()");page.locator('#activityDay').select_option('5');page.locator('#activityStart').fill('16:30');page.locator('#activityStart').dispatch_event('input')
 page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);page.locator('[data-place-result]').click();expect(page.locator('.journey-summary')).to_contain_text('doesn’t fit')
 page.locator('[data-add-transfer]').first.click();expect(page.locator('.journey-summary')).to_contain_text('Travel fits');expect(page.locator('.drive-chip')).to_be_visible()
 page.locator('[data-drop-transfer]').click();expect(page.locator('[data-add-transfer]')).to_be_visible();page.locator('[data-add-transfer]').first.click()
 page.locator('#saveActivity').click();titles=page.evaluate("state.days[5].cards.map(c=>c.title)");i=titles.index('Taipei 101 <script>bad()</script>');assert titles[i+1].startswith('Drive to Jolley Hotel'),titles;assert page.evaluate(f"state.days[5].cards[{i+1}].category")=='travel'
 # Malicious imported place fields rejected, ordinary existing trips stay valid.
 assert page.evaluate("(()=>{const s=structuredClone(state);s.days[0].cards[0].place={name:'Bad',bookingUrl:'javascript:alert(1)'};try{validate(s);return false}catch{return true}})()")
 # Layout of the picker and reachable footer across mobile widths.
 page.locator('[data-day="1"]').click()
 for width in [320,390,430,740]:
  page.set_viewport_size({'width':width,'height':844});expand_card(farm());farm().locator('[data-place-edit]').click();page.locator('#placeQuery').fill('Taipei 101');expect(page.locator('[data-place-result]')).to_have_count(1);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('#editor').evaluate('el=>el.scrollWidth<=el.clientWidth');page.locator('#activityCancel').click()
 page.set_viewport_size({'width':390,'height':360});farm().locator('[data-place-edit]').click();box=page.locator('#saveActivity').bounding_box();assert box['y']+box['height']<=361
 assert not errors,errors;b.close();print('PASS: suggested and ambiguous places, live debounced/cached suggestions, keyboard choice, escaping, travel legs with estimate fallback, map outage, manual entry, stale responses, drive cards, Chinese driver places, persistence, validation, mobile layout and reachable Save')
