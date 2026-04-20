/* ============================================================
   ATLAS — public viewer
   Reads /data/ai-models.json, renders D3 world map + catalogue.
   ============================================================ */

const DATA_URL      = './data/ai-models.geojson';
const TOOLS_URL     = './data/ai-tools.geojson';
const EDITIONS_URL  = './data/editions/index.json';
const TOPO_URL      = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

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
  filterType: 'all',     // all | proprietary | open-weight
  filterModality: 'all', // all | text | image | audio | video
  sort:     { key: 'year', asc: false },
  toolSort: { key: 'year', asc: false },
  selected: null,
  selectedTool: null,
  activeEditionId: 'live',   // 'live' or an edition id string
  editions: [],              // list loaded from editions/index.json
  tools: [],                 // AI tools layer
  layers: { models: true, tools: true },
  catTab: 'models',          // active catalogue tab
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ──────────────  bootstrap

(async function init() {
  try {
    const [geo, topo, editionsIndex, toolsGeo] = await Promise.all([
      fetch(DATA_URL).then(r => r.json()),
      fetch(TOPO_URL).then(r => r.json()),
      fetch(EDITIONS_URL).then(r => r.json()).catch(() => ({ editions: [] })),
      fetch(TOOLS_URL).then(r => r.json()).catch(() => ({ features: [] })),
    ]);
    const { meta, models } = fromGeoJson(geo);
    state.models   = models;
    state.editions = editionsIndex.editions || [];
    state.tools    = fromToolsGeoJson(toolsGeo);
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
    bindDetailPanel();
    bindArchiveBanner();
    bindLayerToggles();
  } catch (err) {
    console.error('Atlas failed to load:', err);
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
  const countries = new Set(state.models.map(m => m.country));
  const orgs      = new Set(state.models.map(m => m.organization));
  $('#stat-models').innerHTML    = state.models.length.toString().padStart(2, '0');
  $('#stat-countries').innerHTML = countries.size.toString().padStart(2, '0');
  $('#stat-orgs').innerHTML      = orgs.size.toString().padStart(2, '0');
}

// ──────────────  filters

function renderFilters() {
  const types = ['all', 'proprietary', 'open-weight'];
  const mods  = ['all', 'text', 'image', 'audio', 'video'];

  $('#filter-type').innerHTML = types.map(t =>
    `<button class="chip ${state.filterType === t ? 'is-active' : ''}" data-type="${t}">${t}</button>`
  ).join('');

  $('#filter-modality').innerHTML = mods.map(m =>
    `<button class="chip ${state.filterModality === m ? 'is-active' : ''}" data-mod="${m}">${m}</button>`
  ).join('');

  $('#filter-type').addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    state.filterType = btn.dataset.type;
    renderFilters();
    applyFilters();
  });

  $('#filter-modality').addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    state.filterModality = btn.dataset.mod;
    renderFilters();
    applyFilters();
  });
}

function applyFilters() {
  state.filtered = state.models.filter(m => {
    if (state.filterType !== 'all' && m.type !== state.filterType) return false;
    if (state.filterModality !== 'all' && !m.modality.includes(state.filterModality)) return false;
    return true;
  });
  renderMarkers();
  renderCatalogue();
}

// ──────────────  map

let projection, svg, g;
const MAP_W = 1100;
const MAP_H = 620;

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
    .on('click',      (e, d) => openDetail(d));
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
  const badge = entryType === 'tool'
    ? `<span style="margin-top:4px;display:inline-block;background:rgba(128,96,168,0.2);color:#c0a0e0;font-size:9px;letter-spacing:0.12em;padding:1px 5px;border-radius:2px;text-transform:uppercase">${escapeHtml(d.category)}</span>`
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

  tbody.innerHTML = sorted.map((m, i) => `
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
}

function renderToolsCatalogue() {
  const tbody = $('#cat-tools tbody');
  if (!tbody) return;
  const sorted = [...state.tools].sort((a, b) => {
    const k = state.toolSort.key;
    let av = a[k], bv = b[k];
    if (Array.isArray(av)) av = av.join(',');
    if (Array.isArray(bv)) bv = bv.join(',');
    if (av < bv) return state.toolSort.asc ? -1 : 1;
    if (av > bv) return state.toolSort.asc ?  1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(t => {
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
}

function updateCatalogueCount() {
  const el = $('#catalogue-count');
  if (!el) return;
  if (state.catTab === 'tools') {
    el.textContent = `${state.tools.length} tool${state.tools.length !== 1 ? 's' : ''}`;
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
      renderToolsCatalogue();
    });
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
      if (mt) mt.style.display = target === 'models' ? '' : 'none';
      if (tt) tt.style.display = target === 'tools'  ? '' : 'none';
      updateCatalogueCount();
    });
  });
}

// ──────────────  detail panel

function bindDetailPanel() {
  $('#detail .close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetail();
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
    <dt>Modality</dt><dd>${m.modality.join(' · ')}</dd>
    <dt>Parameters</dt><dd>${m.parameters}</dd>
    <dt>Coordinates</dt><dd>${m.lat.toFixed(2)}°, ${m.lng.toFixed(2)}°</dd>
    <dt>Reference</dt><dd><a href="${m.url}" target="_blank" rel="noopener">${stripUrl(m.url)} ↗</a></dd>`;
  $('#detail .notes').textContent = m.notes || '';

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

  const visible = state.layers.tools ? state.tools : [];
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
    .on('click',      (e, d) => openToolDetail(d));
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

  // tools have no submodels
  const subEl = $('#detail .submodels-section');
  if (subEl) subEl.style.display = 'none';

  d3.selectAll('g.marker').classed('open', false);
  d3.selectAll('g.tool-marker').classed('open', d => d.id === t.id);
  panel.classList.add('is-open');
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
      <span class="ed-count">${state.models.length} models</span>
    </button>`;

  const archiveBtns = state.editions.map(ed => `
    <button class="edition-opt ${state.activeEditionId === ed.id ? 'is-active' : ''}"
            data-edition="${escapeAttr(ed.id)}"
            title="${escapeAttr(ed.note || ed.label)}">
      <span class="ed-dot"></span>
      <span class="ed-name">${escapeHtml(ed.label)}</span>
      <span class="ed-count">${ed.features}</span>
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
    state.activeEditionId = id;
    closeDetail();
    renderMeta({ ...meta, edition: ed.label, updated: ed.date });
    renderStats();
    renderEditionSwitcher();
    applyFilters();
    updateArchiveBanner(ed);
  } catch (err) {
    console.error('Failed to load edition', id, err);
  }
}

async function loadLiveEdition() {
  try {
    const geo = await fetch(DATA_URL).then(r => r.json());
    const { meta, models } = fromGeoJson(geo);
    state.models = models;
    state.activeEditionId = 'live';
    closeDetail();
    renderMeta(meta);
    renderStats();
    renderEditionSwitcher();
    applyFilters();
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
    $('#banner-label').textContent = `${ed.label} · ${ed.date} · ${ed.features} models`;
    banner.classList.add('is-visible');
  }
}

function bindArchiveBanner() {
  const btn = $('#btn-return-live');
  if (btn) btn.addEventListener('click', loadLiveEdition);
}

// ──────────────  utilities

function zeroPad(n, w) { return String(n).padStart(w, '0'); }
function stripUrl(u) { return u.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
