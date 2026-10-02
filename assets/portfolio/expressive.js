/* A visible typewriter and CSS-driven technology ribbon. The screen-reader
   descriptions remain static; no live region or data claims are animated. */
(() => {
  'use strict';

  function initialize() {
    const root = document.documentElement;
    if (root.classList.contains('portfolio-expressive-ready')) return;
    const terminal = document.querySelector('#build-terminal');
    const typed = document.querySelector('#typed-build');
    const marquee = document.querySelector('#tech-marquee');
    if (!terminal && !marquee) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const phrases = {
      en: [
        'AI that takes action.',
        'Games with a private side.',
        'Tools for curious builders.',
      ],
      zh: [
        '会行动的 AI 智能体。',
        '把选择藏好的加密游戏。',
        '给好奇开发者的实用工具。',
      ],
    };
    let language = window.portfolioI18n?.language === 'zh' ? 'zh' : 'en';
    let phraseIndex = 0;
    let position = 0;
    let phase = 'typing';
    let timer = null;
    let running = false;
    let hasStarted = false;

    const mayMove = () => !document.hidden && !reduced?.matches && !root.classList.contains('motion-paused');
    function initiallyVisible(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0;
    }
    let terminalInView = initiallyVisible(terminal);
    let marqueeInView = initiallyVisible(marquee);
    const mayType = () => !!terminal && !!typed && terminalInView && mayMove();
    const characters = () => Array.from(phrases[language][phraseIndex]);

    function stopTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }
    function render() {
      if (typed) typed.textContent = characters().slice(0, position).join('');
    }
    function showCompletePhrase() {
      position = characters().length;
      render();
    }
    function settleTyping() {
      stopTimer();
      running = false;
      phase = 'holding';
      showCompletePhrase();
      terminal?.classList.remove('expressive-typing');
    }
    function schedule(delay) {
      stopTimer();
      if (!mayType()) {
        settleTyping();
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        tick();
      }, delay);
    }
    function tick() {
      if (!mayType()) {
        settleTyping();
        return;
      }
      if (phase === 'typing') {
        position = Math.min(position + 1, characters().length);
        render();
        if (position === characters().length) {
          phase = 'holding';
          schedule(1800);
        } else schedule(75);
      } else if (phase === 'holding') {
        phase = 'deleting';
        schedule(38);
      } else if (position > 0) {
        position -= 1;
        render();
        schedule(38);
      } else {
        phraseIndex = (phraseIndex + 1) % phrases[language].length;
        phase = 'typing';
        schedule(220);
      }
    }
    function startTyping() {
      if (running || !mayType()) return;
      running = true;
      terminal.classList.add('expressive-typing');
      if (!hasStarted) {
        hasStarted = true;
        phase = 'typing';
        position = 0;
        render();
        schedule(150);
      } else {
        // Return from pause with a full, readable phrase; never catch up on
        // elapsed time or resume halfway through a deleted word.
        phase = 'holding';
        showCompletePhrase();
        schedule(1800);
      }
    }
    function syncMotion() {
      root.classList.toggle('expressive-document-hidden', document.hidden);
      if (mayType()) startTyping();
      else settleTyping();
      marquee?.classList.toggle('expressive-marquee-running', marqueeInView && mayMove());
    }

    document.addEventListener('portfolio:language', event => {
      const next = (event.detail?.language || window.portfolioI18n?.language) === 'zh' ? 'zh' : 'en';
      if (next === language) return;
      stopTimer();
      language = next;
      phraseIndex = 0;
      position = 0;
      phase = 'typing';
      running = false;
      hasStarted = false;
      showCompletePhrase();
      syncMotion();
    });
    document.addEventListener('portfolio:motion', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    reduced?.addEventListener?.('change', syncMotion);

    if (typeof window.IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.target === terminal) terminalInView = entry.isIntersecting && entry.intersectionRatio > 0;
          if (entry.target === marquee) marqueeInView = entry.isIntersecting && entry.intersectionRatio > 0;
        });
        syncMotion();
      }, { threshold: 0 });
      if (terminal) observer.observe(terminal);
      if (marquee) observer.observe(marquee);
    } else {
      // Older browsers retain the complete source copy and a stationary ribbon.
      terminalInView = false;
      marqueeInView = false;
    }

    root.classList.add('portfolio-expressive-ready');
    showCompletePhrase();
    syncMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
