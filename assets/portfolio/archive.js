/* Public repository browser. Source means “not marked as a fork by GitHub”; it
   does not claim original authorship. Category labels are editorial heuristics. */
(() => {
  'use strict';

  const pageSize = 12;
  const list = document.querySelector('#repo-list');
  if (!list) return;

  const search = document.querySelector('#repo-search');
  const kind = document.querySelector('#repo-kind');
  const language = document.querySelector('#repo-language');
  const sort = document.querySelector('#repo-sort');
  const count = document.querySelector('#repo-count');
  const loadMore = document.querySelector('#repo-load-more');
  const reset = document.querySelector('#repo-reset');
  const categories = [...document.querySelectorAll('[data-category]')];
  let repositories = [];
  let activeCategory = 'all';
  let visible = pageSize;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function normalize(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function verifiedUrl(repository) {
    try {
      const url = new URL(repository.html_url);
      return url.protocol === 'https:' && url.hostname === 'github.com' &&
        url.pathname.toLowerCase() === `/huaigu/${repository.name}`.toLowerCase() &&
        !url.username && !url.password && !url.search && !url.hash ? url.href : null;
    } catch {
      return null;
    }
  }

  function timestamp(repository) {
    return Date.parse(repository.updated_at) || 0;
  }

  function createCard(repository) {
    const card = element('article', 'repo-card');
    const top = element('div', 'repo-topline');
    const title = element('h3', 'repo-title');
    const link = element('a', 'repo-name', repository.name);
    link.href = repository.html_url;
    const arrow = element('span', 'repo-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(arrow);
    title.append(link);
    const badge = element('span', `repo-badge ${repository.fork ? 'is-fork' : 'is-source'}`, repository.fork ? 'Fork' : 'Source');
    top.append(badge);
    const description = element('p', 'repo-description', repository.description?.trim() || 'Public repository. Explore the code on GitHub.');
    const meta = element('div', 'repo-meta');
    meta.append(element('span', 'repo-language', repository.language || 'No language listed'));
    const stars = Number(repository.stargazers_count) || 0;
    const starLabel = element('span', 'repo-stars', `☆ ${stars.toLocaleString('en-US')}`);
    starLabel.setAttribute('aria-label', `${stars} ${stars === 1 ? 'star' : 'stars'}`);
    meta.append(starLabel);
    if (timestamp(repository)) {
      const updated = element('time', 'repo-updated', new Intl.DateTimeFormat('en-US', {
        month: 'short', year: 'numeric', timeZone: 'UTC',
      }).format(new Date(repository.updated_at)));
      updated.dateTime = repository.updated_at;
      updated.title = 'Repository last updated on GitHub';
      meta.append(updated);
    }
    if (repository.archived) meta.append(element('span', 'repo-badge is-archived', 'Archived'));
    card.append(top, title, description, meta);
    return card;
  }

  function render(moveFocus = false) {
    const query = normalize(search?.value).trim();
    const terms = query.split(/\s+/).filter(Boolean);
    const filtered = repositories.filter(repository => {
      if (kind?.value === 'owned' && repository.fork) return false;
      if (kind?.value === 'forks' && !repository.fork) return false;
      if (language?.value !== 'all' && language?.value && (repository.language || 'Unspecified') !== language.value) return false;
      if (activeCategory !== 'all' && !repository.categories?.includes(activeCategory)) return false;
      return terms.every(term => repository.searchText.includes(term));
    });
    filtered.sort((a, b) => {
      if (sort?.value === 'name') return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      if (sort?.value === 'stars') return b.stargazers_count - a.stargazers_count || timestamp(b) - timestamp(a) || a.name.localeCompare(b.name);
      return timestamp(b) - timestamp(a) || a.name.localeCompare(b.name);
    });

    const priorVisible = list.children.length;
    const fragment = document.createDocumentFragment();
    for (const repository of filtered.slice(0, visible)) fragment.append(createCard(repository));
    if (!filtered.length) {
      const empty = element('div', 'repo-empty');
      empty.append(element('h3', 'repo-empty-title', 'No repositories found.'), element('p', '', 'Try a different search or reset the filters.'));
      fragment.append(empty);
    }
    list.replaceChildren(fragment);
    if (count) count.textContent = `Showing ${Math.min(visible, filtered.length)} of ${filtered.length} ${filtered.length === 1 ? 'repository' : 'repositories'}`;
    if (loadMore) {
      loadMore.hidden = visible >= filtered.length;
      loadMore.textContent = `Show ${Math.min(pageSize, Math.max(0, filtered.length - visible))} more`;
    }
    if (moveFocus) list.children[priorVisible]?.querySelector('a')?.focus({ preventScroll: true });
    for (const button of categories) {
      const selected = button.dataset.category === activeCategory;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  async function initialize() {
    try {
      // Embedding supports a downloaded, file:// preview without a server.
      const embedded = document.querySelector('#repo-data');
      let data;
      if (embedded) data = JSON.parse(embedded.textContent);
      else {
        const response = await fetch('./assets/portfolio/repos.json');
        if (!response.ok) throw new Error('Repository data unavailable');
        data = await response.json();
      }
      if (data.owner !== 'huaigu' || !Array.isArray(data.repositories)) throw new Error('Invalid repository data');
      repositories = data.repositories.map(repository => {
        const url = verifiedUrl(repository);
        if (!url || repository.visibility !== 'public' || repository.private === true) throw new Error('Invalid public repository');
        return {
          ...repository,
          html_url: url,
          searchText: normalize([repository.name, repository.description, repository.language, ...(repository.topics || [])].join(' ')),
        };
      });
      const snapshot = document.querySelector('.snapshot-note');
      if (snapshot && data.fetched_at && Number.isFinite(Date.parse(data.fetched_at))) snapshot.textContent = 'Snapshot · ' + new Intl.DateTimeFormat('en-US', {year:'numeric', month:'long', day:'numeric', timeZone:'UTC'}).format(new Date(data.fetched_at));
      const sources = repositories.filter(repository => !repository.fork).length;
      const totals = { 'repo-total': repositories.length, 'source-total': sources, 'fork-total': repositories.length - sources };
      for (const [attribute, value] of Object.entries(totals)) {
        document.querySelectorAll(`[data-${attribute}]`).forEach(node => { node.textContent = String(value); });
      }
      if (language) {
        const languages = new Map();
        for (const repository of repositories) {
          const name = repository.language || 'Unspecified';
          languages.set(name, (languages.get(name) || 0) + 1);
        }
        for (const [name, total] of [...languages].sort((a, b) => a[0].localeCompare(b[0]))) {
          const option = element('option', '', `${name} (${total})`);
          option.value = name;
          language.append(option);
        }
      }
      const refresh = () => { visible = pageSize; render(); };
      search?.addEventListener('input', refresh);
      kind?.addEventListener('change', refresh);
      language?.addEventListener('change', refresh);
      sort?.addEventListener('change', refresh);
      for (const button of categories) button.addEventListener('click', () => {
        activeCategory = button.dataset.category;
        refresh();
      });
      loadMore?.addEventListener('click', () => { visible += pageSize; render(true); });
      reset?.addEventListener('click', () => {
        if (search) search.value = '';
        if (kind) kind.value = 'all';
        if (language) language.value = 'all';
        if (sort) sort.value = 'updated';
        activeCategory = 'all';
        refresh();
        search?.focus({ preventScroll: true });
      });
      render();
    } catch (error) {
      list.replaceChildren(element('p', 'repo-empty', 'The repository archive could not load. Browse all public repositories on GitHub using the link above.'));
      if (count) count.textContent = 'Archive unavailable';
      if (loadMore) loadMore.hidden = true;
      console.error('Repository archive:', error.message);
    }
  }

  initialize();
})();
