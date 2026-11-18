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
  const choices = document.getElementById('unbox-choices');
  const tapToOpen = document.getElementById('tap-to-open');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];
  // Unboxing runs at 1.875× original speed (1.25× faster than the previous 1.5×). CSS transitions follow the same ratio.
  const SPEED = 1.875;

  function wait(fn, ms) { timers.push(window.setTimeout(fn, ms / SPEED)); }
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
    disarm();
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
  function start(keepSignature) {
    disarm();
    clearTimers();
    overlay.hidden = false;
    overlay.classList.remove('is-gone', 'ivory-mode', 'doors-open');
    inside.classList.remove('on');
    doors.forEach(door => door.classList.remove('on'));
    gradient.classList.remove('active');
    if (keepSignature !== true) signature.classList.remove('active');
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

  // First screen: a single quiet "TAP TO OPEN" prompt over the sealed gift box.
  function arm() {
    clearTimers();
    overlay.hidden = false;
    showFrame(0);
    replay.hidden = true;
    document.body.classList.add('opening');
    window.scrollTo(0, 0);
    wait(() => signature.classList.add('active'), 180);
    overlay.classList.add('is-armed');
    window.dispatchEvent(new Event('invitation:armed'));
  }
  function disarm() {
    overlay.classList.remove('is-armed');
  }
  function onTapToOpen(event) {
    // Only the sealed, waiting box can start. Replay, Skip and the live invitation
    // never inherit an accidental full-screen click handler.
    if (!overlay.classList.contains('is-armed')) return;
    if (event.target.closest('button:not(#tap-to-open), a, input, select, textarea')) return;
    event.preventDefault();
    event.stopPropagation();
    disarm(); // Guard against rapid double taps.
    // This fires synchronously inside the user gesture for YouTube playback.
    // bgm.js respects the preselected ON/OFF choice, independent of this tap.
    try { window.dispatchEvent(new CustomEvent('invitation:open')); } catch (e) { /* BGM is optional */ }
    start(true);
  }
  // Any tap on the sealed box opens it. The BGM dock is a separate sibling above
  // the overlay, so its control never bubbles into this listener.
  overlay.addEventListener('click', onTapToOpen);

  // Recover if the in-app browser restores a page from its back/forward cache.
  window.addEventListener('pageshow', () => {
    if (!document.body.classList.contains('opening')) complete();
  });

  skip.addEventListener('click', complete);
  replay.addEventListener('click', () => start());

  // Landing directly on a chapter (including returning from Atlas) must not
  // replay the cover or send readers back to the top unexpectedly.
  const targetId = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (targetId && document.getElementById(targetId)) {
    complete();
    requestAnimationFrame(() => document.getElementById(targetId).scrollIntoView());
  } else if (choices && tapToOpen) {
    arm();
  } else {
    start();
  }
})();
