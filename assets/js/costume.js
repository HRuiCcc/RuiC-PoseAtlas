/* ==========================================================================
   RuiC-CostumeAtlas — gallery controller
   Trilingual, data-driven, dependency-free. Sits beside the pose gallery.
   ========================================================================== */

import { UI, LANGS, LANG_ATTR } from './costume-i18n.js';
import { TAG_NAMES, GROUPS, tagName } from './costume-tags.js';

const DATA_URL = 'data/costumes.json';
const LANG_KEY = 'ruic-poseatlas-lang';
const PAGE = 72;

const state = {
  data: null,
  lang: resolveInitialLang(),
  category: 'all',
  group: 'all',
  color: 'all',
  query: '',
  shown: PAGE,
  openId: null,
  modalList: [],
  modalIndex: -1,
  returnFocus: null,
  loadError: false,
};

let categoryMap = new Map();
let groupMap = new Map();

const els = {
  langSwitch: document.getElementById('langSwitch'),
  metaDescription: document.getElementById('metaDescription'),
  footerMeta: document.getElementById('footerMeta'),
  categoryTabs: document.getElementById('categoryTabs'),
  searchInput: document.getElementById('searchInput'),
  filterToggle: document.getElementById('filterToggle'),
  filterBadge: document.getElementById('filterBadge'),
  filters: document.getElementById('filters'),
  groupSelect: document.getElementById('groupSelect'),
  colorSelect: document.getElementById('colorSelect'),
  resultCount: document.getElementById('resultCount'),
  grid: document.getElementById('grid'),
  more: document.getElementById('more'),
  moreButton: document.getElementById('moreButton'),
  empty: document.getElementById('empty'),
  clearFilters: document.getElementById('clearFilters'),
  info: document.getElementById('info'),
  modal: document.getElementById('modal'),
  modalClose: document.getElementById('modalClose'),
  modalTitle: document.getElementById('modalTitle'),
  modalId: document.getElementById('modalId'),
  modalTags: document.getElementById('modalTags'),
  modalMeta: document.getElementById('modalMeta'),
  downloadLink: document.getElementById('downloadLink'),
  viewerStage: document.getElementById('viewerStage'),
  viewerImage: document.getElementById('viewerImage'),
  viewerGhost: document.getElementById('viewerGhost'),
  viewerError: document.getElementById('viewerError'),
  prevItem: document.getElementById('prevItem'),
  nextItem: document.getElementById('nextItem'),
};

const pageRegions = [
  ...document.querySelectorAll('.hero, .toolbar, .main, .footer, .skip-link'),
];

const fmt = new Intl.NumberFormat('zh-CN');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

function dictionary() {
  return UI[state.lang] ?? UI.zh;
}

function t(key, vars = null) {
  let value = dictionary()[key] ?? UI.zh[key] ?? key;
  if (typeof value !== 'string') return '';
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

function tList(key) {
  const value = dictionary()[key] ?? UI.zh[key] ?? [];
  return Array.isArray(value) ? value : [];
}

function localized(obj) {
  return obj?.[state.lang] ?? obj?.zh ?? '';
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function resolveInitialLang() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    const stored = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(stored)) return stored;
  } catch {
    /* storage or URL access can be restricted */
  }
  const nav = (navigator.language || 'zh').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

init();

async function init() {
  bindInfoPanels();
  bindToolbar();
  bindLanguageSwitch();
  bindLightbox();
  bindGlobalKeys();

  applyLanguage();
  updateLangButtons();
  renderSkeletons();

  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();

    buildLookups();
    buildSearchIndex();

    renderCategoryTabs();
    renderSelects();

    const deepLink = parseDeepLink();
    render();
    applyDataText();

    if (deepLink) openLightbox(deepLink, null);
  } catch (error) {
    console.error('[RuiC-CostumeAtlas] failed to load gallery data', error);
    state.loadError = true;
    showLoadError();
  }
}

/* --------------------------------------------------------------------------
   Localization
   -------------------------------------------------------------------------- */

function updateLangButtons() {
  els.langSwitch.querySelectorAll('button[data-lang]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang));
  });
}

