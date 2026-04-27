/* ============================================================
   ATLAS — public viewer
   Reads /data/ai-models.json, renders D3 world map + catalogue.
   ============================================================ */

const DATA_URL      = './data/ai-models.geojson';
const TOOLS_URL     = './data/ai-tools.geojson';
const EDITIONS_URL  = './data/editions/index.json';
const TOPO_URL      = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const PAGE_SIZE = 20;

// Convert tools GeoJSON FeatureCollection → flat tool objects.
function fromToolsGeoJson(geo) {
  return (geo.features || []).map(f => ({
    ...f.properties,
    id: f.id || f.properties.id,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

// Convert GeoJSON FeatureCollection → flat model objects used by the rest of the code.
function fromGeoJson(geo) {
  const meta = geo.meta || { edition: '—', updated: '—', compiler: '' };
  const models = (geo.features || []).map(f => ({
    ...f.properties,
    id: f.id || f.properties.id,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  return { meta, models };
}

const state = {
  models: [],
  filtered: [],
  filterType: 'all',          // all | proprietary | open-weight
  filterModality: 'all',      // all | text | image | audio | video
  filterSearch: '',
  sort:     { key: 'year', asc: false },
  toolSort: { key: 'year', asc: false },
  selected: null,
  selectedTool: null,
  activeEditionId: 'live',    // 'live' or an edition id string
  editions: [],               // list loaded from editions/index.json
  tools: [],                  // AI tools layer
  filteredTools: [],          // tools after category/search filter
  filterToolCategory: 'all',  // all | assistant | codegen | devtool | ide | search
  layers: { models: true, tools: true },
  catTab: 'models',           // active catalogue tab
  glanceTab: 'models',        // active "at a glance" tab
  view: 'map',                // 'map' | 'timeline'
  timelineRendered: false,
  modelPage: 1,
  toolPage: 1,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ──────────────  bootstrap

(async function init() {
  const overlay = document.getElementById('loading-overlay');
  const hideOverlay = () => {
    if (!overlay) return;
    overlay.classList.add('is-hidden');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };
  try {
    const [geo, topo, editionsIndex, toolsGeo] = await Promise.all([
      fetch(DATA_URL).then(r => r.json()),
      fetch(TOPO_URL).then(r => r.json()),
      fetch(EDITIONS_URL).then(r => r.json()).catch(() => ({ editions: [] })),
      fetch(TOOLS_URL).then(r => r.json()).catch(() => ({ features: [] })),
    ]);
    const { meta, models } = fromGeoJson(geo);
    state.models        = models;
    state.editions      = editionsIndex.editions || [];
    state.tools         = fromToolsGeoJson(toolsGeo);
    state.filteredTools = state.tools;
    renderMeta(meta);
    renderStats();
    renderFilters();
    renderLayerToggles();
    renderEditionSwitcher();
    renderMap(topo);
    applyFilters();
    renderToolsCatalogue();
    bindCatalogueSort();
    bindCatalogueTabs();
    bindGlanceTabs();
    bindDetailPanel();
    bindArchiveBanner();
    bindLayerToggles();
    bindViewSwitch();
    bindEditionsModal();
    bindSearch();
    hideOverlay();
  } catch (err) {
    console.error('Atlas failed to load:', err);
    hideOverlay();
    document.body.insertAdjacentHTML('beforeend',
      `<pre style="padding:48px;color:#b14a2c;font-family:monospace">Failed to load atlas data — ${err.message}</pre>`);
  }
})();

// ──────────────  meta

function renderMeta(meta) {
  $('#edition').textContent = meta.edition;
  $('#updated').textContent = meta.updated;
  $('#compiler').textContent = meta.compiler;
}

// ──────────────  stats

function renderStats() {
  const src = state.glanceTab === 'tools' ? state.tools : state.models;
  const countries = new Set(src.map(x => x.country).filter(Boolean));
  const orgs      = new Set(src.map(x => x.organization).filter(Boolean));
  const pad2 = n => n.toString().padStart(2, '0');
  $('#stat-primary').textContent   = pad2(src.length);
  $('#stat-countries').textContent = pad2(countries.size);
  $('#stat-orgs').textContent      = pad2(orgs.size);
  $('#stat-primary-label').textContent =
    state.glanceTab === 'tools' ? 'Catalogued tools' : 'Catalogued models';
  const block = document.querySelector('.glance-block');
  if (block) block.setAttribute('data-glance', state.glanceTab);
}

function bindGlanceTabs() {
  const tabs = $$('#glance-tabs .glance-tab');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.glance;
      if (state.glanceTab === target) return;
      state.glanceTab = target;
      tabs.forEach(t => t.classList.toggle('is-active', t.dataset.glance === target));
      renderStats();
    });
  });
}

// ──────────────  filters

function renderFilters() {
  const types = ['all', 'proprietary', 'open-weight'];
  const mods  = ['all', 'text', 'image', 'audio', 'video'];

  const typeHtml = types.map(t =>
    `<button class="chip ${state.filterType === t ? 'is-active' : ''}" data-type="${t}">${t}</button>`
  ).join('');
  const modHtml = mods.map(m =>
    `<button class="chip ${state.filterModality === m ? 'is-active' : ''}" data-mod="${m}">${m}</button>`
  ).join('');

  ['#filter-type', '#cat-filter-type'].forEach(sel => {
    const el = $(sel); if (el) el.innerHTML = typeHtml;
  });
  ['#filter-modality', '#cat-filter-modality'].forEach(sel => {
    const el = $(sel); if (el) el.innerHTML = modHtml;
  });

  ['#filter-type', '#cat-filter-type'].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.addEventListener('click', e => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      state.filterType = btn.dataset.type;
      renderFilters();
      applyFilters();
    });
  });

  ['#filter-modality', '#cat-filter-modality'].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.addEventListener('click', e => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      state.filterModality = btn.dataset.mod;
      renderFilters();
      applyFilters();
    });
  });
}

function applyFilters() {
  const q = state.filterSearch.toLowerCase();
  state.filtered = state.models.filter(m => {
    if (state.filterType !== 'all' && m.type !== state.filterType) return false;
    if (state.filterModality !== 'all' && !m.modality.includes(state.filterModality)) return false;
    if (q && ![m.name, m.organization, m.country, m.city, String(m.year)]
               .some(v => (v || '').toLowerCase().includes(q))) return false;
    return true;
  });
  state.modelPage = 1;
  applyToolFilters();
  renderMarkers();
  renderToolMarkers();
  renderCatalogue();
  if (state.view === 'timeline') renderTimeline();
  else state.timelineRendered = false;
}

function applyToolFilters() {
  const q = state.filterSearch.toLowerCase();
  let tools = state.tools;
  if (state.filterToolCategory !== 'all') {
    tools = tools.filter(t => t.category === state.filterToolCategory);
  }
  if (q) {
    tools = tools.filter(t =>
      [t.name, t.organization, t.country, t.category, String(t.year)]
        .some(v => (v || '').toLowerCase().includes(q)));
  }
  state.filteredTools = tools;
}

// ──────────────  map

let projection, svg, g;
const MAP_W = 1100;
const MAP_H = 620;

const SPIDER_THRESH_PX = 12; // pixel distance to treat markers as overlapping
const SPIDER_RADIUS    = 62; // pixel radius of the expanded rose
const MAX_SPIDER       = 20; // above this count, use the list panel instead

let spiderState   = null;
let clusterPanel  = null;
let clusterOutsideHandler = null;

