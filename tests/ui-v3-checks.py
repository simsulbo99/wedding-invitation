# Browser checks for UI/UX refinement v3 (intro speed and choices, footer music, copy, Atlas, airplane bridge).
#   python3 -m http.server 8765 &  then  python3 tests/ui-v3-checks.py
# Playwright Chromium, 390px mobile viewport, mocked YouTube IFrame API (tests/yt-mock.js).
import json, os, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
MOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yt-mock.js')).read()
results = []

def check(name, cond, extra=''):
    results.append(bool(cond))
    print(('PASS' if cond else 'FAIL'), name, '' if cond else extra)

def new_page(ctx):
    pg = ctx.new_page()
    def route(r):
        u = r.request.url
        if u.startswith('https://www.youtube.com/iframe_api'):
            return r.fulfill(status=200, content_type='text/javascript', body=MOCK)
        return r.continue_() if 'localhost' in u else r.abort()
    pg.route('**/*', route)
    pg.on('pageerror', lambda e: (results.append(False), print('PAGEERROR', e)))
    return pg

def flight(pg):
    return pg.evaluate("""()=>{const f=document.querySelector('.bridge-flight'); if(!f) return null;
      const r=f.getBoundingClientRect(); const img=f.querySelector('img');
      return {x:r.left+r.width/2, w:r.width, flip:getComputedStyle(img).transform, src:img.getAttribute('src'),
              natural:img.naturalWidth, count:document.querySelectorAll('.bridge').length}}""")

def view(pg):
    return pg.evaluate("()=>({atlas:!!document.querySelector('.atlas-hero')?.offsetParent, inv:!!document.getElementById('invitation')?.offsetParent, path:location.pathname, len:history.length, plays:(window.__ytLog||[]).filter(x=>x=='play').length, yt:window.__ytPlayer?.state, players:window.__ytPlayers, same:window.__p0?window.__p0===document.getElementById('bgm-player'):null})")

