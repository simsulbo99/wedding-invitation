'use strict';
/* Airplane bridge between the invitation and the Atlas (two seconds).
   app-shell.js calls WeddingBridge.run(direction, swap):
     'to-atlas'      the plane flies left -> right
     'to-invitation' the same image, mirrored with scaleX(-1), flies right -> left
   swap() switches the visible view at the midpoint; afterwards the overlay is removed entirely,
   so it never blocks scrolling or touch. The BGM player is never touched here.
   Reduced motion, a plane image that will not load, or any error -> swap() runs at once.
   run() always resolves and calls swap() exactly once. */
(() => {
  const SRC = './images/airplane-bridge.webp';
  const DURATION = 2000;
  const SWAP_AT = 1000;
  const IMAGE_WAIT = 450; // do not hold the guest back for a slow image: switch without the flight
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let imageReady = null;
  let active = null;

  function preload() {
    if (!imageReady) {
      const image = new Image();
      image.decoding = 'async';
      image.src = SRC;
      const loaded = image.decode
        ? image.decode()
        : new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      imageReady = loaded.then(() => true, () => { imageReady = null; return false; });
    }
    return imageReady;
  }
  const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(false), ms))]);

  // Same quadratic curve for the dotted trail (SVG, in px) and the plane (CSS keyframes, in vw/vh):
  // start (-10%, 58%) -> control (50%, 38%) -> end (110%, 58%) of the viewport.
  function build(direction) {
    const w = window.innerWidth, h = window.innerHeight;
    const pt = (x, y) => `${(x * w / 100).toFixed(1)} ${(y * h / 100).toFixed(1)}`;
    const d = direction === 'to-atlas'
      ? `M ${pt(-10, 58)} Q ${pt(50, 38)} ${pt(110, 58)}`
      : `M ${pt(110, 58)} Q ${pt(50, 38)} ${pt(-10, 58)}`;
    const root = document.createElement('div');
    root.className = `bridge is-${direction}`;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      `<svg class="bridge-trail" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" focusable="false">` +
        `<defs><mask id="bridge-reveal" maskUnits="userSpaceOnUse" x="${-w}" y="0" width="${w * 3}" height="${h}">` +
          `<path class="bridge-reveal" d="${d}"/></mask></defs>` +
        `<path class="bridge-dash" d="${d}" mask="url(#bridge-reveal)"/>` +
      '</svg>' +
      `<div class="bridge-flight"><img class="bridge-plane" src="${SRC}" alt="" decoding="async"></div>`;
    const reveal = root.querySelector('.bridge-reveal');
    let length = 0;
    try { length = reveal.getTotalLength(); } catch (e) { length = w * 1.3; }
    root.style.setProperty('--trail-length', String(Math.ceil(length) + 2));
    return root;
  }

  function run(direction, swap) {
    let swapped = false;
    const doSwap = () => {
      if (swapped) return;
      swapped = true;
      try { swap(); } catch (e) { setTimeout(() => { throw e; }); }
    };
    if (active) active.finish(); // a new trip finishes the previous one first, never overlaps it
    if (reduceMotion() || !document.body) { doSwap(); return Promise.resolve(); }

    return within(preload(), IMAGE_WAIT).then(ok => {
      if (!ok) { doSwap(); return; }
      return new Promise(resolve => {
        let root = null;
        const timers = [];
        const trip = {
          finish() {
            timers.forEach(clearTimeout);
            doSwap();
            if (root) root.remove();
            if (active === trip) active = null;
            resolve();
          }
        };
        try {
          if (active) active.finish();
          root = build(direction);
          document.body.appendChild(root);
          active = trip;
          timers.push(setTimeout(doSwap, SWAP_AT));
          timers.push(setTimeout(() => trip.finish(), DURATION + 40));
        } catch (e) {
          trip.finish();
        }
      });
    }).catch(() => { doSwap(); });
  }

  window.WeddingBridge = { run, preload };
})();
