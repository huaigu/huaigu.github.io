/* Decorative project motion. All content remains visible without this module.
   No data, counters, timers, or project claims are changed by these animations. */
(() => {
  'use strict';

  function initialize() {
    const root = document.documentElement;
    if (root.classList.contains('portfolio-motion-ready')) return;

    const reducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    let paused = root.classList.contains('motion-paused');
    const canAnimate = () => !paused && !reducedMotion?.matches;
    const revealTargets = [...document.querySelectorAll('.project, .section-heading, .about-grid, .laya-grid, .contact-section')];
    const revealed = new WeakSet();

    function animate(selector) {
      document.querySelectorAll(selector).forEach(element => element.classList.add('motion-loop'));
    }

    document.querySelectorAll('.player-screen').forEach(screen => {
      if (screen.querySelector('.motion-stream-track')) return;
      const track = document.createElement('span');
      track.className = 'motion-stream-track';
      track.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.className = 'motion-stream-fill motion-loop';
      track.append(fill);
      screen.append(track);
    });

    document.querySelectorAll('.snake-board svg').forEach(svg => {
      // Keep the original solid paths. Thin moving marks suggest a live game
      // without erasing the snakes, changing their geometry, or moving eyes.
      [...svg.querySelectorAll('path:not(.motion-snake-trace)')].forEach((path, index) => {
        if (path.nextElementSibling?.classList.contains('motion-snake-trace')) return;
        const trace = path.cloneNode(false);
        trace.removeAttribute('id');
        trace.setAttribute('class', 'motion-snake-trace motion-loop');
        trace.setAttribute('stroke', index % 2 === 0 ? '#c4ebce' : '#ffe2bf');
        trace.setAttribute('stroke-width', '3');
        trace.setAttribute('stroke-linecap', 'round');
        trace.setAttribute('stroke-dasharray', '3 29');
        trace.setAttribute('aria-hidden', 'true');
        trace.style.animationDelay = `${index * -1.7}s`;
        path.after(trace);
      });
      svg.querySelectorAll('rect').forEach(food => food.classList.add('motion-snake-food', 'motion-loop'));
    });

    animate('.round-clock, .direction, .number-tile, .proof-step, .workflow-number');

    function onMotionChange(event) {
      paused = typeof event.detail?.paused === 'boolean'
        ? event.detail.paused
        : root.classList.contains('motion-paused');
      // CSS handles loop pause/resume. Finishing a one-time entrance avoids
      // leaving a content block between positions when motion is turned off.
      if (paused) revealTargets.forEach(element => element.classList.remove('motion-reveal-once'));
    }

    window.addEventListener('portfolio:motion', onMotionChange);
    document.addEventListener('portfolio:motion', onMotionChange);
    if (reducedMotion?.addEventListener) {
      reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) revealTargets.forEach(element => element.classList.remove('motion-reveal-once'));
      });
    }

    if (typeof window.IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          entry.target.classList.toggle('motion-in-view', entry.isIntersecting);
          if (entry.isIntersecting && !revealed.has(entry.target)) {
            revealed.add(entry.target);
            if (canAnimate()) entry.target.classList.add('motion-reveal-once');
          }
        });
      }, { threshold: 0.12 });
      revealTargets.forEach(element => observer.observe(element));
    }
    // With no IntersectionObserver the decorations stay still and all page
    // content remains visible. No polling, scroll listener, or animation loop.
    root.classList.add('portfolio-motion-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
