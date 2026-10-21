'use strict';
(() => {
  const overlay = document.getElementById('unboxing');
  const frames = [...overlay.querySelectorAll('.unbox-frame')];
  const gradient = overlay.querySelector('.unbox-gradient');
  const signature = document.getElementById('unbox-signature');
  const skip = document.getElementById('skip-opening');
  const replay = document.getElementById('replay-opening');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];

  function wait(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function showFrame(i) { frames.forEach((frame, j) => frame.classList.toggle('active', i === j)); }
  function complete() {
    clearTimers();
    overlay.hidden = true;
    overlay.classList.remove('is-gone');
    document.body.classList.remove('opening');
    replay.hidden = false;
    signature.classList.remove('active');
  }
  function fadeToLiveCover() {
    overlay.classList.add('is-gone');
    wait(complete, 1248);
  }
  function start() {
    clearTimers();
    overlay.hidden = false;
    overlay.classList.remove('is-gone', 'ivory-mode');
    gradient.classList.remove('active');
    signature.classList.remove('active');
    showFrame(0);
    replay.hidden = true;
    document.body.classList.add('opening');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (reduce) { wait(complete, 180); return; }
    wait(() => signature.classList.add('active'), 180);
    wait(() => showFrame(1), 728);
    wait(() => showFrame(2), 1612);
    wait(() => gradient.classList.add('active'), 1911);
    wait(fadeToLiveCover, 2340);
  }

  skip.addEventListener('click', complete);
  replay.addEventListener('click', start);

  // Landing directly on a chapter (including returning from Atlas) must not
  // replay the cover or send readers back to the top unexpectedly.
  const targetId = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (targetId && document.getElementById(targetId)) {
    complete();
    requestAnimationFrame(() => document.getElementById(targetId).scrollIntoView());
  } else {
    start();
  }
})();
