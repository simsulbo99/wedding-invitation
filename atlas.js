'use strict';

// Map, Index, featured photographs and the viewer all use atlas-data.js.
(() => {
  // Groups listed in ATLAS_DATA.inactiveGroups (currently "details") stay in the data file with their
  // photos, but are left out of the map, Index, counts and viewer. Remove the id there to restore one.
  const DATA = window.ATLAS_DATA;
  const inactive = new Set(DATA.inactiveGroups || []);
  const collections = DATA.collections.filter(c => !inactive.has(c.group));
  const groups = DATA.groups.filter(g => !inactive.has(g.id));
  const { defaultCollection, routeOrigin } = DATA;
  const byId = new Map(collections.map(collection => [collection.id, collection]));
  const groupById = new Map(groups.map(group => [group.id, group]));
  const $ = id => document.getElementById(id);
  const num = value => String(value).padStart(2, '0');
  // City names are shown in capitals; ids, folders and file names keep their original spelling.
  const cityLabel = collection => collection.name.toUpperCase();
  const url = path => './' + path.split('/').map(encodeURIComponent).join('/');
  const photoURL = (collection, photo) => url(`${collection.folder}/${photo.file}`);
  const thumbURL = (collection, photo) => url(`images/atlas-thumbs/${collection.id}/${photo.file.replace(/\.[^.]+$/, '.webp')}`);
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = () => reduceMotion() ? 'auto' : 'smooth';
  let selected = byId.get(defaultCollection);
  let photoIndex = 0;
  let thumbObserver;
  let photoRequest = 0;
  let preloadTimer;
  let preloadedImage;
  let lightboxOpen = false;
  let lastFocused;
  let lockedScroll = 0;
  let suppressPhotoClickUntil = 0;
  // Scoped to the Atlas so it also works when mounted inside the invitation document (app-shell.js).
  const background = [...document.querySelectorAll('.atlas-header, main.atlas-main, .bgm-dock, .atlas-footer')];

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const groupCount = id => collections.filter(c => c.group === id).reduce((sum, c) => sum + c.photos.length, 0);
  const photoAlt = () => `${selected.name} ${groupById.get(selected.group).photoLabel} 사진 ${photoIndex + 1} / ${selected.photos.length}`;

  function bindCollection(button, collection, scroll) {
    button.type = 'button';
    button.dataset.collection = collection.id;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => chooseCollection(collection.id, scroll));
    return button;
  }

  function makeFeatured() {
    for (const collection of collections.filter(c => c.group === 'wedding')) {
      const button = bindCollection(make('button', 'atlas-featured-item'), collection, 'always');
      button.setAttribute('aria-label', `${collection.name} 웨딩 스냅 ${collection.photos.length}장 보기`);
      const img = make('img');
      img.src = url(`images/atlas-featured/${collection.id}.webp`);
      img.alt = `${collection.name} 웨딩 스냅 대표사진`;
      img.width = 560;
      img.height = 700;
      img.decoding = 'async';
      const label = make('span', 'atlas-featured-label', `${num(collection.number)} / ${collection.name.toUpperCase()}`);
      const arrow = make('span', '', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      label.append(arrow);
      button.append(img, label);
      $('wedding-features').append(button);
    }
  }

  function makeMapAndIndex() {
    for (const collection of collections.filter(c => c.map)) {
      const pin = bindCollection(make('button', `atlas-pin is-${collection.group}`), collection, 'mobile');
      const { x, y, dx, dy, labelAlign } = collection.map;
      pin.style.left = `calc(${x}% + ${dx}px)`;
      pin.style.top = `calc(${y}% + ${dy}px)`;
      pin.dataset.labelAlign = labelAlign;
      pin.setAttribute('aria-label', `${num(collection.number)} ${collection.name} — ${groupById.get(collection.group).name}, ${collection.photos.length}장`);
      const marker = make('span', 'atlas-pin-symbol');
      marker.append(make('span', '', num(collection.number)));
      const label = make('span', 'atlas-pin-label', `${cityLabel(collection)} · ${collection.group === 'wedding' ? 'Wedding' : 'Travel'}`);
      label.setAttribute('aria-hidden', 'true');
      pin.append(marker, label);
      $('map-dots').append(pin);
    }
    for (const group of groups) {
      const section = make('section', `atlas-index-group is-${group.id}`);
      const heading = make('h3', 'atlas-index-heading');
      heading.id = `index-group-${group.id}`;
      section.setAttribute('aria-labelledby', heading.id);
      heading.append(make('span', '', `${group.roman}. ${group.name}`), make('small', '', `${groupCount(group.id)} PHOTOS`));
      section.append(heading);
      for (const collection of collections.filter(c => c.group === group.id)) {
        const row = bindCollection(make('button', 'atlas-index-item'), collection, 'mobile');
        const name = make('span', 'atlas-index-title', cityLabel(collection));
        if (collection.country) name.append(make('small', 'atlas-index-country', collection.country));
        const count = make('span', 'atlas-index-count', `${collection.photos.length} photos`);
        const arrow = make('span', 'atlas-index-arr', '↗');
        arrow.setAttribute('aria-hidden', 'true');
        row.append(make('span', 'atlas-index-no', num(collection.number)), name, count, arrow);
        section.append(row);
      }
      $('index-view').append(section);
    }
    const details = collections.find(c => c.group === 'details');
    const detailsLink = $('details-link');
    if (!detailsLink) return;
    if (!details) { detailsLink.remove(); return; } // The Details is inactive: no link under the map
    bindCollection(detailsLink, details, 'mobile');
    detailsLink.replaceChildren(document.createTextNode(`${num(details.number)} / ${details.name}`), make('span', '', '↗'));
  }

  // Use rendered pin centers so fixed 48px pair spacing remains correct on resize.
  function paintRoute() {
    const origin = byId.get(routeOrigin);
    if (!selected.map || selected.city === origin.city) $('map-route-line').setAttribute('d', '');
    const box = $('map-holder').getBoundingClientRect();
    if (!box.width || !box.height) return;
    const point = c => ({ x: (c.map.x / 100 + c.map.dx / box.width) * 1000, y: (c.map.y / 100 + c.map.dy / box.height) * 850 });
    const pairs = collections.filter(c => c.group === 'wedding').map(c => {
      const sibling = collections.find(other => other.group === 'travel' && other.city === c.city);
      if (!sibling?.map) return '';
      const a = point(c), b = point(sibling);
      return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    });
    $('map-pairs').setAttribute('d', pairs.join(' '));
    if (!selected.map || selected.city === origin.city) {
      $('map-route-line').setAttribute('d', '');
      return;
    }
    const from = point(origin), to = point(selected);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - Math.min(65, Math.abs(from.x - to.x) * .1 + 22);
    $('map-route-line').setAttribute('d', `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
  }

  function revealViewer() {
    // Move only the document, without also scrolling any embedding container.
    const viewer = $('photo-viewer');
    const top = window.scrollY + viewer.getBoundingClientRect().top - 24;
    viewer.focus({ preventScroll: true });
    window.scrollTo({ top, behavior: scrollBehavior() });
  }

  function chooseCollection(id, scroll = 'none') {
    selected = byId.get(id);
    photoIndex = 0;
    $('photo-viewer').dataset.collection = id;
    $('place-number').textContent = `${num(selected.number)} / ${num(collections.length)}`;
    $('place-group').textContent = groupById.get(selected.group).name.toUpperCase();
    $('place-country').textContent = selected.country || 'EPILOGUE';
    $('place-title').textContent = `${cityLabel(selected)}.`;
    $('place-title').classList.toggle('is-long', selected.name.length > 8);
    $('memory-story').textContent = selected.story;
    document.querySelectorAll('button[data-collection]').forEach(button => {
      const active = button.dataset.collection === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    makeFilmstrip();
    paintPhoto();
    paintRoute();
    if (scroll === 'always' || (scroll === 'mobile' && matchMedia('(max-width: 860px)').matches)) revealViewer();
  }

  function makeFilmstrip() {
    thumbObserver?.disconnect();
    const strip = $('filmstrip');
    strip.replaceChildren();
    strip.scrollLeft = 0;
    // Observe the viewport AND horizontal clipping; offscreen strips never fetch originals.
    thumbObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
        target.src = target.dataset.src;
        thumbObserver.unobserve(target);
      });
    }, { rootMargin: '80px' }) : null;
    selected.photos.forEach((photo, index) => {
      const button = make('button', 'atlas-thumb');
      button.type = 'button';
      button.dataset.photoIndex = index;
      button.setAttribute('aria-label', `${selected.name} ${groupById.get(selected.group).photoLabel} 사진 ${index + 1} / ${selected.photos.length}`);
      button.addEventListener('click', () => setPhoto(index));
      const img = make('img');
      img.alt = '';
      img.width = 160;
      img.height = 160;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.dataset.src = thumbURL(selected, photo);
      if (!thumbObserver) img.src = img.dataset.src;
      button.append(img);
      strip.append(button);
      thumbObserver?.observe(img);
    });
  }

  function syncFilmstrip() {
    const strip = $('filmstrip');
    const buttons = [...strip.children];
    buttons.forEach((button, index) => {
      const active = index === photoIndex;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const active = buttons[photoIndex];
    // Scroll this container only, never scrollIntoView (which also moves the page).
    const left = active.offsetLeft, right = left + active.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - (strip.clientWidth - active.offsetWidth) / 2, behavior: 'instant' });
    }
  }

  function paintPhoto() {
    const request = ++photoRequest;
    clearTimeout(preloadTimer);
    const collection = selected;
    const photo = collection.photos[photoIndex];
    const img = $('memory-image');
    const stage = $('memory-photo');
    const placeholder = $('memory-placeholder');
    stage.dataset.loadState = 'loading';
    stage.setAttribute('aria-busy', 'true');
    stage.setAttribute('aria-label', `${photoAlt()} 확대`);
    placeholder.hidden = false;
    placeholder.textContent = '사진을 불러오는 중입니다.';
    img.style.opacity = '0';
    img.alt = photoAlt();
    img.width = photo.width;
    img.height = photo.height;
    img.onload = () => {
      if (request !== photoRequest) return;
      stage.dataset.loadState = 'loaded';
      stage.setAttribute('aria-busy', 'false');
      placeholder.hidden = true;
      img.style.opacity = '1';
      // At most the following original, only after the current photo has loaded.
      if (collection.photos.length > 1 && !navigator.connection?.saveData) {
        const next = collection.photos[(photoIndex + 1) % collection.photos.length];
        preloadTimer = setTimeout(() => {
          if (request !== photoRequest) return;
          preloadedImage = new Image();
          preloadedImage.decoding = 'async';
          preloadedImage.fetchPriority = 'low';
          preloadedImage.src = photoURL(collection, next);
        }, 180);
      }
    };
    img.onerror = () => {
      if (request !== photoRequest) return;
      stage.dataset.loadState = 'error';
      stage.setAttribute('aria-busy', 'false');
      placeholder.textContent = '사진을 불러오지 못했습니다. 터치해서 다시 시도해주세요.';
    };
    img.src = photoURL(collection, photo);
    $('memory-count').textContent = `${num(photoIndex + 1)} / ${num(collection.photos.length)}`;
    $('prev-photo').disabled = $('next-photo').disabled = collection.photos.length < 2;
    $('viewer-status').textContent = photoAlt();
    syncFilmstrip();
    if (lightboxOpen) updateLightbox();
  }

  function setPhoto(index) {
    photoIndex = (index + selected.photos.length) % selected.photos.length;
    paintPhoto();
  }
  function movePhoto(delta) { setPhoto(photoIndex + delta); }

  function updateLightbox() {
    $('lightbox-image').src = photoURL(selected, selected.photos[photoIndex]);
    $('lightbox-image').alt = photoAlt();
    $('lightbox-count').textContent = `${selected.name} · ${num(photoIndex + 1)} / ${num(selected.photos.length)}`;
    $('lightbox-prev').disabled = $('lightbox-next').disabled = selected.photos.length < 2;
  }
  function openLightbox() {
    if (performance.now() < suppressPhotoClickUntil) return;
    if ($('memory-photo').dataset.loadState === 'error') { paintPhoto(); return; }
    if (lightboxOpen) return;
    lastFocused = document.activeElement;
    lockedScroll = window.scrollY;
    lightboxOpen = true;
    updateLightbox();
    background.forEach(element => { element.inert = true; });
    document.body.style.setProperty('--atlas-scroll-offset', `-${lockedScroll}px`);
    document.body.classList.add('atlas-lightbox-open');
    $('photo-lightbox').classList.add('is-open');
    $('photo-lightbox').setAttribute('aria-hidden', 'false');
    $('close-lightbox').focus({ preventScroll: true });
  }
  function closeLightbox() {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    $('photo-lightbox').classList.remove('is-open');
    $('photo-lightbox').setAttribute('aria-hidden', 'true');
    background.forEach(element => { element.inert = false; });
    document.body.classList.remove('atlas-lightbox-open');
    document.body.style.removeProperty('--atlas-scroll-offset');
    // Override the shared smooth-scroll rule only for restoring the pre-dialog position.
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, lockedScroll);
    lastFocused?.focus({ preventScroll: true });
    root.style.scrollBehavior = previous;
  }

  function showTab(next, focus = false) {
    for (const name of ['map', 'index']) {
      const active = name === next;
      $(`${name}-view`).hidden = !active;
      $(`${name}-view`).classList.toggle('is-hidden', !active);
      $(`tab-${name}`).classList.toggle('is-active', active);
      $(`tab-${name}`).setAttribute('aria-selected', String(active));
      $(`tab-${name}`).tabIndex = active ? 0 : -1;
    }
    if (next === 'map') paintRoute();
    if (focus) $(`tab-${next}`).focus();
  }

  // Passive touch handlers keep vertical page scrolling and pinch zoom available.
  function trackSwipe(element) {
    let start;
    element.addEventListener('touchstart', event => {
      start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    element.addEventListener('touchend', event => {
      const end = event.changedTouches[0];
      if (!start || !end) return;
      const dx = end.clientX - start.x, dy = end.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        suppressPhotoClickUntil = performance.now() + 500;
        movePhoto(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
    element.addEventListener('touchcancel', () => { start = null; }, { passive: true });
  }

  makeFeatured();
  makeMapAndIndex();
  chooseCollection(defaultCollection);
  new ResizeObserver(paintRoute).observe($('map-holder'));
  for (const name of ['map', 'index']) {
    $(`tab-${name}`).addEventListener('click', () => showTab(name));
    $(`tab-${name}`).addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      showTab(event.key === 'Home' ? 'map' : event.key === 'End' ? 'index' : name === 'map' ? 'index' : 'map', true);
    });
  }
  $('filmstrip').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setPhoto(event.key === 'Home' ? 0 : event.key === 'End' ? selected.photos.length - 1 : photoIndex + (event.key === 'ArrowRight' ? 1 : -1));
    $('filmstrip').children[photoIndex].focus({ preventScroll: true });
  });
  $('memory-photo').addEventListener('click', openLightbox);
  $('memory-photo').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    movePhoto(event.key === 'ArrowRight' ? 1 : -1);
  });
  $('prev-photo').addEventListener('click', () => movePhoto(-1));
  $('next-photo').addEventListener('click', () => movePhoto(1));
  $('lightbox-prev').addEventListener('click', () => movePhoto(-1));
  $('lightbox-next').addEventListener('click', () => movePhoto(1));
  $('close-lightbox').addEventListener('click', closeLightbox);
  $('photo-lightbox').addEventListener('click', event => {
    if (event.target === $('photo-lightbox')) closeLightbox();
  });
  document.addEventListener('keydown', event => {
    if (!lightboxOpen) return;
    if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') closeLightbox();
      else movePhoto(event.key === 'ArrowRight' ? 1 : -1);
    }
    if (event.key === 'Tab') {
      const focusable = [...$('photo-lightbox').querySelectorAll('button:not(:disabled)')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  trackSwipe($('memory-photo'));
  trackSwipe($('lightbox-image'));
})();
