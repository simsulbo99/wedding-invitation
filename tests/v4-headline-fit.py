# Measure the fit of "Our Story in Pictures." at candidate font sizes on the live layout.
#   LD_LIBRARY_PATH=/workspace/.tmp/atklibs/usr/lib/x86_64-linux-gnu \
#   PLAYWRIGHT_BROWSERS_PATH=/workspace/.pw-browsers python3 tests/v4-headline-fit.py
import json, os, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'https://simsulbo99.github.io/wedding-invitation/')

def enter(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    try:
        pg.wait_for_selector('#unbox-choices button', timeout=15000)
        pg.get_by_role('button', name=re.compile('음악 없이 시작하기')).click(timeout=8000)
        pg.wait_for_function("() => document.getElementById('unboxing')?.hidden === true", timeout=20000)
    except Exception:
        pass
    pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(360, 780), (390, 844), (430, 932), (768, 900), (900, 900), (1440, 900), (1920, 1000)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 700, has_touch=w < 700)
        pg = ctx.new_page()
        pg.route('**/*', lambda r: r.abort() if ('youtube.com' in r.request.url or 'ytimg.com' in r.request.url) else r.continue_())
        enter(pg)
        data = pg.evaluate("""() => {
          const h2 = document.getElementById('atlas-title');
          if (!h2) return {error: 'no headline'};
          const box = h2.getBoundingClientRect();
          const base = parseFloat(getComputedStyle(h2).fontSize);
          const out = {vw: innerWidth, current: base, boxW: box.width, colW: h2.parentElement.getBoundingClientRect().width, rows: []};
          for (const size of [46, 56, 68, 78, 88, 96, 106, 116, 130, 145, 160, 175, 194]) {
            h2.style.fontSize = size + 'px';
            const r = h2.getBoundingClientRect();
            out.rows.push({size: size, scrollW: Math.round(h2.scrollWidth), clientW: Math.round(h2.clientWidth),
                           h: Math.round(r.height), overflow: h2.scrollWidth > h2.clientWidth + 1});
          }
          h2.style.fontSize = '';
          // widest word widths via Range on text nodes
          const rng = document.createRange();
          const words = [];
          const walker = document.createTreeWalker(h2, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const t = walker.currentNode;
            rng.selectNodeContents(t);
            words.push({text: t.textContent.trim(), w: Math.round(rng.getBoundingClientRect().width)});
          }
          out.words = words;
          return out;
        }""")
        print(json.dumps(data, ensure_ascii=False))
        ctx.close()
    b.close()
