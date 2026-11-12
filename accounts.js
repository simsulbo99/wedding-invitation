'use strict';
/* Wedding Invitation v5: preserve account copy and add direct KakaoPay links. */
(() => {
  // EDIT LINKS HERE. Leave an unavailable recipient's link empty to disable it.
  const KAKAOPAY_LINKS = Object.freeze({
    groom: 'https://qr.kakaopay.com/Ej70Wbz5P',
    bride: ''
  });

  const accounts = Array.from(document.querySelectorAll('.gift-account'));
  if (!accounts.length) return;

  const validKakaoPayLink = value => {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'qr.kakaopay.com' &&
        /^\/[a-z0-9_-]+\/?$/i.test(url.pathname) && !url.search && !url.hash &&
        !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  };
  const copyFallback = value => {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(input);
    input.focus(); input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { /* unsupported */ }
    input.remove();
    return copied;
  };

  accounts.forEach((account, index) => {
    const side = index === 0 ? 'groom' : index === 1 ? 'bride' : null;
    if (!side) return;
    const number = account.querySelector('.gift-account-number');
    const copyButton = account.querySelector('.gift-account-copy');
    const feedback = account.querySelector('.gift-account-feedback');
    const content = account.querySelector('.gift-account-content');
    if (!number || !copyButton || !feedback || !content) return;

    // Account copy remains independent of KakaoPay. Never copy placeholders.
    const value = number.textContent.trim();
    const ready = !/[\[\]]/.test(value) && value.replace(/\D/g, '').length >= 8;
    copyButton.disabled = !ready;
    let noticeTimer;
    copyButton.addEventListener('click', async () => {
      if (!ready) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try { await navigator.clipboard.writeText(value); }
          catch (_) { if (!copyFallback(value)) throw Error('clipboard failed'); }
        } else if (!copyFallback(value)) {
          throw Error('clipboard unavailable');
        }
        feedback.textContent = '복사되었습니다';
      } catch (_) {
        feedback.textContent = '복사하지 못했습니다. 계좌번호를 직접 선택해 복사해주세요.';
      }
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { feedback.textContent = ''; }, 2600);
    });

    const link = validKakaoPayLink(KAKAOPAY_LINKS[side]);
    const pay = document.createElement(link ? 'a' : 'button');
    pay.className = 'gift-account-kakaopay';
    const logo = document.createElement('img');
    logo.src = './images/kakaotalk-mark.svg';
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.textContent = '카카오페이로 송금하기';
    pay.append(logo, title);
    if (link) {
      pay.href = link;
      // Open the provider separately, preserving the invitation and its music.
      pay.target = '_blank';
      pay.rel = 'noopener noreferrer';
      pay.setAttribute('aria-label', (side === 'groom' ? '신랑측' : '신부측') + ' 카카오페이로 송금하기');
    } else {
      pay.type = 'button';
      pay.disabled = true;
      pay.title = '카카오페이 송금 링크 준비 중';
      pay.setAttribute('aria-label', (side === 'groom' ? '신랑측' : '신부측') + ' 카카오페이 송금 링크 준비 중');
    }
    // Directly below the existing account copy button; feedback stays below both.
    copyButton.insertAdjacentElement('afterend', pay);
  });
})();
