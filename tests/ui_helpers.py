def expand_card(card):
 details=card.locator('.activity-more')
 if details.get_attribute('open') is None:details.locator('summary').first.click()

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