function renderMap(topo) {
  const container = $('#map');
  container.innerHTML = '';

  svg = d3.select(container).append('svg')
    .attr('class', 'world')
    .attr('viewBox', `0 0 ${MAP_W} ${MAP_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  projection = d3.geoNaturalEarth1()
    .scale(195)
    .translate([MAP_W / 2, MAP_H / 2 + 10]);

  const path = d3.geoPath(projection);

  // sphere outline
  svg.append('path')
    .datum({ type: 'Sphere' })
    .attr('class', 'sphere')
    .attr('d', path);

  // graticule
  const graticule = d3.geoGraticule().step([20, 20]);
  svg.append('path')
    .datum(graticule)
    .attr('class', 'graticule')
    .attr('d', path);

  // countries — TopoJSON expected to expose 'countries' object
  const countries = topojson.feature(topo, topo.objects.countries).features;
  const countriesWithModels = new Set(state.models.map(m =>
    countryNameForCoords(m.lat, m.lng)));

  g = svg.append('g').attr('class', 'countries');
  g.selectAll('path.country')
    .data(countries)
    .join('path')
    .attr('class', d => 'country' + (countryHasModels(d, state.models) ? ' has-models' : ''))
    .attr('d', path);

  // markers layers drawn after countries (models below, tools above)
  svg.append('g').attr('class', 'markers');
  svg.append('g').attr('class', 'tool-markers');

  renderMarkers();
  renderToolMarkers();
  buildLegend();
}

function countryHasModels(feature, models) {
  // crude: check any model centroid lies within bbox of this feature
  const bbox = d3.geoBounds(feature);
  return models.some(m =>
    m.lng >= bbox[0][0] && m.lng <= bbox[1][0] &&
    m.lat >= bbox[0][1] && m.lat <= bbox[1][1]);
}

function countryNameForCoords() { return null; } // placeholder hook

function renderMarkers() {
  if (!svg) return;
  const layer = svg.select('g.markers');
  const sel = layer.selectAll('g.marker').data(state.filtered, d => d.id);

  sel.exit().remove();

  const enter = sel.enter().append('g')
    .attr('class', d => `marker type-${d.type}`)
    .attr('transform', d => {
      const [x, y] = projection([d.lng, d.lat]);
      return `translate(${x}, ${y})`;
    })
    .style('opacity', 0);

  enter.append('circle').attr('class', 'pulse').attr('r', 6);
  enter.append('circle').attr('class', 'ring').attr('r', 8);
  enter.append('circle').attr('class', 'dot').attr('r', 3.5);

  enter.transition()
    .delay((_, i) => 250 + i * 35)
    .duration(600)
    .style('opacity', 1);

  // events on all markers (existing + entering)
  layer.selectAll('g.marker')
    .on('mouseenter', (e, d) => showTooltip(e, d))
    .on('mousemove',  (e, d) => positionTooltip(e))
    .on('mouseleave', hideTooltip)
    .on('click',      (e, d) => {
      e.stopPropagation();
      const nearby = collectNearbyItems(d);
      if (nearby.length > 1) {
        nearby.length > MAX_SPIDER ? openClusterPanel(nearby, e) : spiderOpen(nearby);
        return;
      }
      openDetail(d);
    });
}

function buildLegend() {
  const legend = d3.select('#map').append('div')
    .attr('class', 'crosshair br')
    .style('display', 'flex')
    .style('flex-direction', 'column')
    .style('gap', '6px');

  legend.html(`
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:#c9a544;display:inline-block;flex-shrink:0"></span>
      Proprietary model
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:#4a8474;display:inline-block;flex-shrink:0"></span>
      Open-weight model
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:9px;height:9px;background:#8060a8;display:inline-block;transform:rotate(45deg);flex-shrink:0"></span>
      Tool / Application
    </div>
  `);

  d3.select('#map').append('div').attr('class', 'crosshair tl').text('LAT 90°N');
  d3.select('#map').append('div').attr('class', 'crosshair bl').text('LAT 90°S');
  d3.select('#map').append('div').attr('class', 'crosshair tr').text('Natural Earth Projection');
}

// ──────────────  tooltip

const tooltip = (() => {
  const el = document.createElement('div');
  el.className = 'map-tooltip';
  document.body.appendChild(el);
  return el;
})();

function showTooltip(e, d, entryType = 'model') {
  if (entryType === 'submodel') {
    const parts = [
      d.version      ? `v${escapeHtml(d.version)}`      : '',
      d.parameters   ? escapeHtml(d.parameters)         : '',
    ].filter(Boolean).join(' · ');
    tooltip.innerHTML = `
      <span class="name">${escapeHtml(d.name)}</span>
      <span class="org">${escapeHtml(d.parentName)} · submodel</span>
      ${parts ? `<span class="place">${parts}</span>` : ''}
      ${d.addedAt ? `<span style="margin-top:4px;display:inline-block;font-family:var(--mono);font-size:9px;letter-spacing:0.14em;color:var(--paper-3)">${escapeHtml(d.addedAt)}</span>` : ''}`;
    tooltip.classList.add('is-visible');
    positionTooltip(e);
    return;
  }
  const badge = entryType === 'tool'
    ? `<span style="margin-top:4px;display:inline-block;background:rgba(128,96,168,0.15);color:var(--violet);font-size:9px;letter-spacing:0.12em;padding:1px 5px;border-radius:2px;text-transform:uppercase;border:1px solid rgba(128,96,168,0.35)">${escapeHtml(d.category)}</span>`
    : '';
  tooltip.innerHTML = `
    <span class="name">${escapeHtml(d.name)}</span>
    <span class="org">${escapeHtml(d.organization)}</span>
    <span class="place">${escapeHtml(d.city)}, ${escapeHtml(d.country)}</span>
    ${badge}`;
  tooltip.classList.add('is-visible');
  positionTooltip(e);
}
function positionTooltip(e) {
  tooltip.style.left = `${e.clientX}px`;
  tooltip.style.top  = `${e.clientY - 12}px`;
}
function hideTooltip() { tooltip.classList.remove('is-visible'); }

// ──────────────  catalogue

function renderCatalogue() {
  const tbody = $('#cat-models tbody');
  const sorted = [...state.filtered].sort((a, b) => {
    const k = state.sort.key;
    let av = a[k], bv = b[k];
    if (Array.isArray(av)) av = av.join(',');
    if (Array.isArray(bv)) bv = bv.join(',');
    if (av < bv) return state.sort.asc ? -1 : 1;
    if (av > bv) return state.sort.asc ?  1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.modelPage = Math.min(state.modelPage, totalPages);
  const start = (state.modelPage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows.map(m => `
    <tr data-id="${m.id}">
      <td class="name-cell">${m.name}</td>
      <td>${m.organization}</td>
      <td class="hide-sm">${m.city}, ${m.country}</td>
      <td><span class="type-pill ${m.type}">${m.type}</span></td>
      <td class="hide-sm">${m.modality.join(' · ')}</td>
      <td>${m.year}</td>
      <td class="hide-sm">${m.parameters}</td>
    </tr>`).join('');

  updateCatalogueCount();

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const m = state.models.find(x => x.id === tr.dataset.id);
      if (m) openDetail(m);
    });
  });

  renderPagination('#cat-models-pagination', state.modelPage, sorted.length, (p) => {
    state.modelPage = p;
    renderCatalogue();
    scrollToCatalogueTop('#cat-models');
  });
}

function renderToolsCatalogue() {
  const tbody = $('#cat-tools tbody');
  if (!tbody) return;
  applyToolFilters();
  const tools = state.filteredTools;
  const sorted = [...tools].sort((a, b) => {
    const k = state.toolSort.key;
    let av = a[k], bv = b[k];
    if (Array.isArray(av)) av = av.join(',');
    if (Array.isArray(bv)) bv = bv.join(',');
    if (av < bv) return state.toolSort.asc ? -1 : 1;
    if (av > bv) return state.toolSort.asc ?  1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.toolPage = Math.min(state.toolPage, totalPages);
  const start = (state.toolPage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows.map(t => {
    const bo = Array.isArray(t.builtOn) && t.builtOn.length
      ? t.builtOn.slice(0, 2).join(', ') +
        (t.builtOn.length > 2 ? ` <span style="color:var(--muted)">+${t.builtOn.length - 2}</span>` : '')
      : '<span style="color:var(--muted)">—</span>';
    return `
      <tr data-id="${escapeAttr(t.id)}">
        <td class="name-cell">${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.organization)}</td>
        <td class="hide-sm">${escapeHtml(t.city)}, ${escapeHtml(t.country)}</td>
        <td><span class="cat-pill">${escapeHtml(t.category)}</span></td>
        <td>${t.year}</td>
        <td class="hide-sm" style="font-family:var(--mono);font-size:11px">${bo}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const t = state.tools.find(x => x.id === tr.dataset.id);
      if (t) openToolDetail(t);
    });
  });

  renderPagination('#cat-tools-pagination', state.toolPage, sorted.length, (p) => {
    state.toolPage = p;
    renderToolsCatalogue();
    scrollToCatalogueTop('#cat-tools');
  });
}

