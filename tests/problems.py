from playwright.sync_api import sync_playwright,expect
from ui_helpers import use_previous_plan
base='http://127.0.0.1:8000'
ROOM='/#room=11111111-1111-1111-1111-111111111111&key='+'a'*64
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort());ctx.route('https://router.project-osrm.org/**',lambda r:r.abort());ctx.route('https://photon.komoot.io/**',lambda r:r.abort())
 google=[];chat=[]
 def places(route):
  if route.request.method=='GET':return route.fulfill(json={'available':True})
  google.append(1)
  if len(google)<=2:return route.fulfill(status=502,json={'error':'Google Maps rejected the key. Check that Places API (New) is enabled and billing is on.','code':'GOOGLE_AUTH'})
  route.fulfill(json={'suggestions':[{'placeId':'ChIJ_strawberry_farm_1234','name':'草莓園','address':'大湖'}]})
 ctx.route('**/functions/v1/google-places',places)
 replies=[]
 def orbit(route):chat.append(route.request.post_data_json);status,body=replies.pop(0);route.fulfill(status=status,json=body)
 ctx.route('**/functions/v1/orbit-chat',orbit)
 page.goto(base);page.wait_for_selector('.activity');use_previous_plan(page);page.evaluate(f"window.history.replaceState(null,'','{ROOM}')")
 # A place-search failure says what happened, why, and what to do; a key problem isn't retried automatically.
 page.evaluate("openEditor()");page.locator('#placeQuery').fill('草莓園')
 msg=page.locator('#placeMessage .problem');expect(msg).to_contain_text('Google Maps rejected the key');expect(msg).to_contain_text('Why:');expect(msg).to_contain_text('Try:');expect(msg).to_contain_text('billing is on')
 assert len(google)==1,'configuration problems are not retried'
 page.locator('#activityCancel').click()
 # Orbit chat: a busy AI is retried once automatically, so the person just gets the answer.
 replies[:]=[(503,{'error':'Orbit couldn’t answer right now.','code':'PROVIDER'}),(200,{'text':'Here you go!'})]
 page.locator('#orbitPal').click();page.locator('#orbitChatInput').fill('hello');page.locator('#orbitChatSend').click()
 expect(page.locator('.orbit-bot').last).to_contain_text('Here you go!');assert len(chat)==2
 # A timeout is explained with a reason and a fix, and "Try again" re-asks the same question once.
 replies[:]=[(503,{'error':'Orbit took too long thinking.','code':'PROVIDER_TIMEOUT'}),(200,{'text':'Answered on the second go.'})]
 page.locator('#orbitChatInput').fill('plan all 7 days');page.locator('#orbitChatSend').click()
 failed=page.locator('.orbit-failed .problem');expect(failed).to_contain_text('Orbit took too long thinking.');expect(failed).to_contain_text('more than two minutes');expect(failed).to_contain_text('one day or one place')
 assert len(chat)==3,'timeouts are not retried automatically'
 page.locator('[data-orbit-retry]').click();expect(page.locator('.orbit-bot').last).to_contain_text('Answered on the second go.')
 assert page.locator('.orbit-me').filter(has_text='plan all 7 days').count()==1 and page.locator('.orbit-failed').count()==0
 assert chat[-1]['messages'][-1]=={'role':'user','text':'plan all 7 days'}
 # A daily limit explains itself and offers no pointless retry.
 replies[:]=[(429,{'error':'Orbit has answered a lot today. Try again tomorrow (UTC).'})]
 page.locator('#orbitChatInput').fill('one more');page.locator('#orbitChatSend').click()
 expect(page.locator('.orbit-failed .problem')).to_contain_text('daily allowance');assert page.locator('[data-orbit-retry]').count()==0
 # Offline: explained without sending anything, and the page says so when the connection drops.
 sent=len(chat);ctx.set_offline(True)
 expect(page.locator('#toast')).to_contain_text('You’re offline')
 page.locator('#orbitChatInput').fill('still there?');page.locator('#orbitChatSend').click()
 expect(page.locator('.orbit-failed .problem').last).to_contain_text('Your device is offline');assert len(chat)==sent
 ctx.set_offline(False);expect(page.locator('#toast')).to_contain_text('Back online')
 assert not errors,errors;b.close()
print('problem explanation tests passed')
