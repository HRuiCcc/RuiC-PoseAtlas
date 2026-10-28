/* ==========================================================================
   RuiC-PoseAtlas — gallery controller
   Trilingual, data-driven, dependency-free. Written for this project.
   ========================================================================== */

import { UI, LANGS, LANG_ATTR } from './i18n.js';

const DATA_URL = 'data/poses.json';
const LANG_KEY = 'ruic-poseatlas-lang';
const ANGLE_ORDER = ['front', 'high', 'low', 'side', 'diagonal'];
const VIEW_KEYS = ['pose', 'single'];

const state = {
  data: null,
  lang: resolveInitialLang(),
  series: 'all',
  category: 'all',
  angle: 'all',
  view: 'pose',
  query: '',
  openPoseId: null,
  openAngle: null,
  modalList: [],
  modalIndex: -1,
  returnFocus: null,
  loadError: false,
};

let seriesMap = new Map();
let categoryMap = new Map();
let angleMap = new Map();

const els = {
  langSwitch: document.getElementById('langSwitch'),
  metaDescription: document.getElementById('metaDescription'),
  footerMeta: document.getElementById('footerMeta'),
  seriesTabs: document.getElementById('seriesTabs'),
  searchInput: document.getElementById('searchInput'),
  filterToggle: document.getElementById('filterToggle'),
  filterBadge: document.getElementById('filterBadge'),
  filters: document.getElementById('filters'),
  categorySelect: document.getElementById('categorySelect'),
  angleSeg: document.getElementById('angleSeg'),
  viewSeg: document.getElementById('viewSeg'),
  resultCount: document.getElementById('resultCount'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  clearFilters: document.getElementById('clearFilters'),
  info: document.getElementById('info'),
  modal: document.getElementById('modal'),
  modalClose: document.getElementById('modalClose'),
  modalTitle: document.getElementById('modalTitle'),
  modalId: document.getElementById('modalId'),
  modalAngles: document.getElementById('modalAngles'),
  modalMeta: document.getElementById('modalMeta'),
  downloadLink: document.getElementById('downloadLink'),
  viewerStage: document.getElementById('viewerStage'),
  viewerImage: document.getElementById('viewerImage'),
  viewerGhost: document.getElementById('viewerGhost'),
  viewerError: document.getElementById('viewerError'),
  prevAngle: document.getElementById('prevAngle'),
  nextAngle: document.getElementById('nextAngle'),
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

    const deepLink = parseDeepLink();
    if (deepLink) {
      state.series = deepLink.pose.series;
      state.category = 'all';
    }

    renderSeriesTabs();
    renderAngleFilter();
    renderCategoryOptions();
    updateFilterBadge();
    renderViewFilter();
    render();
    applyDataText();

    if (deepLink) openLightbox(deepLink.pose.id, deepLink.angle, null);
  } catch (error) {
    console.error('[RuiC-PoseAtlas] failed to load gallery data', error);
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
  const vars = {
    poses: fmt.format(state.data.totals.poses),
    images: fmt.format(state.data.totals.images),
  };
  els.footerMeta.textContent = t('footerMeta', vars);
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
    renderSeriesTabs();
    renderAngleFilter();
    renderCategoryOptions();
    updateFilterBadge();
    renderViewFilter();
    render();
    if (!els.modal.hidden && currentPose()) {
      showVariant(currentPose(), state.openAngle);
    }
  }
}

/* --------------------------------------------------------------------------
   Data helpers
   -------------------------------------------------------------------------- */

function buildLookups() {
  seriesMap = new Map(state.data.series.map((series) => [series.key, series]));
  categoryMap = new Map(state.data.categories.map((category) => [category.key, category]));
  angleMap = new Map(state.data.angles.map((angle) => [angle.key, angle]));
}

function buildSearchIndex() {
  const angleWords = state.data.angles.flatMap((angle) => Object.values(angle.names));
  for (const pose of state.data.poses) {
    const series = seriesMap.get(pose.series);
    const category = categoryMap.get(pose.category);
    pose._search = [
      pose.id,
      pose.no,
      ...Object.values(pose.names),
      ...Object.values(series?.names ?? {}),
      ...Object.values(series?.short ?? {}),
      ...Object.values(category?.names ?? {}),
      ...angleWords,
    ].join(' ').toLowerCase();
  }
}