function updateCatalogueCount() {
  const el = $('#catalogue-count');
  if (!el) return;
  if (state.catTab === 'tools') {
    const total  = state.tools.length;
    const shown  = state.filteredTools.length;
    el.textContent = shown === total
      ? `${total} tool${total !== 1 ? 's' : ''}`
      : `${shown} of ${total} tools`;
  } else {
    el.textContent = `${state.filtered.length} of ${state.models.length} entries`;
  }
}

function bindCatalogueSort() {
  // models table sort
  $$('#cat-models th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.sort.key === k) state.sort.asc = !state.sort.asc;
      else { state.sort.key = k; state.sort.asc = true; }
      $$('#cat-models th').forEach(t => t.classList.remove('sorted', 'asc'));
      th.classList.add('sorted');
      if (state.sort.asc) th.classList.add('asc');
      state.modelPage = 1;
      renderCatalogue();
    });
  });

  // tools table sort
  $$('#cat-tools th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.toolSort.key === k) state.toolSort.asc = !state.toolSort.asc;
      else { state.toolSort.key = k; state.toolSort.asc = true; }
      $$('#cat-tools th').forEach(t => t.classList.remove('sorted', 'asc'));
      th.classList.add('sorted');
      if (state.toolSort.asc) th.classList.add('asc');
      state.toolPage = 1;
      renderToolsCatalogue();
    });
  });
}

function renderToolsFilters() {
  const el = $('#cat-filter-category');
  if (!el) return;
  const categories = ['all', ...new Set(state.tools.map(t => t.category).filter(Boolean))].sort((a, b) =>
    a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b));
  el.innerHTML = categories.map(c =>
    `<button class="chip ${state.filterToolCategory === c ? 'is-active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  el.addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    state.filterToolCategory = btn.dataset.cat;
    state.toolPage = 1;
    renderToolsFilters();
    renderToolsCatalogue();
  });
}

function bindCatalogueTabs() {
  const tabs = $$('.cat-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.cat;
      state.catTab = target;
      tabs.forEach(t => t.classList.toggle('is-active', t.dataset.cat === target));
      const mt = $('#cat-models');
      const tt = $('#cat-tools');
      const mp = $('#cat-models-pagination');
      const tp = $('#cat-tools-pagination');
      if (mt) mt.style.display = target === 'models' ? '' : 'none';
      if (tt) tt.style.display = target === 'tools'  ? '' : 'none';
      if (mp) mp.style.display = target === 'models' ? '' : 'none';
      if (tp) tp.style.display = target === 'tools'  ? '' : 'none';

      const filterbar   = $('.cat-filterbar');
      const typeFilter  = $('#cat-filter-type');
      const modFilter   = $('#cat-filter-modality');
      const catFilter   = $('#cat-filter-category');
      const isTools     = target === 'tools';

      if (typeFilter)  typeFilter.hidden  =  isTools;
      if (modFilter)   modFilter.hidden   =  isTools;
      if (catFilter)   catFilter.hidden   = !isTools;
      if (filterbar)   filterbar.classList.toggle('tools-mode', isTools);

      if (isTools) {
        renderToolsFilters();
        renderToolsCatalogue();
      } else {
        renderFilters();
      }
      updateCatalogueCount();
    });
  });
}

// ──────────────  detail panel

function bindDetailPanel() {
  $('#detail .close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (clusterPanel) closeClusterPanel();
      else if (spiderState) spiderClose();
      else closeDetail();
    }
  });
}

function openDetail(m) {
  state.selected = m;
  const panel = $('#detail');
  $('#detail .eyebrow').textContent = `№ ${zeroPad(state.models.indexOf(m) + 1, 3)} · ${m.year}`;
  $('#detail h3').textContent = m.name;
  $('#detail .org-line').innerHTML = `${m.organization}<span class="place">${m.city} · ${m.country}</span>`;
  $('#detail .specs').innerHTML = `
    <dt>Type</dt><dd>${m.type}</dd>
    <dt>Year</dt><dd>${m.year}</dd>
    ${m.releaseDate ? `<dt>Released</dt><dd>${m.releaseDate}</dd>` : ''}
    <dt>Modality</dt><dd>${m.modality.join(' · ')}</dd>
    <dt>Parameters</dt><dd>${m.parameters}</dd>
    <dt>Coordinates</dt><dd>${m.lat.toFixed(2)}°, ${m.lng.toFixed(2)}°</dd>
    <dt>Reference</dt><dd><a href="${m.url}" target="_blank" rel="noopener">${stripUrl(m.url)} ↗</a></dd>`;
  $('#detail .notes').textContent = m.notes || '';

  // ── links ──
  const linksEl = $('#detail .links-section');
  if (linksEl) {
    const links = Array.isArray(m.links) ? m.links.filter(l => l.url) : [];
    if (links.length) {
      linksEl.innerHTML = `
        <div class="links-title">References</div>
        <div class="links-list">${links.map(l => `
          <a class="detail-link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener">
            ${escapeHtml(l.label || stripUrl(l.url))} ↗
          </a>`).join('')}
        </div>`;
      linksEl.style.display = '';
    } else {
      linksEl.style.display = 'none';
    }
  }

  // ── submodels ──
  const subEl = $('#detail .submodels-section');
  if (subEl) {
    const subs = Array.isArray(m.submodels) ? m.submodels.filter(s => s.name || s.parameters) : [];
    if (subs.length) {
      const rows = subs.map(s => {
        const links = [
          s.ollamaUrl      ? `<a class="sub-link" href="${escapeAttr(s.ollamaUrl)}" target="_blank" rel="noopener">Ollama ↗</a>` : '',
          s.huggingfaceUrl ? `<a class="sub-link" href="${escapeAttr(s.huggingfaceUrl)}" target="_blank" rel="noopener">HF ↗</a>` : '',
        ].filter(Boolean).join('');
        return `<tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.version)}</td>
          <td>${escapeHtml(s.parameters)}</td>
          <td class="sub-links">${links}</td>
          <td>${escapeHtml(s.addedAt)}</td>
        </tr>`;
      }).join('');
      subEl.innerHTML = `
        <div class="submodels-title">Variants &amp; submodels<span>(${subs.length})</span></div>
        <table class="submodels-table">
          <thead><tr>
            <th>Name</th><th>Version</th><th>Params</th><th>Links</th><th>Added</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      subEl.style.display = '';
    } else {
      subEl.style.display = 'none';
    }
  }

  const connElM = $('#detail .connections-section');
  if (connElM) connElM.style.display = 'none';
  const modConnElM = $('#detail .model-connections-section');
  if (modConnElM) modConnElM.style.display = 'none';

  panel.classList.add('is-open');
  d3.selectAll('g.marker').classed('open', d => d.id === m.id);
}

