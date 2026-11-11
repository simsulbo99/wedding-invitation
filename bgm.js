'use strict';
/* Background music for the invitation (index.html) and the Atlas (atlas.html).
   - One YouTube IFrame player per document, shown at full size in the shared music card
     (never hidden, shrunk or moved). Inside index.html the Atlas is a view of the same document
     (app-shell.js), so switching views never touches the player.
   - The guest's ON/OFF choice is kept in sessionStorage for real page loads (refresh, direct
     Atlas link); actual playback is tracked separately and is the only thing the button reflects.
   - Any failure leaves the page, the unboxing and the Atlas untouched. */
(() => {
  // One song for the whole invitation, Atlas included.
  const TRACK = { id: '5k71Ueu4wG8', title: 'L-O-V-E' };
  const CHOICE_KEY = 'wedding-bgm-choice'; // 'on' | 'off'; absent in a new session = off
  const VOLUME = 40;
  const API_URL = 'https://www.youtube.com/iframe_api';
  const API_TIMEOUT = 12000;
  const CHECK_AFTER = 6000;      // no PLAYING by then (and not buffering) = treated as blocked
  const CHECK_BUFFERING = 15000; // slow networks get longer while the player reports buffering
  const HINT_MS = 8000;
  const MSG = {
    play: 'Tap to play ♪',
    resume: 'Tap to resume ♪',
    retry: '음악을 불러오지 못했어요. 다시 눌러 주세요.',
    unavailable: '이 곡은 여기서 재생할 수 없어요.'
  };

  const body = document.body;
  const page = body.dataset.bgmPage; // document the visit started in: 'invitation' | 'atlas'
  const track = TRACK;
  const host = document.getElementById('bgm-player');
  if (!track || !host) return;

  const readChoice = () => { try { return sessionStorage.getItem(CHOICE_KEY); } catch (e) { return null; } };
  const saveChoice = value => { try { sessionStorage.setItem(CHOICE_KEY, value); } catch (e) { /* storage blocked: choice lives for this page only */ } };

  // status: idle (no player yet) | off | pending | playing | blocked | error | unavailable
  let status = 'idle';
  let player = null;
  let ready = false;
  let creating = false;
  let apiTimer = 0;
  let checkTimer = 0;
  let checkStarted = 0;
  let hintTimer = 0;
  let queued = null;          // play request waiting for the player: 'gesture' | 'auto'
  let autoQueued = false;     // resume the shared ON choice once the player is ready
  let intent = 'stop';        // what this page is currently trying to do
  let ourPause = false;       // the next PAUSED event was caused by this script
  let systemPaused = false;   // paused because the page went to the background
  let everPlayed = false;
  let openedByTap = false;    // invitation: the guest opened the box with the tap prompt
  let cancelUntil = 0;        // a play request was cancelled; a late PLAYING is paused again

  // ---------- UI ----------
  const control = document.createElement('div');
  control.className = 'bgm-control';
  control.innerHTML =
    '<button type="button" class="bgm-toggle" id="bgm-toggle" aria-pressed="false" aria-describedby="bgm-hint">' +
      '<svg class="bgm-icon" viewBox="0 0 18 16" aria-hidden="true" focusable="false">' +
        '<path d="M2.5 6h2.6l3.5-3v10l-3.5-3H2.5z"/>' +
        '<path class="bgm-wave" d="M11 5.6a3.4 3.4 0 0 1 0 4.8M13.2 3.6a6.2 6.2 0 0 1 0 8.8"/>' +
        '<path class="bgm-mute" d="M11.4 6.1l3.8 3.8m0-3.8l-3.8 3.8"/>' +
      '</svg><span class="bgm-label">BGM OFF</span></button>' +
    '<p class="bgm-hint" id="bgm-hint" role="status" aria-live="polite"></p>';
  body.appendChild(control);
  const button = control.querySelector('.bgm-toggle');
  const label = control.querySelector('.bgm-label');
  const hint = control.querySelector('.bgm-hint');

  function render() {
    const on = status === 'playing';
    button.setAttribute('aria-pressed', String(on));
    button.dataset.state = status;
    button.classList.toggle('is-pending', status === 'pending');
    label.textContent = on ? 'BGM ON' : 'BGM OFF';
    button.setAttribute('aria-label', (on ? '배경음악 끄기: ' : '배경음악 켜기: ') + track.title);
  }
  function setStatus(next) { status = next; render(); }
  function showHint(text, ms = HINT_MS) {
    clearTimeout(hintTimer);
    hint.textContent = text;
    hint.classList.add('is-visible');
    if (ms) hintTimer = setTimeout(hideHint, ms);
  }
  function hideHint() { clearTimeout(hintTimer); hint.classList.remove('is-visible'); }
  const resumeHint = () => showHint(everPlayed || readChoice() === 'on' ? MSG.resume : MSG.play);

  // YouTube only allows automatic playback once more than half of the player is on screen.
  function playerMostlyVisible() {
    const el = document.getElementById('bgm-player') || host;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 && (w * h) / (r.width * r.height) > 0.5;
  }
  const playerState = () => { try { return player.getPlayerState(); } catch (e) { return -1; } };

  // ---------- YouTube IFrame API ----------
  function loadApi() {
    if (window.YT && window.YT.Player) { createPlayer(); return; }
    if (!window.__bgmApiHook) {
      window.__bgmApiHook = true;
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === 'function') { try { previous(); } catch (e) { /* not ours */ } }
        clearTimeout(apiTimer);
        createPlayer();
      };
    }
    let script = document.querySelector('script[data-bgm-api]');
    if (!script || script.dataset.failed) {
      if (script) script.remove();
      script = document.createElement('script');
      script.src = API_URL;
      script.async = true;
      script.dataset.bgmApi = '';
      script.onerror = () => { script.dataset.failed = '1'; apiFailed(); };
      document.head.appendChild(script);
    }
    clearTimeout(apiTimer);
    apiTimer = setTimeout(() => { if (!ready) apiFailed(); }, API_TIMEOUT);
  }
  function apiFailed() {
    clearTimeout(apiTimer);
    if (ready) return;
    const wanted = queued;
    queued = null;
    intent = 'stop';
    setStatus('error');
    if (wanted === 'gesture') showHint(MSG.retry);
  }
  function createPlayer() {
    if (player || creating || !(window.YT && window.YT.Player)) return;
    creating = true;
    const playerVars = { playsinline: 1, rel: 0, loop: 1, playlist: track.id };
    if (/^https?:$/.test(location.protocol)) { playerVars.origin = location.origin; playerVars.widget_referrer = location.href; }
    try {
      player = new window.YT.Player(host, {
        width: '100%',
        height: '100%',
        videoId: track.id,
        playerVars,
        events: { onReady, onStateChange, onError, onAutoplayBlocked }
      });
    } catch (e) {
      player = null;
      creating = false;
      apiFailed();
    }
  }

  function onReady() {
    ready = true;
    creating = false;
    clearTimeout(apiTimer);
    try { player.setVolume(VOLUME); player.unMute(); } catch (e) { /* volume is not settable on iOS */ }
    if (status === 'idle' || status === 'error') setStatus('off');
    if (queued) { const reason = queued; queued = null; play(reason); }
    else if (autoQueued) { autoQueued = false; autoResume(); }
  }
  function onStateChange(event) {
    const S = window.YT.PlayerState;
    if (event.data === S.PLAYING) {
      clearTimeout(checkTimer);
      if (intent === 'stop' && Date.now() < cancelUntil) { pauseNow(); return; } // a cancelled request finished late
      if (status !== 'pending' && status !== 'playing') saveChoice('on'); // started from the YouTube player itself
      intent = 'play';
      ourPause = false;
      everPlayed = true;
      systemPaused = false;
      try { player.setVolume(VOLUME); } catch (e) { /* ignore */ }
      hideHint();
      setStatus('playing');
    } else if (event.data === S.PAUSED) {
      clearTimeout(checkTimer);
      if (!ourPause && !systemPaused && !document.hidden && status === 'playing') {
        saveChoice('off'); // paused from the YouTube player itself
        intent = 'stop';
      }
      ourPause = false;
      if (status !== 'blocked' && status !== 'unavailable') setStatus('off');
    } else if (event.data === S.ENDED) {
      // loop=1 with playlist=id normally loops by itself; this is the fallback.
      if (intent === 'play') { try { player.seekTo(0, true); player.playVideo(); } catch (e) { /* ignore */ } }
    }
  }
  function onError(event) {
    clearTimeout(checkTimer);
    const wanted = intent === 'play';
    intent = 'stop';
    if ([100, 101, 150].includes(event.data)) { setStatus('unavailable'); showHint(MSG.unavailable); }
    else { setStatus('error'); if (wanted) showHint(MSG.retry); }
  }
  function onAutoplayBlocked() { markBlocked(); }

  // ---------- playback ----------
  function play(reason) {
    if (status === 'unavailable') { showHint(MSG.unavailable); return; }
    intent = 'play';
    if (!ready) {
      queued = reason;
      setStatus('pending');
      loadApi(); // no-op while loading; retries after a failure
      return;
    }
    ourPause = false;
    try {
      player.setVolume(VOLUME);
      player.unMute();
      player.playVideo();
    } catch (e) {
      intent = 'stop';
      setStatus('error');
      showHint(MSG.retry);
      return;
    }
    if (playerState() === window.YT.PlayerState.PLAYING) { setStatus('playing'); return; }
    setStatus('pending');
    watchStart();
  }
  function watchStart() {
    clearTimeout(checkTimer);
    checkStarted = Date.now();
    const check = () => {
      if (status !== 'pending') return;
      const state = playerState();
      if (state === window.YT.PlayerState.PLAYING) { setStatus('playing'); return; }
      if (state === window.YT.PlayerState.BUFFERING && Date.now() - checkStarted < CHECK_BUFFERING) {
        checkTimer = setTimeout(check, 1000);
        return;
      }
      markBlocked();
    };
    checkTimer = setTimeout(check, CHECK_AFTER);
  }
  function markBlocked() {
    clearTimeout(checkTimer);
    if (status === 'playing' || status === 'unavailable') return;
    intent = 'stop';
    queued = null;
    setStatus('blocked');
    if (!body.classList.contains('opening')) resumeHint();
  }
  function pauseNow() {
    if (!ready) return;
    ourPause = true;
    try { player.pauseVideo(); } catch (e) { ourPause = false; }
  }
  function stop() {
    if (status === 'pending') cancelUntil = Date.now() + 4000;
    intent = 'stop';
    queued = null;
    clearTimeout(checkTimer);
    hideHint();
    pauseNow();
    setStatus(ready ? 'off' : 'idle');
  }
  // Resume the shared ON choice without a tap (page entry, return from background).
  function autoResume() {
    if (readChoice() !== 'on' || status === 'playing' || status === 'pending' || status === 'unavailable') return;
    if (!ready) { autoQueued = true; loadApi(); return; }
    if (!playerMostlyVisible()) { setStatus('off'); resumeHint(); return; }
    play('auto');
  }

  // ---------- events ----------
  button.addEventListener('click', () => {
    if (status === 'unavailable') { showHint(MSG.unavailable); return; }
    if (status === 'playing' || status === 'pending') { saveChoice('off'); stop(); return; }
    saveChoice('on');
    hideHint();
    play('gesture'); // called inside the tap so mobile browsers accept it
  });

  // Invitation: the guest opens the gift box with one of two buttons. main.js dispatches this
  // synchronously inside the same tap, before the unboxing timers start.
  //   detail.music === true  -> "음악과 함께 시작하기": save ON and play
  //   detail.music === false -> "음악 없이 시작하기": save OFF; the BGM button can still turn it on
  window.addEventListener('invitation:open', event => {
    openedByTap = true;
    const music = !(event && event.detail && event.detail.music === false);
    if (!music) {
      saveChoice('off');
      if (status === 'playing' || status === 'pending') stop();
      return;
    }
    saveChoice('on');
    play('gesture');
  });

  // Invitation: the button appears when the unboxing ends (or is skipped / bypassed by a link).
  if (page === 'invitation') {
    let opening = body.classList.contains('opening');
    new MutationObserver(() => {
      const now = body.classList.contains('opening');
      if (opening && !now) {
        if (status === 'error') showHint(MSG.retry);
        else if (status === 'blocked') resumeHint();
        else if (!openedByTap) autoResume();
      }
      opening = now;
    }).observe(body, { attributes: true, attributeFilter: ['class'] });
  }

  // Background / foreground: pause while hidden, resume on return if the guest left it on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (status === 'playing' || status === 'pending') { systemPaused = true; clearTimeout(checkTimer); pauseNow(); }
    } else if (systemPaused) {
      systemPaused = false;
      if (readChoice() === 'on') { setStatus('off'); autoResume(); }
    }
  });
  // Leaving the page (to the Atlas or back): stop cleanly without touching the saved choice.
  window.addEventListener('pagehide', () => {
    if (status === 'playing' || status === 'pending') { clearTimeout(checkTimer); pauseNow(); }
  });
  // Back/forward cache: the other page may have changed the shared choice.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    systemPaused = false;
    if (readChoice() === 'on') { if (status !== 'playing') { setStatus(ready ? 'off' : status); autoResume(); } }
    else if (status === 'playing' || status === 'pending') stop();
    else render();
  });

  // ---------- start ----------
  render();
  if (readChoice() === 'on' && !(page === 'invitation' && body.classList.contains('opening'))) autoQueued = true;
  loadApi(); // load early so the first tap finds a ready player
})();
