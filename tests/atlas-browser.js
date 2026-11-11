'use strict';
const frame = document.querySelector('#preview');
const output = document.querySelector('#results');
const status = document.querySelector('#status');
const params = new URLSearchParams(location.search);
const widthSelect = document.querySelector('#width');
if (params.has('width')) widthSelect.value = params.get('width');
frame.style.width = widthSelect.value + 'px';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (condition, label, timeout = 8000) => {
  const end = performance.now() + timeout;
  while (!condition()) { if (performance.now() > end) throw Error('Timeout: ' + label); await delay(30); }
};
const doc = () => frame.contentDocument;
const el = id => doc().getElementById(id);
const click = id => el(id).click();
const loaded = () => waitFor(() => el('memory-photo')?.dataset.loadState === 'loaded', 'main image');
const reset = async width => {
  frame.style.width = width + 'px';
  await new Promise(resolve => { frame.onload = resolve; frame.src = '../atlas.html?qa=' + Date.now(); });
  await loaded();
  await frame.contentDocument.fonts.ready;
  await delay(300);
};
const key = (target, value, shift = false) => target.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {key:value,shiftKey:shift,bubbles:true,cancelable:true}));
const swipe = (target, dx, dy = 0) => {
  const win = frame.contentWindow;
  const touch = (x,y) => new win.Touch({identifier:1,target,clientX:x,clientY:y});
  target.dispatchEvent(new win.TouchEvent('touchstart',{touches:[touch(150,150)],bubbles:true}));
  target.dispatchEvent(new win.TouchEvent('touchend',{touches:[],changedTouches:[touch(150+dx,150+dy)],bubbles:true}));
};
let pass = 0, fail = 0;
const assert = (condition, label) => {
  if (condition) pass++; else fail++;
  output.textContent += `${condition ? 'PASS' : 'FAIL'} ${label}\n`;
};
async function run() {
  pass = fail = 0; output.textContent = ''; status.textContent = 'Running…';
  document.querySelector('#run').disabled = true;
  try {
    for (const width of params.has('runWidth') ? [Number(params.get('runWidth'))] : [360,390,430,861,1024,1440]) {
      await reset(width);
      const win = frame.contentWindow, data = win.ATLAS_DATA;
      const check = (ok,label) => assert(ok, `${width}px — ${label}`);
      const current = () => el('photo-viewer').dataset.collection;
      check(current() === 'wedding-seoul' && el('memory-count').textContent === '01 / 12', 'default Wedding Seoul, first photo');
      check(win.scrollY === 0, 'no initial automatic page scroll');
      check(data.collections.length === 11 && data.collections.reduce((a,c) => a+c.photos.length,0) === 166, '11 collections / 166 photos');
      check(['wedding','travel','details'].map(g=>data.collections.filter(c=>c.group===g).reduce((a,c)=>a+c.photos.length,0)).join() === '43,120,3', 'group counts 43 / 120 / 3');
      const requests = win.performance.getEntriesByType('resource').map(e=>decodeURI(e.name));
      const originals = requests.filter(name=>/\/images\/(?:1-[123]\.|[2-9]\.)[^/]*\/.*\.jpg$/.test(name));
      check(originals.length <= 2 && originals.every(p=>p.includes('WS_Seoul_0')), `initial original-image requests limited (${originals.length})`);
      check(!requests.some(p=>p.includes('api.github.com')), 'no browser GitHub API call');
      check(doc().documentElement.scrollWidth <= win.innerWidth, 'no page horizontal overflow');
      const pins = [...doc().querySelectorAll('.atlas-pin')];
      check(pins.length === 10 && !pins.some(p=>p.dataset.collection==='details'), '10 map pins; no Details pin');
      const rects = pins.map(p=>p.getBoundingClientRect());
      check(rects.every(r=>r.width>=44 && r.height>=44), '44×44px marker hit targets');
      const map = el('map-holder').getBoundingClientRect();
      check(rects.every(r=>r.left>=map.left && r.right<=map.right && r.top>=map.top && r.bottom<=map.bottom), 'all marker hit targets inside map');
      check(rects.every((a,i)=>rects.every((b,j)=>i===j || Math.min(a.right,b.right)-Math.max(a.left,b.left)<=0 || Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=0)), 'no overlapping marker hit targets (including Tokyo/Karuizawa)');
      check([...doc().querySelectorAll('.atlas-featured-item img')].every(img=>img.complete&&img.naturalWidth===560), '3 featured photos decoded');
      for (const c of data.collections.filter(c=>c.group==='wedding')) {
        doc().querySelector(`.atlas-featured-item[data-collection="${c.id}"]`).click();
        await loaded(); await delay(850);
        check(current() === c.id && el('memory-count').textContent.startsWith('01 /'), `${c.id} featured selection resets to first photo`);
        check(el('photo-viewer').getBoundingClientRect().top < 140, `featured action reveals viewer (top ${Math.round(el('photo-viewer').getBoundingClientRect().top)})`);
      }
      click('tab-map');
      for (const pin of pins) {
        pin.click(); await loaded();
        const row = doc().querySelector(`.atlas-index-item[data-collection="${pin.dataset.collection}"]`);
        check(current() === pin.dataset.collection && pin.getAttribute('aria-pressed')==='true' && row.getAttribute('aria-pressed')==='true', `${pin.dataset.collection} independent marker + Index sync`);
      }
      click('tab-index');
      for (const c of data.collections) {
        doc().querySelector(`.atlas-index-item[data-collection="${c.id}"]`).click(); await loaded();
        check(current()===c.id && el('filmstrip').children.length===c.photos.length, `${c.id} Index + full filmstrip`);
        el('filmstrip').lastElementChild.click(); await loaded(); await delay(700);
        check(el('memory-count').textContent===`${String(c.photos.length).padStart(2,'0')} / ${String(c.photos.length).padStart(2,'0')}`, `${c.id} last thumbnail selects photo (${current()}, ${el('memory-count').textContent})`);
        const active = el('filmstrip').lastElementChild.getBoundingClientRect(), strip = el('filmstrip').getBoundingClientRect();
        check(active.left>=strip.left-1 && active.right<=strip.right+1, `${c.id} active thumbnail visible`);
        const scroll = win.scrollY;
        click('next-photo'); await loaded();
        check(el('memory-count').textContent.startsWith('01 /'), `${c.id} next wraps to first`);
        click('prev-photo'); await loaded();
        check(el('memory-count').textContent.startsWith(String(c.photos.length).padStart(2,'0')+' /'), `${c.id} previous wraps to last`);
        check(Math.abs(win.scrollY-scroll)<2, `${c.id} photo navigation preserves page scroll`);
      }
      check(!el('map-route-line').getAttribute('d'), 'Details clears route');
      click('tab-map');
      check(doc().querySelectorAll('.atlas-pin.is-selected').length===0, 'Details clears marker selection');
      click('details-link'); await loaded();
      check(current()==='details', 'Details discoverable from map');
      doc().querySelector('.atlas-featured-item[data-collection="wedding-sapa"]').click(); await loaded(); await delay(850);
      check(el('memory-image').naturalWidth>el('memory-image').naturalHeight && win.getComputedStyle(el('memory-image')).objectFit==='contain', 'landscape photograph is contained');
      click('next-photo');await loaded();
      check(el('memory-image').naturalHeight>el('memory-image').naturalWidth && win.getComputedStyle(el('memory-image')).objectFit==='contain', 'portrait photograph is contained');
      const scroll = win.scrollY;
      el('memory-photo').focus({preventScroll:true}); click('memory-photo');
      check(el('photo-lightbox').classList.contains('is-open') && doc().body.classList.contains('atlas-lightbox-open') && doc().activeElement===el('close-lightbox'), 'lightbox opens, locks and focuses');
      key(el('close-lightbox'),'ArrowRight'); await loaded();
      check(el('memory-count').textContent==='03 / 24' && el('lightbox-image').src===el('memory-image').src, 'lightbox arrow key + viewer sync');
      click('lightbox-next'); await loaded();
      click('lightbox-prev'); await loaded();
      check(el('memory-count').textContent==='03 / 24', 'lightbox buttons');
      key(el('close-lightbox'),'Tab',true);
      check(doc().activeElement===el('lightbox-next'), 'lightbox focus trap');
      key(el('lightbox-next'),'Escape');
      check(!doc().body.classList.contains('atlas-lightbox-open') && !doc().querySelector('main').inert && doc().activeElement===el('memory-photo') && Math.abs(win.scrollY-scroll)<2, 'Escape restores focus, scroll and page access');
      swipe(el('memory-photo'),-90);await loaded();
      check(el('memory-count').textContent==='04 / 24', 'main horizontal swipe');
      click('memory-photo');
      check(!el('photo-lightbox').classList.contains('is-open'), 'swipe does not accidentally open lightbox');
      swipe(el('memory-photo'),10,100);
      check(el('memory-count').textContent==='04 / 24', 'vertical gesture does not change photo');
      await delay(550);click('memory-photo');swipe(el('lightbox-image'),90);await loaded();
      check(el('memory-count').textContent==='03 / 24', 'lightbox horizontal swipe');
      click('close-lightbox');
      el('filmstrip').children[2].focus({preventScroll:true});key(el('filmstrip').children[2],'End');await loaded();
      check(el('memory-count').textContent==='24 / 24', 'filmstrip keyboard End');
      key(doc().activeElement,'Home');await loaded();
      check(el('memory-count').textContent==='01 / 24', 'filmstrip keyboard Home');
      key(el('tab-map'),'ArrowRight');
      check(el('tab-index').getAttribute('aria-selected')==='true' && el('map-view').hidden, 'keyboard Map/Index switching');
      check(doc().documentElement.scrollWidth<=win.innerWidth, 'no overflow after all navigation');
      check([...doc().querySelectorAll('.atlas-back,.atlas-footer a')].every(a=>a.getAttribute('href')==='./index.html#atlas-entry'), 'both invitation return links');
      const pathResponse=await fetch('../index.html');
      check(pathResponse.ok && (await pathResponse.text()).includes('id="atlas-entry"'), 'return destination and anchor exist');
      const broken=[...doc().images].filter(img=>img.getAttribute('src')&&img.complete&&!img.naturalWidth);
      check(broken.length===0, 'no broken loaded images');
    }
    const data = frame.contentWindow.ATLAS_DATA;
    const paths = ['atlas.html','atlas.js','atlas-data.js','atlas.css','atlas-typography.css','style.css','images/atlas-map.svg','fonts/relationship-of-melodrame.woff2','index.html'];
    const originals = [];
    for (const c of data.collections) {
      for (const p of c.photos) {
        const source = c.folder + '/' + p.file;
        originals.push(source); paths.push(source, `images/atlas-thumbs/${c.id}/${p.file.replace(/\.[^.]+$/, '.webp')}`);
      }
      if(c.group==='wedding') paths.push(`images/atlas-featured/${c.id}.webp`);
    }
    let httpFailures = [];
    for(let i=0;i<paths.length;i+=8) await Promise.all(paths.slice(i,i+8).map(async path=>{
      const response = await fetch('../'+path.split('/').map(encodeURIComponent).join('/'), {method:'HEAD'});
      if(!response.ok) httpFailures.push(path+': '+response.status);
    }));
    assert(!httpFailures.length, `${paths.length} local HTTP paths: ${httpFailures.length ? httpFailures.join(', ') : 'all 200'}`);
    let decodeFailures=[];
    for(let i=0;i<originals.length;i+=4) await Promise.all(originals.slice(i,i+4).map(async path=>{
      const img = new Image();
      img.src='../'+path.split('/').map(encodeURIComponent).join('/');
      try {await img.decode();} catch {decodeFailures.push(path);}
    }));
    assert(!decodeFailures.length, `166 original JPGs decode in Chromium: ${decodeFailures.length ? decodeFailures.join(', ') : 'all passed'}`);
  } catch(error) { assert(false,error.stack); }
  status.textContent = `Complete: ${pass} passed, ${fail} failed`;
  output.textContent += '\n'+status.textContent;
  document.querySelector('#run').disabled = false;
}
document.querySelector('#run').addEventListener('click',run);
document.querySelector('#reset').addEventListener('click',()=>reset(Number(widthSelect.value)));
widthSelect.addEventListener('change',()=>reset(Number(widthSelect.value)));
document.querySelector('#index').addEventListener('click',()=>{click('tab-index');el('explore').scrollIntoView();});
document.querySelector('#viewer').addEventListener('click',()=>el('photo-viewer').scrollIntoView());
document.querySelector('#landscape').addEventListener('click',()=>doc().querySelector('.atlas-featured-item[data-collection="wedding-sapa"]').click());
if(params.has('capture')) {
  document.body.classList.add('capture');
  frame.onload = async()=>{
    await loaded(); await doc().fonts.ready;
    if(params.get('capture')==='index') click('tab-index');
    if(params.get('capture')==='landscape') doc().querySelector('.atlas-featured-item[data-collection="wedding-sapa"]').click();
    await loaded(); await delay(800);
    for(let i=0;i<3;i++) { frame.style.height=doc().documentElement.scrollHeight+'px'; await delay(100); }
    frame.contentWindow.scrollTo({top:0,behavior:'instant'});
    document.body.dataset.captureReady = 'true';
  };
}
