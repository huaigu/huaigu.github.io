/* Scroll-linked depth, without changing the browser's scrolling behavior. */
(() => {
  'use strict';
  const root = document.documentElement;
  if (root.classList.contains('portfolio-scroll-ready')) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 760px)');
  const canMove = () => !document.hidden && !reduced.matches && !root.classList.contains('motion-paused');
  const clamp = value => Math.max(0, Math.min(1, value));
  const records = [];
  const visible = new Set();
  let frame = null;

  function decoration(className) {
    const element = document.createElement('span');
    element.className = className;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  document.querySelectorAll('.project').forEach(project => {
    const art = project.querySelector('.project-art');
    const scene = art?.querySelector('.shelby-player, .forecast-visual, .number-visual, .proof-visual, .snake-board');
    if (!art || !scene) return;
    scene.classList.add('scroll-scene');
    const track = decoration('scroll-art-track');
    track.append(decoration('scroll-art-fill'));
    art.append(track);
    records.push({ anchor: project, scene, art, kind: 'project' });
  });

  const hero = document.querySelector('.hero');
  const lab = document.querySelector('#orbital');
  if (hero && lab) {
    lab.classList.add('scroll-depth-panel');
    records.push({ anchor: hero, scene: lab, kind: 'hero' });
  }
  const laya = document.querySelector('.laya-grid');
  const workflow = document.querySelector('.laya-workflow');
  if (laya && workflow) {
    workflow.classList.add('scroll-depth-panel');
    records.push({ anchor: laya, scene: workflow, kind: 'workflow' });
  }

  document.querySelectorAll('#work, .laya-grid, .about-grid, #repositories, .contact-section').forEach(section => {
    section.classList.add('scroll-chapter');
    const rail = decoration('scroll-chapter-rail');
    rail.append(decoration('scroll-chapter-fill'), decoration('scroll-chapter-dot'));
    section.append(rail);
    records.push({ anchor: section, rail, kind: 'chapter' });
  });

  function render() {
    frame = null;
    if (!canMove()) return;
    const height = window.innerHeight;
    // Measure stationary ancestors first; never measure the shifted scene.
    const measured = [...visible].map(record => ({ record, rect: record.anchor.getBoundingClientRect() }));
    measured.forEach(({ record, rect }) => {
      const progress = clamp((height - rect.top) / (height + rect.height));
      if (record.kind === 'chapter') {
        const start = narrow.matches ? 0 : 30;
        const journey = clamp((height * .62 - rect.top - start) / Math.max(1, rect.height - start * 2));
        record.rail.style.setProperty('--scroll-journey', journey.toFixed(4));
        return;
      }
      let shift = 0;
      if (record.kind === 'hero') {
        shift = -clamp(-rect.top / Math.max(1, rect.height)) * (narrow.matches ? 16 : 42);
      } else {
        shift = (.5 - progress) * (record.kind === 'workflow' ? 28 : narrow.matches ? 24 : 64);
      }
      record.scene.style.setProperty('--scroll-shift', `${shift.toFixed(2)}px`);
      if (record.art) {
        record.scene.style.setProperty('--scroll-turn', `${((progress - .5) * (narrow.matches ? 0 : 4)).toFixed(2)}deg`);
        record.scene.style.setProperty('--scroll-scale', (1 + (progress - .5) * (narrow.matches ? .04 : .10)).toFixed(4));
        record.art.style.setProperty('--scroll-art-progress', progress.toFixed(4));
      }
    });
  }

  function schedule() {
    if (frame === null && canMove() && visible.size) frame = requestAnimationFrame(render);
  }
  function syncMotion() {
    root.classList.toggle('scroll-effects-paused', !canMove());
    if (!canMove()) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      return;
    }
    schedule();
  }

  // A single passive scroll listener, one scheduled frame, and only visible
  // sections. There is no continuous loop, scroll interception, or scroll snap.
  if ('IntersectionObserver' in window) {
    const byAnchor = new Map();
    records.forEach(record => {
      if (!byAnchor.has(record.anchor)) byAnchor.set(record.anchor, []);
      byAnchor.get(record.anchor).push(record);
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        byAnchor.get(entry.target).forEach(record => {
          if (entry.isIntersecting) visible.add(record);
          else visible.delete(record);
        });
      });
      schedule();
    }, { rootMargin: '80px 0px', threshold: 0 });
    byAnchor.forEach((_, anchor) => observer.observe(anchor));
  } else {
    // Old browsers retain the original static artwork.
    return;
  }
  root.classList.add('portfolio-scroll-ready');
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('portfolio:motion', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  document.addEventListener('portfolio:language', schedule);
  reduced.addEventListener('change', syncMotion);
  narrow.addEventListener('change', schedule);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    new Set(records.map(record => record.anchor)).forEach(anchor => observer.observe(anchor));
  }
  syncMotion();
})();