function applyLanguage() {
  document.documentElement.lang = LANG_ATTR[state.lang];
  document.title = t('docTitle');
  if (els.metaDescription) els.metaDescription.setAttribute('content', t('metaDescription'));

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });
  document.querySelectorAll('[data-i18n-alt]').forEach((node) => {
    node.setAttribute('alt', t(node.dataset.i18nAlt));
  });
  document.querySelectorAll('[data-i18n-list]').forEach((node) => {
    node.innerHTML = tList(node.dataset.i18nList)
      .map((item) => `<li>${esc(item)}</li>`)
      .join('');
  });

  if (state.loadError) applyLoadErrorText();
}

function applyDataText() {
  if (!state.data) return;
  els.footerMeta.textContent = t('footerMeta', {
    costumes: fmt.format(state.data.totals.costumes),
    categories: fmt.format(state.data.totals.categories),
  });
}

function setLanguage(lang, updateUrl) {
  if (!LANGS.includes(lang)) return;
  if (state.lang === lang) {
    updateLangButtons();
    return;
  }

  state.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* noop */
  }

  if (updateUrl) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('lang', lang);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch {
      /* noop */
    }
  }

  applyLanguage();
  applyDataText();
  updateLangButtons();

  if (state.data) {
    renderCategoryTabs();
    renderSelects();
    render();
    if (!els.modal.hidden && currentItem()) showItem(currentItem());
  }
}

/* --------------------------------------------------------------------------
   Data helpers
   -------------------------------------------------------------------------- */

function buildLookups() {
  categoryMap = new Map(state.data.categories.map((item) => [item.key, item]));
  groupMap = new Map(state.data.groups.map((item) => [item.key, item]));
  groupMap.set('all', { key: 'all', names: { zh: '全部分类', en: 'All', ja: 'すべて' } });
}

function buildSearchIndex() {
  const categoryWords = state.data.categories.flatMap((item) => Object.values(item.names));
  const groupWords = state.data.groups.flatMap((item) => Object.values(item.names));
  const colorWords = state.data.colors.flatMap((color) => Object.values(TAG_NAMES[color.key] ?? {}));

  for (const item of state.data.costumes) {
    item._search = [
      item.id,
      ...item.tags,
      ...item.tags.flatMap((tag) => Object.values(TAG_NAMES[tag] ?? {})),
      ...Object.values(categoryMap.get(item.cat)?.names ?? {}),
      ...Object.values(groupMap.get(item.group)?.names ?? {}),
      ...categoryWords,
      ...groupWords,
      ...colorWords,
    ].join(' ').toLowerCase();
  }
}

function itemById(id) {
  return state.data?.costumes.find((item) => item.id === id) ?? null;
}

function currentItem() {
  return itemById(state.openId);
}

function categoryName(key) {
  return localized(categoryMap.get(key)?.names) || key;
}

function groupName(key) {
  return localized(groupMap.get(key)?.names) || key;
}

function itemName(item) {
  const main = tagName(item.main, state.lang);
  const color = item.color ? tagName(item.color, state.lang) : '';
  return color ? `${main} · ${color}` : main;
}

/* --------------------------------------------------------------------------
   Toolbar
   -------------------------------------------------------------------------- */

function bindLanguageSwitch() {
  els.langSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-lang]');
    if (button) setLanguage(button.dataset.lang, true);
  });
}

function bindToolbar() {
  els.categoryTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-category]');
    if (button) setCategory(button.dataset.category);
  });

  els.searchInput.addEventListener('input', debounce(() => {
    state.query = els.searchInput.value.trim();
    state.shown = PAGE;
    render();
  }, 120));

  els.groupSelect.addEventListener('change', () => {
    state.group = els.groupSelect.value;
    updateFilterBadge();
    state.shown = PAGE;
    render();
  });

  els.colorSelect.addEventListener('change', () => {
    state.color = els.colorSelect.value;
    updateFilterBadge();
    state.shown = PAGE;
    render();
  });

  els.filterToggle.addEventListener('click', () => {
    const isOpen = els.filters.classList.toggle('is-open');
    els.filterToggle.setAttribute('aria-expanded', String(isOpen));
  });

  els.clearFilters.addEventListener('click', clearAllFilters);
  els.moreButton.addEventListener('click', () => {
    state.shown += PAGE;
    render();
  });
}