function poseById(id) {
  return state.data?.poses.find((pose) => pose.id === id) ?? null;
}

function seriesOf(key) {
  return seriesMap.get(key) ?? null;
}

function categoryName(key) {
  return localized(categoryMap.get(key)?.names) || key;
}

function angleName(key) {
  return localized(angleMap.get(key)?.names) || key;
}

function poseName(pose) {
  return localized(pose.names);
}

function categoriesFor(seriesKey) {
  if (!state.data) return [];
  if (seriesKey === 'all') return state.data.categories.map((category) => category.key);
  return state.data.categoriesBySeries[seriesKey] ?? [];
}

function pickAngle(pose, preferred = null) {
  if (preferred && pose.variants.some((variant) => variant.angle === preferred)) {
    return preferred;
  }
  if (state.angle !== 'all' && pose.variants.some((variant) => variant.angle === state.angle)) {
    return state.angle;
  }
  if (pose.variants.some((variant) => variant.angle === 'front')) return 'front';
  return pose.variants[0]?.angle ?? ANGLE_ORDER[0];
}

function currentPose() {
  return poseById(state.openPoseId);
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
  els.seriesTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-series]');
    if (button) setSeries(button.dataset.series);
  });

  els.searchInput.addEventListener('input', debounce(() => {
    state.query = els.searchInput.value.trim();
    render();
  }, 120));

  els.categorySelect.addEventListener('change', () => {
    state.category = els.categorySelect.value;
    updateFilterBadge();
    render();
  });

  els.angleSeg.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-angle]');
    if (button) setAngle(button.dataset.angle);
  });

  els.viewSeg.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (button) setView(button.dataset.view);
  });

  els.filterToggle.addEventListener('click', () => {
    const isOpen = els.filters.classList.toggle('is-open');
    els.filterToggle.setAttribute('aria-expanded', String(isOpen));
  });

  els.clearFilters.addEventListener('click', clearAllFilters);
}

function setSeries(key) {
  if (key !== 'all' && !seriesMap.has(key)) return;
  if (state.series === key) return;
  state.series = key;
  if (!new Set(categoriesFor(key)).has(state.category)) state.category = 'all';
  renderCategoryOptions();
  syncSeriesTabState();
  updateFilterBadge();
  render();
}

function setAngle(key) {
  if (key !== 'all' && !angleMap.has(key)) return;
  if (state.angle === key) return;
  state.angle = key;
  syncAngleState();
  updateFilterBadge();
  render();
}

function setView(key) {
  if (!VIEW_KEYS.includes(key) || state.view === key) return;
  state.view = key;
  renderViewFilter();
  render();
}

function clearAllFilters() {
  state.series = 'all';
  state.category = 'all';
  state.angle = 'all';
  state.query = '';
  els.searchInput.value = '';
  renderSeriesTabs();
  renderAngleFilter();
  renderCategoryOptions();
  updateFilterBadge();
  renderViewFilter();
  render();
}

function renderSeriesTabs() {
  if (!state.data) return;
  const rows = [
    {
      key: 'all',
      short: t('seriesAll'),
      name: t('seriesAll'),
      poseCount: state.data.totals.poses,
    },
    ...state.data.series.map((series) => ({
      key: series.key,
      short: localized(series.short),
      name: localized(series.names),
      poseCount: series.poseCount,
    })),
  ];

  els.seriesTabs.innerHTML = rows.map((row) => `
    <button type="button" data-series="${esc(row.key)}" aria-pressed="${state.series === row.key}"
      title="${esc(row.name)}">
      ${esc(row.short)}<em>${fmt.format(row.poseCount)}</em>
    </button>
  `).join('');
}

function syncSeriesTabState() {
  els.seriesTabs.querySelectorAll('button[data-series]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.series === state.series));
  });
}

function renderAngleFilter() {
  if (!state.data) return;
  const rows = [
    { key: 'all', name: t('allAngles') },
    ...state.data.angles.map((angle) => ({ key: angle.key, name: localized(angle.names) })),
  ];

  els.angleSeg.innerHTML = rows.map((row) => `
    <button type="button" data-angle="${esc(row.key)}" aria-pressed="${state.angle === row.key}">
      ${esc(row.name)}
    </button>
  `).join('');
}

function syncAngleState() {
  els.angleSeg.querySelectorAll('button[data-angle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.angle === state.angle));
  });
}

