from ui_helpers import expand_card,open_options,close_options,open_library
from playwright.sync_api import sync_playwright, expect
import json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000');page.wait_for_selector('.activity')
 page.locator('#mobileAdd').click();page.locator('#saveActivity').click();expect(page.locator('#activityError')).to_contain_text('activity name');assert page.locator('#title').get_attribute('aria-invalid')=='true'
 page.locator('#title').fill('Test responsive snack');page.locator('#duration').fill('0');page.locator('#saveActivity').click();expect(page.locator('#activityError')).to_contain_text('1 to 1440');assert page.locator('#title').input_value()=='Test responsive snack'
 page.locator('#duration').fill('10');page.locator('#activityStart').fill('12:45');page.locator('#saveActivity').click();expect(page.locator('#activityError')).to_contain_text('overlaps');page.locator('#scheduleActions button').first.click();expect(page.locator('#activityError')).to_be_hidden()
 page.locator('#saveActivity').click();expect(page.locator('#editor')).not_to_be_visible();expect(page.locator('#toast')).to_contain_text('Added');expect(page.locator('#toast').get_by_role('button',name='Undo',exact=True)).to_be_visible()
 card=page.locator('.activity').filter(has=page.get_by_role('heading',name='Test responsive snack',exact=True));assert card.count()==1;assert card.evaluate("el=>el.parentElement.classList.contains('just-updated')")
 page.locator('#toast').get_by_role('button',name='Undo',exact=True).click();assert page.get_by_role('heading',name='Test responsive snack',exact=True).count()==0
 # Reorder keeps focus and names the action; changed duration has an explicit confirmation.
 expand_card(page.locator('.activity').first);first=page.locator('.activity').first.get_attribute('data-id');page.locator('.activity').first.get_by_label('Move later',exact=True).click();expect(page.locator('#toast')).to_contain_text('Card moved');assert page.locator('.activity').nth(1).get_attribute('data-id')==first
 assert page.evaluate("document.activeElement.dataset.action")=='down'
 page.locator('.activity').nth(1).get_by_label('Increase duration by 15 minutes',exact=True).click();expect(page.locator('#toast')).to_contain_text('now 55m')
 # Description disclosure survives editing duration.
 card=page.locator('.activity').nth(1);card.get_by_label('Reduce duration by 15 minutes',exact=True).click();assert page.locator('.activity').nth(1).locator('.card-details').get_attribute('open') is not None
 # Moving to another day offers both navigation and recovery.
 page.locator('.activity').nth(1).get_by_label('Move card',exact=True).click();page.locator('#moveDay').select_option('2');page.locator('#confirmMove').click();expect(page.locator('#toast')).to_contain_text('Day 3');assert page.locator('[data-day="2"]').get_attribute('aria-current')=='date'
 # Library additions offer a direct route to the new card, as well as Undo.
 open_library(page);page.locator('[data-add]').first.click();expect(page.locator('#toast').get_by_role('button',name='View activity',exact=True)).to_be_visible();page.locator('#toast').get_by_role('button',name='View activity',exact=True).click();assert page.evaluate("document.activeElement.classList.contains('activity')")
 # Branch URL and blank titles get immediate inline solutions without losing details.
 expand_card(page.locator('.activity').first);page.locator('.branch-add').first.click();page.locator('#branchForm button[type=submit]').click();expect(page.locator('#branchError')).to_contain_text('short title')
 page.locator('#branchTitle').fill('Tickets');page.locator('#branchUrl').fill('example.com');page.locator('#branchForm button[type=submit]').click();expect(page.locator('#branchError')).to_contain_text('https://');page.locator('#branchUrl').fill('https://example.com');page.locator('#branchForm button[type=submit]').click();expect(page.locator('#branchEditor')).not_to_be_visible();expect(page.locator('#toast')).to_contain_text('Updated')
 # An invalid import leaves the plan intact and offers a retry action.
 before=page.evaluate('JSON.stringify(state)');page.locator('#file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{broken'});expect(page.locator('#toast')).to_contain_text('could not be imported');assert page.evaluate('JSON.stringify(state)')==before;assert page.locator('#toast').get_attribute('data-kind')=='error';expect(page.locator('#toast').get_by_role('button',name='Choose another file')).to_be_visible()
 # Async sharing button is visibly busy; failed request returns an enabled retry.
 page.route('**/config.json',lambda route:route.fulfill(json={'provider':'server'}));page.route('**/api/rooms',lambda route:route.fulfill(status=503,json={'error':'Sharing is unavailable. Please try again.'}))
 open_options(page);page.locator('#share').click();page.locator('#createShare').click();expect(page.locator('#shareStatus')).to_contain_text('unavailable');expect(page.locator('#createShare')).to_be_enabled();expect(page.locator('#createShare')).to_have_text('Try creating shared trip');page.locator('#shareClose').click();close_options(page)
 # Validation failure is transactional and never leaves a partial mutation.
 original=page.evaluate('JSON.stringify(state)');page.evaluate("mutate(()=>state.days[day].cards[0].duration=0)");assert page.evaluate('JSON.stringify(state)')==original;expect(page.locator('#toast')).to_contain_text('could not be applied')
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.set_viewport_size({'width':390,'height':844});page.locator('#mobileAdd').click();page.locator('#saveActivity').click();page.screenshot(path='/tmp/orbit-feedback-error.png');page.locator('#cancel').click()
 # Reduced-motion preference disables application-triggered animation, preserving feedback.
 page.emulate_media(reduced_motion='reduce');page.evaluate("document.getAnimations().forEach(a=>a.finish());notify('Reduced motion still confirms this action')");assert page.evaluate('document.getAnimations().length')==0
 assert not errors,errors
 b.close();print('PASS: inline form errors and fixes, preserved entries, save highlighting/Undo, reorder focus, duration feedback, retained disclosures, cross-day navigation, branch validation, import retry, sharing error/retry, transaction rollback, responsive layouts, reduced motion')
