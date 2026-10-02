/* Small, progressive enhancements: all content stays readable before JS runs.
   No text replacement, continuous animation loop, or child-element hooks. */
(() => {
  'use strict';

  function initialize() {
    const root = document.documentElement;
    if (root.classList.contains('portfolio-interactions-ready')) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    const canMove = () => !document.hidden && !reduced?.matches && !root.classList.contains('motion-paused');
    const canTilt = () => canMove() && finePointer?.matches;
    const activeEntrances = new Set();
    const pendingPointers = new Map();
    const tilted = new Set();
    const tiltProperties = ['--interaction-rotate-x', '--interaction-rotate-y', '--interaction-light-x', '--interaction-light-y'];
    let pointerFrame = null;

    function finishEntrance(element) {
      element.classList.remove('interaction-hero-enter', 'interaction-repo-enter', 'interaction-heading-reveal');
      element.style.removeProperty('--interaction-delay');
      activeEntrances.delete(element);
    }

    function enter(element, className, delay = 0) {
      if (!canMove()) return;
      element.style.setProperty('--interaction-delay', `${delay}ms`);
      element.classList.add(className);
      activeEntrances.add(element);
    }

    // Delegation survives translations that replace authored rich text.
    document.addEventListener('animationend', event => {
      if (event.animationName.startsWith('interaction-')) finishEntrance(event.target);
    });

    function resetArt(art) {
      pendingPointers.delete(art);
      tilted.delete(art);
      art.classList.remove('is-interaction-hovered');
      tiltProperties.forEach(property => art.style.removeProperty(property));
    }

    function resetTilt() {
      if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
      pointerFrame = null;
      pendingPointers.clear();
      [...tilted].forEach(resetArt);
    }

    function flushPointers() {
      pointerFrame = null;
      if (!canTilt()) {
        resetTilt();
        return;
      }
      // One layout read and style update per active card per frame, at most.
      pendingPointers.forEach((point, art) => {
        const rect = art.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.max(0, Math.min(1, (point.x - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (point.y - rect.top) / rect.height));
        art.style.setProperty('--interaction-rotate-x', `${((.5 - y) * 5).toFixed(2)}deg`);
        art.style.setProperty('--interaction-rotate-y', `${((x - .5) * 6).toFixed(2)}deg`);
        art.style.setProperty('--interaction-light-x', `${(x * 100).toFixed(1)}%`);
        art.style.setProperty('--interaction-light-y', `${(y * 100).toFixed(1)}%`);
      });
      pendingPointers.clear();
    }

    document.querySelectorAll('.project-art').forEach(art => {
      art.classList.add('interaction-tilt-target');
      const move = event => {
        if (event.pointerType === 'touch' || !canTilt()) return;
        art.classList.add('is-interaction-hovered');
        tilted.add(art);
        pendingPointers.set(art, { x: event.clientX, y: event.clientY });
        if (pointerFrame === null) pointerFrame = requestAnimationFrame(flushPointers);
      };
      art.addEventListener('pointerenter', move, { passive: true });
      art.addEventListener('pointermove', move, { passive: true });
      art.addEventListener('pointerleave', () => resetArt(art), { passive: true });
      art.addEventListener('pointercancel', () => resetArt(art), { passive: true });
    });

    function syncMotion() {
      root.classList.toggle('interactions-document-hidden', document.hidden);
      if (!canTilt()) resetTilt();
      if (!canMove()) [...activeEntrances].forEach(finishEntrance);
    }
    document.addEventListener('portfolio:motion', syncMotion);
    window.addEventListener('portfolio:motion', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    window.addEventListener('blur', resetTilt);
    reduced?.addEventListener?.('change', syncMotion);
    finePointer?.addEventListener?.('change', syncMotion);

    root.classList.add('portfolio-interactions-ready');
    syncMotion();

    // Start from an already readable state. These entrances never gate content.
    const heroParts = document.querySelectorAll('.hero-copy > .eyebrow, .hero-copy > h1, .hero-copy > .hero-intro, .hero-copy > .hero-description, .hero-copy > .hero-actions, .hero > .hero-foot');
    heroParts.forEach((element, index) => enter(element, 'interaction-hero-enter', index * 65));

    if (typeof window.IntersectionObserver !== 'function') return;

    const headingObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        enter(entry.target, 'interaction-heading-reveal', 100);
        headingObserver.unobserve(entry.target);
      });
    }, { threshold: .7 });
    document.querySelectorAll('.section-heading h2, .laya-copy h2, .about-left h2').forEach(heading => {
      heading.classList.add('interaction-heading');
      headingObserver.observe(heading);
    });

    const repositoryList = document.querySelector('#repo-list');
    if (!repositoryList) return;
    const cardOrder = new WeakMap();
    const repositoryObserver = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach(entry => {
        const index = cardOrder.get(entry.target) || 0;
        enter(entry.target, 'interaction-repo-enter', Math.min(index % 12, 7) * 32);
        repositoryObserver.unobserve(entry.target);
      });
    }, { threshold: .08 });

    function observeCards(nodes) {
      nodes.forEach(node => {
        if (node.nodeType !== 1 || !node.matches('.repo-card')) return;
        cardOrder.set(node, [...repositoryList.children].indexOf(node));
        repositoryObserver.observe(node);
      });
    }
    observeCards([...repositoryList.children]);

    if (typeof window.MutationObserver === 'function') {
      const listObserver = new MutationObserver(records => {
        records.forEach(record => {
          record.removedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            repositoryObserver.unobserve(node);
            activeEntrances.delete(node);
          });
          observeCards([...record.addedNodes]);
        });
      });
      // Observe only replacement cards; translated text and style updates do not
      // trigger this observer, and filtering remains wholly owned by archive.js.
      listObserver.observe(repositoryList, { childList: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