function renderViewFilter() {
  els.viewSeg.querySelectorAll('button[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  });
}

function renderCategoryOptions() {
  if (!state.data) return;
  const keys = categoriesFor(state.series);
  const valid = new Set(keys);
  if (!valid.has(state.category)) state.category = 'all';

  const option = (key) =>
    `<option value="${esc(key)}" ${state.category === key ? 'selected' : ''}>${esc(categoryName(key))}</option>`;

  els.categorySelect.innerHTML =
    `<option value="all" ${state.category === 'all' ? 'selected' : ''}>${esc(t('allCategories'))}</option>` +
    keys.map(option).join('');
}

function updateFilterBadge() {
  const activeFilters =
    (state.category !== 'all' ? 1 : 0) + (state.angle !== 'all' ? 1 : 0);
  els.filterBadge.textContent = activeFilters ? String(activeFilters) : '';
  els.filterBadge.hidden = activeFilters === 0;
}

/* --------------------------------------------------------------------------
   Filtering & rendering
   -------------------------------------------------------------------------- */

function visiblePoses() {
  if (!state.data) return [];
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);

  return state.data.poses.filter((pose) => {
    if (state.series !== 'all' && pose.series !== state.series) return false;
    if (state.category !== 'all' && pose.category !== state.category) return false;
    if (state.angle !== 'all' && !pose.variants.some((variant) => variant.angle === state.angle)) {
      return false;
    }
    if (terms.length && !terms.every((term) => pose._search.includes(term))) return false;
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

  const poses = visiblePoses();
  const imageCount = poses.reduce((total, pose) => {
    const variants = state.angle === 'all'
      ? pose.variants
      : pose.variants.filter((variant) => variant.angle === state.angle);
    return total + variants.length;
  }, 0);

  const poseLabel = t(poses.length === 1 ? 'poseUnitOne' : 'poseUnitMany', {
    n: fmt.format(poses.length),
  });
  const imageLabel = t(imageCount === 1 ? 'imageUnitOne' : 'imageUnitMany', {
    n: fmt.format(imageCount),
  });
  els.resultCount.textContent = state.view === 'single'
    ? imageLabel
    : `${poseLabel} · ${imageLabel}`;

  const isEmpty = poses.length === 0;
  els.grid.hidden = isEmpty;
  els.empty.hidden = !isEmpty;
  els.clearFilters.hidden = false;
  els.grid.setAttribute('aria-busy', 'false');

  if (isEmpty) {
    els.grid.replaceChildren();
    return;
  }

  els.grid.innerHTML = state.view === 'pose'
    ? poses.map(poseCardMarkup).join('')
    : poses.flatMap(singleCardMarkup).join('');
}

function poseCardMarkup(pose) {
  const coverAngle = pickAngle(pose);
  const cover = pose.variants.find((variant) => variant.angle === coverAngle) ?? pose.variants[0];
  const name = poseName(pose);
  const series = seriesOf(pose.series);
  const coverName = angleName(cover.angle);

  const strip = pose.variants.map((variant) => {
    const variantName = angleName(variant.angle);
    return `
      <button type="button" class="angle-chip" data-preview="${esc(variant.angle)}"
        aria-pressed="${variant.angle === coverAngle}"
        aria-label="${esc(t('previewAria', { name, angle: variantName }))}"
        title="${esc(variantName)}">
        <img src="${esc(variant.thumb)}" alt="" width="300" height="400" loading="lazy" decoding="async">
        <span>${esc(variantName)}</span>
      </button>
    `;
  }).join('');

  return `
    <article class="card" data-pose="${esc(pose.id)}">
      <button type="button" class="card__media" data-open data-angle="${esc(cover.angle)}"
        aria-label="${esc(t('viewAria', { name, angle: coverName }))}">
        <img class="card__cover" src="${esc(cover.thumb)}" alt="" width="300" height="400"
          loading="lazy" decoding="async">
        <span class="card__badges">
          <span>${esc(pose.no)}</span><span>${esc(t('views', { n: pose.variants.length }))}</span>
        </span>
      </button>
      <div class="card__body">
        <h3 class="card__title">
          <button type="button" data-open data-angle="${esc(cover.angle)}">${esc(name)}</button>
        </h3>
        <p class="card__id">${esc(pose.id)}</p>
        <p class="card__cat">${esc(categoryName(pose.category))}<i>·</i>${esc(localized(series?.short))}</p>
      </div>
      <div class="card__strip" role="group" aria-label="${esc(t('stripAria', { name }))}">
        ${strip}
      </div>
    </article>
  `;
}

function singleCardMarkup(pose) {
  const variants = state.angle === 'all'
    ? pose.variants
    : pose.variants.filter((variant) => variant.angle === state.angle);
  const name = poseName(pose);
  const series = seriesOf(pose.series);

  return variants.map((variant) => {
    const variantName = angleName(variant.angle);
    return `
      <article class="card" data-pose="${esc(pose.id)}">
        <button type="button" class="card__media" data-open data-angle="${esc(variant.angle)}"
          aria-label="${esc(t('viewAria', { name, angle: variantName }))}">
          <img class="card__cover" src="${esc(variant.thumb)}" alt="" width="300" height="400"
            loading="lazy" decoding="async">
          <span class="card__badges">
            <span>${esc(pose.no)}</span><span>${esc(variantName)}</span>
          </span>
        </button>
        <div class="card__body">
          <h3 class="card__title">
            <button type="button" data-open data-angle="${esc(variant.angle)}">${esc(name)}</button>
          </h3>
          <p class="card__id">${esc(pose.id)} · ${esc(variantName)}</p>
          <p class="card__cat">${esc(categoryName(pose.category))}<i>·</i>${esc(localized(series?.short))}</p>
        </div>
      </article>
    `;
  }).join('');
}

/* Grid events ------------------------------------------------------------- */

els.grid.addEventListener('click', (event) => {
  const chip = event.target.closest('.angle-chip');
  if (chip) {
    swapCardPreview(chip);
    return;
  }

  const opener = event.target.closest('[data-open]');
  if (!opener) return;

  const card = opener.closest('.card');
  if (card) openLightbox(card.dataset.pose, opener.dataset.angle, opener);
});

function swapCardPreview(chip) {
  const card = chip.closest('.card');
  if (!card) return;
  const pose = poseById(card.dataset.pose);
  const variant = pose?.variants.find((item) => item.angle === chip.dataset.preview);
  if (!pose || !variant) return;

  const cover = card.querySelector('.card__cover');
  const media = card.querySelector('.card__media');
  if (!cover || !media) return;

  const name = poseName(pose);
  const variantName = angleName(variant.angle);

  card.querySelectorAll('.angle-chip').forEach((button) => {
    button.setAttribute('aria-pressed', String(button === chip));
  });
  card.querySelectorAll('[data-open]').forEach((button) => {
    button.dataset.angle = variant.angle;
  });
  media.setAttribute('aria-label', t('viewAria', { name, angle: variantName }));

  if (cover.getAttribute('src') === variant.thumb) return;

  cover.classList.add('is-swapping');
  const preload = new Image();
  const finish = () => {
    cover.src = variant.thumb;
    cover.classList.remove('is-swapping');
  };
  preload.onload = finish;
  preload.onerror = () => cover.classList.remove('is-swapping');
  preload.src = variant.thumb;
  if (preload.complete && preload.naturalWidth > 0) finish();
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
  els.prevAngle.addEventListener('click', () => stepAngle(-1));
  els.nextAngle.addEventListener('click', () => stepAngle(1));

  els.modalAngles.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-angle]');
    if (!button) return;
    const pose = currentPose();
    if (pose) showVariant(pose, button.dataset.angle);
  });
}