function setCategory(key) {
  if (key !== 'all' && !categoryMap.has(key)) return;
  if (state.category === key) return;
  state.category = key;
  state.shown = PAGE;
  syncCategoryTabState();
  render();
}

function clearAllFilters() {
  state.category = 'all';
  state.group = 'all';
  state.color = 'all';
  state.query = '';
  state.shown = PAGE;
  els.searchInput.value = '';
  els.groupSelect.value = 'all';
  els.colorSelect.value = 'all';
  renderCategoryTabs();
  updateFilterBadge();
  render();
}

function renderCategoryTabs() {
  if (!state.data) return;
  const rows = [
    { key: 'all', label: t('categoryAll'), count: state.data.totals.costumes },
    ...state.data.categories.map((item) => ({
      key: item.key,
      label: localized(item.names),
      count: item.count,
    })),
  ];

  els.categoryTabs.innerHTML = rows.map((row) => `
    <button type="button" data-category="${esc(row.key)}" aria-pressed="${state.category === row.key}">
      ${esc(row.label)}<em>${fmt.format(row.count)}</em>
    </button>
  `).join('');
}

function syncCategoryTabState() {
  els.categoryTabs.querySelectorAll('button[data-category]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
  });
}

function renderSelects() {
  if (!state.data) return;

  els.groupSelect.innerHTML =
    `<option value="all">${esc(t('allGroups'))}</option>` +
    state.data.groups.map((group) => `
      <option value="${esc(group.key)}" ${state.group === group.key ? 'selected' : ''}>
        ${esc(localized(group.names))}（${fmt.format(group.count)}）
      </option>
    `).join('');
  els.groupSelect.value = state.group;

  els.colorSelect.innerHTML =
    `<option value="all">${esc(t('allColors'))}</option>` +
    state.data.colors.map((color) => `
      <option value="${esc(color.key)}" ${state.color === color.key ? 'selected' : ''}>
        ${esc(tagName(color.key, state.lang))}（${fmt.format(color.count)}）
      </option>
    `).join('');
  els.colorSelect.value = state.color;
}

function updateFilterBadge() {
  const active = (state.group !== 'all' ? 1 : 0) + (state.color !== 'all' ? 1 : 0);
  els.filterBadge.textContent = active ? String(active) : '';
  els.filterBadge.hidden = active === 0;
}

/* --------------------------------------------------------------------------
   Filtering & rendering
   -------------------------------------------------------------------------- */

function visibleItems() {
  if (!state.data) return [];
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);

  return state.data.costumes.filter((item) => {
    if (state.category !== 'all' && item.cat !== state.category) return false;
    if (state.group !== 'all' && item.group !== state.group) return false;
    if (state.color !== 'all' && item.color !== state.color) return false;
    if (terms.length && !terms.every((term) => item._search.includes(term))) return false;
    return true;
  });
}

function renderSkeletons() {
  els.grid.setAttribute('aria-busy', 'true');
  els.grid.innerHTML = Array.from({ length: 12 }, () => `
    <div class="skeleton" aria-hidden="true">
      <div class="skeleton__media"></div>
      <div class="skeleton__body">
        <div class="skeleton__line"></div>
        <div class="skeleton__line skeleton__line--short"></div>
      </div>
    </div>
  `).join('');
}

function showLoadError() {
  els.grid.setAttribute('aria-busy', 'false');
  els.grid.innerHTML = '';
  els.grid.hidden = true;
  els.more.hidden = true;
  els.empty.hidden = false;
  els.clearFilters.hidden = true;
  els.resultCount.textContent = '';
  applyLoadErrorText();
}

function applyLoadErrorText() {
  els.empty.querySelector('.empty__title').textContent = t('loadErrorTitle');
  els.empty.querySelector('.empty__text').textContent = t('loadErrorText');
}

function render() {
  if (!state.data) return;

  const items = visibleItems();
  const isEmpty = items.length === 0;

  els.resultCount.textContent = t(
    items.length === 1 ? 'costumeUnitOne' : 'costumeUnitMany',
    { n: fmt.format(items.length) }
  );

  els.grid.hidden = isEmpty;
  els.empty.hidden = !isEmpty;
  els.clearFilters.hidden = false;
  els.grid.setAttribute('aria-busy', 'false');

  if (isEmpty) {
    els.grid.replaceChildren();
    els.more.hidden = true;
    return;
  }

  const slice = items.slice(0, state.shown);
  els.grid.innerHTML = slice.map(cardMarkup).join('');
  els.more.hidden = slice.length >= items.length;
}

