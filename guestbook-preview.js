'use strict';
/* Photo selection is intentionally local-only. Nothing is uploaded or saved. */
(() => {
  const form = document.getElementById('guestbook-form');
  const input = document.getElementById('guestbook-photo');
  const preview = document.getElementById('guestbook-preview');
  const image = document.getElementById('guestbook-preview-image');
  const caption = document.getElementById('guestbook-preview-caption');
  const error = document.getElementById('guestbook-photo-error');
  if (!form || !input || !preview || !image || !caption || !error) return;
  const maxBytes = 10 * 1024 * 1024;
  let objectUrl = null;
  const clear = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    image.removeAttribute('src');
    caption.textContent = '';
    preview.hidden = true;
    error.textContent = '';
    error.hidden = true;
  };
  form.addEventListener('submit', event => event.preventDefault());
  input.addEventListener('change', () => {
    clear();
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error.textContent = '이미지 파일만 선택할 수 있습니다.';
      error.hidden = false;
      input.value = '';
      return;
    }
    if (file.size > maxBytes) {
      error.textContent = '10MB 이하의 사진을 선택해주세요.';
      error.hidden = false;
      input.value = '';
      return;
    }
    objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    caption.textContent = file.name;
    preview.hidden = false;
  });
  window.addEventListener('pagehide', clear, { once: true });
})();
