from playwright.sync_api import sync_playwright,expect
from ui_helpers import google_off,expand_card
base='http://127.0.0.1:8000'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for vp,mobile in [({'width':390,'height':844},True),({'width':1280,'height':900},False)]:
  ctx=b.new_context(viewport=vp,is_mobile=mobile,has_touch=mobile,reduced_motion='reduce')
  for host in ['https://router.project-osrm.org/**','https://photon.komoot.io/**','https://tile.openstreetmap.org/**']:ctx.route(host,lambda r:r.abort())
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));google_off(page);page.goto(base);page.wait_for_selector('.activity')
  page.locator('[data-day="1"]').click()
  times=lambda:page.evaluate("(()=>{const d=state.days[1];let t=d.start;return d.cards.map(c=>{const s=t;t+=c.duration;return [c.title,s]})})()")
  before=times();brewery=page.locator('.activity').filter(has=page.get_by_role('heading',name='Puli Brewery (埔里酒廠)',exact=True))
  # Delete sits on the card itself, next to Edit and Reminder.
  expand_card(brewery);btn=brewery.locator('.card-primary [data-action=remove]');expect(btn).to_be_visible();expect(btn).to_contain_text('Delete')
  # It asks first, and "Keep it" changes nothing.
  btn.click();dlg=page.locator('#deleteDialog');expect(dlg).to_be_visible();expect(dlg).to_contain_text('Delete “Puli Brewery (埔里酒廠)”?');expect(dlg).to_contain_text('8 Dec');expect(dlg).to_contain_text('14:15–15:50');expect(dlg).to_contain_text('includes the 1h of travel to it')
  # The drive to it goes with it. It offers what to do with the freed time, naming the real neighbours and their new times.
  ch=page.locator('#deleteChoices');expect(ch.locator('input:checked')).to_have_value('keep')
  expect(ch).to_contain_text('Leave it as free time');expect(ch).to_contain_text('Give it to “Schokolake Country House (Dahu)”');expect(ch).to_contain_text('It ends at 15:50 instead of 14:15')
  expect(ch).to_contain_text('Give it to “Feeling 18 Bakery (18度C 生吐司)”');expect(ch).to_contain_text('It starts at 14:15 instead of 15:50');expect(ch).to_contain_text('Later activities start 1h 35m earlier')
  expect(page.locator('#deleteCancel')).to_be_focused()
  page.locator('#deleteCancel').click();expect(dlg).to_be_hidden();assert times()==before
  # Delete (default): the slot becomes free time, so later activities keep their times; Undo brings it back.
  btn.click();page.locator('#confirmDelete').click();expect(dlg).to_be_hidden()
  after=times();assert 'Puli Brewery (埔里酒廠)' not in [t for t,_ in after] and 'Drive Dahu → Puli (~1 h)' not in [t for t,_ in after]
  later={t:s for t,s in before};assert all(later.get(t)==s for t,s in after if t in later),'later activities keep their times'
  assert any(t=='A little breathing room' for t,_ in after)
  page.locator('#toast').get_by_role('button',name='Undo').click();assert times()==before
  dur=lambda t:page.evaluate("t=>state.days[1].cards.find(c=>c.title===t)?.duration",t)
  # Give the time to the activity before: it runs longer, everything after keeps its time.
  expand_card(brewery);brewery.locator('.card-primary [data-action=remove]').click();page.locator('#deleteChoices input[value=before]').check();page.locator('#confirmDelete').click()
  assert dur('Schokolake Country House (Dahu)')==60+95 and dict(times())['Feeling 18 Bakery (18度C 生吐司)']==dict(before)['Feeling 18 Bakery (18度C 生吐司)']
  page.locator('#toast').get_by_role('button',name='Undo').click();assert times()==before
  # Give it to the next activity: it starts 1 h 35 min earlier and ends when it did.
  expand_card(brewery);brewery.locator('.card-primary [data-action=remove]').click();page.locator('#deleteChoices input[value=after]').check();page.locator('#confirmDelete').click()
  assert dict(times())['Feeling 18 Bakery (18度C 生吐司)']==dict(before)['Drive Dahu → Puli (~1 h)'] and dur('Feeling 18 Bakery (18度C 生吐司)')==30+95
  page.locator('#toast').get_by_role('button',name='Undo').click();assert times()==before
  # Move everything after it earlier instead.
  expand_card(brewery);brewery.locator('.card-primary [data-action=remove]').click();page.locator('#deleteChoices input[value=close]').check();page.locator('#confirmDelete').click()
  shifted=dict(times());assert shifted['Feeling 18 Bakery (18度C 生吐司)']==dict(before)['Feeling 18 Bakery (18度C 生吐司)']-95
  # Escape closes the question without deleting.
  first=page.locator('.activity').first;expand_card(first);first.locator('.card-primary [data-action=remove]').click();page.keyboard.press('Escape');expect(dlg).to_be_hidden();assert len(times())==len(shifted)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors;ctx.close()
 b.close()
print('delete tests passed')