function closeDetail() {
  $('#detail').classList.remove('is-open');
  d3.selectAll('g.marker').classed('open', false);
  d3.selectAll('g.tool-marker').classed('open', false);
  state.selected = null;
  state.selectedTool = null;
}

// ──────────────  tools layer

function renderToolMarkers() {
  if (!svg) return;
  const layer = svg.select('g.tool-markers');
  if (layer.empty()) return;

  const visible = state.layers.tools ? state.filteredTools : [];
  const sel = layer.selectAll('g.tool-marker').data(visible, d => d.id);

  sel.exit().remove();

  const enter = sel.enter().append('g')
    .attr('class', d => `tool-marker cat-${d.category}`)
    .attr('transform', d => {
      const [x, y] = projection([d.lng, d.lat]);
      return `translate(${x}, ${y})`;
    })
    .style('opacity', 0);

  // outer ring (hover feedback)
  enter.append('rect')
    .attr('class', 'tdiamond-ring')
    .attr('x', -7).attr('y', -7)
    .attr('width', 14).attr('height', 14)
    .attr('transform', 'rotate(45)');

  // solid diamond fill
  enter.append('rect')
    .attr('class', 'tdiamond')
    .attr('x', -4.5).attr('y', -4.5)
    .attr('width', 9).attr('height', 9)
    .attr('transform', 'rotate(45)');

  enter.transition()
    .delay((_, i) => 400 + i * 28)
    .duration(500)
    .style('opacity', 1);

  layer.selectAll('g.tool-marker')
    .on('mouseenter', (e, d) => showTooltip(e, d, 'tool'))
    .on('mousemove',  (e)    => positionTooltip(e))
    .on('mouseleave', hideTooltip)
    .on('click',      (e, d) => {
      e.stopPropagation();
      const nearby = collectNearbyItems(d);
      if (nearby.length > 1) {
        nearby.length > MAX_SPIDER ? openClusterPanel(nearby, e) : spiderOpen(nearby);
        return;
      }
      openToolDetail(d);
    });
}

function openToolDetail(t) {
  state.selectedTool = t;
  state.selected = null;
  const panel = $('#detail');

  const idx = state.tools.indexOf(t) + 1;
  $('#detail .eyebrow').textContent = `Tool № ${zeroPad(idx, 3)} · ${t.year} · ${t.category}`;
  $('#detail h3').textContent = t.name;
  $('#detail .org-line').innerHTML =
    `${escapeHtml(t.organization)}<span class="place">${escapeHtml(t.city)} · ${escapeHtml(t.country)}</span>`;

  const builtOnHtml = Array.isArray(t.builtOn) && t.builtOn.length
    ? t.builtOn.map(b => `<span class="built-on-tag">${escapeHtml(b)}</span>`).join('')
    : `<span style="color:var(--muted)">—</span>`;

  const refHtml = t.url
    ? `<a href="${escapeAttr(t.url)}" target="_blank" rel="noopener">${escapeHtml(stripUrl(t.url))} ↗</a>`
    : '—';

  $('#detail .specs').innerHTML = `
    <dt>Category</dt><dd>${escapeHtml(t.category)}</dd>
    <dt>Year</dt><dd>${t.year}</dd>
    <dt>Built on</dt><dd style="display:flex;flex-wrap:wrap;gap:2px">${builtOnHtml}</dd>
    <dt>Coordinates</dt><dd>${t.lat.toFixed(2)}°, ${t.lng.toFixed(2)}°</dd>
    <dt>Reference</dt><dd>${refHtml}</dd>`;

  $('#detail .notes').textContent = t.notes || '';

  // ── connected models ──
  const modConnEl = $('#detail .model-connections-section');
  if (modConnEl) {
    const modIds = Array.isArray(t.connectedModels) ? t.connectedModels : [];
    const connModels = modIds.map(id => state.models.find(m => m.id === id)).filter(Boolean);
    if (connModels.length) {
      modConnEl.innerHTML = `
        <div class="model-connections-title">Connected Models</div>
        ${connModels.map(m => `
          <button class="conn-model-btn" data-id="${escapeAttr(m.id)}">
            <span class="conn-name">${escapeHtml(m.name)}</span>
            <span class="conn-model-sub">${escapeHtml(m.organization)} · ${escapeHtml(m.type)}</span>
          </button>`).join('')}`;
      modConnEl.querySelectorAll('.conn-model-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = state.models.find(x => x.id === btn.dataset.id);
          if (m) openDetail(m);
        });
      });
      modConnEl.style.display = '';
    } else {
      modConnEl.style.display = 'none';
    }
  }

  // ── connected tools (forward + reverse) ──
  const connEl = $('#detail .connections-section');
  if (connEl) {
    const connIds = new Set(Array.isArray(t.connectedTools) ? t.connectedTools : []);
    state.tools.forEach(other => {
      if (other.id !== t.id && Array.isArray(other.connectedTools) && other.connectedTools.includes(t.id)) {
        connIds.add(other.id);
      }
    });
    const connTools = [...connIds].map(id => state.tools.find(x => x.id === id)).filter(Boolean);
    if (connTools.length) {
      connEl.innerHTML = `
        <div class="connections-title">Connected Tools</div>
        ${connTools.map(ct => `
          <button class="conn-tool-btn" data-id="${escapeAttr(ct.id)}">
            <span class="conn-name">${escapeHtml(ct.name)}</span>
            <span class="conn-sub">${escapeHtml(ct.organization)} · ${escapeHtml(ct.category)}</span>
          </button>`).join('')}`;
      connEl.querySelectorAll('.conn-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const ct = state.tools.find(x => x.id === btn.dataset.id);
          if (ct) openToolDetail(ct);
        });
      });
      connEl.style.display = '';
    } else {
      connEl.style.display = 'none';
    }
  }

  // ── links ──
  const linksEl = $('#detail .links-section');
  if (linksEl) {
    const links = Array.isArray(t.links) ? t.links.filter(l => l.url) : [];
    if (links.length) {
      linksEl.innerHTML = `
        <div class="links-title">References</div>
        <div class="links-list">${links.map(l => `
          <a class="detail-link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener">
            ${escapeHtml(l.label || stripUrl(l.url))} ↗
          </a>`).join('')}
        </div>`;
      linksEl.style.display = '';
    } else {
      linksEl.style.display = 'none';
    }
  }

  // tools have no submodels
  const subEl = $('#detail .submodels-section');
  if (subEl) subEl.style.display = 'none';

  d3.selectAll('g.marker').classed('open', false);
  d3.selectAll('g.tool-marker').classed('open', d => d.id === t.id);
  panel.classList.add('is-open');
}

// ──────────────  search

