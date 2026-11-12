# v5 checks (account card design, KakaoPay buttons, Photo Album title) against any base URL.
#   LD_LIBRARY_PATH=/workspace/.tmp/atklibs/usr/lib/x86_64-linux-gnu \
#   PLAYWRIGHT_BROWSERS_PATH=/workspace/.pw-browsers BASE=http://127.0.0.1:8099/ OUT=/workspace/screenshots-v5 python3 tests/ui-v5-checks.py
import json, os, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://127.0.0.1:8099/')
OUT = os.environ.get('OUT', '/workspace/screenshots-v5')
TAG = os.environ.get('TAG', 'local')
os.makedirs(OUT, exist_ok=True)
results, notes = [], []

def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS' if cond else 'FAIL'), name, '' if cond else extra)

def new_page(ctx, errors):
    pg = ctx.new_page()
    def route(r):
        u = r.request.url
        if 'youtube.com' in u or 'ytimg.com' in u or 'google-analytics' in u or 'googletagmanager' in u:
            return r.abort()
        return r.continue_()
    pg.route('**/*', route)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    def on_console(m):
        if m.type != 'error':
            return
        txt = m.text
        if 'ERR_FAILED' in txt or 'ERR_BLOCKED' in txt or 'net::' in txt:
            return  # third-party media blocked on purpose
        errors.append('console: ' + txt)
    pg.on('console', on_console)
    return pg

