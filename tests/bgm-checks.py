# Browser checks for the BGM toggle. Run from the repo root:
#   python3 -m http.server 8765 &  then  python3 tests/bgm-checks.py
# Uses Playwright Chromium with a mocked YouTube IFrame API (tests/yt-mock.js); real devices still need a manual check.
import json, time
from playwright.sync_api import sync_playwright
import os
BASE=os.environ.get('BASE','http://localhost:8765/')
MOCK=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'yt-mock.js')).read()
results=[]
def check(name, cond, extra=''):
    results.append((('PASS' if cond else 'FAIL'), name, extra)); print(('PASS' if cond else 'FAIL'), name, extra)

def new_page(ctx, mock=None, api='mock'):
    pg=ctx.new_page()
    pg.add_init_script('window.__ytMock=%s;' % json.dumps(mock or {}))
    def route(r):
        u=r.request.url
        if u.startswith('https://www.youtube.com/iframe_api'):
            if api=='mock': return r.fulfill(status=200, content_type='text/javascript', body=MOCK)
            return r.abort()
        if 'localhost' in u: return r.continue_()
        return r.abort()
    pg.route('**/*', route)
    pg.on('pageerror', lambda e: results.append(('FAIL','pageerror',str(e))) or print('PAGEERROR', e))
    return pg

S=lambda pg: pg.evaluate("()=>({label:document.querySelector('.bgm-label')?.textContent, state:document.querySelector('.bgm-toggle')?.dataset.state, hint:document.querySelector('.bgm-hint.is-visible')?.textContent||'', players:window.__ytPlayers, ytstate:window.__ytPlayer?.state, vol:window.__ytPlayer?.vol, t:window.__ytPlayer?.t, log:(window.__ytLog||[]).join(','), choice:sessionStorage.getItem('wedding-bgm-choice'), opening:document.body.classList.contains('opening'), btnVisible:!!document.querySelector('.bgm-toggle')?.offsetParent})")