function bindSearch() {
  const inputs = [
    { input: $('#atlas-search'), clear: $('#atlas-search-clear') },
    { input: $('#cat-search'),   clear: $('#cat-search-clear')   },
  ].filter(p => p.input);

  function syncAll(value) {
    inputs.forEach(({ input, clear }) => {
      input.value = value;
      if (clear) clear.hidden = !value;
    });
  }

  inputs.forEach(({ input, clear }) => {
    input.addEventListener('input', () => {
      state.filterSearch = input.value.trim();
      syncAll(state.filterSearch);
      state.toolPage = 1;
      applyFilters();
      renderToolsCatalogue();
    });

    if (clear) {
      clear.addEventListener('click', () => {
        state.filterSearch = '';
        syncAll('');
        input.focus();
        state.toolPage = 1;
        applyFilters();
        renderToolsCatalogue();
      });
    }
  });
}

// ──────────────  editions modal

function bindEditionsModal() {
  const btn     = $('#btn-editions-modal');
  const backdrop = $('#editions-modal');
  const closeBtn = $('#editions-modal-close');
  if (!btn || !backdrop) return;

  btn.addEventListener('click', openEditionsModal);
  closeBtn.addEventListener('click', closeEditionsModal);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeEditionsModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeEditionsModal();
  });
}

function openEditionsModal() {
  renderEditionsModal();
  $('#editions-modal').classList.add('is-open');
  $('#editions-modal').setAttribute('aria-hidden', 'false');
}

function closeEditionsModal() {
  $('#editions-modal').classList.remove('is-open');
  $('#editions-modal').setAttribute('aria-hidden', 'true');
}

function renderEditionsModal() {
  const body = $('#editions-modal-body');
  const liveActive = state.activeEditionId === 'live';

  const liveItem = `
    <div class="em-item em-live ${liveActive ? 'is-active' : ''}" data-edition="live">
      <div class="em-item__label"><span class="em-dot"></span>Live edition</div>
      <div class="em-item__meta">
        <span>${state.models.length} model${state.models.length !== 1 ? 's' : ''}</span>
        <span>${state.tools.length} tool${state.tools.length !== 1 ? 's' : ''}</span>
        <span>Always current</span>
      </div>
    </div>`;

  const archiveItems = state.editions.length
    ? state.editions.map(ed => `
        <div class="em-item ${state.activeEditionId === ed.id ? 'is-active' : ''}"
             data-edition="${escapeAttr(ed.id)}">
          <div class="em-item__label"><span class="em-dot"></span>${escapeHtml(ed.label)}</div>
          <div class="em-item__meta">
            <span>${ed.date}</span>
            <span>${ed.features} model${ed.features !== 1 ? 's' : ''}</span>
            ${ed.tools != null ? `<span>${ed.tools} tool${ed.tools !== 1 ? 's' : ''}</span>` : ''}
          </div>
          ${ed.note ? `<div class="em-item__note">${escapeHtml(ed.note)}</div>` : ''}
        </div>`).join('')
    : `<div style="padding:32px 24px;font-family:var(--mono);font-size:10px;letter-spacing:0.16em;color:var(--muted);text-transform:uppercase">
         No archived editions yet.
       </div>`;

  body.innerHTML = liveItem + archiveItems;

  body.querySelectorAll('.em-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.edition;
      closeEditionsModal();
      if (id === 'live') await loadLiveEdition();
      else await loadEdition(id);
    });
  });
}

// ──────────────  spiderfy

function collectNearbyItems(clickedDatum) {
  const [cx, cy] = projection([clickedDatum.lng, clickedDatum.lat]);
  const items = [];
  if (state.layers.models) {
    state.filtered.forEach(m => {
      const [px, py] = projection([m.lng, m.lat]);
      if (Math.hypot(px - cx, py - cy) < SPIDER_THRESH_PX)
        items.push({ kind: 'model', datum: m });
    });
  }
  if (state.layers.tools) {
    state.tools.forEach(t => {
      const [px, py] = projection([t.lng, t.lat]);
      if (Math.hypot(px - cx, py - cy) < SPIDER_THRESH_PX)
        items.push({ kind: 'tool', datum: t });
    });
  }
  return items;
}

function spiderOpen(nearbyItems) {
  spiderClose(false);
  closeClusterPanel();
  hideTooltip();

  // center = average projected position of all clustered items
  let sumX = 0, sumY = 0;
  nearbyItems.forEach(item => {
    const [px, py] = projection([item.datum.lng, item.datum.lat]);
    sumX += px; sumY += py;
  });
  const cx = sumX / nearbyItems.length;
  const cy = sumY / nearbyItems.length;

  const n = nearbyItems.length;
  const angleStep  = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // start from top

  // transparent full-map rect catches clicks outside the spider
  const capture = svg.append('rect')
    .attr('class', 'spider-capture')
    .attr('width', MAP_W).attr('height', MAP_H)
    .style('fill', 'transparent')
    .on('click', () => spiderClose());

  const group = svg.append('g')
    .attr('class', 'spider-group')
    .style('opacity', 0);

  group.append('circle')
    .attr('class', 'spider-backdrop')
    .attr('cx', cx).attr('cy', cy)
    .attr('r', SPIDER_RADIUS + 22);

  group.append('circle')
    .attr('class', 'spider-center')
    .attr('cx', cx).attr('cy', cy).attr('r', 3);

  nearbyItems.forEach((item, i) => {
    const angle = startAngle + i * angleStep;
    const tx = cx + SPIDER_RADIUS * Math.cos(angle);
    const ty = cy + SPIDER_RADIUS * Math.sin(angle);

    group.append('line')
      .attr('class', 'spider-leg')
      .attr('x1', cx).attr('y1', cy)
      .attr('x2', tx).attr('y2', ty);

    const tip = group.append('g')
      .attr('class', `spider-tip spider-kind-${item.kind}`)
      .attr('transform', `translate(${tx},${ty})`)
      .style('cursor', 'pointer');

    if (item.kind === 'model') {
      tip.append('circle').attr('class', 'spider-tip-ring').attr('r', 9);
      tip.append('circle')
        .attr('class', `spider-tip-dot type-${item.datum.type}`)
        .attr('r', 4.5);
    } else {
      tip.append('rect')
        .attr('class', 'spider-tip-dring')
        .attr('x', -7).attr('y', -7)
        .attr('width', 14).attr('height', 14)
        .attr('transform', 'rotate(45)');
      tip.append('rect')
        .attr('class', 'spider-tip-diamond')
        .attr('x', -4.5).attr('y', -4.5)
        .attr('width', 9).attr('height', 9)
        .attr('transform', 'rotate(45)');
    }

    // label: push outward in direction of the arm
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const LABEL_OFF = 13;
    const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
    const lx = ux > 0.3 ? LABEL_OFF : ux < -0.3 ? -LABEL_OFF : 0;
    const ly = Math.abs(ux) <= 0.3 ? (uy > 0 ? LABEL_OFF + 2 : -(LABEL_OFF - 2)) : 1;

    tip.append('text')
      .attr('class', 'spider-tip-label')
      .attr('x', lx).attr('y', ly)
      .attr('text-anchor', anchor)
      .attr('dominant-baseline', 'middle')
      .text(item.datum.name.length > 18
        ? item.datum.name.slice(0, 16) + '…'
        : item.datum.name);

    tip.on('mouseenter', e => showTooltip(e, item.datum, item.kind))
       .on('mousemove',  e => positionTooltip(e))
       .on('mouseleave', hideTooltip)
       .on('click', e => {
         e.stopPropagation();
         spiderClose();
         if (item.kind === 'model') openDetail(item.datum);
         else openToolDetail(item.datum);
       });
  });

  group.transition().duration(220).style('opacity', 1);
  spiderState = { group, capture };
}

function spiderClose(animate = true) {
  if (!spiderState) return;
  const { group, capture } = spiderState;
  spiderState = null;
  capture.remove();
  if (animate) {
    group.transition().duration(180).style('opacity', 0)
      .on('end', function () { d3.select(this).remove(); });
  } else {
    group.remove();
  }
}

