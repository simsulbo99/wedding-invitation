'use strict';
/* Guestbook v2: up to ten images, one small request per image, publish only after upload. */
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxA-3GbJJUwdm29d6geRqgsDdguOpM77I2BppnPdCeOTFoRdq8tROKOO2GwQEvwzHs2NQ/exec';
  const $ = id => document.getElementById(id);
  const form = $('guestbook-form'), list = $('guestbook-list');
  if (!form || !list) return;
  const photoInput = $('guestbook-photo'), preview = $('guestbook-preview');
  const submit = $('guestbook-submit'), status = $('guestbook-status');
  const pagination = $('guestbook-pagination'), empty = $('guestbook-empty');
  const galleryStatus = $('guestbook-gallery-status'), photoError = $('guestbook-photo-error');
  const honeypot = $('guestbook-website');
  const PAGE_SIZE = 5, MAX_IMAGES = 10, MAX_RAW_BYTES = 100 * 1024 * 1024;
  let page = 1, busy = false, listing = false, photos = [], previewUrls = [];
  const randomHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2,'0')).join('');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const el = (tag, cls, label) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (label !== undefined) node.textContent = label;
    return node;
  };
  function notice(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function pictureError(message) {
    photoError.textContent = message;
    photoError.hidden = !message;
  }
  function jsonp(action, args = {}) {
    return new Promise((resolve, reject) => {
      const cb = 'guestbookCallback_' + randomHex(8);
      const script = document.createElement('script');
      let finished = false;
      const timer = setTimeout(() => finish(new Error('서버 응답 시간 초과')), 12000);
      function finish(err, data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        delete window[cb]; script.remove();
        err ? reject(err) : resolve(data);
      }
      window[cb] = data => finish(null, data);
      script.onerror = () => finish(new Error('방명록 서버 연결 실패'));
      const u = new URL(ENDPOINT);
      u.searchParams.set('action', action);
      u.searchParams.set('callback', cb);
      Object.entries(args).forEach(([k, v]) => u.searchParams.set(k, String(v)));
      u.searchParams.set('_', String(Date.now()));
      script.src = u.href;
      document.head.appendChild(script);
    });
  }
  function postHidden(fields) {
    const frame = el('iframe');
    frame.name = 'gb-post-' + randomHex(8);
    frame.hidden = true; frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);
    const sender = el('form');
    sender.method = 'POST'; sender.action = ENDPOINT; sender.target = frame.name;
    sender.hidden = true;
    Object.entries(fields).forEach(([key, value]) => {
      const input = el('input'); input.type = 'hidden';
      input.name = key; input.value = String(value);
      sender.appendChild(input);
    });
    document.body.appendChild(sender);
    sender.submit();
    setTimeout(() => { sender.remove(); frame.remove(); }, 60000);
  }
  async function saveAndConfirm(action, fields, checkAction, checkFields, detail) {
    postHidden({ action, ...fields });
    for (let i = 0; i < 24; i++) {
      await sleep(i ? 1100 : 1400);
      try {
        const response = await jsonp(checkAction, checkFields);
        if (response && response.saved === true) return;
        if (response && response.error) throw new Error(response.error);
      } catch (err) { /* Apps Script redirect sometimes takes longer; retry status. */ }
    }
    throw new Error(detail + ' 저장 여부를 확인하지 못했습니다. 재제출하기 전에 페이지를 새로고침해 확인해주세요.');
  }
  function clearPreviews() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = []; preview.replaceChildren(); preview.hidden = true;
  }
  function renderPreviews() {
    clearPreviews(); pictureError('');
    if (!photos.length) return;
    photos.forEach((file, i) => {
      const fig = el('figure', 'guestbook-preview-item');
      const img = el('img');
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      img.src = url; img.alt = `선택한 사진 ${i + 1}`;
      const cap = el('figcaption', null, `${i + 1} / ${photos.length}`);
      fig.append(img, cap); preview.appendChild(fig);
    });
    preview.hidden = false;
  }
  photoInput.addEventListener('change', () => {
    const chosen = Array.from(photoInput.files || []);
    photos = [];
    if (chosen.length > MAX_IMAGES) pictureError('사진은 최대 10장까지 선택할 수 있습니다.');
    else if (chosen.reduce((n, f) => n + f.size, 0) > MAX_RAW_BYTES) pictureError('원본 사진의 합계는 100MB를 넘을 수 없습니다.');
    else if (chosen.some(f => !/^image\//i.test(f.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name))) pictureError('이미지 파일만 올릴 수 있습니다.');
    else photos = chosen;
    if (!photos.length && chosen.length) { photoInput.value = ''; clearPreviews(); }
    else renderPreviews();
  });
  window.addEventListener('pagehide', clearPreviews);
  async function imageAsJpeg(file) {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch (_) { throw new Error('사진을 읽을 수 없습니다. HEIC 파일은 JPG로 변환해 다시 시도해주세요.'); }
    const canvas = document.createElement('canvas');
    let maxDim = 1440, quality = .78;
    try {
      for (let attempt = 0; attempt < 9; attempt++) {
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('이 브라우저에서는 사진을 처리할 수 없습니다.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', quality);
        const encoded = data.slice(data.indexOf(',') + 1);
        if (encoded.length <= 900000) return encoded;
        if (quality > .51) quality -= .11;
        else { maxDim = Math.round(maxDim * .78); quality = .70; }
      }
      throw new Error('이미지를 업로드 크기로 압축할 수 없습니다.');
    } finally { bitmap.close?.(); canvas.width = canvas.height = 1; }
  }
  function photoCarousel(ids, author) {
    const wrap = el('div', 'guestbook-photo-stack');
    const link = el('a', 'guestbook-entry-photo');
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    const img = el('img'); img.loading = 'lazy'; img.decoding = 'async';
    const count = el('span', 'guestbook-photo-count', `${ids.length} PHOTOS`);
    const prev = el('button', 'guestbook-photo-arrow is-prev', '‹');
    const next = el('button', 'guestbook-photo-arrow is-next', '›');
    const position = el('span', 'guestbook-photo-position');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', '이전 사진'); next.setAttribute('aria-label', '다음 사진');
    let current = 0;
    function show(i) {
      current = (i + ids.length) % ids.length;
      const id = encodeURIComponent(ids[current]);
      img.src = `https://drive.google.com/thumbnail?id=${id}&sz=w960`;
      link.href = `https://drive.google.com/file/d/${id}/view`;
      link.setAttribute('aria-label', `${author}님 사진 ${current+1}/${ids.length} 크게 보기`);
      position.textContent = `${current+1} / ${ids.length}`;
    }
    prev.addEventListener('click', () => show(current - 1));
    next.addEventListener('click', () => show(current + 1));
    // Swipe on phones (never prevents normal vertical scrolling).
    let startX = 0, startY = 0;
    wrap.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    }, {passive:true});
    wrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) show(current + (dx < 0 ? 1 : -1));
    }, {passive:true});
    link.appendChild(img);
    wrap.append(link);
    if (ids.length > 1) wrap.append(count, prev, next, position);
    img.onerror = () => { img.alt = '사진 미리보기를 불러오지 못했습니다'; };
    show(0);
    return wrap;
  }
  function tile(item) {
    const article = el('article', 'guestbook-entry');
    const ids = Array.isArray(item.photoIds) ? item.photoIds : (item.photoId ? [item.photoId] : []);
    const valid = ids.filter(id => /^[a-zA-Z0-9_-]{10,}$/.test(id)).slice(0, MAX_IMAGES);
    if (valid.length) article.appendChild(photoCarousel(valid, item.name || '하객'));
    const body = el('div', 'guestbook-entry-body');
    const message = el('p', 'guestbook-entry-message', item.message || '');
    const foot = el('div', 'guestbook-entry-foot');
    foot.append(el('span', null, 'FROM / ' + (item.name || '하객')), el('time', null, item.date || ''));
    body.append(message, foot); article.appendChild(body); return article;
  }
  function pageButton(label, target, current = false, disabled = false) {
    const btn = el('button', current ? 'is-current' : '', label);
    btn.type = 'button'; btn.disabled = disabled;
    if (current) btn.setAttribute('aria-current', 'page');
    btn.addEventListener('click', () => load(target));
    return btn;
  }
  function renderPages(total) {
    pagination.replaceChildren();
    const pages = Math.ceil(total / PAGE_SIZE);
    pagination.hidden = pages <= 1;
    if (pages <= 1) return;
    pagination.appendChild(pageButton('‹', page - 1, false, page === 1));
    const candidates = new Set([1, pages, page-1, page, page+1]);
    let last = 0;
    [...candidates].filter(n => n >= 1 && n <= pages).sort((a,b)=>a-b).forEach(n => {
      if (last && n > last + 1) pagination.appendChild(el('span', 'guestbook-page-gap', '…'));
      pagination.appendChild(pageButton(String(n), n, n === page));
      last = n;
    });
    pagination.appendChild(pageButton('›', page + 1, false, page === pages));
  }
  async function load(target = 1) {
    if (listing) return;
    listing = true; galleryStatus.textContent = '메시지를 불러오는 중입니다…';
    try {
      const result = await jsonp('guestbook_list', {offset:(target - 1)*PAGE_SIZE, limit:PAGE_SIZE});
      if (!result || !result.ok || !Array.isArray(result.items)) throw new Error('방명록 목록 오류');
      const total = Number(result.total || 0);
      page = total && (target - 1)*PAGE_SIZE >= total ? Math.max(1, Math.ceil(total/PAGE_SIZE)) : target;
      if (page !== target) {listing=false; return load(page);}
      list.replaceChildren(...result.items.map(tile));
      empty.hidden = total !== 0;
      renderPages(total);
      galleryStatus.textContent = '';
    } catch (_) {
      galleryStatus.textContent = '메시지를 불러오지 못했어요. 다시 시도해주세요.';
    } finally { listing = false; }
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy || !form.reportValidity() || honeypot.value) return;
    const name = form.elements.name.value.trim(), message = form.elements.message.value.trim();
    if (!name || name.length > 40 || !message || message.length > 500) return notice('이름과 메시지를 확인해주세요.', true);
    if (photos.length > MAX_IMAGES || photos.reduce((n,f)=>n+f.size,0) > MAX_RAW_BYTES) return notice('사진 개수나 용량을 확인해주세요.', true);
    const postId = randomHex(16), requestId = randomHex(16);
    busy = true; submit.disabled = true;
    try {
      notice('등록을 준비하고 있어요…');
      await saveAndConfirm('guestbook_begin', {postId, requestId, name, message, photoCount:photos.length, website:''}, 'guestbook_begin_status', {postId,requestId}, '방명록');
      for (let i = 0; i < photos.length; i++) {
        notice(`사진을 저장하고 있어요… ${i+1} / ${photos.length}`);
        const imageBase64 = await imageAsJpeg(photos[i]);
        await saveAndConfirm('guestbook_photo', {postId,requestId,index:i,imageBase64}, 'guestbook_photo_status', {postId,requestId,index:i}, `사진 ${i+1}`);
      }
      notice('공개 방명록에 등록하는 중입니다…');
      await saveAndConfirm('guestbook_publish', {postId,requestId}, 'guestbook_status', {postId,requestId}, '공개 방명록');
      notice('축하 메시지가 등록되었습니다. 감사합니다!');
      form.reset(); photos = []; clearPreviews(); pictureError('');
      await load(1);
    } catch (err) {
      notice((err.message || '저장에 실패했습니다.') + ' 등록 확인이 안 되면 같은 내용을 즉시 다시 제출하지 말아주세요.', true);
    } finally {busy=false;submit.disabled=false;}
  });
  load(1);
})();