with sync_playwright() as p:
    b=p.chromium.launch()
    def ctxn(): return b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)

    # 1. Fresh session: intro waits, tap starts unboxing + music
    ctx=ctxn(); pg=new_page(ctx)
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1600)
    st=S(pg)
    armed=pg.evaluate("()=>document.getElementById('unboxing').classList.contains('is-armed')")
    tapOpacity=pg.evaluate("()=>getComputedStyle(document.getElementById('unbox-tap')).opacity")
    check('1a intro armed, waits for tap', armed and st['opening'], f"tapOpacity={tapOpacity}")
    check('1b new session choice empty, no autoplay', st['choice'] is None and 'play' not in st['log'])
    check('1c button hidden during intro', not st['btnVisible'])
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/01-intro-armed.png')
    pg.wait_for_timeout(2000)
    check('1d unboxing does not start on its own', pg.evaluate("()=>document.querySelectorAll('.unbox-frame.active').length===1 && document.querySelectorAll('.unbox-frame')[0].classList.contains('active')"))
    pg.mouse.click(195, 500)
    pg.wait_for_timeout(1300)
    st=S(pg)
    check('1e tap -> play requested and playing', st['state']=='playing' and st['ytstate']==1, str(st))
    check('1f volume 40', st['vol']==40)
    check('1g loop params', pg.evaluate("()=>document.getElementById('bgm-player').dataset.loop")=='1/5k71Ueu4wG8')
    check('1h unboxing frames advancing', pg.evaluate("()=>document.querySelectorAll('.unbox-frame')[1].classList.contains('active')"))
    pg.wait_for_timeout(7600)
    st=S(pg)
    check('1i opening ended, button visible BGM ON', (not st['opening']) and st['btnVisible'] and st['label']=='BGM ON', str(st))
    check('1j choice saved on', st['choice']=='on')
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/02-cover-button.png')
    # scroll + fixed button
    r0=pg.evaluate("()=>document.querySelector('.bgm-toggle').getBoundingClientRect().top")
    pg.mouse.wheel(0,2500); pg.wait_for_timeout(900)
    sy=pg.evaluate("()=>scrollY"); r1=pg.evaluate("()=>document.querySelector('.bgm-toggle').getBoundingClientRect().top")
    check('1k page scrolls, button fixed', sy>1000 and abs(r0-r1)<1, f"scrollY={sy} top {r0}->{r1}")
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/03-scrolled.png')
    # 2. OFF/ON resume position, rapid toggles
    pg.click('#bgm-toggle'); pg.wait_for_timeout(400)
    st=S(pg); t_off=st['t']
    check('2a OFF pauses', st['label']=='BGM OFF' and st['ytstate']==2 and st['choice']=='off', str(st))
    pg.wait_for_timeout(1000)
    pg.click('#bgm-toggle'); pg.wait_for_timeout(700)
    st=S(pg)
    check('2b ON resumes from paused position', st['label']=='BGM ON' and st['t']>=t_off and st['t']-t_off<1.0, f"t_off={t_off} t={st['t']}")
    for i in range(7): pg.click('#bgm-toggle'); pg.wait_for_timeout(60)
    pg.wait_for_timeout(1200); st=S(pg)
    check('2c rapid toggles: single player, button matches player', st['players']==1 and ((st['label']=='BGM ON')==(st['ytstate']==1)), str(st))
    if st['label']!='BGM ON': pg.click('#bgm-toggle'); pg.wait_for_timeout(700)
    # footer card size
    sz=pg.evaluate("()=>{const r=document.getElementById('bgm-player').getBoundingClientRect();return [r.width,r.height]}")
    check('2d invitation player >= 200x200', sz[0]>=200 and sz[1]>=200, str(sz))
    pg.evaluate("()=>document.querySelector('.site-footer').scrollIntoView()"); pg.wait_for_timeout(500)
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/04-footer-card.png')
    # 3. to Atlas with ON (browser allows)
    pg.evaluate("()=>document.querySelector('a.atlas-feature').scrollIntoView({block:'center'})"); pg.wait_for_timeout(300)
    pg.click('a.atlas-feature'); pg.wait_for_load_state('domcontentloaded'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('3a atlas view: same L-O-V-E keeps playing, no new play call', st['state']=='playing' and pg.evaluate("()=>document.getElementById('bgm-player').dataset.videoId")=='5k71Ueu4wG8' and st['log'].endswith('play') and pg.evaluate("()=>location.pathname").endswith('/atlas.html'), str(st))
    check('3b atlas button visible on entry', st['btnVisible'])
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/05-atlas-top.png')
    # 4. Atlas internal navigation keeps music
    plays_before=st['log'].count('play'); t0=st['t']
    for sel in ['#next-photo','#next-photo','#prev-photo','#tab-index','#tab-map']:
        try: pg.click(sel, timeout=2000); pg.wait_for_timeout(250)
        except Exception as e: print('skip',sel,e)
    pins=pg.query_selector_all('#map-dots button')
    if len(pins)>2: pins[2].click(); pg.wait_for_timeout(400)
    pg.click('#memory-photo'); pg.wait_for_timeout(400); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300); pg.click('#close-lightbox'); pg.wait_for_timeout(300)
    st=S(pg)
    check('4a atlas gallery/city/lightbox: same player, no restart', st['players']==1 and st['ytstate']==1 and st['log'].count('play')==plays_before and st['t']>t0, str(st))
    # 5. back to invitation with ON
    pg.evaluate("()=>window.scrollTo(0,0)"); pg.click('.atlas-back'); pg.wait_for_load_state('domcontentloaded'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('5a return: intro skipped, invitation track, choice kept', (not st['opening']) and st['choice']=='on' and pg.evaluate("()=>document.getElementById('bgm-player').dataset.videoId")=='5k71Ueu4wG8', str(st))
    check('5b return: music still playing (same document)', st['label']=='BGM ON' and st['ytstate']==1, str(st))
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/06-return-hint.png')
    pg.click('#bgm-toggle'); pg.wait_for_timeout(400); pg.click('#bgm-toggle'); pg.wait_for_timeout(700)
    check('5c return: OFF/ON still works', S(pg)['label']=='BGM ON')
    ctx.close()

    # 6. Atlas autoplay blocked
    ctx=ctxn(); pg=new_page(ctx, {'block':True})
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    pg.mouse.click(195,500); pg.wait_for_timeout(1000)
    check('6a intro tap plays even in blocking browser (gesture)', S(pg)['ytstate']==1)
    pg.click('#skip-opening'); pg.wait_for_timeout(300)
    pg.goto(BASE+'atlas.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('6b direct atlas.html load: no autoplay (player off-screen), OFF + resume hint, choice still on', st['label']=='BGM OFF' and 'resume' in st['hint'] and st['choice']=='on', str(st))
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/07-atlas-blocked.png')
    pg.click('#bgm-toggle'); pg.wait_for_timeout(800)
    check('6c tap after block plays', S(pg)['label']=='BGM ON')
    ctx.close()

    # 7. OFF choice carried to Atlas
    ctx=ctxn(); pg=new_page(ctx)
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(900)
    pg.mouse.click(195,500); pg.wait_for_timeout(900); pg.click('#skip-opening'); pg.wait_for_timeout(300)
    pg.click('#bgm-toggle'); pg.wait_for_timeout(400)
    pg.goto(BASE+'atlas.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('7a OFF choice: atlas does not autoplay, shows OFF', st['label']=='BGM OFF' and 'play' not in st['log'], str(st))
    pg.click('#bgm-toggle'); pg.wait_for_timeout(800)
    check('7b tap plays atlas track', S(pg)['label']=='BGM ON')
    pg.click('#bgm-toggle'); pg.wait_for_timeout(300)
    # reload invitation with explicit off -> prompt without music
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1200)
    txt=pg.inner_text('#unbox-tap')
    pg.mouse.click(195,500); pg.wait_for_timeout(900)
    st=S(pg)
    check('7c refresh with OFF: prompt says Tap to open, unboxing runs, no music', txt=='Tap to open' and 'play' not in st['log'] and pg.evaluate("()=>document.querySelectorAll('.unbox-frame')[1].classList.contains('active')"), txt+' '+str(st))
    ctx.close()

    # 8. Refresh with ON in same session
    ctx=ctxn(); pg=new_page(ctx)
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(900); pg.mouse.click(195,500); pg.wait_for_timeout(900)
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('8a refresh (ON): intro waits again, no autoplay before tap', st['opening'] and 'play' not in st['log'] and st['choice']=='on', str(st))
    pg.mouse.click(195,500); pg.wait_for_timeout(900)
    check('8b tap plays', S(pg)['ytstate']==1)
    # background / foreground
    pg.click('#skip-opening'); pg.wait_for_timeout(300)
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))}"); pg.wait_for_timeout(300)
    st=S(pg)
    check('8c background: paused, choice kept', st['ytstate']==2 and st['choice']=='on', str(st))
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))}"); pg.wait_for_timeout(800)
    st=S(pg)
    check('8d foreground: player off-screen -> OFF + resume hint (no silent autoplay)', st['label']=='BGM OFF' and 'resume' in st['hint'], str(st))
    ctx.close()

    # 9. API load failure
    ctx=ctxn(); pg=new_page(ctx, api='fail')
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(800)
    pg.mouse.click(195,500); pg.wait_for_timeout(8600)
    st=S(pg)
    check('9a API blocked: unboxing completes, button OFF', (not st['opening']) and st['label']=='BGM OFF' and st['btnVisible'], str(st))
    pg.click('#bgm-toggle'); pg.wait_for_timeout(500)
    st=S(pg)
    check('9b retry tap keeps page working (pending/error, no crash)', st['label']=='BGM OFF', str(st)+' scripts='+str(pg.evaluate("()=>document.querySelectorAll('script[data-bgm-api]').length")))
    pg.mouse.wheel(0,1500); pg.wait_for_timeout(600)
    check('9c page still scrolls', pg.evaluate("()=>scrollY")>500)
    ctx.close()

    # 10. Embed restricted
    ctx=ctxn(); pg=new_page(ctx, {'error':150})
    pg.goto(BASE+'atlas.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1000)
    pg.click('#bgm-toggle'); pg.wait_for_timeout(500)
    st=S(pg)
    check('10a embed error 150 -> OFF + unavailable message', st['label']=='BGM OFF' and st['state']=='unavailable' and '재생할 수 없' in st['hint'], str(st))
    ctx.close()

    # 11. Skip before tap: no music; replay doesn't re-request
    ctx=ctxn(); pg=new_page(ctx)
    pg.goto(BASE+'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1000)
    pg.click('#skip-opening'); pg.wait_for_timeout(400)
    st=S(pg)
    check('11a skip before tap: intro closes, no music, button OFF', (not st['opening']) and 'play' not in st['log'] and st['btnVisible'] and st['label']=='BGM OFF', str(st))
    pg.evaluate("()=>document.getElementById('replay-opening').scrollIntoView()")
    pg.click('#replay-opening'); pg.wait_for_timeout(1500)
    st=S(pg)
    check('11b replay intro runs without tap gate and no music request', st['opening'] and 'play' not in st['log'] and pg.evaluate("()=>document.querySelectorAll('.unbox-frame')[1].classList.contains('active')"), str(st))
    ctx.close()

    # 12. desktop width screenshot
    ctx=b.new_context(viewport={'width':1280,'height':800}); pg=new_page(ctx)
    pg.goto(BASE+'atlas.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1200); pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/08-atlas-desktop.png')
    ctx.close()
    b.close()
print('\nSUMMARY', sum(r[0]=='PASS' for r in results), '/', len(results))