// ──────────────  cluster panel (large overlapping sets)

function openClusterPanel(items, event) {
  closeClusterPanel();
  spiderClose(false);
  hideTooltip();

  const mapEl = $('#map');
  if (!mapEl) return;

  // Sort: models A-Z first, then tools A-Z
  const sorted = [
    ...items.filter(i => i.kind === 'model').sort((a, b) => a.datum.name.localeCompare(b.datum.name)),
    ...items.filter(i => i.kind === 'tool' ).sort((a, b) => a.datum.name.localeCompare(b.datum.name)),
  ];

  const modelCount = items.filter(i => i.kind === 'model').length;
  const toolCount  = items.filter(i => i.kind === 'tool').length;
  const headLabel  = [
    modelCount ? `${modelCount} model${modelCount !== 1 ? 's' : ''}` : '',
    toolCount  ? `${toolCount} tool${toolCount !== 1 ? 's' : ''}`    : '',
  ].filter(Boolean).join(' · ');

  const panel = document.createElement('div');
  panel.className = 'cluster-panel';
  panel.innerHTML = `
    <div class="cluster-panel__head">
      <span>${escapeHtml(headLabel)}</span>
      <button class="cluster-panel__close" title="Close">×</button>
    </div>
    <div class="cluster-panel__list">
      ${sorted.map(item => {
        const d = item.datum;
        const tagClass = item.kind === 'tool' ? 'tool' : d.type;
        const tagLabel = item.kind === 'tool' ? d.category : d.type;
        return `
          <button class="cluster-item" data-id="${escapeAttr(d.id)}" data-kind="${item.kind}">
            <span class="cluster-item__name">${escapeHtml(d.name)}</span>
            <span class="cluster-item__org">${escapeHtml(d.organization)}</span>
            <span class="cluster-item__tag ${tagClass}">${escapeHtml(tagLabel)}</span>
          </button>`;
      }).join('')}
    </div>`;

  mapEl.appendChild(panel);

  // Position near the click, clamped to stay within the map
  const rect = mapEl.getBoundingClientRect();
  const cx   = event.clientX - rect.left;
  const cy   = event.clientY - rect.top;
  const pw   = panel.offsetWidth;
  const ph   = panel.offsetHeight;
  const mw   = mapEl.offsetWidth;
  const mh   = mapEl.offsetHeight;

  let left = cx + 14;
  let top  = cy - 24;
  if (left + pw > mw - 8) left = cx - pw - 14;
  if (top  + ph > mh - 8) top  = mh - ph - 8;
  if (top  < 8) top  = 8;
  if (left < 8) left = 8;

  panel.style.left = `${left}px`;
  panel.style.top  = `${top}px`;

  panel.querySelector('.cluster-panel__close').addEventListener('click', closeClusterPanel);

  panel.querySelectorAll('.cluster-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeClusterPanel();
      if (btn.dataset.kind === 'tool') {
        const t = state.tools.find(x => x.id === btn.dataset.id);
        if (t) openToolDetail(t);
      } else {
        const m = state.models.find(x => x.id === btn.dataset.id);
        if (m) openDetail(m);
      }
    });
  });

  // Close when clicking outside the panel
  clusterOutsideHandler = e => {
    if (!panel.contains(e.target)) closeClusterPanel();
  };
  setTimeout(() => document.addEventListener('click', clusterOutsideHandler), 0);

  clusterPanel = panel;
}

function closeClusterPanel() {
  if (clusterPanel) { clusterPanel.remove(); clusterPanel = null; }
  if (clusterOutsideHandler) {
    document.removeEventListener('click', clusterOutsideHandler);
    clusterOutsideHandler = null;
  }
}

// ──────────────  layer toggles

function renderLayerToggles() {
  const modelsNum = $('#layer-models-count');
  const toolsNum  = $('#layer-tools-count');
  if (modelsNum) modelsNum.textContent = state.models.length;
  if (toolsNum)  toolsNum.textContent  = state.tools.length;
}

function bindLayerToggles() {
  const container = $('#layer-toggles');
  if (!container) return;
  container.addEventListener('click', e => {
    const btn = e.target.closest('.layer-btn');
    if (!btn) return;
    const layer = btn.dataset.layer;
    state.layers[layer] = !state.layers[layer];
    btn.classList.toggle('is-active', state.layers[layer]);
    if (svg) {
      if (layer === 'models') svg.select('g.markers').style('display', state.layers.models ? '' : 'none');
      if (layer === 'tools')  svg.select('g.tool-markers').style('display', state.layers.tools ? '' : 'none');
    }
    if (state.view === 'timeline') renderTimeline();
  });
}

// ──────────────  edition switcher

function renderEditionSwitcher() {
  const container = $('#edition-switcher');
  if (!container) return;

  const liveActive = state.activeEditionId === 'live';

  const liveBtn = `
    <button class="edition-opt live ${liveActive ? 'is-active' : ''}" data-edition="live">
      <span class="ed-dot"></span>
      <span class="ed-name">Live edition</span>
      <span class="ed-count">${state.models.length} models · ${state.tools.length} tools</span>
    </button>`;

  const archiveBtns = state.editions.slice(0, 3).map(ed => `
    <button class="edition-opt ${state.activeEditionId === ed.id ? 'is-active' : ''}"
            data-edition="${escapeAttr(ed.id)}"
            title="${escapeAttr(ed.note || ed.label)}">
      <span class="ed-dot"></span>
      <span class="ed-name">${escapeHtml(ed.label)}</span>
      <span class="ed-count">${ed.features} models${ed.tools != null ? ` · ${ed.tools} tools` : ''}</span>
    </button>`).join('');

  container.innerHTML = liveBtn + (state.editions.length
    ? archiveBtns
    : `<div style="font-family:var(--mono);font-size:10px;letter-spacing:0.14em;color:var(--muted);padding:8px 2px;line-height:1.5">
         No archived editions yet.
       </div>`);

  container.querySelectorAll('.edition-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.edition;
      if (id === 'live') loadLiveEdition();
      else loadEdition(id);
    });
  });
}

async function loadEdition(id) {
  const ed = state.editions.find(e => e.id === id);
  if (!ed) return;
  try {
    const geo = await fetch(`./data/${ed.file}`).then(r => r.json());
    const { meta, models } = fromGeoJson(geo);
    state.models = models;
    // Restore the tools snapshot saved with this edition.
    // For older editions that pre-date tool snapshotting, strip inter-layer
    // connections from live tools so the timeline stays historically accurate.
    if (Array.isArray(geo.toolFeatures) && geo.toolFeatures.length > 0) {
      state.tools = fromToolsGeoJson({ features: geo.toolFeatures });
    } else {
      state.tools = state.tools.map(t => ({ ...t, connectedModels: [], connectedTools: [] }));
    }
    state.activeEditionId = id;
    state.modelPage = 1;
    state.toolPage = 1;
    closeDetail();
    renderMeta({ ...meta, edition: ed.label, updated: ed.date });
    renderStats();
    renderLayerToggles();
    renderEditionSwitcher();
    applyFilters();
    renderToolsCatalogue();
    updateArchiveBanner(ed);
  } catch (err) {
    console.error('Failed to load edition', id, err);
  }
}

