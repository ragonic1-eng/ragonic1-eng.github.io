from ui_helpers import open_extras,google_off
from ui_helpers import open_day_settings,close_options
from playwright.sync_api import sync_playwright
from datetime import datetime,timezone
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},timezone_id='America/Los_Angeles');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.install(time=datetime(2026,12,7,4,29,50,tzinfo=timezone.utc))
 google_off(page);page.goto('http://127.0.0.1:8000');page.wait_for_selector('.activity')
 assert '12:29' in page.locator('#tripClock').inner_text()
 assert page.locator('.time-passed').count()==0
 assert 'Leave home' in page.locator('#liveHeading').inner_text()
 assert page.locator('.card-start').first.inner_text()=='12:30'
 assert page.locator('.timing-duration').first.inner_text()=='40m'
 assert page.locator('.card-start').first.evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)')>=24
 # Real timer starts highlighting at the start boundary; the current card stays bright.
 page.clock.run_for(15000);assert page.locator('.happening-now').count()==1;assert 'Now' in page.locator('#liveHeading').inner_text();assert page.locator('.time-passed').count()==0
 page.clock.run_for(40*60*1000);assert page.locator('.time-passed').count()==1;assert 'Airport check-in' in page.locator('#liveHeading').inner_text()
 assert page.locator('.happening-now').get_attribute('data-id')=='airport-play-checkin'
 page.locator('#jumpCurrent').click();assert page.evaluate("document.activeElement.dataset.id")=='airport-play-checkin'
 # Reversible preference remains across reload, and cards remain editable.
 open_day_settings(page);page.locator('#fadePast').uncheck();assert not page.locator('body').evaluate("el=>el.classList.contains('fade-past')")
 page.reload();page.wait_for_selector('.activity');assert not page.locator('#fadePast').is_checked();open_day_settings(page);page.locator('#fadePast').check();close_options(page)
 page.locator('.card-start').first.click();open_extras(page);page.locator('#notes').fill('Meet by the taxi stand');page.locator('#saveActivity').click();assert not page.locator('#editor').is_visible()
 # Future dates do not fade merely because their time-of-day passed today.
 page.locator('[data-day="1"]').click();assert page.locator('.time-passed').count()==0
 # Check absolute-date handling for an activity spanning midnight.
 page.evaluate("()=>{state.days[1].start=1410;state.days[1].cards=[{id:'overnight',title:'Late arrival',duration:90,notes:'',category:'travel'}];render();updateTripClock(Date.parse('2026-12-09T00:15:00+08:00'))}")
 assert page.locator('.happening-now').count()==1;assert page.locator('.time-passed').count()==0;assert 'Next day' in page.locator('.card-timing').inner_text()
 page.evaluate("updateTripClock(Date.parse('2026-12-09T01:00:00+08:00'))");assert page.locator('.time-passed').count()==1
 page.reload();page.wait_for_selector('.activity');page.locator('[data-day="0"]').click()
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  for timing in page.locator('.card-timing').all():assert timing.evaluate('(el)=>el.scrollWidth<=el.clientWidth'),width
  if width==390:page.locator('.time-passed').first.scroll_into_view_if_needed();page.screenshot(path='/tmp/orbit-time-mobile.png')
  if width==1440:page.locator('#liveHeading').scroll_into_view_if_needed();page.screenshot(path='/tmp/orbit-time-desktop.png')
 assert not errors,errors
 print('PASS: clear start/finish/duration, UTC+8 independent of device timezone, live start/end transitions, future dates, overnight cards, current navigation, fade preference persistence, editing passed cards, 320–1440px layouts, no browser errors')
 b.close()
