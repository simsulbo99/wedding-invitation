'use strict';
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxA-3GbJJUwdm29d6geRqgsDdguOpM77I2BppnPdCeOTFoRdq8tROKOO2GwQEvwzHs2NQ/exec';
  const KEY = 'jw-seoha-rsvp-v1';
  const form = document.getElementById('rsvp-form');
  if (!form) return;
  const submit = document.getElementById('rsvp-submit');
  const status = document.getElementById('rsvp-status');
  const count = document.getElementById('rsvp-count-wrap');
  const success = document.getElementById('rsvp-success');
  const link = document.getElementById('rsvp-edit-link');
  const copy = document.getElementById('rsvp-copy-link');
  const editHint = document.getElementById('rsvp-edit-hint');
  const tokenRegex = /^[a-f0-9]{64}$/i;
  const url = new URL(location.href);
  const queryToken = url.searchParams.get('rsvp');
  let local = {};
  try { local = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
  let token = tokenRegex.test(queryToken || '') ? queryToken : (tokenRegex.test(local.token || '') ? local.token : null);
  // A link token is a bearer credential; keep it out of share previews/referrer URLs after reading it.
  if (queryToken) {
    url.searchParams.delete('rsvp');
    history.replaceState(null, '', url.pathname + url.search + '#rsvp');
  }
  if (token && local.token === token && local.data) fill(local.data);
  if (token) {
    editHint.hidden = false;
    editHint.textContent = local.token === token && local.data
      ? '이전에 입력한 답변입니다. 변경 후 다시 전달할 수 있어요.'
      : '수정 링크로 접속했어요. 정보를 다시 입력해 저장하면 기존 응답이 수정됩니다.';
  }
  function fill(data) {
    form.elements.guestName.value = data.guestName || '';
    const attendance = form.querySelector(`[name="attendance"][value="${data.attendance === 'no' ? 'no' : 'yes'}"]`);
    attendance.checked = true;
    const side = form.querySelector(`[name="side"][value="${data.side === 'bride' ? 'bride' : 'groom'}"]`);
    side.checked = true;
    form.elements.guests.value = String(data.guests || 1);
    updateCount();
  }
  function updateCount() {
    const going = form.elements.attendance.value === 'yes';
    count.hidden = !going;
    form.elements.guests.disabled = !going;
  }
  form.querySelectorAll('[name="attendance"]').forEach(el => el.addEventListener('change', updateCount));
  updateCount();
  function randomHex(bytes) {
    if (!window.crypto || !crypto.getRandomValues) throw new Error('안전한 연결(HTTPS)이 필요합니다.');
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
  }
  function editUrl(value) {
    const u = new URL(location.href);
    u.searchParams.set('rsvp', value);
    u.hash = 'rsvp';
    return u.href;
  }
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function checkStatus(value, requestId) {
    return new Promise((resolve, reject) => {
      const callback = 'rsvpCallback_' + randomHex(8);
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('확인 요청 시간 초과')), 6000);
      function finish(err, result) {
        clearTimeout(timer);
        delete window[callback];
        script.remove();
        err ? reject(err) : resolve(result);
      }
      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('연결할 수 없습니다.'));
      const u = new URL(ENDPOINT);
      u.searchParams.set('action', 'status');
      u.searchParams.set('token', value);
      u.searchParams.set('requestId', requestId);
      u.searchParams.set('callback', callback);
      u.searchParams.set('_', String(Date.now()));
      script.src = u.href;
      document.head.appendChild(script);
    });
  }
  function postHidden(fields) {
    const frame = document.createElement('iframe');
    frame.name = 'rsvp-post-' + randomHex(8);
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);
    const poster = document.createElement('form');
    poster.method = 'POST';
    poster.action = ENDPOINT;
    poster.target = frame.name;
    poster.style.display = 'none';
    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = key; input.value = value;
      poster.appendChild(input);
    }
    document.body.appendChild(poster);
    poster.submit();
    setTimeout(() => { poster.remove(); frame.remove(); }, 30000);
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let busy = false;
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (busy || !form.reportValidity()) return;
    const data = {
      guestName: form.elements.guestName.value.trim(),
      attendance: form.elements.attendance.value,
      side: form.elements.side.value,
      guests: form.elements.attendance.value === 'yes' ? Number(form.elements.guests.value) : 0
    };
    if (!data.guestName || data.guestName.length > 40 || !['yes','no'].includes(data.attendance) ||
        !['groom','bride'].includes(data.side) || !Number.isInteger(data.guests) || data.guests < 0 || data.guests > 10 ||
        (data.attendance === 'yes' && data.guests === 0)) {
      message('입력 내용을 확인해주세요.', true); return;
    }
    busy = true; submit.disabled = true;
    const id = token || randomHex(32);
    const requestId = randomHex(16);
    message('응답을 전달하고 저장 여부를 확인하는 중입니다…');
    try {
      postHidden({ action: 'save', token: id, requestId, ...data });
      let verified = false;
      for (let i = 0; i < 12; i++) {
        await sleep(i === 0 ? 1400 : 1050);
        try {
          const result = await checkStatus(id, requestId);
          if (result && result.saved === true) { verified = true; break; }
        } catch (_) { /* Retry when the redirected JSONP request fails temporarily. */ }
      }
      if (!verified) throw new Error('저장 완료를 확인하지 못했습니다. 네트워크를 확인한 뒤 잠시 후 다시 시도해주세요.');
      token = id;
      try { localStorage.setItem(KEY, JSON.stringify({ token, data })); } catch (_) {}
      link.href = editUrl(token);
      success.hidden = false;
      editHint.hidden = false;
      editHint.textContent = '이 브라우저에서는 답변을 다시 수정할 수 있습니다.';
      message('참석 여부가 정상적으로 저장되었습니다.');
    } catch (err) {
      message(err.message || '전송에 실패했습니다. 다시 시도해주세요.', true);
    } finally { busy = false; submit.disabled = false; }
  });
  copy.addEventListener('click', async () => {
    if (!token) return;
    const value = editUrl(token);
    try { await navigator.clipboard.writeText(value); message('수정 링크를 복사했습니다. 안전하게 보관해주세요.'); }
    catch (_) { window.prompt('아래 링크를 복사해주세요.', value); }
  });
})();
