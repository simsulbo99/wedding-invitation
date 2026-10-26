'use strict';

// The order is the order shown in the Index and the map marker numbers.
// Map positions are deliberately adjusted for small screens (especially Karuizawa).
// Photos are relative to atlas.html at the repository root.
const records = [
  {
    name: 'Tokyo', country: 'JAPAN', x: 82.8, y: 18.1,
    story: '도시의 밤과 불빛 속에 남긴 한 장.',
    photos: ['./images/Tokyo/tokyo-01.jpg', './images/Tokyo/tokyo-02.jpg', './images/Tokyo/tokyo-03.jpg', './images/Tokyo/tokyo-04.jpg', './images/Tokyo/tokyo-05.jpg', './images/Tokyo/tokyo-06.jpg', './images/Tokyo/tokyo-07.jpg', './images/Tokyo/tokyo-08.jpg', './images/Tokyo/tokyo-09.jpg', './images/Tokyo/tokyo-10.jpg', './images/Tokyo/tokyo-11.jpg', './images/Tokyo/tokyo-12.jpg', './images/Tokyo/tokyo-13.jpg', './images/Tokyo/tokyo-14.jpg', './images/Tokyo/tokyo-15.jpg', './images/Tokyo/tokyo-16.jpg', './images/Tokyo/tokyo-17.jpg', './images/Tokyo/tokyo-18.jpg', './images/Tokyo/tokyo-19.jpg', './images/Tokyo/tokyo-20.jpg']
  },
  {
    name: 'Sapa', country: 'VIETNAM', x: 16.4, y: 41.5,
    story: '산등성이를 따라 이어지는 길과 느리게 흘러간 시간.', photos: ['./images/sapa/sapa-01.jpg', './images/sapa/sapa-02.jpg', './images/sapa/sapa-03.jpg', './images/sapa/sapa-04.jpg', './images/sapa/sapa-05.jpg', './images/sapa/sapa-06.jpg', './images/sapa/sapa-07.jpg', './images/sapa/sapa-08.jpg', './images/sapa/sapa-09.jpg', './images/sapa/sapa-10.jpg', './images/sapa/sapa-11.webp', './images/sapa/sapa-12.webp', './images/sapa/sapa-13.webp', './images/sapa/sapa-14.webp', './images/sapa/sapa-15.webp']
  },
  {
    name: 'Seoul', country: 'KOREA', x: 59.2, y: 14.8,
    story: '가장 익숙한 도시에서 가장 특별한 모습으로.',
    photos: ['./images/main-1.webp', './images/main-2.webp', './images/main-3.webp']
  },
  {
    name: 'Manado', country: 'INDONESIA', x: 55.3, y: 78.1,
    story: '바다의 낯선 색을 처음 함께 기억한 곳.', photos: ['./images/manado/manado-01.jpg', './images/manado/manado-02.jpg', './images/manado/manado-03.jpg', './images/manado/manado-04.jpg', './images/manado/manado-05.jpg', './images/manado/manado-06.jpg', './images/manado/manado-07.jpg', './images/manado/manado-08.jpg', './images/manado/manado-09.jpg', './images/manado/manado-10.jpg', './images/manado/manado-11.jpg', './images/manado/manado-12.jpg', './images/manado/manado-13.jpg', './images/manado/manado-14.jpg']
  },
  {
    name: 'Karuizawa', country: 'JAPAN', x: 69.5, y: 5.4,
    story: '숲이 가까운 작은 도시에서.', photos: ['./images/karuizawa/karuizawa-01.jpg', './images/karuizawa/karuizawa-02.jpg', './images/karuizawa/karuizawa-03.jpg', './images/karuizawa/karuizawa-04.jpg', './images/karuizawa/karuizawa-05.jpg', './images/karuizawa/karuizawa-06.jpg', './images/karuizawa/karuizawa-07.jpg', './images/karuizawa/karuizawa-08.jpg', './images/karuizawa/karuizawa-09.jpg', './images/karuizawa/karuizawa-10.jpg']
  },
  {
    name: 'Nha Trang', country: 'VIETNAM', x: 26.3, y: 59.2,
    story: '여름의 바다를 함께 건너온 기록.', photos: ['./images/nhatrang/nhatrang-01.webp', './images/nhatrang/nhatrang-02.webp', './images/nhatrang/nhatrang-03.webp', './images/nhatrang/nhatrang-04.webp', './images/nhatrang/nhatrang-05.webp']
  },
  {
    name: 'Pattaya', country: 'THAILAND', x: 10.9, y: 58.0,
    story: '같이 걷고 같은 방향을 바라본 풍경.', photos: []
  },
  {
    name: 'Bohol', country: 'PHILIPPINES', x: 53.4, y: 63.8,
    story: '햇빛과 바다가 나란히 놓였던 날들.', photos: []
  }
];

