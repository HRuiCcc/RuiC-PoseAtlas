/* ==========================================================================
   RuiC-PortraitAtlas — gallery controller
   Trilingual, data-driven, dependency-free. Sits beside the pose and costume
   galleries. Images prefer the local portrait/ copy and fall back to the
   original CC0 gallery when the local files are not deployed.
   ========================================================================== */

import { UI, LANGS, LANG_ATTR } from './face-i18n.js';

const DATA_URL = 'data/faces.json';
const LANG_KEY = 'ruic-poseatlas-lang';
const PAGE = 72;

/* Thumbnails ship with the repo, so they are always local. Full-size PNGs are
   local-only; on a deployed host the original gallery URL is used instead. */
const preferLocalFull = (() => {
  if (location.protocol === 'file:') return true;
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname)) return true;
  return new URLSearchParams(location.search).get('local') === '1';
})();

const state = {
  data: null,
  lang: resolveInitialLang(),
  section: 'all',
  hair: 'all',
  query: '',
  shown: PAGE,
  openId: null,
  modalList: [],
  modalIndex: -1,
  returnFocus: null,
  loadError: false,
};

let sectionMap = new Map();
let hairMap = new Map();
let itemMap = new Map();
let hairCounts = new Map();

const els = {
  langSwitch: document.getElementById('langSwitch'),
  metaDescription: document.getElementById('metaDescription'),
  footerMeta: document.getElementById('footerMeta'),
  sectionTabs: document.getElementById('sectionTabs'),
  searchInput: document.getElementById('searchInput'),
  filterToggle: document.getElementById('filterToggle'),
  filterBadge: document.getElementById('filterBadge'),
  filters: document.getElementById('filters'),
  hairSelect: document.getElementById('hairSelect'),
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
  downloadLabel: document.getElementById('downloadLabel'),
  downloadNote: document.getElementById('downloadNote'),
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

function imageSrc(item, kind) {
  if (kind === 'thumb') return item.thumb;
  return preferLocalFull ? item.full : item.full_remote;
}

function megabyte(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
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

    renderSectionTabs();
    renderHairSelect();

    const deepLink = parseDeepLink();
    render();
    applyDataText();

    if (deepLink) openLightbox(deepLink, null);
  } catch (error) {
    console.error('[RuiC-PortraitAtlas] failed to load gallery data', error);
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

  if (els.downloadLabel) els.downloadLabel.textContent = t('download');
  if (els.downloadNote) els.downloadNote.textContent = t('downloadNote');

  if (state.loadError) applyLoadErrorText();
}

function applyDataText() {
  if (!state.data) return;
  els.footerMeta.textContent = t('footerMeta', {
    images: fmt.format(state.data.totals.images),
    face: fmt.format(state.data.totals.face),
    styling: fmt.format(state.data.totals.styling),
    hairs: fmt.format(state.data.totals.hairs),
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
    renderSectionTabs();
    renderHairSelect();
    render();
    if (!els.modal.hidden && currentItem()) showItem(currentItem());
  }
}

/* --------------------------------------------------------------------------
   Data helpers
   -------------------------------------------------------------------------- */

function buildLookups() {
  sectionMap = new Map(state.data.sections.map((item) => [item.key, item]));
  hairMap = new Map(state.data.hairs.map((item) => [item.key, item]));
  itemMap = new Map(state.data.images.map((item) => [item.id, item]));

  hairCounts = new Map();
  for (const item of state.data.images) {
    const key = `${item.sec}:${item.hair}`;
    hairCounts.set(key, (hairCounts.get(key) ?? 0) + 1);
  }
}

function buildSearchIndex() {
  const sectionWords = state.data.sections.flatMap((item) => Object.values(item.names));
  const hairWords = state.data.hairs.flatMap((item) => Object.values(item.names));

  for (const item of state.data.images) {
    item._search = [
      item.id,
      item.style,
      ...Object.values(sectionMap.get(item.sec)?.names ?? {}),
      ...Object.values(hairMap.get(item.hair)?.names ?? {}),
      ...sectionWords,
      ...hairWords,
    ].join(' ').toLowerCase();
  }
}

function itemById(id) {
  return itemMap.get(id) ?? null;
}

function currentItem() {
  return itemById(state.openId);
}

function sectionName(key) {
  return localized(sectionMap.get(key)?.names) || key;
}

function hairName(key) {
  return localized(hairMap.get(key)?.names) || key;
}

function itemName(item) {
  const hair = hairName(item.hair);
  return item.style ? `${hair} · ${item.style}` : `${sectionName(item.sec)} · ${hair}`;
}

function hairCountFor(hairKey) {
  if (state.section === 'all') {
    return state.data.hairs.find((hair) => hair.key === hairKey)?.count ?? 0;
  }
  return hairCounts.get(`${state.section}:${hairKey}`) ?? 0;
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
  els.sectionTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-section]');
    if (button) setSection(button.dataset.section);
  });

  els.searchInput.addEventListener('input', debounce(() => {
    state.query = els.searchInput.value.trim();
    state.shown = PAGE;
    render();
  }, 120));

  els.hairSelect.addEventListener('change', () => {
    state.hair = els.hairSelect.value;
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

function setSection(key) {
  if (key !== 'all' && !sectionMap.has(key)) return;
  if (state.section === key) return;
  state.section = key;

  if (state.hair !== 'all' && !hairCountFor(state.hair)) state.hair = 'all';

  state.shown = PAGE;
  syncSectionTabState();
  renderHairSelect();
  updateFilterBadge();
  render();
}

function clearAllFilters() {
  state.section = 'all';
  state.hair = 'all';
  state.query = '';
  state.shown = PAGE;
  els.searchInput.value = '';
  renderSectionTabs();
  renderHairSelect();
  updateFilterBadge();
  render();
}

function renderSectionTabs() {
  if (!state.data) return;
  const rows = [
    { key: 'all', label: t('sectionAll'), count: state.data.totals.images },
    ...state.data.sections.map((item) => ({
      key: item.key,
      label: localized(item.names),
      count: item.count,
    })),
  ];

  els.sectionTabs.innerHTML = rows.map((row) => `
    <button type="button" data-section="${esc(row.key)}" aria-pressed="${state.section === row.key}">
      ${esc(row.label)}<em>${fmt.format(row.count)}</em>
    </button>
  `).join('');
}

function syncSectionTabState() {
  els.sectionTabs.querySelectorAll('button[data-section]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.section === state.section));
  });
}

function renderHairSelect() {
  if (!state.data) return;

  els.hairSelect.innerHTML =
    `<option value="all">${esc(t('allHairs'))}</option>` +
    state.data.hairs.map((hair) => {
      const count = hairCountFor(hair.key);
      return `
        <option value="${esc(hair.key)}" ${state.hair === hair.key ? 'selected' : ''}>
          ${esc(localized(hair.names))}（${fmt.format(count)}）
        </option>
      `;
    }).join('');
  els.hairSelect.value = state.hair;
}

function updateFilterBadge() {
  const active = state.hair !== 'all' ? 1 : 0;
  els.filterBadge.textContent = active ? String(active) : '';
  els.filterBadge.hidden = active === 0;
}

/* --------------------------------------------------------------------------
   Filtering & rendering
   -------------------------------------------------------------------------- */

function visibleItems() {
  if (!state.data) return [];
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);

  return state.data.images.filter((item) => {
    if (state.section !== 'all' && item.sec !== state.section) return false;
    if (state.hair !== 'all' && item.hair !== state.hair) return false;
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
    items.length === 1 ? 'imageUnitOne' : 'imageUnitMany',
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
  const tags = item.style
    ? `<p class="card__tags">${esc(item.style)}</p>`
    : '';

  return `
    <article class="card card--portrait" data-id="${esc(item.id)}">
      <button type="button" class="card__media" data-open
        aria-label="${esc(t('cardAria', { name, id: item.id }))}">
        <img class="card__cover" src="${esc(imageSrc(item, 'thumb'))}"
          data-remote="${esc(item.thumb_remote)}" alt=""
          width="400" height="500" loading="lazy" decoding="async">
        <span class="card__badges"><span>${esc(item.id)}</span></span>
      </button>
      <div class="card__body">
        <h3 class="card__title"><button type="button" data-open>${esc(name)}</button></h3>
        <p class="card__id">${esc(sectionName(item.sec))} · ${esc(hairName(item.hair))}</p>
        ${tags}
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

/* Swap to the original URL when a local copy is missing. */
els.grid.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (!image.dataset.remote || image.dataset.fallback) return;
  image.dataset.fallback = '1';
  image.src = image.dataset.remote;
}, true);

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
  if (!list.some((entry) => entry.id === item.id)) list = state.data.images;

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
    const active = els.sectionTabs.querySelector('button[aria-pressed="true"]');
    if (active) active.focus({ preventScroll: true });
  }
}

function showItem(item) {
  state.openId = item.id;

  els.modalTitle.textContent = itemName(item);
  els.modalId.textContent = item.id;
  document.title = `${itemName(item)} · ${item.id} | ${t('brandName')}`;

  const chips = [
    sectionName(item.sec),
    hairName(item.hair),
    item.style,
  ].filter(Boolean);
  els.modalTags.innerHTML = chips
    .map((chip) => `<span>${esc(chip)}</span>`)
    .join('');

  els.modalMeta.innerHTML = `
    <dt>${esc(t('metaSection'))}</dt><dd>${esc(sectionName(item.sec))}</dd>
    <dt>${esc(t('metaHair'))}</dt><dd>${esc(hairName(item.hair))}</dd>
    ${item.style ? `<dt>${esc(t('metaStyle'))}</dt><dd>${esc(item.style)}</dd>` : ''}
    <dt>${esc(t('metaNumber'))}</dt><dd>${esc(item.id)}</dd>
    <dt>${esc(t('metaSpec'))}</dt><dd>${esc(`${item.w} × ${item.h} · PNG`)}</dd>
    <dt>${esc(t('metaBytes'))}</dt><dd>${esc(megabyte(item.bytes))}</dd>
  `;

  const source = imageSrc(item, 'full');
  els.downloadLink.href = source;
  els.downloadLabel.textContent = t('download');

  if (source === item.full) {
    els.downloadLink.setAttribute('download', `ai-${item.sec}-${item.id}.png`);
    els.downloadLink.removeAttribute('target');
    els.downloadLink.removeAttribute('rel');
  } else {
    els.downloadLink.removeAttribute('download');
    els.downloadLink.setAttribute('target', '_blank');
    els.downloadLink.setAttribute('rel', 'noopener noreferrer');
  }

  els.viewerStage.style.setProperty('--stage-ratio', String(item.w / item.h));
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

  const thumb = imageSrc(item, 'thumb');
  let ghostFallback = thumb === item.thumb_remote;

  els.viewerGhost.onload = () => {
    els.viewerGhost.style.visibility = 'visible';
  };
  els.viewerGhost.onerror = () => {
    if (!ghostFallback) {
      ghostFallback = true;
      els.viewerGhost.src = item.thumb_remote;
      return;
    }
    els.viewerGhost.style.visibility = 'hidden';
  };
  els.viewerGhost.src = thumb;

  let fullFallback = imageSrc(item, 'full') === item.full_remote;

  const finish = () => {
    stage.classList.remove('is-loading');
    stage.classList.add('is-ready');
    image.classList.add('is-ready');
  };

  image.onload = finish;
  image.onerror = () => {
    if (!fullFallback) {
      fullFallback = true;
      image.src = item.full_remote;
      return;
    }
    stage.classList.remove('is-loading');
    els.viewerError.hidden = false;
  };
  image.alt = t('imageAlt', { name: itemName(item) });
  image.src = imageSrc(item, 'full');

  requestAnimationFrame(() => {
    if (image.complete && image.naturalWidth > 0) finish();
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
      if (next) new Image().src = imageSrc(next, 'full');
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
  const id = params.get('portrait');
  return id && itemById(id) ? id : null;
}

function syncHash(id) {
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}#portrait=${encodeURIComponent(id)}`);
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
