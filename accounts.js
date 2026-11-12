'use strict';
/* Placeholder account numbers are never copied to the clipboard. */
(() => {
  const accounts = document.querySelectorAll('.gift-account');
  if (!accounts.length) return;
  function copyFallback(value) {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(input);
    input.focus(); input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { /* unsupported */ }
    input.remove(); return copied;
  }
  accounts.forEach(account => {
    const number = account.querySelector('.gift-account-number');
    const button = account.querySelector('.gift-account-copy');
    const feedback = account.querySelector('.gift-account-feedback');
    if (!number || !button || !feedback) return;
    const value = number.textContent.trim();
    const ready = !/[\[\]]/.test(value) && value.replace(/\D/g, '').length >= 8;
    button.disabled = !ready;
    let noticeTimer;
    button.addEventListener('click', async () => {
      if (!ready) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try { await navigator.clipboard.writeText(value); }
          catch (_) { if (!copyFallback(value)) throw new Error('clipboard failed'); }
        } else if (!copyFallback(value)) {
          throw new Error('clipboard unavailable');
        }
        feedback.textContent = '복사되었습니다';
      } catch (_) {
        feedback.textContent = '복사하지 못했습니다. 계좌번호를 직접 선택해 복사해주세요.';
      }
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { feedback.textContent = ''; }, 2600);
    });
  });
})();