function openLightbox(poseId, angle, trigger) {
  const pose = poseById(poseId);
  if (!pose) return;

  let list = visiblePoses();
  if (!list.some((item) => item.id === pose.id)) list = state.data.poses;

  state.modalList = list;
  state.modalIndex = list.findIndex((item) => item.id === pose.id);
  state.returnFocus = trigger ?? document.activeElement;

  els.modal.hidden = false;
  document.body.classList.add('is-locked');
  pageRegions.forEach((region) => region.setAttribute('inert', ''));

  showVariant(pose, angle ? pickAngle(pose, angle) : pickAngle(pose));
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
  state.openPoseId = null;
  state.openAngle = null;
  state.returnFocus = null;

  if (focusTarget && focusTarget !== document.body && focusTarget.isConnected) {
    focusTarget.focus({ preventScroll: true });
  } else {
    const active = els.seriesTabs.querySelector('button[aria-pressed="true"]');
    if (active) active.focus({ preventScroll: true });
  }
}

function showVariant(pose, angleKey) {
  const variant = pose.variants.find((item) => item.angle === angleKey) ?? pose.variants[0];
  if (!variant) return;

  const index = pose.variants.indexOf(variant);
  const name = poseName(pose);
  const variantName = angleName(variant.angle);
  const series = seriesOf(pose.series);

  state.openPoseId = pose.id;
  state.openAngle = variant.angle;

  els.modalTitle.textContent = name;
  els.modalId.textContent = pose.id;
  document.title = `${name} · ${variantName} | ${t('brandName')}`;

  els.modalAngles.innerHTML = pose.variants.map((item) => {
    const itemName = angleName(item.angle);
    return `
      <button type="button" data-angle="${esc(item.angle)}"
        aria-pressed="${item.angle === variant.angle}"
        aria-label="${esc(t('angleSwitchAria', { angle: itemName }))}"
        title="${esc(itemName)}">
        <img src="${esc(item.thumb)}" alt="" width="300" height="400" loading="eager" decoding="async">
        <span>${esc(itemName)}</span>
      </button>
    `;
  }).join('');

  els.modalMeta.innerHTML = `
    <dt>${esc(t('metaSeries'))}</dt><dd>${esc(localized(series?.names))}</dd>
    <dt>${esc(t('metaCategory'))}</dt><dd>${esc(categoryName(pose.category))}</dd>
    <dt>${esc(t('metaNumber'))}</dt><dd>${esc(pose.no)}</dd>
    <dt>${esc(t('metaAngle'))}</dt><dd>${esc(variantName)} · ${index + 1} / ${pose.variants.length}</dd>
    <dt>${esc(t('metaSpec'))}</dt><dd>${esc(t('specValue'))}</dd>
  `;

  const filename = variant.full.split('/').pop();
  els.downloadLink.href = variant.full;
  els.downloadLink.setAttribute('download', filename);

  setViewerImage(pose, variant);
  syncHash(pose.id, variant.angle);
  schedulePreload();
}

