# Capture v5 screenshots (mobile 390 / desktop) on the live site.
#   LD_LIBRARY_PATH=/workspace/.tmp/atklibs/usr/lib/x86_64-linux-gnu \
#   PLAYWRIGHT_BROWSERS_PATH=/workspace/.pw-browsers BASE=https://simsulbo99.github.io/wedding-invitation/ \
#   OUT=/workspace/screenshots-v5 python3 tests/v5-shots.py
import os, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'https://simsulbo99.github.io/wedding-invitation/')
OUT = os.environ.get('OUT', '/workspace/screenshots-v5')
os.makedirs(OUT, exist_ok=True)

def enter(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    try:
        pg.wait_for_selector('#unbox-choices button', timeout=15000)
        pg.get_by_role('button', name=re.compile('음악 없이 시작하기')).click(timeout=8000)
        pg.wait_for_function("() => document.getElementById('unboxing')?.hidden === true", timeout=20000)
    except Exception:
        pass
    pg.wait_for_timeout(700)

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, w, h, scale, mobile in [('mobile390', 390, 844, 3, True), ('desktop1440', 1440, 900, 1, False)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale,
                            is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.route('**/*', lambda r: r.abort() if ('youtube.com' in r.request.url or 'ytimg.com' in r.request.url) else r.continue_())
        enter(pg)
        # groom open, bride closed -> the v5 card as a visitor first sees it
        accs = pg.query_selector_all('.gift-account')
        accs[0].evaluate("el => el.open = true")
        pg.wait_for_timeout(400)
        pg.query_selector('.gift-accounts').scroll_into_view_if_needed()
        pg.wait_for_timeout(500)
        pg.query_selector('.gift-accounts').screenshot(path=os.path.join(OUT, '%s-accounts-groom.png' % label))
        pg.screenshot(path=os.path.join(OUT, '%s-viewport-accounts.png' % label))
        # bride opened too: disabled state side by side
        accs[1].evaluate("el => el.open = true")
        pg.wait_for_timeout(400)
        pg.query_selector('.gift-accounts').screenshot(path=os.path.join(OUT, '%s-accounts-both.png' % label))
        # photo album title
        pg.goto(BASE + 'atlas.html', wait_until='domcontentloaded', timeout=60000)
        pg.wait_for_timeout(1000)
        pg.screenshot(path=os.path.join(OUT, '%s-atlas-hero.png' % label))
        ctx.close()
    b.close()
print('done', OUT)
