(() => {
  'use strict';
  const body = document.querySelector('.post-body');
  const progress = document.querySelector('.article-progress');
  if (!body || !progress) return;

  const toc = document.querySelector('.toc-details');
  const compact = window.matchMedia('(max-width: 900px)');
  const fitToc = () => { if (toc) toc.open = !compact.matches; };
  fitToc();
  compact.addEventListener('change', fitToc);

  const headings = [...body.querySelectorAll('h2[id]')];
  const links = [...document.querySelectorAll('.toc-link')];
  let queued = false;
  function updateReadingPosition() {
    queued = false;
    const rect = body.getBoundingClientRect();
    const available = Math.max(1, rect.height - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, -rect.top / available));
    progress.style.transform = `scaleX(${ratio})`;
    let current = headings[0]?.id;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 110) current = heading.id;
      else break;
    }
    links.forEach(link => {
      if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function schedule() {
    if (!queued) {
      queued = true;
      window.requestAnimationFrame(updateReadingPosition);
    }
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('portfolio:language', schedule);
  updateReadingPosition();
})();