function cardMarkup(item) {
  const name = itemName(item);
  const tags = item.tags
    .map((tag) => esc(tagName(tag, state.lang)))
    .join('<i>·</i>');

  return `
    <article class="card card--costume" data-id="${esc(item.id)}">
      <button type="button" class="card__media" data-open
        aria-label="${esc(t('cardAria', { name, id: item.id }))}">
        <img class="card__cover" src="${esc(item.thumb)}" alt="" width="360" height="540"
          loading="lazy" decoding="async">
        <span class="card__badges"><span>${esc(item.id)}</span></span>
      </button>
      <div class="card__body">
        <h3 class="card__title"><button type="button" data-open>${esc(name)}</button></h3>
        <p class="card__id">${esc(categoryName(item.cat))} · ${esc(groupName(item.group))}</p>
        <p class="card__tags">${tags}</p>
      </div>
    </article>
  `;
}

/* Grid events ------------------------------------------------------------- */

els.grid.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open]');
  if (!opener) return;
  const card = opener.closest('.card');
  if (card) openLightbox(card.dataset.id, opener);
});

/* Auto-paginate when the loader scrolls into view ------------------------- */

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !els.more.hidden && state.data) {
      state.shown += PAGE;
      render();
    }
  }, { rootMargin: '600px 0px' });
  observer.observe(els.more);
}

/* --------------------------------------------------------------------------
   Info panels
   -------------------------------------------------------------------------- */

function bindInfoPanels() {
  els.info.addEventListener('click', (event) => {
    const tab = event.target.closest('.info__tab');
    if (tab) {
      toggleInfoPanel(tab);
      return;
    }
    if (event.target.closest('[data-close-panel]')) closeInfoPanels(true);
  });

  document.addEventListener('click', (event) => {
    if (!isInfoOpen()) return;
    if (!els.info.contains(event.target)) closeInfoPanels(false);
  });
}

function isInfoOpen() {
  return [...els.info.querySelectorAll('.info__tab')].some(
    (tab) => tab.getAttribute('aria-expanded') === 'true'
  );
}

function toggleInfoPanel(tab) {
  const panel = document.getElementById(tab.dataset.panel);
  const wasOpen = tab.getAttribute('aria-expanded') === 'true';
  closeInfoPanels(false);
  if (wasOpen || !panel) return;

  tab.setAttribute('aria-expanded', 'true');
  panel.hidden = false;
  panel.focus({ preventScroll: true });
}

function closeInfoPanels(restoreFocus) {
  els.info.querySelectorAll('.info__tab').forEach((tab) => {
    if (tab.getAttribute('aria-expanded') !== 'true') return;
    tab.setAttribute('aria-expanded', 'false');
    const panel = document.getElementById(tab.dataset.panel);
    if (panel) panel.hidden = true;
    if (restoreFocus) tab.focus({ preventScroll: true });
  });
}

/* --------------------------------------------------------------------------
   Lightbox
   -------------------------------------------------------------------------- */

function bindLightbox() {
  els.modalClose.addEventListener('click', () => closeLightbox());
  els.modal.querySelector('[data-close-modal]').addEventListener('click', () => closeLightbox());
  els.prevItem.addEventListener('click', () => stepItem(-1));
  els.nextItem.addEventListener('click', () => stepItem(1));
}

function openLightbox(id, trigger) {
  const item = itemById(id);
  if (!item) return;

  let list = visibleItems();
  if (!list.some((entry) => entry.id === item.id)) list = state.data.costumes;

  state.modalList = list;
  state.modalIndex = list.findIndex((entry) => entry.id === item.id);
  state.returnFocus = trigger ?? document.activeElement;

  els.modal.hidden = false;
  document.body.classList.add('is-locked');
  pageRegions.forEach((region) => region.setAttribute('inert', ''));

  showItem(item);
  els.modalClose.focus({ preventScroll: true });
}