const $ = id => document.getElementById(id);
const num = value => String(value).padStart(2, '0');
let selected = 0;
let photoIndex = 0;
let lastFocused = null;
let touchStart = null;

function photoCount() { return records[selected].photos.length; }

function paintRoute() {
  const from = records[2]; // Seoul is the reference point.
  const to = records[selected];
  const path = $('map-route-line');
  if (selected === 2) { path.setAttribute('d', ''); return; }
  const x1 = from.x * 10, y1 = from.y * 8.5;
  const x2 = to.x * 10, y2 = to.y * 8.5;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - Math.min(65, Math.abs(x1 - x2) * .10 + 22);
  path.setAttribute('d', `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
}

function makeMapAndIndex() {
  const pins = $('map-dots');
  const index = $('index-view');
  records.forEach((place, i) => {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = `atlas-pin${place.y < 12 ? ' is-high' : ''}`;
    pin.style.left = `${place.x}%`;
    pin.style.top = `${place.y}%`;
    pin.dataset.city = String(i);
    pin.setAttribute('aria-label', `${place.name} 사진 보기`);
    pin.setAttribute('aria-pressed', 'false');
    const number = document.createElement('span');
    number.textContent = num(i + 1);
    const label = document.createElement('span');
    label.className = 'atlas-pin-label';
    label.textContent = place.name;
    label.setAttribute('aria-hidden', 'true');
    pin.append(number, label);
    pin.addEventListener('click', () => choosePlace(i));
    pins.append(pin);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'atlas-index-item';
    row.dataset.city = String(i);
    row.setAttribute('aria-pressed', 'false');
    const n = document.createElement('span');
    n.className = 'atlas-index-no';
    n.textContent = num(i + 1);
    const name = document.createElement('span');
    name.className = 'atlas-index-title';
    name.textContent = place.name;
    const country = document.createElement('small');
    country.className = 'atlas-index-country';
    country.textContent = place.country;
    name.append(country);
    const arrow = document.createElement('span');
    arrow.className = 'atlas-index-arr';
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    row.append(n, name, arrow);
    row.addEventListener('click', () => choosePlace(i, true));
    index.append(row);
  });
}

function choosePlace(i, indexClicked = false) {
  selected = i;
  photoIndex = 0;
  const p = records[i];
  $('place-number').textContent = `${num(i + 1)} / ${num(records.length)}`;
  $('place-country').textContent = p.country;
  $('place-title').textContent = `${p.name}.`;
  $('place-title').classList.toggle('is-long', p.name.length > 8);
  $('memory-story').textContent = p.story;
  document.querySelectorAll('[data-city]').forEach(el => {
    const active = Number(el.dataset.city) === i;
    el.classList.toggle('is-selected', active);
    el.setAttribute('aria-pressed', String(active));
  });
  paintRoute();
  paintPhoto();
  // Mobile: selecting a city in Index should reveal its photo, not leave it offscreen.
  if (indexClicked && window.matchMedia('(max-width:700px)').matches) {
    $('place-title').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
}

function placeholder() {
  const div = document.createElement('div');
  div.className = 'atlas-photo-placeholder';
  div.textContent = '사진을 준비하고 있습니다.';
  return div;
}

function paintPhoto() {
  const p = records[selected];
  const stage = $('memory-photo');
  stage.replaceChildren();
  const total = p.photos.length;
  $('memory-count').textContent = total ? `${num(photoIndex + 1)} / ${num(total)}` : '00 / 00';
  $('prev-photo').disabled = total < 2;
  $('next-photo').disabled = total < 2;
  if (!total) { stage.append(placeholder()); return; }
  const img = document.createElement('img');
  img.alt = `${p.name} 여행 사진 ${photoIndex + 1} / ${total}`;
  img.loading = 'eager';
  img.decoding = 'async';
  img.src = p.photos[photoIndex];
  // If the file hasn't been uploaded yet, keep a clean placeholder rather than a broken icon.
  img.addEventListener('error', () => {
    if (stage.contains(img)) stage.replaceChildren(placeholder());
  }, { once: true });
  img.addEventListener('click', openLightbox);
  stage.append(img);
  if (total > 1) {
    const preload = new Image();
    preload.src = p.photos[(photoIndex + 1) % total];
  }
}

function movePhoto(delta) {
  const total = photoCount();
  if (total < 2) return;
  photoIndex = (photoIndex + delta + total) % total;
  paintPhoto();
  if ($('photo-lightbox').classList.contains('is-open')) updateLightbox();
}

function updateLightbox() {
  const p = records[selected];
  const total = p.photos.length;
  if (!total) return;
  $('lightbox-image').src = p.photos[photoIndex];
  $('lightbox-image').alt = `${p.name} 여행 사진 ${photoIndex + 1} / ${total}`;
  $('lightbox-count').textContent = `${num(photoIndex + 1)} / ${num(total)}`;
  $('lightbox-prev').hidden = total < 2;
  $('lightbox-next').hidden = total < 2;
}

function openLightbox() {
  if (!photoCount()) return;
  lastFocused = document.activeElement;
  updateLightbox();
  $('photo-lightbox').classList.add('is-open');
  $('photo-lightbox').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('close-lightbox').focus();
}

function closeLightbox() {
  $('photo-lightbox').classList.remove('is-open');
  $('photo-lightbox').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocused?.isConnected) lastFocused.focus();
}

function showTab(next) {
  const map = next === 'map';
  $('map-view').hidden = !map;
  $('index-view').hidden = map;
  $('index-view').classList.toggle('is-hidden', map);
  $('tab-map').classList.toggle('is-active', map);
  $('tab-index').classList.toggle('is-active', !map);
  $('tab-map').setAttribute('aria-selected', String(map));
  $('tab-index').setAttribute('aria-selected', String(!map));
}

function trackSwipe(element) {
  element.addEventListener('touchstart', ev => {
    const p = ev.touches[0];
    if (p) touchStart = { x: p.clientX, y: p.clientY };
  }, { passive: true });
  element.addEventListener('touchend', ev => {
    if (!touchStart) return;
    const p = ev.changedTouches[0];
    const dx = p.clientX - touchStart.x;
    const dy = p.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      movePhoto(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

makeMapAndIndex();
choosePlace(0);
$('tab-map').addEventListener('click', () => showTab('map'));
$('tab-index').addEventListener('click', () => showTab('index'));
$('prev-photo').addEventListener('click', () => movePhoto(-1));
$('next-photo').addEventListener('click', () => movePhoto(1));
$('lightbox-prev').addEventListener('click', () => movePhoto(-1));
$('lightbox-next').addEventListener('click', () => movePhoto(1));
$('close-lightbox').addEventListener('click', closeLightbox);
$('photo-lightbox').addEventListener('click', event => {
  if (event.target === $('photo-lightbox')) closeLightbox();
});
document.addEventListener('keydown', event => {
  if (!$('photo-lightbox').classList.contains('is-open')) return;
  if (event.key === 'Escape') closeLightbox();
  if (event.key === 'ArrowLeft') movePhoto(-1);
  if (event.key === 'ArrowRight') movePhoto(1);
});
trackSwipe($('memory-photo'));
trackSwipe($('photo-lightbox'));
