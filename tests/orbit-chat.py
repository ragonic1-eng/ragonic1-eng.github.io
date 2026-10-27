from playwright.sync_api import sync_playwright,expect
from ui_helpers import use_previous_plan,google_off
base='http://127.0.0.1:8000'
PNG=bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a90000000049454e44ae426082')
ROOM='/#room=11111111-1111-1111-1111-111111111111&key='+'a'*64
def run(viewport,mobile,shot):
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport=viewport,is_mobile=mobile,has_touch=mobile,reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  sent=[];replies=[]
  def chat(route):
   body=route.request.post_data_json;sent.append(body);route.fulfill(json=replies.pop(0))
  ctx.route('**/functions/v1/orbit-chat',chat);ctx.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(body=PNG,content_type='image/png'))
  ctx.route('https://router.project-osrm.org/**',lambda r:r.abort());ctx.route('https://photon.komoot.io/**',lambda r:r.abort())
  google_off(page);page.goto(base);page.wait_for_selector('.activity');use_previous_plan(page)
  # Without a shared trip, Orbit explains how to turn it on and sends nothing.
  page.locator('#orbitPal').click();expect(page.locator('#orbitChat')).to_be_visible();expect(page.locator('#orbitChatInput')).to_be_focused()
  page.locator('#orbitChatInput').fill('Where are our hotels?');page.locator('#orbitChatInput').press('Enter')
  expect(page.locator('[data-orbit-share]')).to_be_visible();assert not sent
  page.evaluate(f"window.history.replaceState(null,'','{ROOM}')")
  # Asking sends the conversation and a compact trip (times, places, known points) — never the trip key in the trip data.
  hotel=page.evaluate("()=>{for(const [i,d] of state.days.entries())for(const c of d.cards)if(c.category==='hotel')return {id:c.id,day:i,title:c.title};}")
  replies.append({'text':'Here are your hotels:\n- **Jolley Hotel** for two nights','map':{'title':'Your hotels','points':[{'name':'Jolley Hotel','lat':25.04,'lon':121.53,'kind':'trip','cardId':hotel['id']},{'name':'Cingjing hotel','lat':24.05,'lon':121.16,'kind':'trip'}]}})
  page.locator('[data-orbit-ask]').first.click();expect(page.locator('.orbit-map')).to_have_count(1);expect(page.locator('.orbit-map .orbit-pin')).to_have_count(2)
  body=sent[-1];assert body['messages'][-1]=={'role':'user','text':'Show all our hotels on a map'},body['messages'];assert len(body['trip']['days'])==7
  card=next(c for c in body['trip']['days'][hotel['day']]['cards'] if c['id']==hotel['id']);assert card['start'] and card['end'] and card['category']=='hotel'
  assert 'roomKey' not in body['trip'] and body['roomKey']=='a'*64
  expect(page.locator('.orbit-me').last).to_contain_text('Show all our hotels');expect(page.locator('.orbit-bot').last.locator('strong').first).to_have_text('Jolley Hotel')
  # A suggested change is only proposed; nothing changes until "Apply".
  free=page.evaluate("()=>{const d=state.days[2];let t=d.start;for(const c of d.cards){if(c.category==='break'&&c.duration>=60)return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');t+=c.duration}}")
  before=page.evaluate("()=>JSON.stringify(state)")
  replies.append({'text':'Strawberry picking fits nicely there.','places':[{'name':'紅色琉璃瓦草莓園 & SUHU Café','lat':24.3877,'lon':120.8631,'googleId':'ChIJ9cCoOJIBaTQRkogoZ-_JZtU','rating':4.7,'why':'Raised beds, easy with a stroller'}],
   'changes':[{'op':'add','day':2,'start':free,'title':'Strawberry picking','duration':60,'category':'kids','place':{'name':'紅色琉璃瓦草莓園 & SUHU Café','lat':24.3877,'lon':120.8631,'googleId':'ChIJ9cCoOJIBaTQRkogoZ-_JZtU','id':'google-ChIJ9cCoOJIBaTQRkogoZ-_JZtU','rating':4.7}}],'changeSummary':'Add strawberry picking'})
  page.locator('#orbitChatInput').fill('Add strawberry picking on day 3');page.locator('#orbitChatSend').click()
  expect(page.locator('.orbit-changes')).to_contain_text('Add “Strawberry picking” on');expect(page.locator('.orbit-places')).to_contain_text('★ 4.7')
  assert page.evaluate("()=>JSON.stringify(state)")==before,'Orbit must not change the plan before approval'
  assert [m['role'] for m in sent[-1]['messages']]==['user','assistant','user','assistant','user']
  if shot:page.screenshot(path=shot)
  page.locator('[data-orbit-apply]').click();expect(page.locator('.orbit-change-status')).to_contain_text('Applied')
  added=page.evaluate("()=>state.days[2].cards.find(c=>c.title==='Strawberry picking')");assert added and added['place']['googleId']=='ChIJ9cCoOJIBaTQRkogoZ-_JZtU' and added['duration']==60,added
  # One Undo, right in the chat (the chat covers the page's toast on phones), reverses everything Orbit applied.
  page.locator('[data-orbit-undo]').click();expect(page.locator('.orbit-change-status').last).to_have_text('Undone.');assert page.evaluate("()=>JSON.stringify(state)")==before
  # A change that no longer fits is explained, not half-applied; declining marks it.
  replies.append({'text':'Remove it?','changes':[{'op':'remove','cardId':hotel['id']},{'op':'move','cardId':hotel['id'],'day':2,'start':'25:99'}]})
  page.locator('#orbitChatInput').fill('remove the hotel');page.locator('#orbitChatSend').click();expect(page.locator('[data-orbit-apply]')).to_have_count(1)
  page.locator('[data-orbit-decline]').click();expect(page.locator('.orbit-change-status').last).to_have_text('Not applied.');assert page.evaluate("()=>JSON.stringify(state)")==before
  # Memory is passive: Orbit's reply says what it remembered or replaced, and each saved note has an Undo.
  forgets=[];ctx.unroute('**/functions/v1/orbit-chat')
  def chat2(route):
   body=route.request.post_data_json
   if body.get('action')=='forget':forgets.append(body);return route.fulfill(json={'forgotten':True,'note':body['note']})
   sent.append(body);route.fulfill(json=replies.pop(0))
  ctx.route('**/functions/v1/orbit-chat',chat2)
  replies.append({'text':'Noted — I’ll plan around naps.','remembered':['The 2-year-old naps 14:00–16:00.','Both kids dislike spicy food.'],'forgot':['The 2-year-old naps 13:00–15:00.']})
  page.locator('#orbitChatInput').fill('Our toddler naps 2 to 4pm now, and no spicy food');page.locator('#orbitChatSend').click()
  chips=page.locator('.orbit-memory-list').last;expect(chips).to_contain_text('Remembered: “The 2-year-old naps 14:00–16:00.”');expect(chips).to_contain_text('Updated: no longer “The 2-year-old naps 13:00–15:00.”')
  assert page.locator('[data-orbit-remember]').count()==0 and page.locator('[data-orbit-save]').count()==0,'no manual remember buttons'
  chips.locator('[data-orbit-forget]').nth(1).click();expect(chips).to_contain_text('Forgotten: “Both kids dislike spicy food.”')
  assert forgets==[{'action':'forget','roomId':'11111111-1111-1111-1111-111111111111','roomKey':'a'*64,'note':'Both kids dislike spicy food.'}],forgets
  ctx.unroute('**/functions/v1/orbit-chat');ctx.route('**/functions/v1/orbit-chat',lambda r:r.fulfill(status=503,json={'error':'Orbit couldn’t update its memory right now. Try again shortly.'}))
  chips.locator('[data-orbit-forget]').first.click();expect(chips.locator('.orbit-memory-error')).to_contain_text('couldn’t update its memory');expect(chips.locator('[data-orbit-forget]').first).to_be_enabled()
  # When memory isn't switched on, Orbit says what it would have remembered.
  ctx.unroute('**/functions/v1/orbit-chat');ctx.route('**/functions/v1/orbit-chat',chat2)
  replies.append({'text':'Sure.','memoryOff':['The kids love capybaras.']});page.locator('#orbitChatInput').fill('we love capybaras');page.locator('#orbitChatSend').click()
  expect(page.locator('.orbit-memory-note').last).to_contain_text('would remember “The kids love capybaras.”, but its memory isn’t switched on yet')
  expect(page.locator('#orbitChatLog a[href*="orbit-knowledge.md"]')).to_have_count(1)
  # Errors are shown in the chat; the conversation survives a reload on this tab; Escape closes.
  ctx.unroute('**/functions/v1/orbit-chat');ctx.route('**/functions/v1/orbit-chat',lambda r:r.fulfill(status=429,json={'error':'Orbit has answered a lot today. Try again tomorrow (UTC).'}))
  page.locator('#orbitChatInput').fill('anything else?');page.locator('#orbitChatSend').click();expect(page.locator('.orbit-failed')).to_contain_text('answered a lot today')
  page.reload();page.wait_for_selector('.activity');page.locator('#orbitPal').click();expect(page.locator('.orbit-me')).to_have_count(7)
  page.keyboard.press('Escape');expect(page.locator('#orbitChat')).to_be_hidden();expect(page.locator('#orbitPal')).to_be_focused()
  # The model's text is never rendered as HTML.
  page.evaluate("()=>{sessionStorage.setItem('little-orbit-chat',JSON.stringify([{role:'assistant',text:'<img src=x onerror=alert(1)> **hi**'}]))}");page.reload();page.wait_for_selector('.activity');page.locator('#orbitPal').click()
  expect(page.locator('.orbit-bot').last).to_contain_text('<img src=x');assert page.locator('#orbitChatLog img').count()==0
  assert page.evaluate("()=>document.documentElement.scrollWidth<=innerWidth"),'no sideways scroll'
  assert not errors,errors;b.close()
run({'width':1280,'height':900},False,None)
run({'width':390,'height':844},True,'/tmp/claude-0/orbit-chat-phone.png')
print('orbit chat tests passed')
