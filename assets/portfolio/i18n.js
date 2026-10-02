(() => {
  'use strict';

  const storageKey = 'huaigu-portfolio-language';
  const entries = [];
  const attributes = [
    ['data-zh-label', 'aria-label'],
    ['data-zh-placeholder', 'placeholder'],
    ['data-zh-title', 'title'],
  ];

  // Capture authored English before any translation or dynamic enhancement runs.
  // Rich translations are restricted to the explicitly marked, authored markup.
  document.querySelectorAll('[data-zh]').forEach(element => {
    const html = element.hasAttribute('data-i18n-html');
    entries.push({
      element,
      property: html ? 'innerHTML' : 'textContent',
      english: html ? element.innerHTML : element.textContent,
      chinese: element.getAttribute('data-zh'),
    });
  });
  attributes.forEach(([source, target]) => {
    document.querySelectorAll(`[${source}]`).forEach(element => {
      entries.push({
        element,
        attribute: target,
        english: element.getAttribute(target),
        chinese: element.getAttribute(source),
      });
    });
  });

  const metadata = [
    {
      element: document.querySelector('title'),
      property: 'textContent',
      chinese: 'Alex Wang · huaigu — 让好奇心成为现实。',
    },
    {
      element: document.querySelector('meta[name="description"]'),
      attribute: 'content',
      chinese: 'Alex Wang，也叫 Bojack / huaigu。探索 AI 智能体、加密应用、链上游戏和开发工具，了解我的作品与全部公开代码仓库。',
    },
    {
      element: document.querySelector('meta[property="og:title"]'),
      attribute: 'content',
      chinese: 'Alex Wang · huaigu — 让好奇心成为现实。',
    },
    {
      element: document.querySelector('meta[property="og:description"]'),
      attribute: 'content',
      chinese: 'AI 智能体、加密世界、实用工具。这里记录我做过的作品、学到的东西，以及不断探索的想法。',
    },
  ];
  metadata.forEach(entry => {
    if (!entry.element) return;
    entry.english = entry.attribute
      ? entry.element.getAttribute(entry.attribute)
      : entry.element[entry.property];
    entries.push(entry);
  });

  let language = 'en';
  try {
    if (localStorage.getItem(storageKey) === 'zh') language = 'zh';
  } catch (_) {
    // The control still works when browser storage is unavailable.
  }

  const controls = [...document.querySelectorAll('[data-language]')];

  function applyLanguage() {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    entries.forEach(entry => {
      const value = language === 'zh' ? entry.chinese : entry.english;
      if (entry.attribute) {
        if (entry.element.getAttribute(entry.attribute) !== value) {
          entry.element.setAttribute(entry.attribute, value);
        }
      } else if (entry.element[entry.property] !== value) {
        entry.element[entry.property] = value;
      }
    });
    controls.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    document.dispatchEvent(new CustomEvent('portfolio:language', {
      detail: { language },
    }));
  }

  function setLanguage(nextLanguage) {
    if (nextLanguage !== 'en' && nextLanguage !== 'zh') return;
    language = nextLanguage;
    // Persist only an explicit choice; first visits always start in English.
    try {
      localStorage.setItem(storageKey, language);
    } catch (_) {
      // A deliberate choice applies for this page even without storage.
    }
    applyLanguage();
  }

  window.portfolioI18n = Object.freeze({
    get language() { return language; },
    pick(english, chinese) {
      return language === 'zh' && chinese != null ? chinese : english;
    },
    setLanguage,
  });

  controls.forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
  applyLanguage();
  document.querySelectorAll('.language-switch').forEach(group => {
    group.hidden = false;
  });
})();