function closeLightbox() {
  if (els.modal.hidden) return;

  els.modal.hidden = true;
  document.body.classList.remove('is-locked');
  pageRegions.forEach((region) => region.removeAttribute('inert'));
  clearHash();
  document.title = t('docTitle');

  const focusTarget = state.returnFocus;
  state.openId = null;
  state.returnFocus = null;

  if (focusTarget && focusTarget !== document.body && focusTarget.isConnected) {
    focusTarget.focus({ preventScroll: true });
  } else {
    const active = els.categoryTabs.querySelector('button[aria-pressed="true"]');
    if (active) active.focus({ preventScroll: true });
  }
}

function showItem(item) {
  state.openId = item.id;

  els.modalTitle.textContent = itemName(item);
  els.modalId.textContent = item.id;
  document.title = `${itemName(item)} · ${item.id} | ${t('brandName')}`;

  els.modalTags.innerHTML = item.tags
    .map((tag) => `<span>${esc(tagName(tag, state.lang))}</span>`)
    .join('');

  els.modalMeta.innerHTML = `
    <dt>${esc(t('metaCategory'))}</dt><dd>${esc(categoryName(item.cat))}</dd>
    <dt>${esc(t('metaGroup'))}</dt><dd>${esc(groupName(item.group))}</dd>
    <dt>${esc(t('metaColor'))}</dt><dd>${esc(item.color ? tagName(item.color, state.lang) : '—')}</dd>
    <dt>${esc(t('metaNumber'))}</dt><dd>${esc(item.id)}</dd>
    <dt>${esc(t('metaSpec'))}</dt><dd>${esc(t('specValue'))}</dd>
  `;

  els.downloadLink.href = item.image;
  els.downloadLink.setAttribute('download', item.image.split('/').pop());

  setViewerImage(item);
  syncHash(item.id);
  schedulePreload();
}

function setViewerImage(item) {
  const stage = els.viewerStage;
  const image = els.viewerImage;

  stage.classList.remove('is-ready');
  stage.classList.add('is-loading');
  image.classList.remove('is-ready');
  els.viewerError.hidden = true;

  els.viewerGhost.onload = () => {
    els.viewerGhost.style.visibility = 'visible';
  };
  els.viewerGhost.onerror = () => {
    els.viewerGhost.style.visibility = 'hidden';
  };
  els.viewerGhost.src = item.thumb;

  const finish = () => {
    stage.classList.remove('is-loading');
    stage.classList.add('is-ready');
    image.classList.add('is-ready');
  };

  image.onload = finish;
  image.onerror = () => {
    stage.classList.remove('is-loading');
    els.viewerError.hidden = false;
  };
  image.alt = t('imageAlt', { name: itemName(item) });
  image.src = item.image;

  requestAnimationFrame(() => {
    if (image.complete && image.naturalWidth > 0 && image.getAttribute('src') === item.image) {
      finish();
    }
  });
}

function stepItem(delta) {
  if (!state.modalList.length) return;
  const length = state.modalList.length;
  state.modalIndex = (state.modalIndex + delta + length) % length;
  showItem(state.modalList[state.modalIndex]);
}

function schedulePreload() {
  const run = () => {
    if (els.modal.hidden || !state.openId) return;
    for (const delta of [-1, 1]) {
      const next = state.modalList[
        (state.modalIndex + delta + state.modalList.length) % state.modalList.length
      ];
      if (next) new Image().src = next.image;
    }
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 350);
  }
}

/* --------------------------------------------------------------------------
   Deep links & keyboard
   -------------------------------------------------------------------------- */

function parseDeepLink() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const id = params.get('costume');
  return id && itemById(id) ? id : null;
}

function syncHash(id) {
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}#costume=${encodeURIComponent(id)}`);
  } catch {
    /* history replacement can be unavailable in embedded contexts */
  }
}

function clearHash() {
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* noop */
  }
}

function bindGlobalKeys() {
  document.addEventListener('keydown', (event) => {
    if (!els.modal.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepItem(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepItem(1);
        return;
      }
      if (event.key === 'Tab') {
        trapFocus(event);
      }
      return;
    }

    if (event.key === 'Escape' && isInfoOpen()) {
      closeInfoPanels(true);
    }
  });
}

function trapFocus(event) {
  const focusable = [...els.modal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !els.modal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !els.modal.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
