/* ============================================================
   ATLAS — public viewer
   Reads /data/ai-models.json, renders D3 world map + catalogue.
   ============================================================ */

const DATA_URL = './data/ai-models.geojson';
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

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
  sort: { key: 'year', asc: false },
  selected: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ──────────────  bootstrap

(async function init() {
  try {
    const [geo, topo] = await Promise.all([
      fetch(DATA_URL).then(r => r.json()),
      fetch(TOPO_URL).then(r => r.json()),
    ]);
    const { meta, models } = fromGeoJson(geo);
    state.models = models;
    renderMeta(meta);
    renderStats();
    renderFilters();
    renderMap(topo);
    applyFilters();
    bindCatalogueSort();
    bindDetailPanel();
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

  // markers layer drawn after countries
  svg.append('g').attr('class', 'markers');

  renderMarkers();
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
      <span style="width:8px;height:8px;border-radius:50%;background:#c9a544;display:inline-block"></span>
      Proprietary
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:#4a8474;display:inline-block"></span>
      Open-weight
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

function showTooltip(e, d) {
  tooltip.innerHTML = `
    <span class="name">${d.name}</span>
    <span class="org">${d.organization}</span>
    <span class="place">${d.city}, ${d.country}</span>`;
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
  const tbody = $('#catalogue tbody');
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

  $('#catalogue-count').textContent =
    `${state.filtered.length} of ${state.models.length} entries`;

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const m = state.models.find(x => x.id === tr.dataset.id);
      if (m) openDetail(m);
    });
  });
}

function bindCatalogueSort() {
  $$('#catalogue th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.sort.key === k) state.sort.asc = !state.sort.asc;
      else { state.sort.key = k; state.sort.asc = true; }
      $$('#catalogue th').forEach(t => t.classList.remove('sorted', 'asc'));
      th.classList.add('sorted');
      if (state.sort.asc) th.classList.add('asc');
      renderCatalogue();
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

  panel.classList.add('is-open');
  d3.selectAll('g.marker').classed('open', d => d.id === m.id);
}

function closeDetail() {
  $('#detail').classList.remove('is-open');
  d3.selectAll('g.marker').classed('open', false);
  state.selected = null;
}

// ──────────────  utilities

function zeroPad(n, w) { return String(n).padStart(w, '0'); }
function stripUrl(u) { return u.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
