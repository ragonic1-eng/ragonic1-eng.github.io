from playwright.sync_api import sync_playwright,expect
import math

def touch_drag(page,client,start,end,hold=0):
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start[0],'y':start[1]}]})
 for n in range(1,19):
  x=start[0]+(end[0]-start[0])*n/18;y=start[1]+(end[1]-start[1])*n/18
  client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]});page.wait_for_timeout(16)
 if hold:page.wait_for_timeout(hold)
 expect(page.locator('.sort-marker')).to_have_count(1);expect(page.locator('.sort-status')).to_be_visible()
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

def touch_tap(page,client,selector):
 box=page.locator(selector).bounding_box()
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}]});page.wait_for_timeout(50)
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000');page.wait_for_selector('.activity');page.emulate_media(reduced_motion='reduce');client=page.context.new_cdp_session(page)
 first=page.locator('.activity').first;box=first.bounding_box();assert box['y']<300 and box['height']<240,box
 expect(first.get_by_label('Edit activity',exact=True)).not_to_be_visible();expect(first.locator('.drag-handle')).to_be_visible();expect(first.locator('.timing-duration')).to_have_text('40m')
 page.screenshot(path='/tmp/orbit-minimal-overview.png')
 # A real touch gesture (CDP touchscreen input) reorders using the visible handle.
 original=page.evaluate('state.days[0].cards.map(c=>c.id)');handle=first.locator('.drag-handle').bounding_box();second=page.locator('.timeline-row').nth(1).bounding_box()
 touch_drag(page,client,(handle['x']+22,handle['y']+22),(handle['x']+22,second['y']+second['height']-5))
 assert page.evaluate('state.days[0].cards[1].id')==original[0];expect(page.locator('#toast')).to_contain_text('Card moved');assert not page.evaluate('window.orbitDragging');assert page.locator('.sort-ghost').count()==0
 touch_tap(page,client,'#mobileUndo');page.wait_for_function('(ids)=>JSON.stringify(state.days[0].cards.map(c=>c.id))===JSON.stringify(ids)',arg=original);assert page.evaluate('state.days[0].cards.map(c=>c.id)')==original;page.locator('#toast').get_by_label('Dismiss message').tap()
 # Dragging to another day tab moves the same card and retains its details.
 page.evaluate('window.scrollTo(0,0)');handle=page.locator('.drag-handle').first.bounding_box();tab=page.locator('[data-day="1"]').bounding_box()
 touch_drag(page,client,(handle['x']+22,handle['y']+22),(tab['x']+tab['width']/2,tab['y']+tab['height']/2))
 assert page.evaluate('state.days[1].cards.at(-1).id')==original[0];assert page.evaluate('day')==1;assert page.evaluate('state.days.flatMap(d=>d.cards).filter(c=>c.id===\''+original[0]+'\').length')==1
 touch_tap(page,client,'#mobileUndo');expect(page.locator('#toast')).to_contain_text('undone');assert page.evaluate('day')==0;page.locator('#toast').get_by_label('Dismiss message').tap();page.locator('[data-day="0"]').tap();expect(page.locator('[data-day="0"]')).to_have_attribute('aria-current','date');page.evaluate('window.scrollTo(0,0)')
 # Edge scrolling lets the card travel to positions below the initial viewport.
 handle=page.locator('.drag-handle').first.bounding_box();initial_scroll=page.evaluate('scrollY')
 touch_drag(page,client,(handle['x']+22,handle['y']+22),(handle['x']+22,740),hold=850)
 assert page.evaluate('scrollY')>initial_scroll+50;assert page.evaluate('state.days[0].cards.findIndex(c=>c.id===\''+original[0]+'\')')>1
 touch_tap(page,client,'#mobileUndo');expect(page.locator('#toast')).to_contain_text('undone');page.locator('#toast').get_by_label('Dismiss message').tap();page.evaluate('window.scrollTo(0,0)')
 # Cancelled touch and a normal page swipe must not change the plan.
 before=page.evaluate('JSON.stringify(state)');handle=page.locator('.drag-handle').first.bounding_box();client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':handle['x']+22,'y':handle['y']+22}]});client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':handle['x']+22,'y':handle['y']+80}]});client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});assert page.evaluate('JSON.stringify(state)')==before;assert not page.evaluate('window.orbitDragging')
 page.locator('#toast').get_by_label('Dismiss message').tap()
 # Expanding a card reveals working edit/move/reminder controls; editing keeps other times.
 card=page.locator('.activity').first;card.locator('.activity-more>summary').tap();card.get_by_label('Edit activity',exact=True).tap();page.locator('#notes').fill('My airport description');page.locator('#saveActivity').tap();assert page.evaluate("slotTime(state.days[0],state.days[0].cards.findIndex(c=>c.id==='activity-1-0'))")==945
 page.locator('#toast').get_by_label('Dismiss message').tap();card.get_by_label('Move card',exact=True).tap();page.locator('#moveCancel').tap()
 page.locator('#mobileAdd').tap();page.locator('#title').fill('Minimal test');page.locator('#activityStart').fill('11:00');page.locator('#duration').fill('20');page.locator('#saveActivity').tap();expect(page.get_by_role('heading',name='Minimal test',exact=True)).to_be_visible()
 touch_tap(page,client,'#mobileUndo');page.reload();page.wait_for_selector('.activity');assert page.evaluate("state.days[0].cards[0].notes")=='My airport description'
 # Compact overview and full settings remain available at all supported widths.
 for width,height in [(320,568),(390,844),(430,932),(740,375),(1440,1000)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width<=740:assert page.locator('.activity').first.bounding_box()['height']<260
 page.set_viewport_size({'width':390,'height':844});page.evaluate('window.scrollTo(0,0)');page.locator('.trip-options>summary').tap();page.locator('#dayBudget>summary').tap();expect(page.locator('#fadePast')).to_be_visible();page.locator('.trip-options>summary').tap()
 assert not errors,errors
 # A swipe on ordinary card content scrolls the page, without starting a reorder.
 swipe=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);swipe.goto('http://127.0.0.1:8000');swipe.wait_for_selector('.activity');swipe_client=swipe.context.new_cdp_session(swipe);unchanged=swipe.evaluate('JSON.stringify(state)')
 card_box=swipe.locator('.activity').first.bounding_box();x=card_box['x']+80;y=card_box['y']+110
 swipe_client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for step in range(1,12):
  swipe_client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-step*18}]});swipe.wait_for_timeout(20)
 swipe_client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert swipe.evaluate('scrollY')>30;assert swipe.evaluate('JSON.stringify(state)')==unchanged;assert not swipe.evaluate('window.orbitDragging');swipe.close()
 # The same explicit handle also works with a mouse on desktop.
 desktop=b.new_page(viewport={'width':1440,'height':2600});desktop.goto('http://127.0.0.1:8000');desktop.wait_for_selector('.activity');desktop.emulate_media(reduced_motion='reduce');desktop_first=desktop.locator('.activity').first.get_attribute('data-id');h=desktop.locator('.drag-handle').first.bounding_box();target=desktop.locator('.timeline-row').nth(1).bounding_box()
 desktop.mouse.move(h['x']+22,h['y']+22);desktop.mouse.down();desktop.mouse.move(h['x']+22,target['y']+target['height']-5,steps=18);desktop.mouse.up();desktop.wait_for_function('(id)=>state.days[0].cards[1].id===id',arg=desktop_first);desktop.close()
 b.close();print('PASS: compact cards, real touchscreen sorting, cross-day drag, auto-scroll, cancellation safety, Undo and persistence, expanded edit/move actions, earlier additions, full settings, responsive widths, no browser errors')