def enter(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    try:
        pg.wait_for_selector('#unbox-choices button', timeout=15000)
        pg.get_by_role('button', name=re.compile('음악 없이 시작하기')).click(timeout=8000)
    except Exception as exc:
        notes.append('intro entry: %s' % exc)
    try:
        pg.wait_for_function("() => document.getElementById('unboxing')?.hidden === true", timeout=20000)
    except Exception as exc:
        notes.append('intro overlay still visible: %s' % exc)
    pg.wait_for_timeout(600)

def shoot(pg, name, selector=None):
    path = os.path.join(OUT, '%s-%s.png' % (TAG, name))
    if selector:
        el = pg.query_selector(selector)
        if el:
            el.scroll_into_view_if_needed()
            pg.wait_for_timeout(400)
            el.screenshot(path=path)
            return path
    pg.screenshot(path=path)
    return path

ACCOUNT_PROBE = """() => {
  const out = {side: []};
  const sec = document.querySelector('.gift-accounts');
  if (!sec) return {error: 'no .gift-accounts'};
  const cs = getComputedStyle(sec);
  out.card = {bg: cs.backgroundColor, border: cs.borderTopColor, borderW: cs.borderTopWidth,
              radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, padding: cs.padding};
  document.querySelectorAll('.gift-account').forEach((acc, i) => {
    const pay = acc.querySelector('.gift-account-kakaopay');
    const copy = acc.querySelector('.gift-account-copy');
    const img = pay ? pay.querySelector('img') : null;
    const copyW = copy ? copy.getBoundingClientRect().width : 0;
    const contentW = acc.querySelector('.gift-account-content').getBoundingClientRect().width;
    out.side.push({
      index: i,
      tag: pay ? pay.tagName : null,
      href: pay && pay.href ? pay.href : null,
      target: pay ? pay.getAttribute('target') : null,
      rel: pay ? pay.getAttribute('rel') : null,
      disabled: pay ? !!pay.disabled : null,
      title: pay ? pay.getAttribute('title') : null,
      aria: pay ? pay.getAttribute('aria-label') : null,
      text: pay ? pay.textContent.trim() : null,
      img: img ? {src: img.getAttribute('src'), complete: img.complete,
                  nw: img.naturalWidth, nh: img.naturalHeight,
                  w: img.getBoundingClientRect().width} : null,
      copyWidth: Math.round(copyW), contentWidth: Math.round(contentW),
      contentClientWidth: Math.round(acc.querySelector('.gift-account-content').clientWidth),
      contentInnerWidth: (() => { const c = acc.querySelector('.gift-account-content'); const s = getComputedStyle(c);
        return Math.round(c.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)); })(),
      copyDisabled: copy ? copy.disabled : null,
      payBg: pay ? getComputedStyle(pay).backgroundColor : null,
      payW: pay ? Math.round(pay.getBoundingClientRect().width) : null,
      payH: pay ? Math.round(pay.getBoundingClientRect().height) : null,
      order: pay && copy ? (copy.compareDocumentPosition(pay) & Node.DOCUMENT_POSITION_FOLLOWING ? 'copy-then-pay' : 'pay-then-copy') : null
    });
  });
  return out;
}
"""

TITLE_PROBE = """() => {
  const h1 = document.querySelector('.atlas-hero h1');
  if (!h1) return {error: 'no hero h1'};
  const r = h1.getBoundingClientRect();
  const cs = getComputedStyle(h1);
  const wrap = h1.closest('.wrap').getBoundingClientRect();
  return {text: h1.textContent.trim(), fontSize: cs.fontSize, lineHeight: cs.lineHeight,
          family: cs.fontFamily, whiteSpace: cs.whiteSpace,
          boxW: Math.round(r.width), boxH: Math.round(r.height),
          wrapW: Math.round(wrap.width),
          scrollW: h1.scrollWidth, clientW: h1.clientWidth,
          overflowX: Math.round(r.right - wrap.right) || 0,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          left: Math.round(r.left), lines: Math.round(r.height / parseFloat(cs.lineHeight))};
}"""

with sync_playwright() as p:
    browser = p.chromium.launch()

    for label, w, h, mobile in [('mobile390', 390, 844, True), ('mobile360', 360, 780, True),
                                ('mobile430', 430, 932, True), ('tablet768', 768, 900, False),
                                ('desktop1440', 1440, 900, False)]:
        # ---- invitation page: account card + KakaoPay
        errors = []
        ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1,
                                  is_mobile=mobile, has_touch=mobile)
        try:
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        except Exception as exc:
            notes.append('clipboard permission: %s' % exc)
        pg = new_page(ctx, errors)
        enter(pg)
        for i, d in enumerate(pg.query_selector_all('.gift-account')):
            d.evaluate("el => el.open = true")
        pg.wait_for_timeout(500)
        data = pg.evaluate(ACCOUNT_PROBE)
        print('[%s accounts] %s' % (label, json.dumps(data, ensure_ascii=False)))
        if 'error' not in data:
            groom = data['side'][0]
            bride = data['side'][1]
            check('%s card bg is pale tiffany' % label, data['card']['bg'] in ('rgb(234, 245, 241)',), data['card'])
            check('%s card top border accent' % label, data['card']['borderW'] == '4px', data['card'])
            check('%s groom pay is link' % label, groom['tag'] == 'A', groom['tag'])
            check('%s groom pay href' % label, groom['href'] == 'https://qr.kakaopay.com/Ej70Wbz5P', groom['href'])
            check('%s groom pay new tab + noopener' % label,
                  groom['target'] == '_blank' and 'noopener' in (groom['rel'] or ''), (groom['target'], groom['rel']))
            check('%s groom pay aria' % label, groom['aria'] == '신랑측 카카오페이로 송금하기', groom['aria'])
            check('%s groom kakao logo loaded' % label,
                  bool(groom['img']) and groom['img']['complete'] and groom['img']['nw'] > 0, groom['img'])
            check('%s groom pay full width of content' % label,
                  abs(groom['payW'] - groom['contentInnerWidth']) <= 2,
                  (groom['payW'], groom['contentInnerWidth']))
            check('%s bride pay disabled button' % label,
                  bride['tag'] == 'BUTTON' and bride['disabled'] is True and not bride['href'], bride)
            check('%s bride logo present' % label, bool(bride['img']) and bride['img']['nw'] > 0, bride['img'])
            check('%s pay sits below copy' % label, groom['order'] == 'copy-then-pay', groom['order'])
            check('%s no console/page errors (invitation)' % label, not errors, errors[:3])
        # ---- groom account details + copy button must be live
        details = pg.evaluate("""() => {
          const acc = document.querySelector('.gift-account');
          const dds = Array.from(acc.querySelectorAll('.gift-account dd')).map(d => d.textContent.trim());
          return {values: dds, number: acc.querySelector('.gift-account-number').textContent.trim()};
        }""")
        print('[%s groom values] %s' % (label, json.dumps(details, ensure_ascii=False)))
        check('%s groom bank is 신한은행' % label, details['values'][0] == '신한은행', details['values'])
        check('%s groom number is 110-292-797975' % label, details['number'] == '110-292-797975', details['number'])
        check('%s groom holder is 김정우' % label, details['values'][2] == '김정우', details['values'])
        copy_state = pg.evaluate("""() => {
          const b = document.querySelector('.gift-account .gift-account-copy');
          return {disabled: b.disabled, opacity: getComputedStyle(b).opacity, cursor: getComputedStyle(b).cursor};
        }""")
        check('%s groom copy button enabled' % label, copy_state['disabled'] is False, copy_state)
        if label == 'mobile390':
            pg.click('.gift-account .gift-account-copy')
            pg.wait_for_timeout(500)
            fb = pg.inner_text('.gift-account .gift-account-feedback')
            clip = pg.evaluate("() => navigator.clipboard.readText().catch(e => 'ERR:' + e.message)")
            print('[mobile390 copy] feedback=%r clipboard=%r' % (fb, clip))
            check('mobile390 copy feedback shown', '복사되었습니다' in fb, fb)
            check('mobile390 clipboard holds the number', clip == '110-292-797975', clip)
            shoot(pg, 'accounts-open', '.gift-accounts')
            shoot(pg, 'accounts-groom-detail', '.gift-account')
        if label == 'desktop1440':
            shoot(pg, 'accounts-open-desktop', '.gift-accounts')
        ctx.close()

        # ---- atlas page: Photo Album title
        errors2 = []
        ctx2 = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1,
                                   is_mobile=mobile, has_touch=mobile)
        pg2 = new_page(ctx2, errors2)
        pg2.goto(BASE + 'atlas.html', wait_until='domcontentloaded', timeout=60000)
        pg2.wait_for_timeout(1200)
        t = pg2.evaluate(TITLE_PROBE)
        print('[%s atlas] %s' % (label, json.dumps(t, ensure_ascii=False)))
        if 'error' not in t:
            check('%s atlas title uses display face' % label, 'Relationship of Melodrame' in t['family'], t['family'])
            check('%s atlas title no horizontal overflow' % label, t['docOverflow'] <= 0 and t['overflowX'] <= 1,
                  (t['docOverflow'], t['overflowX']))
            check('%s atlas title not clipped' % label, t['scrollW'] <= t['clientW'] + 1, (t['scrollW'], t['clientW']))
        check('%s no console/page errors (atlas)' % label, not errors2, errors2[:3])
        if label in ('mobile390', 'desktop1440'):
            shoot(pg2, 'atlas-hero')
        ctx2.close()

    browser.close()

print('\n--- summary ---')
fails = [n for n, ok in results if not ok]
print('%d checks, %d failed' % (len(results), len(fails)))
for n in fails:
    print('FAILED:', n)
if notes:
    print('notes:', notes)
