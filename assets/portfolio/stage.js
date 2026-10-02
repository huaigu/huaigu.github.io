/* Finite text and artwork entrances. Original markup and text stay semantic;
   the unenhanced page is always readable, and no scroll behavior is replaced. */
(() => {
  'use strict';

  function initialize() {
    const root = document.documentElement;
    if (root.classList.contains('portfolio-stage-ready')) return;
    const headingSelector = '.hero h1, .section-heading h2, .laya-copy h2, .about-left h2, .contact-title';
    const reduced = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const records = new Map();
    const canAnimate = () => !document.hidden && !reduced?.matches && !root.classList.contains('motion-paused');
    const canObserve = typeof window.IntersectionObserver === 'function';

    function textSegments(text) {
      const chinese = /[\u3400-\u9fff]/u.test(text);
      if (!chinese) return text.match(/\s+|\S+/gu) || [];
      let pieces;
      if (typeof Intl.Segmenter === 'function') {
        pieces = [...new Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(text)].map(part => part.segment);
      } else {
        pieces = [...text];
      }
      // Keep closing punctuation with the word before it; never add, remove,
      // normalize, or duplicate any source characters or spaces.
      const segments = [];
      for (const piece of pieces) {
        if (/^[，。！？、；：”’）》】]+$/u.test(piece) && segments.length && !/^\s+$/u.test(segments.at(-1))) {
          segments[segments.length - 1] += piece;
        } else segments.push(piece);
      }
      return segments;
    }

    function wrapHeading(heading) {
      heading.classList.remove('stage-text-enter');
      // Translations can replace all or only part of a heading. Rebuild from
      // current connected nodes; never keep references to translated children.
      heading.querySelectorAll('.stage-word-mask').forEach(mask => {
        mask.replaceWith(document.createTextNode(mask.textContent));
      });
      heading.normalize();
      const textBefore = heading.textContent;
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest('sup, script, style, svg, [aria-hidden="true"], [data-repo-total]')) return NodeFilter.FILTER_REJECT;
          if (/^[\s\d.,+%/:·−-]+$/u.test(node.textContent)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      let wordIndex = 0;
      for (const node of nodes) {
        const fragment = document.createDocumentFragment();
        for (const segment of textSegments(node.textContent)) {
          if (!segment.trim() || /^[\d.,+%/:·−-]+$/u.test(segment)) {
            fragment.append(document.createTextNode(segment));
            continue;
          }
          const mask = document.createElement('span');
          const word = document.createElement('span');
          mask.className = 'stage-word-mask';
          word.className = 'stage-word-rise';
          word.textContent = segment;
          word.style.setProperty('--stage-delay', `${Math.min(wordIndex * 60, 400)}ms`);
          mask.append(word);
          fragment.append(mask);
          wordIndex += 1;
        }
        node.replaceWith(fragment);
      }
      // The wrappers are meaningful inline text, so they remain accessible.
      // No aria-label, aria-hidden, or duplicate heading is introduced.
      if (heading.textContent !== textBefore) {
        heading.querySelectorAll('.stage-word-mask').forEach(mask => mask.replaceWith(document.createTextNode(mask.textContent)));
        return false;
      }
      heading.classList.add('stage-heading');
      return wordIndex > 0;
    }

    function settle(record) {
      record.element.classList.remove(record.kind === 'text' ? 'stage-text-enter' : 'stage-art-enter');
    }

    function enter(record) {
      if (!record.armed || !canAnimate()) return;
      record.armed = false;
      record.element.classList.add(record.kind === 'text' ? 'stage-text-enter' : 'stage-art-enter');
    }

    const observer = canObserve ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        const record = records.get(entry.target);
        if (!record) continue;
        record.inView = entry.isIntersecting;
        if (!entry.isIntersecting) {
          // A threshold below 18% does not rearm. A complete viewport exit does.
          record.armed = true;
          settle(record);
        } else if (entry.intersectionRatio >= .18) {
          enter(record);
        }
      }
    }, { threshold: [0, .18] }) : null;

    function addRecord(element, kind) {
      const record = { element, kind, armed: true, inView: false };
      records.set(element, record);
      observer?.observe(element);
      return record;
    }

    function rebuildHeadings(replayVisible = false) {
      for (const [element, record] of records) {
        if (!element.isConnected) {
          observer?.unobserve(element);
          records.delete(element);
        } else if (record.kind === 'text') settle(record);
      }
      document.querySelectorAll(headingSelector).forEach(heading => {
        if (!wrapHeading(heading)) return;
        const record = records.get(heading) || addRecord(heading, 'text');
        if (replayVisible && canObserve && canAnimate()) {
          const rect = heading.getBoundingClientRect();
          const visible = Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top);
          if (visible >= rect.height * .18) {
            record.armed = true;
            enter(record);
          }
        }
      });
    }

    rebuildHeadings();
    document.querySelectorAll('.project-art').forEach(art => {
      if (!art.querySelector('.stage-art-curtain')) {
        const curtain = document.createElement('span');
        curtain.className = 'stage-art-curtain';
        curtain.setAttribute('aria-hidden', 'true');
        art.append(curtain);
      }
      addRecord(art, 'art');
    });

    function syncMotion() {
      root.classList.toggle('stage-document-hidden', document.hidden);
      if (!canAnimate()) records.forEach(settle);
    }

    document.addEventListener('portfolio:language', () => rebuildHeadings(true));
    document.addEventListener('portfolio:motion', syncMotion);
    window.addEventListener('portfolio:motion', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    reduced?.addEventListener?.('change', syncMotion);
    root.classList.add('portfolio-stage-ready');
    syncMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
