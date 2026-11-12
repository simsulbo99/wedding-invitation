# Live checks for UI/UX refinement v4 against the deployed GitHub Pages site.
#   LD_LIBRARY_PATH=/workspace/.tmp/atklibs/usr/lib/x86_64-linux-gnu \
#   PLAYWRIGHT_BROWSERS_PATH=/workspace/.pw-browsers python3 tests/ui-v4-live-checks.py
import json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'https://simsulbo99.github.io/wedding-invitation/')
OUT = os.environ.get('OUT', '/workspace/browser/v4-live')
os.makedirs(OUT, exist_ok=True)
results = []
notes = []

def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS' if cond else 'FAIL'), name, '' if cond else extra)

def new_page(ctx, errors):
    pg = ctx.new_page()
    def route(r):
        u = r.request.url
        if 'youtube.com' in u or 'ytimg.com' in u or 'google-analytics' in u:
            return r.abort()
        return r.continue_()
    pg.route('**/*', route)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console:' + m.text) if m.type == 'error' else None)
    return pg

def enter(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    try:
        pg.wait_for_selector('#unbox-choices button', timeout=15000)
        pg.get_by_role('button', name=re.compile('음악 없이 시작하기')).click(timeout=8000)
    except Exception as exc:
        notes.append('intro entry: %s' % exc)
    # wait for the unboxing overlay to finish
    try:
        pg.wait_for_function("() => document.getElementById('unboxing')?.hidden === true", timeout=20000)
    except Exception as exc:
        notes.append('intro overlay still visible: %s' % exc)
    pg.wait_for_timeout(600)

def shoot(pg, name, selector=None, full=False):
    path = os.path.join(OUT, name + '.png')
    if selector:
        el = pg.query_selector(selector)
        if el:
            el.scroll_into_view_if_needed()
            pg.wait_for_timeout(350)
            el.screenshot(path=path)
            return path
    pg.screenshot(path=path, full_page=full)
    return path

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------- mobile 390 ----------------
    errors = []
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale='ko-KR')
    pg = new_page(ctx, errors)
    enter(pg)

    info = pg.evaluate("""() => {
      const h2 = document.getElementById('atlas-title');
      const acc = document.querySelector('.gift-accounts');
      const parking = [...document.querySelectorAll('.access-summary .micro')].find(e => e.textContent.trim() === 'PARKING');
      const copy = document.querySelector('.gift-account-copy');
      const walk = getComputedStyle(document.querySelector('body'));
      return {
        headline: h2 ? getComputedStyle(h2).fontSize : null,
        headlineBox: h2 ? h2.getBoundingClientRect().width : null,
        accExists: !!acc,
        accTop: acc ? acc.getBoundingClientRect().top + window.scrollY : null,
        parkingTop: parking ? parking.getBoundingClientRect().top + window.scrollY : null,
        accHeading: document.getElementById('gift-accounts-title')?.textContent,
        accBg: acc ? getComputedStyle(acc).borderTopColor : null,
        copyDisabled: copy ? copy.disabled : null,
        placeholder: document.querySelector('.gift-account-number')?.textContent?.trim(),
        overflowX: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        bgm: !!document.getElementById('bgm-player'),
        rsvp: !!document.querySelector('#rsvp form'),
        guestbook: !!document.querySelector('.guestbook-form, #guestbook form'),
        lightbox: !!document.getElementById('guestbook-lightbox'),
        accountsJs: [...document.scripts].some(s => (s.src||'').includes('accounts.js'))
      };
    }""")
    print('MOBILE INFO', json.dumps(info, ensure_ascii=False))
    check('mobile: main headline larger than 84px (was clamp 21.5vw=83.9px)', info['headline'] and float(info['headline'].replace('px','')) > 88, info['headline'])
    check('mobile: account section exists', info['accExists'])
    check('mobile: account section below parking info', info['accTop'] and info['parkingTop'] and info['accTop'] > info['parkingTop'])
    check('mobile: account heading text', info['accHeading'] == '마음을 전하는 곳', info['accHeading'])
    # v5: the groom account now carries real details, so copy must be live.
    check('mobile: copy button live for the real groom account', info['copyDisabled'] is False)
    check('mobile: no horizontal overflow', info['overflowX'] <= info['innerW'] + 1, f"{info['overflowX']} vs {info['innerW']}")
    check('mobile: bgm player present', info['bgm'])
    check('mobile: rsvp form present', info['rsvp'])
    check('mobile: accounts.js loaded', info['accountsJs'])

    shoot(pg, 'v4-mobile-01-headline', '#atlas-entry .atlas-teaser-top')
    shoot(pg, 'v4-mobile-02-accounts-closed', '.gift-accounts')

    # accordion toggle
    pg.click('.gift-account summary')
    pg.wait_for_timeout(500)
    opened = pg.evaluate("""() => {
      const d = document.querySelector('.gift-account');
      const c = d.querySelector('.gift-account-content');
      const btn = d.querySelector('.gift-account-copy');
      const toggle = d.querySelector('.gift-account-toggle');
      return {open: d.open, contentH: c.getBoundingClientRect().height, disabled: btn.disabled,
              toggleAfter: getComputedStyle(toggle, '::after').content,
              rect: {t: c.getBoundingClientRect().top, b: c.getBoundingClientRect().bottom}};
    }""")
    print('MOBILE ACCORDION', json.dumps(opened, ensure_ascii=False))
    check('mobile: accordion opens', opened['open'] and opened['contentH'] > 40, opened)
    shoot(pg, 'v4-mobile-03-accounts-open', '.gift-accounts')
    pg.click('.gift-account summary')  # close again

    # guestbook lightbox
    pg.eval_on_selector('.gift-accounts', "el => el.scrollIntoView()")
    try:
        pg.wait_for_selector('.guestbook-entry-photo', timeout=15000)
        pg.eval_on_selector('.guestbook-entry-photo', "el => el.scrollIntoView({block:'center'})")
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(OUT, 'v4-mobile-04-guestbook-entry.png'))
        pg.click('.guestbook-entry-photo')
        pg.wait_for_selector('#guestbook-lightbox:not([hidden])', timeout=8000)
        pg.wait_for_timeout(1500)
        lb = pg.evaluate("""() => {
          const v = document.getElementById('guestbook-lightbox');
          const img = document.getElementById('guestbook-lightbox-image');
          const n = document.getElementById('guestbook-lightbox-next');
          return {shown: !v.hidden, src: img.getAttribute('src'), natural: img.naturalWidth,
                  bodyClass: document.body.className, nextHidden: n.hidden,
                  count: document.getElementById('guestbook-lightbox-count').textContent,
                  scrollY: window.scrollY};
        }""")
        print('MOBILE LIGHTBOX', json.dumps(lb, ensure_ascii=False))
        check('mobile: lightbox opens on photo tap', lb['shown'])
        check('mobile: lightbox image loads from Drive thumbnail', lb['src'] and 'drive.google.com/thumbnail' in lb['src'] and lb['natural'] > 100, lb)
        check('mobile: lightbox locks page scroll', 'guestbook-lightbox-open' in lb['bodyClass'])
        shoot(pg, 'v4-mobile-05-guestbook-lightbox')
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(700)
        closed = pg.evaluate("""() => ({hidden: document.getElementById('guestbook-lightbox').hidden,
                                        bodyClass: document.body.className})""")
        check('mobile: Escape closes lightbox', closed['hidden'] and 'guestbook-lightbox-open' not in closed['bodyClass'], closed)
    except Exception as exc:
        notes.append('guestbook lightbox check: %s' % exc)
        check('mobile: lightbox opens on photo tap', False, str(exc))

    # album page navigation through the airplane bridge
    try:
        pg.eval_on_selector('#atlas-entry a.atlas-feature', "el => el.scrollIntoView({block:'center'})")
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(OUT, 'v4-mobile-06-album-entry.png'))
        pg.click('#atlas-entry a.atlas-feature')
        pg.wait_for_selector('.atlas-page .atlas-hero, body.atlas-page #atlas-page-title', timeout=30000)
        pg.wait_for_function("() => document.body.classList.contains('atlas-page')", timeout=30000)
        pg.wait_for_timeout(1500)
        album = pg.evaluate("""() => {
          const h1 = document.getElementById('atlas-page-title');
          const r = h1.getBoundingClientRect();
          const cs = getComputedStyle(h1);
          return {text: h1.textContent.trim(), url: location.pathname,
                  font: cs.fontSize, w: r.width, right: r.right, left: r.left,
                  bodyClass: document.body.className,
                  overflowX: document.documentElement.scrollWidth, innerW: window.innerWidth,
                  title: document.title, hasEm: !!h1.querySelector('em')};
        }""")
        print('MOBILE ALBUM', json.dumps(album, ensure_ascii=False))
        check('mobile: album heading is "Photo Album"', album['text'] == 'Photo Album', album['text'])
        check('mobile: album heading inside viewport', album['left'] >= -1 and album['right'] <= album['innerW'] + 1, album)
        check('mobile: album document title updated', album['title'].startswith('Photo Album'), album['title'])
        shoot(pg, 'v4-mobile-07-album-hero', 'body > main > .atlas-hero, .atlas-hero')
    except Exception as exc:
        notes.append('album navigation: %s' % exc)
        check('mobile: album heading is "Photo Album"', False, str(exc))

    print('MOBILE PAGE ERRORS', json.dumps(errors[:8], ensure_ascii=False))
    ctx.close()

    # ---------------- desktop 1440 ----------------
    errors2 = []
    ctx2 = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR')
    pg2 = new_page(ctx2, errors2)
    enter(pg2)
    d = pg2.evaluate("""() => {
      const h2 = document.getElementById('atlas-title');
      const acc = document.querySelector('.gift-accounts');
      const copy = document.querySelector('.gift-account-copy');
      return {headline: getComputedStyle(h2).fontSize, acc: !!acc,
              copyDisabled: copy?.disabled, bgm: !!document.getElementById('bgm-player'),
              overflowX: document.documentElement.scrollWidth, innerW: window.innerWidth,
              title: document.title};
    }""")
    print('DESKTOP INFO', json.dumps(d, ensure_ascii=False))
    check('desktop: main headline enlarged (was clamp 9vw=129.6px)', float(d['headline'].replace('px','')) > 135, d['headline'])
    check('desktop: account section exists', d['acc'])
    check('desktop: copy button live for the real groom account', d['copyDisabled'] is False)
    check('desktop: no horizontal overflow', d['overflowX'] <= d['innerW'] + 1, f"{d['overflowX']} vs {d['innerW']}")
    shoot(pg2, 'v4-desktop-01-headline', '#atlas-entry .atlas-teaser-top')
    pg2.click('.gift-account summary')
    pg2.wait_for_timeout(500)
    shoot(pg2, 'v4-desktop-02-accounts-open', '.gift-accounts')
    pg2.screenshot(path=os.path.join(OUT, 'v4-desktop-03-accounts-viewport.png'))

    pg2.goto(BASE + 'atlas.html', wait_until='domcontentloaded', timeout=60000)
    try:
        pg2.wait_for_function("() => document.getElementById('unboxing')?.hidden === true", timeout=20000)
    except Exception:
        pass
    pg2.wait_for_timeout(1200)
    da = pg2.evaluate("""() => {
      const h1 = document.getElementById('atlas-page-title');
      const r = h1.getBoundingClientRect();
      return {text: h1.textContent.trim(), font: getComputedStyle(h1).fontSize,
              right: r.right, innerW: window.innerWidth, title: document.title};
    }""")
    print('DESKTOP ALBUM', json.dumps(da, ensure_ascii=False))
    check('desktop: album heading is "Photo Album"', da['text'] == 'Photo Album', da['text'])
    check('desktop: album heading inside viewport', da['right'] <= da['innerW'] + 1, da)
    shoot(pg2, 'v4-desktop-04-album-hero', '.atlas-hero')
    print('DESKTOP PAGE ERRORS', json.dumps(errors2[:8], ensure_ascii=False))

    browser.close()

print('\nNOTES', json.dumps(notes, ensure_ascii=False))
failed = [n for n, ok in results if not ok]
print('SUMMARY %d/%d passed' % (len(results) - len(failed), len(results)))
if failed:
    print('FAILED:', failed)
sys.exit(0 if not failed else 1)
