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

    function decoration(className) {
      const element = document.createElement('span');
      element.className = className;
      element.setAttribute('aria-hidden', 'true');
      return element;
    }

    function svgElement(tag, attributes) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
      return element;
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

      const waveform = decoration('motion-equalizer');
      for (let index = 0; index < 22; index += 1) {
        const bar = decoration('motion-equalizer-bar motion-loop');
        // Different fixed phases create a calm waveform, without a JS ticker.
        bar.style.animationDelay = `${-(index * 0.27 + (index % 4) * 0.38)}s`;
        bar.style.animationDuration = `${1.8 + (index % 5) * 0.29}s`;
        bar.style.height = `${8 + ((index * 7) % 13)}px`;
        waveform.append(bar);
      }
      screen.append(waveform);
    });

    document.querySelectorAll('.forecast-visual').forEach(visual => {
      if (visual.querySelector('.motion-forecast-line')) return;
      // A decorative signal, not historical or live price data. It is hidden
      // from assistive technology and introduces no values or financial claims.
      const svg = svgElement('svg', {
        class: 'motion-forecast-line', viewBox: '0 0 520 230',
        'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none',
      });
      const path = 'M-20 166 L34 166 62 142 94 154 131 112 165 131 199 88 234 108 268 97 301 117 337 78 375 103 408 80 444 93 480 54 540 68';
      svg.append(
        svgElement('path', { d: path, fill: 'none', stroke: '#ac957c', 'stroke-width': '1', opacity: '.29' }),
        svgElement('path', {
          d: path, class: 'motion-forecast-signal motion-loop', fill: 'none',
          stroke: '#997249', 'stroke-width': '2', 'stroke-linecap': 'round',
          pathLength: '100', 'stroke-dasharray': '9 91',
        }),
      );
      visual.prepend(svg);
    });

    document.querySelectorAll('.number-visual').forEach(visual => {
      if (visual.querySelector('.motion-cipher-field')) return;
      const svg = svgElement('svg', {
        class: 'motion-cipher-field', viewBox: '0 0 420 280',
        'aria-hidden': 'true', focusable: 'false',
      });
      [-19, 23].forEach((rotation, index) => {
        const geometry = { cx: '210', cy: '140', rx: '183', ry: '96', fill: 'none', transform: `rotate(${rotation} 210 140)` };
        svg.append(svgElement('ellipse', { ...geometry, stroke: '#6887a1', 'stroke-width': '1', opacity: '.24' }));
        const signal = svgElement('ellipse', {
          ...geometry, class: 'motion-cipher-signal motion-loop', stroke: '#557a9b',
          'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-dasharray': '3 109',
        });
        signal.style.animationDirection = index ? 'reverse' : 'normal';
        signal.style.animationDelay = `${index * -4}s`;
        svg.append(signal);
      });
      visual.prepend(svg);
    });

    document.querySelectorAll('.proof-connector').forEach((connector, index) => {
      if (connector.querySelector('.motion-proof-rail')) return;
      const rail = decoration('motion-proof-rail');
      const packet = decoration('motion-proof-packet motion-loop');
      packet.style.animationDelay = `${0.45 + (index % 2) * 2.1}s`;
      rail.append(packet);
      connector.append(rail);
    });

    document.querySelectorAll('.workflow-steps li:not(:last-child)').forEach((step, index) => {
      if (step.querySelector('.motion-workflow-rail')) return;
      const rail = decoration('motion-workflow-rail');
      const packet = decoration('motion-workflow-packet motion-loop');
      packet.style.animationDelay = `${0.4 + (index % 2) * 3}s`;
      rail.append(packet);
      step.append(rail);
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

    animate('.play-symbol, .round-clock, .direction, .number-tile, .proof-step, .workflow-number');

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