async function loadLiveEdition() {
  try {
    const [geo, toolsGeo] = await Promise.all([
      fetch(DATA_URL).then(r => r.json()),
      fetch(TOOLS_URL).then(r => r.json()),
    ]);
    const { meta, models } = fromGeoJson(geo);
    state.models = models;
    state.tools  = fromToolsGeoJson(toolsGeo);
    state.activeEditionId = 'live';
    state.modelPage = 1;
    state.toolPage  = 1;
    closeDetail();
    renderMeta(meta);
    renderStats();
    renderLayerToggles();
    renderEditionSwitcher();
    applyFilters();
    renderToolsCatalogue();
    updateArchiveBanner(null);
  } catch (err) {
    console.error('Failed to reload live edition', err);
  }
}

function updateArchiveBanner(ed) {
  const banner = $('#archive-banner');
  if (!banner) return;
  if (!ed) {
    banner.classList.remove('is-visible');
  } else {
    $('#banner-label').textContent = `${ed.label} · ${ed.date} · ${ed.features} models${ed.tools != null ? ` · ${ed.tools} tools` : ''}`;
    banner.classList.add('is-visible');
  }
}

function bindArchiveBanner() {
  const btn = $('#btn-return-live');
  if (btn) btn.addEventListener('click', loadLiveEdition);
}

// ──────────────  view switcher (Map / Timeline)

function bindViewSwitch() {
  const box = $('#view-switch');
  if (!box) return;
  box.addEventListener('click', e => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    setView(btn.dataset.view);
  });
}

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  $$('#view-switch .view-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.view === view));
  const mapEl = $('#map');
  const tlEl  = $('#timeline');
  if (view === 'timeline') {
    if (mapEl) mapEl.hidden = true;
    if (tlEl)  tlEl.hidden  = false;
    renderTimeline();
  } else {
    if (tlEl)  tlEl.hidden  = true;
    if (mapEl) mapEl.hidden = false;
  }
}

// ──────────────  timeline

const TL_W = 1100;
const TL_H = 620;
const TL_PAD = { top: 60, right: 56, bottom: 80, left: 56 };
const TL_LANES = {
  models: { top: TL_PAD.top + 10,  bottom: 290, label: 'Models' },
  tools:  { top: 320,              bottom: TL_H - TL_PAD.bottom - 10, label: 'Tools & applications' },
};

function parseItemDate(d) {
  if (d && typeof d === 'object') {
    for (const key of ['releaseDate', 'addedAt']) {
      if (d[key]) {
        const t = Date.parse(d[key]);
        if (!isNaN(t)) return new Date(t);
      }
    }
  }
  if (d && d.year != null) return new Date(d.year, 6, 1); // mid-year anchor
  return null;
}

