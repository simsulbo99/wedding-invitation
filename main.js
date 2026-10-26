'use strict';
(() => {
  const overlay = document.getElementById('unboxing');
  const frames = [...overlay.querySelectorAll('.unbox-frame')];
  const gradient = overlay.querySelector('.unbox-gradient');
  const signature = document.getElementById('unbox-signature');
  const inside = document.getElementById('unbox-inside');
  const doors = [...overlay.querySelectorAll('.unbox-door')];
  const skip = document.getElementById('skip-opening');
  const replay = document.getElementById('replay-opening');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];

  function wait(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function showFrame(i) { frames.forEach((frame, j) => frame.classList.toggle('active', i === j)); }
  // Fade the next frame in over the current one, so the ivory backdrop never shows mid-dissolve.
  function stackFrame(i) {
    frames[i].classList.add('active');
    wait(() => frames[i - 1].classList.remove('active'), 1100);
  }
  // Swap the closed-lid frame for its two halves, then hinge them open onto the rings.
  function openDoors() {
    inside.classList.add('on');
    doors.forEach(door => door.classList.add('on'));
    frames[3].classList.remove('active');
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('doors-open')));
  }
  function complete() {
    clearTimers();
    overlay.hidden = true;
    overlay.classList.remove('is-gone');
    document.body.classList.remove('opening');
    // Do not set overflow on either scrolling root; CSS keeps it native.
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
    overlay.classList.remove('is-gone', 'ivory-mode', 'doors-open');
    inside.classList.remove('on');
    doors.forEach(door => door.classList.remove('on'));
    gradient.classList.remove('active');
    signature.classList.remove('active');
    showFrame(0);
    replay.hidden = true;
    document.body.classList.add('opening');
    window.scrollTo(0, 0);
    wait(() => signature.classList.add('active'), 180);
    wait(() => stackFrame(1), 900);
    wait(() => stackFrame(2), 1900);
    wait(() => stackFrame(3), 3000);
    wait(openDoors, 4400);
    wait(() => overlay.classList.add('ivory-mode'), 5600);
    wait(fadeToLiveCover, 7300);
  }

  // Recover if the in-app browser restores a page from its back/forward cache.
  window.addEventListener('pageshow', () => {
    if (!document.body.classList.contains('opening')) complete();
  });

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
