import json
from playwright.sync_api import sync_playwright,expect
from ui_helpers import use_previous_plan
base='http://127.0.0.1:8000'
ID='ChIJ_strawberry_farm_1234'
place={'id':'google-'+ID,'googleId':ID,'name':'Red Glazed Tile Strawberry Farm','nameZh':'紅色琉璃瓦草莓園','address':'No. 96-6, Linliping, Dahu Township, Miaoli County, Taiwan 364','addressZh':'364苗栗縣大湖鄉義和村淋漓坪96-6號',
 'lat':24.3912,'lon':120.8721,'source':'https://maps.google.com/?cid=123','googleUrl':'https://maps.google.com/?cid=123','checked':'2026-10-27','bookingNote':'Booking requirement not confirmed yet.',
 'openingHours':'Monday: Closed\nTuesday: 9:00 AM – 5:30 PM','phone':'0972 055 042','website':'https://www.facebook.com/dahuRED','rating':4.6,'ratingCount':812,'photo':'https://lh3.googleusercontent.com/photo.jpg','photoCredit':'A visitor','planning':{'category':'kids'}}
PNG=bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a90000000049454e44ae426082')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 calls,photon,orbit=[],[],[]
 def google(route):
  if route.request.method=='GET':return route.fulfill(json={'available':True})
  body=route.request.post_data_json;calls.append(body)
  if body['action']=='autocomplete':return route.fulfill(json={'suggestions':[{'placeId':ID,'name':'紅色琉璃瓦草莓園','address':'苗栗縣大湖鄉'},{'placeId':'ChIJ_other_place_5678','name':'SUHU Café','address':'苗栗縣大湖鄉'}]})
  if body['action']=='details':return route.fulfill(json={'place':place})
  route.fulfill(json={'point':{'lat':24.39,'lon':120.87,'googleId':ID}})
 ctx.route('**/functions/v1/google-places',google);ctx.route('https://photon.komoot.io/**',lambda r:(photon.append(r.request.url),r.abort()))
 ctx.route('**/functions/v1/research-place',lambda r:(orbit.append(r.request.post_data_json),r.fulfill(json={'evaluation':{'verdict':'good','headline':'Fits well.','reasons':[],'suggestion':''}})))
 ctx.route('https://router.project-osrm.org/**',lambda r:r.fulfill(json={'code':'Ok','routes':[{'distance':14300,'duration':1560,'legs':[{'distance':14300,'duration':1560}]}]}))
 ctx.route('https://lh3.googleusercontent.com/**',lambda r:r.fulfill(body=PNG,content_type='image/png'));ctx.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(body=PNG,content_type='image/png'))
 page.goto(base);page.wait_for_selector('.activity');use_previous_plan(page)
 page.evaluate("window.history.replaceState(null,'','/#room=11111111-1111-1111-1111-111111111111&key='+'a'.repeat(64))")
 # Typing searches Google Maps (not the free map); small places like the farm come straight back.
 page.evaluate("openEditor()");page.locator('#activityDay').select_option('1');page.locator('#title').fill('')
 page.locator('#placeQuery').press_sequentially('紅色琉璃瓦',delay=20);expect(page.locator('[data-place-result]')).to_have_count(2)
 expect(page.locator('[data-place-result]').first).to_contain_text('紅色琉璃瓦草莓園');expect(page.locator('.place-option.is-weak')).to_have_count(0);assert not photon,photon
 auto=[c for c in calls if c['action']=='autocomplete'];assert auto[-1]['input']=='紅色琉璃瓦' and auto[-1]['country']=='tw' and len(auto[-1]['sessionToken'])==32,auto
 # Picking it loads Google's details: pin, hours, phone, rating, photo, Chinese name for the driver. No slow web research.
 page.locator('[data-place-result]').first.click();expect(page.locator('#form')).not_to_have_attribute('aria-busy','true')
 sel=page.locator('#placeSelected');expect(sel).to_contain_text('4.6');expect(sel).to_contain_text('812 Google reviews');expect(sel).to_contain_text('Tuesday: 9:00 AM');expect(sel).to_contain_text('0972 055 042');expect(sel).to_contain_text('Place details from Google Maps')
 expect(sel.locator('.place-photo img')).to_have_attribute('src','https://lh3.googleusercontent.com/photo.jpg');expect(sel.locator('.maps-button')).to_have_attribute('href','https://maps.google.com/?cid=123')
 details=[c for c in calls if c['action']=='details'];assert details and details[0]['placeId']==ID and details[0]['sessionToken']==auto[-1]['sessionToken'],details
 assert page.locator('#title').input_value()=='Red Glazed Tile Strawberry Farm';assert page.locator('#driverTitle').input_value()=='紅色琉璃瓦草莓園'
 assert not any('query' in o for o in orbit),'Google places should not trigger web research';expect(page.locator('#journey')).to_be_visible()
 page.locator('#saveActivity').click()
 saved=page.evaluate("state.days[1].cards.find(c=>c.title==='Red Glazed Tile Strawberry Farm').place");assert saved['googleId']==ID and saved['lat']==24.3912 and saved['rating']==4.6,saved
 # The driver view shows the Chinese address.
 html=page.evaluate("p=>PlaceCore.html(p,true)",saved);assert '364苗栗縣大湖鄉義和村淋漓坪96-6號' in html and 'Google 評論' in html
 # Unsafe links from a stored place are never rendered.
 bad=page.evaluate("p=>PlaceCore.valid(p)",{**place,'googleUrl':'javascript:alert(1)'});assert bad is False
 # A broken (expired) photo link disappears instead of showing a broken image.
 ctx.route('https://lh3.googleusercontent.com/missing.jpg',lambda r:r.fulfill(status=404))
 page.evaluate("()=>{const d=document.createElement('div');d.id='expired';d.innerHTML=PlaceCore.html({name:'X',photo:'https://lh3.googleusercontent.com/missing.jpg'});document.body.append(d)}")
 expect(page.locator('#expired .place-info')).to_have_count(1);expect(page.locator('#expired .place-photo')).to_have_count(0)
 assert not errors,errors
 b.close()
print('google search tests passed')