function renderTimeline() {
  const container = $('#timeline');
  if (!container) return;
  container.innerHTML = '';

  // ── collect items (respect filters for models; layers toggle respected too)
  const modelItems = (state.layers.models ? state.filtered : []).map(m => ({
    kind: 'model',
    datum: m,
    date: parseItemDate(m),
  }));
  const toolItems = (state.layers.tools ? state.tools : []).map(t => ({
    kind: 'tool',
    datum: t,
    date: parseItemDate(t),
  }));
  const submodelItems = (state.layers.models ? state.filtered : []).flatMap(m =>
    (Array.isArray(m.submodels) ? m.submodels : [])
      .filter(s => s && (s.name || s.parameters))
      .map(s => ({
        kind: 'submodel',
        datum: { ...s, parentId: m.id, parentName: m.name },
        parent: m,
        date: parseItemDate(s) || parseItemDate(m),
      }))
  );

  const all = [...modelItems, ...toolItems, ...submodelItems].filter(i => i.date);
  if (!all.length) {
    container.innerHTML = `<div style="padding:48px;font-family:var(--mono);font-size:11px;letter-spacing:0.18em;color:var(--muted);text-transform:uppercase">No datable entries to plot.</div>`;
    return;
  }

  // ── X scale (reversed: newer on left)
  const minDate = d3.min(all, d => d.date);
  const maxDate = d3.max(all, d => d.date);
  const pad = Math.max(
    (maxDate - minDate) * 0.05,
    1000 * 60 * 60 * 24 * 120 // min 4 months padding
  );
  const domain = [new Date(maxDate.getTime() + pad), new Date(minDate.getTime() - pad)];
  const x = d3.scaleTime()
    .domain(domain)
    .range([TL_PAD.left, TL_W - TL_PAD.right]);

  const svgSel = d3.select(container).append('svg')
    .attr('class', 'timeline')
    .attr('viewBox', `0 0 ${TL_W} ${TL_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // ── lane backgrounds & labels
  Object.entries(TL_LANES).forEach(([key, lane]) => {
    svgSel.append('rect')
      .attr('class', `tl-lane tl-lane-${key}`)
      .attr('x', TL_PAD.left - 20)
      .attr('y', lane.top)
      .attr('width', TL_W - TL_PAD.left - TL_PAD.right + 40)
      .attr('height', lane.bottom - lane.top);
    svgSel.append('text')
      .attr('class', 'tl-lane-label')
      .attr('x', TL_PAD.left - 16)
      .attr('y', lane.top + 16)
      .text(lane.label.toUpperCase());
  });

  // ── year grid + axis
  const years = d3.timeYear.range(
    d3.timeYear.floor(domain[1]),
    d3.timeYear.offset(d3.timeYear.ceil(domain[0]), 1)
  );
  const grid = svgSel.append('g').attr('class', 'tl-grid');
  years.forEach(yr => {
    const xp = x(yr);
    grid.append('line')
      .attr('class', 'tl-gridline')
      .attr('x1', xp).attr('x2', xp)
      .attr('y1', TL_PAD.top - 20)
      .attr('y2', TL_H - TL_PAD.bottom);
    grid.append('text')
      .attr('class', 'tl-year')
      .attr('x', xp)
      .attr('y', TL_H - TL_PAD.bottom + 26)
      .attr('text-anchor', 'middle')
      .text(yr.getFullYear());
  });

  // arrow hint "newer → older"
  svgSel.append('text')
    .attr('class', 'tl-hint')
    .attr('x', TL_PAD.left)
    .attr('y', 28)
    .text('◄ Newer');
  svgSel.append('text')
    .attr('class', 'tl-hint')
    .attr('x', TL_W - TL_PAD.right)
    .attr('y', 28)
    .attr('text-anchor', 'end')
    .text('Older ►');

  // ── helpers for stacking within lane
  function placeInLane(items, lane, radius) {
    const cy = (lane.top + lane.bottom) / 2;
    const step = radius * 2 + 4;
    const placed = [];
    items
      .slice()
      .sort((a, b) => d3.descending(a.date, b.date))
      .forEach(it => {
        const xp = x(it.date);
        let level = 0;
        // zig-zag: 0, -1, +1, -2, +2, ...
        const tries = [];
        for (let k = 0; k < 40; k++) {
          tries.push(k === 0 ? 0 : (k % 2 === 1 ? -Math.ceil(k/2) : Math.ceil(k/2)));
        }
        for (const lv of tries) {
          const y = cy + lv * step;
          if (y < lane.top + radius + 6 || y > lane.bottom - radius - 6) continue;
          const hit = placed.some(p => Math.hypot(p.x - xp, p.y - y) < radius * 2 + 2);
          if (!hit) { level = lv; placed.push({ x: xp, y, ref: it }); it._x = xp; it._y = y; return; }
        }
        // fallback: clamp
        it._x = xp; it._y = cy;
        placed.push({ x: xp, y: it._y, ref: it });
      });
  }

  placeInLane(modelItems, TL_LANES.models, 6);
  placeInLane(toolItems,  TL_LANES.tools,  6);
  // Submodels: place along the models lane, smaller radius; they may overlap parents slightly
  placeInLane(submodelItems, TL_LANES.models, 4);

  // ── build deduplicated tool-to-tool connection pairs
  const toolConnPairs = [];
  const seenToolPairs = new Set();
  toolItems.forEach(ti => {
    const ids = Array.isArray(ti.datum.connectedTools) ? ti.datum.connectedTools : [];
    ids.forEach(otherId => {
      const pairKey = [ti.datum.id, otherId].sort().join('::');
      if (seenToolPairs.has(pairKey)) return;
      seenToolPairs.add(pairKey);
      const other = toolItems.find(t => t.datum.id === otherId);
      if (!other || ti._x == null || other._x == null) return;
      toolConnPairs.push({ a: ti, b: other });
    });
  });

  // ── build tool-model cross-lane connection pairs
  const toolModelPairs = [];
  toolItems.forEach(ti => {
    const modIds = Array.isArray(ti.datum.connectedModels) ? ti.datum.connectedModels : [];
    modIds.forEach(modId => {
      const mi = modelItems.find(m => m.datum.id === modId);
      if (!mi || ti._x == null || mi._x == null) return;
      toolModelPairs.push({ tool: ti, model: mi });
    });
  });

  // ── submodel → parent connectors (drawn first, under markers)
  const connectors = svgSel.append('g').attr('class', 'tl-connectors');
  submodelItems.forEach(s => {
    const parent = modelItems.find(m => m.datum.id === s.datum.parentId);
    if (!parent || parent._x == null) return;
    connectors.append('path')
      .attr('class', 'tl-connector')
      .attr('d', `M${parent._x},${parent._y} C${parent._x},${(parent._y + s._y) / 2} ${s._x},${(parent._y + s._y) / 2} ${s._x},${s._y}`);
  });

  // ── model markers
  const modelsG = svgSel.append('g').attr('class', 'tl-models');
  modelsG.selectAll('g.tl-model')
    .data(modelItems)
    .join('g')
    .attr('class', d => `tl-model type-${d.datum.type}`)
    .attr('transform', d => `translate(${d._x}, ${d._y})`)
    .each(function (d) {
      const g = d3.select(this);
      g.append('circle').attr('class', 'tl-ring').attr('r', 8);
      g.append('circle').attr('class', 'tl-dot').attr('r', 4);
    })
    .on('mouseenter', (e, d) => showTooltip(e, d.datum, 'model'))
    .on('mousemove',  (e)    => positionTooltip(e))
    .on('mouseleave', hideTooltip)
    .on('click',      (e, d) => openDetail(d.datum));

  // ── submodel markers
  const subG = svgSel.append('g').attr('class', 'tl-submodels');
  subG.selectAll('g.tl-submodel')
    .data(submodelItems)
    .join('g')
    .attr('class', 'tl-submodel')
    .attr('transform', d => `translate(${d._x}, ${d._y})`)
    .each(function () {
      const g = d3.select(this);
      g.append('circle').attr('class', 'tl-sub-dot').attr('r', 2.5);
    })
    .on('mouseenter', (e, d) => showTooltip(e, d.datum, 'submodel'))
    .on('mousemove',  (e)    => positionTooltip(e))
    .on('mouseleave', hideTooltip)
    .on('click',      (e, d) => {
      if (d.parent) openDetail(d.parent);
    });

  // ── cross-lane tool-model arcs (drawn behind all markers)
  const crossConnsG = svgSel.append('g').attr('class', 'tl-cross-connections');
  toolModelPairs.forEach(({ tool, model }) => {
    const gap = tool._y - model._y;
    crossConnsG.append('path')
      .attr('class', 'tl-model-tool-conn')
      .attr('d', `M${tool._x},${tool._y} C${tool._x},${tool._y - gap * 0.4} ${model._x},${model._y + gap * 0.4} ${model._x},${model._y}`);
  });

  // ── tool-to-tool connection arcs (drawn behind diamonds)
  const toolConnsG = svgSel.append('g').attr('class', 'tl-tool-connections');
  toolConnPairs.forEach(({ a, b }) => {
    const midX = (a._x + b._x) / 2;
    const midY = Math.min(a._y, b._y) - 32;
    toolConnsG.append('path')
      .attr('class', 'tl-tool-conn')
      .attr('d', `M${a._x},${a._y} Q${midX},${midY} ${b._x},${b._y}`);
  });

  // ── tool markers (diamonds)
  const toolsG = svgSel.append('g').attr('class', 'tl-tools');
  toolsG.selectAll('g.tl-tool')
    .data(toolItems)
    .join('g')
    .attr('class', 'tl-tool')
    .attr('transform', d => `translate(${d._x}, ${d._y})`)
    .each(function () {
      const g = d3.select(this);
      g.append('rect')
        .attr('class', 'tl-tdiamond-ring')
        .attr('x', -7).attr('y', -7)
        .attr('width', 14).attr('height', 14)
        .attr('transform', 'rotate(45)');
      g.append('rect')
        .attr('class', 'tl-tdiamond')
        .attr('x', -4.5).attr('y', -4.5)
        .attr('width', 9).attr('height', 9)
        .attr('transform', 'rotate(45)');
    })
    .on('mouseenter', (e, d) => showTooltip(e, d.datum, 'tool'))
    .on('mousemove',  (e)    => positionTooltip(e))
    .on('mouseleave', hideTooltip)
    .on('click',      (e, d) => openToolDetail(d.datum));

  // ── connection legend (bottom, centred)
  const legendItems = [
    { stroke: 'rgba(201,165,68,0.65)',  label: 'Model variant' },
    { stroke: 'rgba(74,132,116,0.7)',   label: 'Tool–model link' },
    { stroke: 'rgba(128,96,168,0.75)', label: 'Tool–tool link' },
  ];
  const legendY   = TL_H - 18;
  const lineLen   = 24;
  const itemW     = 180;
  const legendW   = itemW * legendItems.length;
  const legendX0  = (TL_W - legendW) / 2;

  const legendG = svgSel.append('g').attr('class', 'tl-legend');
  legendItems.forEach((item, i) => {
    const lx = legendX0 + i * itemW;
    legendG.append('line')
      .attr('x1', lx).attr('y1', legendY)
      .attr('x2', lx + lineLen).attr('y2', legendY)
      .attr('stroke', item.stroke)
      .attr('stroke-width', 1.5);
    legendG.append('text')
      .attr('class', 'tl-legend-label')
      .attr('x', lx + lineLen + 8)
      .attr('y', legendY)
      .attr('dominant-baseline', 'middle')
      .text(item.label);
  });

  state.timelineRendered = true;
}

// ──────────────  pagination

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('…');
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  for (let i = lo; i <= hi; i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function renderPagination(selector, current, total, onPage) {
  const container = $(selector);
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const range = buildPageRange(current, totalPages);
  const prevDis = current === 1 ? 'disabled' : '';
  const nextDis = current === totalPages ? 'disabled' : '';

  container.innerHTML = `
    <div class="pagination">
      <button class="page-btn page-arrow" data-page="${current - 1}" ${prevDis} aria-label="Previous page">←</button>
      ${range.map(p => p === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-btn ${p === current ? 'is-active' : ''}" data-page="${p}">${p}</button>`
      ).join('')}
      <button class="page-btn page-arrow" data-page="${current + 1}" ${nextDis} aria-label="Next page">→</button>
      <span class="page-info">${current} / ${totalPages}</span>
    </div>`;

  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPage(+btn.dataset.page));
  });
}

function scrollToCatalogueTop(tableSelector) {
  const el = $(tableSelector);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ──────────────  utilities

function zeroPad(n, w) { return String(n).padStart(w, '0'); }
function stripUrl(u) { return u.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