with sync_playwright() as p:
    b = p.chromium.launch()
    mobile = lambda **kw: b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, **kw)

    # ---------- intro: choices and speed ----------
    ctx = mobile(); pg = new_page(ctx)
    pg.goto(BASE, wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    labels = pg.eval_on_selector_all('.unbox-choice', 'els=>els.map(e=>e.textContent.trim())')
    boxes = pg.eval_on_selector_all('.unbox-choice', 'els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.top,r.height,r.width]})')
    check('intro: two choices, stacked, 44px+ touch targets', labels == ['음악과 함께 시작하기 ♪', '음악 없이 시작하기'] and boxes[0][0] < boxes[1][0] and all(h >= 44 for _, h, _ in boxes), f'{labels} {boxes}')
    pg.mouse.click(195, 300); pg.wait_for_timeout(600)
    check('intro: tapping the box itself does not open it or start music', pg.evaluate("document.body.classList.contains('opening') && document.getElementById('unboxing').classList.contains('is-armed')") and pg.evaluate("(window.__ytLog||[]).length") == 0)
    t0 = time.time(); pg.click('#start-without-music')
    pg.wait_for_function("!document.body.classList.contains('opening')", timeout=15000)
    elapsed = time.time() - t0
    check(f'intro: 1.875x original speed (opened in {elapsed:.2f}s; target ~4.56s)', 4.0 < elapsed < 5.4)
    check('intro: "음악 없이" plays nothing and saves OFF', pg.evaluate("(window.__ytLog||[]).filter(x=>x=='play').length") == 0 and pg.evaluate("sessionStorage.getItem('wedding-bgm-choice')") == 'off' and pg.inner_text('.bgm-label') == 'BGM OFF')
    pg.click('#bgm-toggle'); pg.wait_for_timeout(700)
    check('intro: music can still be turned on with the BGM button', pg.inner_text('.bgm-label') == 'BGM ON')
    ctx.close()

    ctx = mobile(); pg = new_page(ctx)
    pg.goto(BASE, wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    pg.click('#start-with-music'); pg.wait_for_timeout(900)
    check('intro: "음악과 함께" plays and saves ON', pg.evaluate("window.__ytPlayer.state") == 1 and pg.evaluate("sessionStorage.getItem('wedding-bgm-choice')") == 'on')
    durations = pg.evaluate("""()=>{const d=s=>getComputedStyle(document.querySelector(s)).transitionDuration; return [d('.unbox-overlay'),d('.unbox-frame'),d('.unbox-signature'),d('.unbox-door')]}""")
    check('intro: CSS durations synchronized at 1.875x', durations[0] == '0.624s' and durations[1] == '0.569s' and durations[2] == '0.374s', durations)
    pg.wait_for_function("!document.body.classList.contains('opening')", timeout=15000)
    pg.evaluate("document.documentElement.style.scrollBehavior='auto'; window.__p0=document.getElementById('bgm-player')")

    # ---------- copy, typography, footer ----------
    check('dress code copy', '흰옷도, 반바지도, 트레이닝복도 환영합니다!' in pg.inner_text('.dress-code-copy') and pg.locator('.dress-code-copy').inner_html().count('<br>') == 1)
    check('trimmed UI copy', all(pg.locator(s).count() == 0 for s in ['.statement','.rsvp-form-heading','.guestbook-paper-top','.guestbook-photo-hint','.guestbook-public-note','.guestbook-gallery-sub']))
    check('RSVP three choice groups still have controls', pg.locator('.rsvp-field--choice').count() == 3 and pg.locator('#rsvp-count-wrap').count() == 1)
    prize = pg.evaluate("(()=>{const e=document.querySelector('.guestbook-prize'),c=getComputedStyle(e);return {t:e.textContent,fs:parseFloat(c.fontSize),fw:c.fontWeight,bg:c.backgroundColor}})()")
    check('guestbook gift-card notice: new copy, own panel, larger text', prize['t'] == '올려주신 결혼식 사진 중 한 장을 선정해상품권을 드립니다!' and prize['fs'] >= 15 and prize['bg'] != 'rgba(0, 0, 0, 0)', prize)
    album = pg.evaluate("(()=>{const e=document.querySelector('.album-cta-type'),c=getComputedStyle(e),h=getComputedStyle(document.querySelector('.atlas-teaser h2'));return {t:e.textContent,ff:c.fontFamily,tt:c.textTransform,fw:c.fontWeight,hf:h.fontFamily,ok:document.fonts.check('40px \"Relationship of Melodrame\"')}})()")
    check('Photo Album. uses the headline face (Relationship of Melodrame), not uppercase', album['t'] == 'Photo Album.' and album['ff'].startswith('"Relationship of Melodrame"') and album['ff'] == album['hf'] and album['tt'] == 'none' and album['fw'] == '400' and not pg.locator('.album-cta-type i').count(), album)
    order = pg.evaluate("(()=>{const y=s=>document.querySelector(s).getBoundingClientRect().top+scrollY;return [y('#guestbook-form'),y('.site-footer-signature .footer-title'),y('.bgm-dock'),y('.footer-actions')]})()")
    check('footer order: Guestbook -> J & S. -> Music -> footer links', order == sorted(order), order)
    check('music card shows no song title or artist', 'L-O-V-E' not in pg.inner_text('.bgm-dock') and 'Olivia' not in pg.inner_text('.bgm-dock'))
    sz = pg.evaluate("(()=>{const r=document.getElementById('bgm-player').getBoundingClientRect();return [r.width,r.height]})()")
    check('player stays at least 200x200', sz[0] >= 200 and sz[1] >= 200, sz)

    # ---------- bridge: Invitation -> Atlas ----------
    pg.evaluate("document.querySelector('a.atlas-feature').scrollIntoView({block:'center'})"); pg.wait_for_timeout(300)
    before = view(pg)
    pg.click('a.atlas-feature'); pg.click('a.atlas-feature', force=True, no_wait_after=True)  # rapid double tap
    pg.wait_for_timeout(180); f1 = flight(pg); v1 = view(pg)
    pg.wait_for_timeout(950); f2 = flight(pg); v2 = view(pg)
    check('bridge →: uses images/airplane-bridge.webp (720px) without mirroring', f1 and f1['src'] == './images/airplane-bridge.webp' and f1['natural'] == 720 and f1['flip'] == 'none', f1)
    check('bridge →: plane flies left to right', f1 and f2 and f2['x'] > f1['x'] + 60, f'{f1} {f2}')
    check('bridge →: plane width 110-150px on mobile', f1 and 110 <= f1['w'] <= 150, f1)
    check('bridge →: view switches at the midpoint, not before', v1['inv'] and not v1['atlas'] and v2['atlas'] and not v2['inv'], f'{v1} {v2}')
    check('bridge →: one overlay only, double tap ignored', f1['count'] == 1 and f2['count'] == 1)
    pg.wait_for_timeout(1050); v3 = view(pg)
    check('bridge →: overlay removed after ~2s; single history entry added', pg.evaluate("document.querySelectorAll('.bridge').length") == 0 and v3['len'] == before['len'] + 1 and v3['path'].endswith('/atlas.html'), v3)
    check('bridge →: music continues (same player, no new play call)', v3['same'] and v3['plays'] == before['plays'] and v3['yt'] == 1 and v3['players'] == 1, v3)
    pg.mouse.wheel(0, 1200); pg.wait_for_timeout(500)
    check('after bridge: Atlas scrolls normally', pg.evaluate("scrollY") > 300)

    # ---------- Atlas content ----------
    check('Atlas title "The Atlas."', pg.inner_text('#atlas-page-title') == 'The Atlas.')
    tb = pg.evaluate("(()=>{const h=document.querySelector('.atlas-toolbar h2'),g=document.querySelector('.atlas-map-guide'),t=document.querySelector('.atlas-tabs');const r=e=>e.getBoundingClientRect();return {h:h.textContent,g:g.textContent,ok:r(h).bottom<=r(g).top+1&&r(g).bottom<=r(t).top+1,fs:parseFloat(getComputedStyle(g).fontSize)}})()")
    check('"Choose a Place" -> guide -> Map/Index, guide 15px', tb['h'] == 'Choose a Place' and tb['g'] == '지도 위 위치를 선택해 사진을 살펴보세요.' and tb['ok'] and tb['fs'] >= 15, tb)
    counts = pg.evaluate("[!!document.getElementById('collection-total'), !!document.getElementById('photo-total'), !!document.getElementById('wedding-total'), document.querySelectorAll('.atlas-index-item').length, !!document.getElementById('details-link'), document.getElementById('place-number').textContent]")
    check('Count UI removed while 10 Index rows and no Details link remain', counts == [False, False, False, 10, False, '01 / 10'], counts)
    caps = pg.evaluate("[document.getElementById('place-title').textContent, ...[...document.querySelectorAll('.atlas-index-title')].map(e=>e.firstChild.textContent), ...[...document.querySelectorAll('.atlas-featured-label')].map(e=>e.textContent)]")
    check('city names in capitals (viewer, Index, Wedding Edit labels)', all(c == c.upper() for c in caps), caps)

    # ---------- bridge: Atlas -> Invitation (link = history.back) ----------
    pg.evaluate("window.scrollTo(0,0)")
    pg.click('.atlas-back'); pg.wait_for_timeout(180); g1 = flight(pg)
    pg.wait_for_timeout(950); g2 = flight(pg); w2 = view(pg)
    check('bridge ←: same image mirrored with scaleX(-1)', g1 and g1['src'] == './images/airplane-bridge.webp' and g1['flip'].startswith('matrix(-1'), g1)
    check('bridge ←: plane flies right to left', g1 and g2 and g2['x'] < g1['x'] - 60, f'{g1} {g2}')
    check('bridge ←: Invitation shown after the midpoint', w2['inv'] and not w2['atlas'], w2)
    pg.wait_for_timeout(1050)
    check('bridge ←: overlay gone, music continues', pg.evaluate("document.querySelectorAll('.bridge').length") == 0 and view(pg)['plays'] == before['plays'] and view(pg)['yt'] == 1)

    # ---------- browser back / forward ----------
    pg.go_forward(); pg.wait_for_timeout(200); fwd = flight(pg); pg.wait_for_timeout(1950)
    check('browser Forward flies left -> right into the Atlas', fwd and fwd['flip'] == 'none' and view(pg)['atlas'], fwd)
    pg.go_back(); pg.wait_for_timeout(200); back = flight(pg); pg.wait_for_timeout(1950)
    check('browser Back flies right -> left to the Invitation', back and back['flip'].startswith('matrix(-1') and view(pg)['inv'], back)
    pg.mouse.wheel(0, -800); pg.wait_for_timeout(500)
    check('after Back: Invitation scrolls, overlay not blocking', pg.evaluate("document.elementFromPoint(195,400)?.closest('.bridge')") is None)
    ctx.close()

    # ---------- reduced motion ----------
    ctx = mobile(reduced_motion='reduce'); pg = new_page(ctx)
    pg.goto(BASE + '#atlas-entry', wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    pg.evaluate("document.querySelector('a.atlas-feature').scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
    pg.click('a.atlas-feature'); pg.wait_for_timeout(250)
    check('reduced motion: no airplane, switches at once', pg.evaluate("document.querySelectorAll('.bridge').length") == 0 and view(pg)['atlas'])
    ctx.close()

    # ---------- bridge failure falls back to plain switching ----------
    ctx = mobile(); pg = new_page(ctx)
    pg.route('**/airplane-bridge.webp', lambda r: r.abort())
    pg.goto(BASE + '#atlas-entry', wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    pg.evaluate("document.querySelector('a.atlas-feature').scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
    pg.click('a.atlas-feature'); pg.wait_for_timeout(900)
    check('plane image unavailable: Atlas still opens without the flight', view(pg)['atlas'] and pg.evaluate("document.querySelectorAll('.bridge').length") == 0)
    ctx.close()
    b.close()

print('\nSUMMARY', sum(results), '/', len(results))
