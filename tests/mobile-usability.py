from ui_helpers import open_extras,google_off
from ui_helpers import expand_card
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,568),(390,844),(430,932),(740,375)]:
  print('Checking',width,height,flush=True)
  page=b.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  google_off(page);page.goto('http://127.0.0.1:8000');page.wait_for_selector('.activity');page.emulate_media(reduced_motion='reduce')
  expect(page.locator('#mobileSaveStatus')).to_contain_text('Saved');expect(page.locator('#mobileAdd')).to_be_visible()
  # Reach add from the thumb toolbar without scrolling to the heading.
  page.locator('#mobileAdd').tap();expect(page.locator('#editor')).to_be_visible()
  for control in ['saveActivity','activityCancel']:
   box=page.locator('#'+control).bounding_box();assert box['y']>=0 and box['y']+box['height']<=height+1,(width,control,box)
  assert page.locator('#title').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')>=16
  page.locator('#title').fill('Mobile breakfast');page.locator('#activityStart').fill('11:30');page.locator('#duration').fill('40');open_extras(page);page.locator('#notes').fill('Meet at the taxi stand. Bring the stroller.');page.locator('#saveActivity').tap()
  expect(page.locator('#editor')).not_to_be_visible();card=page.locator('.activity').filter(has=page.get_by_role('heading',name='Mobile breakfast',exact=True));assert card.count()==1
  page.locator('#toast').get_by_role('button',name='Dismiss message').tap()
  # Both time and edit controls are visible, comfortably sized, and work with touch.
  expect(card.locator('.card-timing')).to_contain_text('11:30');expect(card.locator('.timing-duration')).to_have_text('40m')
  expand_card(card)
  for action in ['edit','move','up','down','remove']:
   box=card.locator(f'.card-primary [data-action="{action}"], .card-actions [data-action="{action}"]').first.bounding_box();assert box['width']>=44 and box['height']>=44,(width,action,box)
  card.get_by_label('Edit activity',exact=True).evaluate("el=>el.scrollIntoView({block:'center'})");card.get_by_label('Edit activity',exact=True).tap();expect(page.locator('#notes')).to_have_value('Meet at the taxi stand. Bring the stroller.');open_extras(page);page.locator('#notes').fill('Updated on mobile');page.locator('#saveActivity').tap();page.locator('#toast').get_by_role('button',name='Dismiss message').tap()
  assert page.evaluate("slotTime(state.days[0],state.days[0].cards.findIndex(c=>c.id==='home-to-airport'))")==750
  assert page.evaluate("slotTime(state.days[0],state.days[0].cards.findIndex(c=>c.id==='activity-1-0'))")==945
  # Move to a specific position on a different day; details survive and only one card exists.
  card.get_by_label('Move card',exact=True).evaluate("el=>el.scrollIntoView({block:'center'})");card.get_by_label('Move card',exact=True).tap();page.locator('#moveDay').select_option('1');next_id=page.evaluate('state.days[1].cards.find(c=>!quietLeg(c)).id');page.locator('#movePosition').select_option(next_id);expect(page.locator('#movePreview')).to_contain_text('09:15–09:55')
  box=page.locator('#confirmMove').bounding_box();assert box['y']+box['height']<=height+1
  page.locator('#confirmMove').tap();expect(page.locator('#moveEditor')).not_to_be_visible();assert page.locator('[data-day="1"]').get_attribute('aria-current')=='date';assert page.evaluate("state.days.flatMap(d=>d.cards).filter(c=>c.title==='Mobile breakfast').length")==1
  assert page.evaluate("state.days[1].cards[0].notes")=='Updated on mobile';page.locator('#toast').get_by_role('button',name='Dismiss message').tap()
  # Reorder with touch controls and recover using the always available Undo.
  card.get_by_label('Move later',exact=True).evaluate("el=>el.scrollIntoView({block:'center'})");card.get_by_label('Move later',exact=True).tap();assert page.evaluate("state.days[1].cards.filter(c=>!quietLeg(c))[1].title")=='Mobile breakfast';page.locator('#mobileUndo').tap();assert page.evaluate("state.days[1].cards[0].title")=='Mobile breakfast'
  # Move within the same day using the destination picker; no duplicate or lost descriptions.
  page.locator('#toast').get_by_role('button',name='Dismiss message').tap();expand_card(card);card.get_by_label('Move card',exact=True).evaluate("el=>el.scrollIntoView({block:'center'})");card.get_by_label('Move card',exact=True).tap();page.locator('#movePosition').select_option('');page.locator('#confirmMove').tap();assert page.evaluate("state.days[1].cards.at(-1).title")=='Mobile breakfast'
  page.locator('#mobileNow').tap();assert page.evaluate('document.activeElement.classList.contains("activity")')
  # Save remains reachable with a substantially shortened viewport (keyboard approximation).
  page.locator('#mobileAdd').tap();page.set_viewport_size({'width':width,'height':360});page.locator('#title').fill('Keyboard test');box=page.locator('#saveActivity').bounding_box();assert box['y']>=0 and box['y']+box['height']<=361,(width,box);page.locator('#activityCancel').tap();page.set_viewport_size({'width':width,'height':height})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  # All visible card controls meet the 44px touch goal; native checkbox uses its larger label.
  assert page.locator('#mobileSaveStatus').is_visible();assert page.locator('.move-select').first.is_hidden()
  if width==390:
   page.locator('#toast').get_by_role('button',name='Dismiss message').tap();card.scroll_into_view_if_needed();page.screenshot(path='/tmp/orbit-mobile-card-audit.png');card.get_by_label('Move card',exact=True).evaluate("el=>el.scrollIntoView({block:'center'})");card.get_by_label('Move card',exact=True).tap();page.screenshot(path='/tmp/orbit-mobile-move-audit.png')
  page.reload();page.wait_for_selector('.activity');assert page.evaluate("state.days[1].cards.at(-1).notes")=='Updated on mobile'
  assert not errors,errors;page.close()
 b.close();print('PASS: touch flows at 320/390/430px and landscape, reachable Save/Cancel, 16px inputs, add/edit/free-text persistence, 44px card controls, day+position moves, same-day moves, reorder/Undo, current-card navigation, keyboard-height approximation, no overflow or browser errors')
