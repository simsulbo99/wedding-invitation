'use strict';
/* App shell for index.html: the Atlas opens as a view of this same document, so the shared
   BGM player (bgm.js) keeps playing between the invitation and the Atlas.
   - The invitation DOM is only hidden, never removed (RSVP / Guestbook listeners stay single).
   - atlas.html is fetched once, its header/main/footer/lightbox are mounted once, and its
     scripts run once. atlas.html itself stays a normal page for direct links and refreshes.
   - The music card and its iframe are never moved, hidden or told to play/pause here.
   - If anything fails, the link falls back to a normal page load (music then restarts). */
(() => {
  const body = document.body;
  const atlasSlot = document.getElementById('atlas-view');
  const atlasFooterSlot = document.getElementById('atlas-footer-slot');
  if (!atlasSlot || !atlasFooterSlot || !window.fetch || !window.DOMParser || !history.pushState) return;

  const ATLAS_URL = new URL('./atlas.html', location.href);
  const HOME_URL = new URL(location.pathname + location.search, location.href);
  const SKIP_SCRIPTS = /(?:^|\/)(?:bgm|app-shell)\.js(?:\?|$)/;
  const titles = { invitation: document.title, atlas: document.title };
  const themes = { invitation: null, atlas: null };
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themes.invitation = themes.atlas = themeMeta.content;

  let view = 'invitation';
  let mounted = false;
  let mountPromise = null;
  let htmlPromise = null;
  let busy = false;

  const viewOf = url => (url.pathname === ATLAS_URL.pathname ? 'atlas' : 'invitation');
  const isHome = url => url.pathname === HOME_URL.pathname
    || url.pathname === new URL('./', HOME_URL).pathname
    || url.pathname === new URL('./index.html', HOME_URL).pathname;

  function jumpTo(top) {
    // Bypass html { scroll-behavior: smooth } only for this restore (same approach as atlas.js closeLightbox).
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, top || 0));
    root.style.scrollBehavior = previous;
  }
  function rememberScroll() {
    try { history.replaceState({ ...(history.state || {}), shell: view, scroll: window.scrollY }, ''); } catch (e) { /* ignore */ }
  }

  // ---------- mounting the Atlas ----------
  function fetchAtlas() {
    if (!htmlPromise) {
      htmlPromise = fetch(ATLAS_URL.href, { credentials: 'same-origin' })
        .then(response => { if (!response.ok) throw new Error('atlas ' + response.status); return response.text(); })
        .catch(error => { htmlPromise = null; throw error; });
    }
    return htmlPromise;
  }
  const sameFile = (a, b) => new URL(a, location.href).pathname === new URL(b, location.href).pathname;
  function addStylesheet(href) {
    const present = [...document.querySelectorAll('link[rel="stylesheet"]')].some(link => sameFile(link.getAttribute('href'), href));
    if (present) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }
  function addScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('script ' + src));
      document.body.appendChild(script);
    });
  }
  function mountAtlas() {
    if (mounted) return Promise.resolve();
    if (mountPromise) return mountPromise;
    mountPromise = (async () => {
      const doc = new DOMParser().parseFromString(await fetchAtlas(), 'text/html');
      const header = doc.querySelector('.atlas-header');
      const main = doc.querySelector('main.atlas-main');
      const footer = doc.querySelector('.atlas-footer');
      const lightbox = doc.getElementById('photo-lightbox');
      if (!header || !main || !footer || !lightbox) throw new Error('atlas markup');
      titles.atlas = doc.title || titles.atlas;
      themes.atlas = doc.querySelector('meta[name="theme-color"]')?.content || themes.atlas;
      await Promise.all([...doc.querySelectorAll('link[rel="stylesheet"]')].map(link => addStylesheet(link.getAttribute('href'))));
      atlasSlot.append(document.adoptNode(header), document.adoptNode(main), document.adoptNode(lightbox));
      atlasFooterSlot.append(document.adoptNode(footer));
      mounted = true;
      // atlas.js expects its DOM on first run; it runs exactly once, in atlas.html's order.
      for (const script of doc.querySelectorAll('script[src]')) {
        const src = script.getAttribute('src');
        if (!SKIP_SCRIPTS.test(src)) await addScript(src);
      }
    })().catch(error => { mountPromise = null; throw error; });
    return mountPromise;
  }

  // ---------- switching views ----------
  function closeLightboxIfOpen() {
    if (!body.classList.contains('atlas-lightbox-open')) return false;
    document.getElementById('close-lightbox')?.click();
    return true;
  }
  function show(next, scrollTop) {
    if (next === view) { if (scrollTop !== undefined) jumpTo(scrollTop); return; }
    const toAtlas = next === 'atlas';
    document.querySelectorAll('[data-shell-view]').forEach(el => { el.hidden = el.dataset.shellView !== next; });
    // Swap scopes in one step: invitation CSS keys on .invitation-page, Atlas CSS on .atlas-page.
    body.classList.toggle('atlas-page', toAtlas);
    body.classList.toggle('invitation-page', !toAtlas);
    view = next;
    document.title = titles[next];
    if (themeMeta && themes[next]) themeMeta.content = themes[next];
    jumpTo(scrollTop);
    const focusTarget = toAtlas ? atlasSlot.querySelector('h1') : document.getElementById('atlas-entry');
    if (focusTarget) {
      if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }
  }
  async function openAtlas() {
    if (busy) return;
    busy = true;
    body.classList.add('shell-loading');
    rememberScroll();
    try {
      await mountAtlas();
      history.pushState({ shell: 'atlas', scroll: 0, from: 'invitation' }, '', ATLAS_URL.href);
      show('atlas', 0);
    } catch (error) {
      location.assign(ATLAS_URL.href); // normal page load still works
    } finally {
      busy = false;
      body.classList.remove('shell-loading');
    }
  }
  function returnToInvitation() {
    closeLightboxIfOpen();
    if (history.state && history.state.shell === 'atlas' && history.state.from === 'invitation') {
      history.back(); // popstate restores the invitation and its scroll position
      return;
    }
    rememberScroll();
    history.pushState({ shell: 'invitation', scroll: null }, '', HOME_URL.href);
    show('invitation');
    const entry = document.getElementById('atlas-entry');
    if (entry) jumpTo(window.scrollY + entry.getBoundingClientRect().top);
  }

  // ---------- events ----------
  function linkTarget(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return null;
    const url = new URL(link.getAttribute('href'), location.href);
    if (url.origin !== location.origin) return null;
    if (url.pathname === ATLAS_URL.pathname) return 'atlas';
    if (view === 'atlas' && isHome(url)) return 'invitation';
    return null;
  }
  document.addEventListener('click', event => {
    const target = linkTarget(event);
    if (!target) return;
    if (body.classList.contains('opening')) return; // the unboxing overlay owns the screen
    event.preventDefault();
    if (target === 'atlas') { if (view !== 'atlas') openAtlas(); }
    else returnToInvitation();
  });
  // Start fetching as soon as a finger lands on an Atlas link, so the first open is quicker.
  document.addEventListener('pointerdown', event => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (link && new URL(link.getAttribute('href'), location.href).pathname === ATLAS_URL.pathname) fetchAtlas().catch(() => {});
  }, { passive: true });

  window.addEventListener('popstate', event => {
    const next = viewOf(new URL(location.href));
    const state = event.state || {};
    // Back while a photo is enlarged: close the photo and stay in the Atlas.
    if (view === 'atlas' && next !== 'atlas' && closeLightboxIfOpen()) {
      history.pushState({ shell: 'atlas', scroll: window.scrollY, from: 'invitation' }, '', ATLAS_URL.href);
      return;
    }
    if (next === 'atlas' && !mounted) {
      // Forward into the Atlas after a failed or never-made mount: load it as a page.
      mountAtlas().then(() => show('atlas', state.scroll || 0)).catch(() => location.reload());
      return;
    }
    show(next, typeof state.scroll === 'number' ? state.scroll : undefined);
  });

  history.scrollRestoration = 'manual'; // the shell restores each view's own position
  try { history.replaceState({ ...(history.state || {}), shell: 'invitation', scroll: window.scrollY }, ''); } catch (e) { /* ignore */ }
  window.addEventListener('pagehide', rememberScroll);
  // Keep the current entry's position up to date so Back/Forward land where the guest left off.
  let scrollTimer = 0;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(rememberScroll, 250); // debounced: Safari limits replaceState frequency
  }, { passive: true });
})();