function setViewerImage(pose, variant) {
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
  els.viewerGhost.src = variant.thumb;

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
  image.alt = t('imageAlt', { name: poseName(pose), angle: angleName(variant.angle) });
  image.src = variant.full;

  requestAnimationFrame(() => {
    if (image.complete && image.naturalWidth > 0 && image.getAttribute('src') === variant.full) {
      finish();
    }
  });
}

function stepAngle(delta) {
  const pose = currentPose();
  if (!pose) return;
  const index = pose.variants.findIndex((variant) => variant.angle === state.openAngle);
  const next = pose.variants[(index + delta + pose.variants.length) % pose.variants.length];
  showVariant(pose, next.angle);
}

function stepPose(delta) {
  if (!state.modalList.length) return;
  const length = state.modalList.length;
  state.modalIndex = (state.modalIndex + delta + length) % length;
  const pose = state.modalList[state.modalIndex];
  showVariant(pose, pickAngle(pose, state.openAngle));
}

function schedulePreload() {
  const run = () => {
    if (els.modal.hidden || !state.openPoseId) return;
    const pose = currentPose();
    if (!pose) return;

    const angleIndex = pose.variants.findIndex((variant) => variant.angle === state.openAngle);
    for (const delta of [-1, 1]) {
      const variant = pose.variants[(angleIndex + delta + pose.variants.length) % pose.variants.length];
      if (variant) new Image().src = variant.full;
    }

    for (const delta of [-1, 1]) {
      const nextPose = state.modalList[
        (state.modalIndex + delta + state.modalList.length) % state.modalList.length
      ];
      if (!nextPose) continue;
      const variant =
        nextPose.variants.find((item) => item.angle === state.openAngle) ??
        nextPose.variants.find((item) => item.angle === 'front') ??
        nextPose.variants[0];
      if (variant) new Image().src = variant.full;
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
  const id = params.get('pose');
  if (!id) return null;

  const pose = poseById(id);
  if (!pose) return null;

  const requested = params.get('angle');
  const angle = pose.variants.some((variant) => variant.angle === requested) ? requested : null;
  return { pose, angle };
}

function syncHash(poseId, angle) {
  try {
    const params = new URLSearchParams({ pose: poseId, angle });
    history.replaceState(null, '', `${location.pathname}${location.search}#${params.toString()}`);
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
        stepAngle(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepAngle(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepPose(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepPose(1);
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
