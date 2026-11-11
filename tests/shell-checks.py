# Browser checks for the app shell (Invitation <-> Atlas in one document, continuous BGM).
#   python3 -m http.server 8765 &  then  python3 tests/shell-checks.py
# Uses Playwright Chromium with a mocked YouTube IFrame API (tests/yt-mock.js); real devices still need a manual check.
import json
from playwright.sync_api import sync_playwright
import os
BASE=os.environ.get('BASE','http://localhost:8765/')
MOCK=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'yt-mock.js')).read()
results=[]
def check(name, cond, extra=''):
    results.append(cond); print(('PASS' if cond else 'FAIL'), name, ('' if cond else extra))
def new_page(ctx, mock=None, block_atlas_fetch=0):
    pg=ctx.new_page(); pg.add_init_script('window.__ytMock=%s;' % json.dumps(mock or {}))
    state={'n':block_atlas_fetch}
    def route(r):
        u=r.request.url
        if u.startswith('https://www.youtube.com/iframe_api'): return r.fulfill(status=200, content_type='text/javascript', body=MOCK)
        if 'localhost' in u:
            if state['n'] and u.split('?')[0].endswith('/atlas.html') and r.request.resource_type=='fetch':
                state['n']-=1; return r.abort()
            return r.continue_()
        return r.abort()
    pg.route('**/*', route)
    pg.on('pageerror', lambda e: (results.append(False), print('PAGEERROR', e)))
    return pg
S=lambda pg: pg.evaluate("""()=>({label:document.querySelector('.bgm-label')?.textContent, state:document.querySelector('.bgm-toggle')?.dataset.state,
 hint:document.querySelector('.bgm-hint.is-visible')?.textContent||'', players:window.__ytPlayers, yt:window.__ytPlayer?.state, t:window.__ytPlayer?.t,
 plays:(window.__ytLog||[]).filter(x=>x=='play').length, pauses:(window.__ytLog||[]).filter(x=>x=='pause').length, path:location.pathname,
 atlasVisible:!!document.querySelector('.atlas-hero')?.offsetParent, invVisible:!!document.getElementById('invitation')?.offsetParent,
 bodyCls:document.body.className, bodyPos:getComputedStyle(document.body).position, sameIframe: window.__p0 ? window.__p0===document.getElementById('bgm-player') && window.__p0.isConnected : null,
 video:document.getElementById('bgm-player')?.dataset.videoId, sy:scrollY})""")
def listeners(pg, sel):
    cdp=pg.context.new_cdp_session(pg)
    obj=cdp.send('Runtime.evaluate',{'expression':f"document.querySelector('{sel}')"})['result']['objectId']
    ls=cdp.send('DOMDebugger.getEventListeners',{'objectId':obj})['listeners']
    return sorted(l['type'] for l in ls)

