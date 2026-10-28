from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off,open_options,close_options
base='http://127.0.0.1:8000'
def touch_drag(page,client,start,end):
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start[0],'y':start[1]}]})
 for n in range(1,19):
  x=start[0]+(end[0]-start[0])*n/18;y=start[1]+(end[1]-start[1])*n/18
  client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]});page.wait_for_timeout(16)
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/functions/v1/orbit-chat',lambda r:r.fulfill(json={'text':'Hello!'}))
 google_off(page);page.goto(base);page.wait_for_selector('.activity');page.emulate_media(reduced_motion='reduce');client=page.context.new_cdp_session(page)
 played=lambda:page.evaluate('[...Sounds.played]');clear=lambda:page.evaluate('Sounds.played.length=0')
 # A card pick-up and drop each make their own sound.
 first=page.locator('.activity').first;handle=first.locator('.drag-handle').bounding_box();second=page.locator('.timeline-row').nth(1).bounding_box()
 touch_drag(page,client,(handle['x']+20,handle['y']+20),(handle['x']+20,second['y']+second['height']-5))
 assert played()[:1]==['pickup'] and 'drop' in played(),played()
 # Undo, folds, buttons and removing a card.
 clear();page.locator('#mobileUndo').click();assert played()==['undo'],played()
 page.locator('#toast').get_by_label('Dismiss message').click();clear()
 page.locator('.activity-more>summary').first.click();assert played()==['fold'],played()
 clear();page.locator('.activity').first.locator('[data-action=remove]').click();page.locator('#confirmDelete').click();assert played()[-1]=='remove',played()
 # Orbit: hee-haw to open, a send blip, a chime for the answer, a softer close.
 page.evaluate("window.history.replaceState(null,'','/#room=11111111-1111-1111-1111-111111111111&key='+'a'.repeat(64))")
 clear();page.locator('#orbitPal').click();assert played()==['heehaw'],played()
 page.locator('#orbitChatInput').fill('hi');page.locator('#orbitChatSend').click();expect(page.locator('.orbit-bot').last).to_contain_text('Hello!')
 assert played()[-2:]==['send','chime'],played();page.keyboard.press('Escape');assert played()[-1]=='close'
 # Problems sound different.
 clear();page.evaluate("notify('Something failed',{error:true})");assert played()==['error'],played()
 # An error message (which stays until dismissed) never covers Orbit's button.
 page.wait_for_timeout(300);assert page.evaluate("()=>{const r=document.getElementById('orbitPal').getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#orbitPal')!==null}"),'Orbit is covered by the message'
 # The switch in Trip options turns sounds off, says so, and is remembered on this device.
 open_options(page);toggle=page.locator('#soundToggle');expect(toggle).to_have_text('🔊 Sounds on');expect(toggle).to_have_attribute('aria-pressed','true')
 toggle.click();expect(toggle).to_have_text('🔈 Sounds off');expect(toggle).to_have_attribute('aria-pressed','false')
 close_options(page);clear();page.locator('#orbitPal').click();assert played()==[],played();page.keyboard.press('Escape')
 page.reload();page.wait_for_selector('.activity');open_options(page);expect(page.locator('#soundToggle')).to_have_text('🔈 Sounds off')
 page.locator('#soundToggle').click();assert page.evaluate('Sounds.muted') is False and page.evaluate('[...Sounds.played]')[-1]=='chime'
 assert page.evaluate("typeof AudioContext")=='function'
 assert not errors,errors;b.close()
print('sound tests passed')
