def expand_card(card):
 details=card.locator('.activity-more')
 if details.get_attribute('open') is None:details.locator('summary').first.click()
 # Reordering, length and day moves sit in a nested "More" fold.
 more=card.locator('.card-more')
 if more.count() and more.get_attribute('open') is None:more.locator('summary').first.click()

def open_options(page):
 options=page.locator('.trip-options')
 if options.get_attribute('open') is None:options.locator('summary').first.click()

def open_day_settings(page):
 if page.viewport_size['width']<=740:open_options(page)
 if page.locator('#dayBudget').get_attribute('open') is None:page.locator('#dayBudget>summary').click()

def close_options(page):
 if page.locator('.trip-options').get_attribute('open') is not None:page.locator('.trip-options>summary').click()

def open_library(page):
 if page.locator('#ideaCollection').get_attribute('open') is None:page.locator('#ideaCollection>summary').click()

def open_extras(page):
 if page.locator('#activityExtras').get_attribute('open') is None:page.locator('#activityExtras>summary').click()

def use_previous_plan(page):
 # Place tests run on a fixed copy of the earlier itinerary so they don't depend on the current schedule.
 import json
 from pathlib import Path
 trip=json.loads((Path(__file__).parent/'fixtures'/'previous-trip.json').read_text())
 for d in trip['days']:
  cards,cursor=[],d['start']
  for c in d['cards']:
   if c.get('originalStart',cursor)>cursor:cards.append({'id':'gap-'+c['id'],'title':'A little breathing room','category':'break','duration':c['originalStart']-cursor,'notes':'Unscheduled time from the original itinerary. Use it for a snack, rest, or getting to the next stop.','optional':False})
   cards.append(c);cursor=c.get('originalStart',cursor)+c['duration']
  d['cards']=cards
 trip['scheduleVersion']=2
 page.evaluate("t=>localStorage.setItem('little-orbit-v1',JSON.stringify(t))",trip);page.reload();page.wait_for_selector('.activity')

def google_off(page,tidy=False):
 # Tests never call the real Google Maps backend; suites that test Google search mock it themselves.
 page.route('**/functions/v1/google-places',lambda r:r.fulfill(json={'available':False}))
 # The one-off travel tidy-up banner is hidden unless a suite tests it, so layouts start where they used to.
 if not tidy:page.add_init_script("try{sessionStorage.setItem('little-orbit-tidy-dismissed','1')}catch(e){}")