with sync_playwright() as p:
    b=p.chromium.launch()
    ctxn=lambda: b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)

    ctx=ctxn(); pg=new_page(ctx)
    pg.goto(BASE, wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    pg.mouse.click(195,500); pg.wait_for_timeout(900)
    pg.click('#skip-opening'); pg.wait_for_timeout(400)
    pg.evaluate("window.__p0=document.getElementById('bgm-player')")
    st=S(pg); check('A1 intro tap plays L-O-V-E', st['yt']==1 and st['video']=='5k71Ueu4wG8', st)
    rsvp0=listeners(pg,'#rsvp-form'); gb0=listeners(pg,'#guestbook-form')
    pg.evaluate("document.documentElement.style.scrollBehavior='auto'; document.querySelector('a.atlas-feature').scrollIntoView({block:'center'})"); pg.wait_for_timeout(400)
    sy_before=pg.evaluate('scrollY'); t0=st['t']
    pg.click('a.atlas-feature'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('A2 Invitation→Atlas: same document, URL atlas.html, atlas visible', st['path'].endswith('/atlas.html') and st['atlasVisible'] and not st['invVisible'] and pg.evaluate("!!window.__p0"), st)
    check('A3 music continues: same iframe, no new play/pause, time advancing', st['sameIframe'] and st['players']==1 and st['plays']==1 and st['pauses']==0 and st['yt']==1 and st['t']>t0, st)
    check('A4 atlas at top, body classes swapped', st['sy']==0 and 'atlas-page' in st['bodyCls'] and 'invitation-page' not in st['bodyCls'], st)
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/s1-atlas-top.png')
    # atlas features inside shell
    feats=pg.evaluate("document.querySelectorAll('#wedding-features button').length"); pins=pg.evaluate("document.querySelectorAll('#map-dots button').length")
    check('A5 atlas rendered once (3 featured, 10 pins, 1 lightbox, atlas.js once)', feats==3 and pins==10 and pg.evaluate("document.querySelectorAll('#photo-lightbox').length")==1 and pg.evaluate("document.querySelectorAll('script[src*=\"atlas.js\"]').length")==1, f"{feats} {pins}")
    pg.click('#next-photo'); pg.wait_for_timeout(250); pg.click('#tab-index'); pg.wait_for_timeout(250); pg.click('#tab-map'); pg.wait_for_timeout(250)
    pg.query_selector_all('#map-dots button')[4].click(); pg.wait_for_timeout(500)
    pg.query_selector_all('#wedding-features button')[1].click(); pg.wait_for_timeout(600)
    pg.click('#memory-photo'); pg.wait_for_timeout(300)
    lb=pg.evaluate("({open:document.body.classList.contains('atlas-lightbox-open'), invInert:document.getElementById('invitation').inert, mainInert:document.querySelector('main.atlas-main').inert, dockInert:document.querySelector('.bgm-dock').inert})")
    check('A6 lightbox inerts Atlas main + dock, not the invitation', lb['open'] and lb['mainInert'] and lb['dockInert'] and not lb['invInert'], lb)
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(200)
    # back while lightbox open -> closes lightbox, stays in atlas
    pg.go_back(); pg.wait_for_timeout(600)
    st=S(pg)
    check('A7 back with photo enlarged: photo closes, still Atlas, body not fixed', st['path'].endswith('/atlas.html') and st['atlasVisible'] and st['bodyPos']!='fixed' and 'atlas-lightbox-open' not in st['bodyCls'], st)
    check('A8 music untouched by gallery/lightbox/back', st['sameIframe'] and st['plays']==1 and st['yt']==1, st)
    pg.evaluate("window.scrollTo(0,1200)"); pg.wait_for_timeout(500); atlas_sy=pg.evaluate('scrollY')
    # back via browser
    pg.go_back(); pg.wait_for_timeout(700)
    st=S(pg)
    check('A9 browser back → Invitation, scroll restored to Atlas entry point', st['invVisible'] and not st['atlasVisible'] and abs(st['sy']-sy_before)<2 and not st['path'].endswith('atlas.html'), f"{st} before={sy_before}")
    check('A10 no intro replay, music continues', 'opening' not in st['bodyCls'] and st['sameIframe'] and st['plays']==1 and st['yt']==1, st)
    pg.go_forward(); pg.wait_for_timeout(700)
    st=S(pg)
    check('A11 forward → Atlas at its previous scroll', st['atlasVisible'] and abs(st['sy']-atlas_sy)<2, f"{st} atlas_sy={atlas_sy}")
    # return link
    pg.evaluate("window.scrollTo(0,0)"); pg.click('.atlas-back'); pg.wait_for_timeout(700)
    st=S(pg)
    check('A12 "Return to invitation" link → Invitation (history.back), music continues', st['invVisible'] and abs(st['sy']-sy_before)<2 and st['plays']==1 and st['yt']==1, st)
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/s2-back-invitation.png')
    # OFF then go to atlas: stays off; ON in atlas resumes same position
    pg.click('#bgm-toggle'); pg.wait_for_timeout(300); toff=S(pg)['t']
    pg.click('a.atlas-feature'); pg.wait_for_timeout(700)
    st=S(pg); check('B1 OFF carried into Atlas (no play)', st['label']=='BGM OFF' and st['plays']==1, st)
    pg.click('#bgm-toggle'); pg.wait_for_timeout(700)
    st=S(pg); check('B2 ON in Atlas resumes from paused position', st['label']=='BGM ON' and st['t']>=toff and st['t']-toff<1.2, f"{st} toff={toff}")
    # 20 round trips
    for i in range(20):
        pg.evaluate("window.scrollTo(0,0)"); pg.click('.atlas-back'); pg.wait_for_timeout(250)
        pg.evaluate("document.querySelector('a.atlas-feature').scrollIntoView()"); pg.click('a.atlas-feature'); pg.wait_for_timeout(250)
    st=S(pg)
    check('C1 20 round trips: one player, same iframe, still playing, atlas.js once', st['players']==1 and st['sameIframe'] and st['yt']==1 and pg.evaluate("document.querySelectorAll('script[src*=\"atlas.js\"]').length")==1 and pg.evaluate("document.querySelectorAll('.atlas-header').length")==1, st)
    check('C2 RSVP/Guestbook listeners unchanged', listeners(pg,'#rsvp-form')==rsvp0 and listeners(pg,'#guestbook-form')==gb0, f"{rsvp0} {listeners(pg,'#rsvp-form')}")
    check('C3 no pageerrors so far', all(results))
    pg.evaluate("window.scrollTo(0,0)"); pg.click('.atlas-back'); pg.wait_for_timeout(500)
    pg.mouse.wheel(0,1500); pg.wait_for_timeout(500)
    check('C4 invitation still scrolls after trips', pg.evaluate('scrollY')>sy_before+500 or pg.evaluate('scrollY')!=sy_before)
    # footer & dock
    pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); pg.wait_for_timeout(400)
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/s3-inv-footer.png')
    sz=pg.evaluate("(()=>{const r=document.getElementById('bgm-player').getBoundingClientRect();return [r.width,r.height]})()")
    check('C5 player >= 200x200', sz[0]>=200 and sz[1]>=200, sz)
    # footer OUR ATLAS link also routes
    pg.click('.footer-actions a'); pg.wait_for_timeout(500)
    st=S(pg); check('C6 footer OUR ATLAS link opens Atlas in-document', st['atlasVisible'] and st['sameIframe'], st)
    pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); pg.wait_for_timeout(400); pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/s4-atlas-footer.png')
    # refresh on atlas URL -> standalone atlas.html
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    st=S(pg); check('D1 refresh on /atlas.html loads standalone Atlas (new document) with L-O-V-E', pg.evaluate("document.body.dataset.bgmPage")=='atlas' and st['video']=='5k71Ueu4wG8' and st['atlasVisible'], st)
    check('D2 refresh: player at bottom not visible → no autoplay, resume hint (choice ON)', st['plays']==0 and 'resume' in st['hint'], st)
    pg.click('.atlas-back'); pg.wait_for_load_state('domcontentloaded'); pg.wait_for_timeout(1000)
    st=S(pg); check('D3 standalone Atlas → Invitation is a normal page load (allowed break), intro skipped', pg.evaluate("document.body.dataset.bgmPage")=='invitation' and 'opening' not in st['bodyCls'], st)
    ctx.close()

    # fetch failure fallback
    ctx=ctxn(); pg=new_page(ctx, block_atlas_fetch=1)
    pg.goto(BASE, wait_until='domcontentloaded'); pg.wait_for_timeout(900); pg.click('#skip-opening'); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('a.atlas-feature').scrollIntoView()"); pg.click('a.atlas-feature'); pg.wait_for_timeout(1500)
    check('E1 Atlas fetch fails → falls back to normal page load', pg.evaluate("document.body.dataset.bgmPage")=='atlas' and pg.evaluate("location.pathname").endswith('/atlas.html'))
    ctx.close()

    # Desktop
    ctx=b.new_context(viewport={'width':1280,'height':800}); pg=new_page(ctx)
    pg.goto(BASE, wait_until='domcontentloaded'); pg.wait_for_timeout(800); pg.click('#skip-opening'); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('a.atlas-feature').scrollIntoView()"); pg.click('a.atlas-feature'); pg.wait_for_timeout(1200)
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/s5-desktop-atlas.png')
    check('F1 desktop atlas renders map route', pg.evaluate("document.getElementById('map-pairs').getAttribute('d').length")>10)
    ctx.close()
    b.close()
print('\nSUMMARY', sum(results), '/', len(results))
