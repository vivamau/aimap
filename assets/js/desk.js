/* ============================================================
   EDITORIAL DESK — admin logic (API-backed)
   Talks to the Express backend at /api/*. Every save is persisted
   server-side and triggers regeneration of /data/ai-models.geojson.
   ============================================================ */

const API = '/api';

const state = {
  meta: {},
  models: [],
  editions: [],
  filteredIds: null,
  activeId: null,
};

const MODALITIES = ['text', 'image', 'audio', 'video', 'code', '3d'];
const TYPES = ['proprietary', 'open-weight'];

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

// ──────────────  HTTP helpers

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include',
  });
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (body && body.error) || `HTTP ${res.status}`;
    const details = body && body.details ? ` — ${body.details.join('; ')}` : '';
    throw new Error(msg + details);
  }
  return body;
}

// ──────────────  bootstrap

(async function init() {
  bindBar();
  bindForm();
  bindSearch();
  bindEditionsToggle();
  bindEditionModal();
  try {
    await refresh();
    newEntry();
  } catch (err) {
    toast(`Cannot reach server: ${err.message}`, 'danger');
  }
})();

async function refresh() {
  const [meta, list, edList] = await Promise.all([
    api('/meta'),
    api('/models'),
    api('/editions'),
  ]);
  state.meta    = meta;
  state.models  = list.models;
  state.editions = edList.editions;
  renderAll();
}

// ──────────────  rendering

function renderAll() {
  renderStatline();
  renderList();
  renderEditions();
  renderPreview();
}

function renderStatline() {
  const orgs = new Set(state.models.map(m => m.organization));
  const countries = new Set(state.models.map(m => m.country));
  $('#statline').innerHTML = `
    <div class="pair"><span>Models</span><strong>${state.models.length}</strong></div>
    <div class="pair"><span>Orgs</span><strong>${orgs.size}</strong></div>
    <div class="pair"><span>Countries</span><strong>${countries.size}</strong></div>
    <div class="pair"><span>Edition</span><strong>${state.meta.edition || '—'}</strong></div>
    <div class="pair"><span>Last saved</span><strong>${state.meta.updated || '—'}</strong></div>
    <div class="pair" style="margin-left:auto"><span>Backend</span><strong>online</strong></div>`;
}

function renderList() {
  const list = $('#entry-list');
  const ids = state.filteredIds || state.models.map(m => m.id);
  const items = state.models.filter(m => ids.includes(m.id));

  $('#entry-count').textContent = `${items.length} / ${state.models.length}`;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">No entries match.</div>`;
    return;
  }

  list.innerHTML = items.map(m => `
    <button class="entry ${state.activeId === m.id ? 'is-active' : ''}" data-id="${m.id}">
      <span class="ent-name">${escapeHtml(m.name)}</span>
      <span class="ent-org">${escapeHtml(m.organization)} · ${escapeHtml(m.country)}</span>
      <span class="ent-type ${m.type}">${m.type}</span>
    </button>`).join('');

  list.querySelectorAll('.entry').forEach(btn => {
    btn.addEventListener('click', () => loadIntoForm(btn.dataset.id));
  });
}

function renderPreview() {
  const fc = toFeatureCollectionPreview();
  const json = JSON.stringify(fc, null, 2);
  $('#json-preview').innerHTML = highlightJson(json);
}

function toFeatureCollectionPreview() {
  return {
    type: 'FeatureCollection',
    meta: state.meta,
    features: state.models.map(m => {
      const { lat, lng, ...properties } = m;
      return {
        type: 'Feature',
        id: m.id,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties,
      };
    }),
  };
}

function highlightJson(s) {
  return escapeHtml(s)
    .replace(/(&quot;[^&]+?&quot;)(\s*:)/g, '<span class="key">$1</span>$2')
    .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="str">$1</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="bool">$1</span>');
}

// ──────────────  form

function bindForm() {
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    saveEntry();
  });
  $('#btn-new').addEventListener('click', newEntry);
  $('#btn-delete').addEventListener('click', deleteEntry);

  $('#mod-grid').innerHTML = MODALITIES.map(m =>
    `<button type="button" class="mod-toggle" data-mod="${m}">${m}</button>`).join('');
  $('#mod-grid').addEventListener('click', e => {
    const t = e.target.closest('.mod-toggle');
    if (!t) return;
    t.classList.toggle('is-on');
  });

  $('#f-type').innerHTML = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
}

function newEntry() {
  state.activeId = null;
  $('#form').reset();
  $('#form-mode').textContent = 'New entry';
  $('#btn-delete').style.display = 'none';
  $$('#mod-grid .mod-toggle').forEach(t => t.classList.remove('is-on'));
  $('#f-type').value = 'proprietary';
  renderList();
}

function loadIntoForm(id) {
  const m = state.models.find(x => x.id === id);
  if (!m) return;
  state.activeId = id;
  $('#form-mode').textContent = `Editing № ${state.models.indexOf(m) + 1}`;
  $('#btn-delete').style.display = '';
  $('#f-id').value = m.id;
  $('#f-name').value = m.name;
  $('#f-org').value = m.organization;
  $('#f-country').value = m.country;
  $('#f-city').value = m.city;
  $('#f-lat').value = m.lat;
  $('#f-lng').value = m.lng;
  $('#f-type').value = m.type;
  $('#f-year').value = m.year;
  $('#f-params').value = m.parameters;
  $('#f-url').value = m.url;
  $('#f-notes').value = m.notes || '';
  $$('#mod-grid .mod-toggle').forEach(t =>
    t.classList.toggle('is-on', m.modality.includes(t.dataset.mod)));
  renderList();
}

function readForm() {
  const modality = $$('#mod-grid .mod-toggle.is-on').map(t => t.dataset.mod);
  return {
    id: $('#f-id').value || undefined,
    name: $('#f-name').value.trim(),
    organization: $('#f-org').value.trim(),
    country: $('#f-country').value.trim(),
    city: $('#f-city').value.trim(),
    lat: parseFloat($('#f-lat').value),
    lng: parseFloat($('#f-lng').value),
    type: $('#f-type').value,
    year: parseInt($('#f-year').value, 10),
    parameters: $('#f-params').value.trim() || 'undisclosed',
    url: $('#f-url').value.trim(),
    notes: $('#f-notes').value.trim(),
    modality: modality.length ? modality : ['text'],
  };
}

async function saveEntry() {
  const m = readForm();
  if (!m.name || !m.organization) {
    return toast('Name and organisation are required.', 'danger');
  }
  try {
    let saved;
    if (state.activeId) {
      saved = await api('/models/' + encodeURIComponent(state.activeId), {
        method: 'PUT', body: JSON.stringify(m),
      });
      toast(`Updated “${saved.name}”.`);
    } else {
      saved = await api('/models', {
        method: 'POST', body: JSON.stringify(m),
      });
      toast(`Added “${saved.name}”. GeoJSON regenerated.`);
    }
    state.activeId = saved.id;
    await refresh();
    loadIntoForm(saved.id);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

async function deleteEntry() {
  if (!state.activeId) return;
  const m = state.models.find(x => x.id === state.activeId);
  if (!confirm(`Remove “${m.name}” from the atlas?`)) return;
  try {
    await api('/models/' + encodeURIComponent(state.activeId), { method: 'DELETE' });
    toast(`Removed “${m.name}”. GeoJSON regenerated.`, 'danger');
    await refresh();
    newEntry();
  } catch (err) {
    toast(err.message, 'danger');
  }
}

// ──────────────  search

function bindSearch() {
  $('#search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { state.filteredIds = null; return renderList(); }
    state.filteredIds = state.models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.organization.toLowerCase().includes(q) ||
      (m.country || '').toLowerCase().includes(q) ||
      (m.city || '').toLowerCase().includes(q)
    ).map(m => m.id);
    renderList();
  });
}

// ──────────────  bar actions

function bindBar() {
  $('#btn-export').addEventListener('click', exportGeojson);
  $('#btn-download').addEventListener('click', downloadGeojson);
  $('#btn-meta').addEventListener('click', editMeta);
  $('#btn-refresh').addEventListener('click', () => refresh().then(() => toast('Refreshed.')));
}

async function exportGeojson() {
  try {
    const r = await api('/export', { method: 'POST' });
    toast(`Wrote ${r.features} features → ${r.path}`);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

function downloadGeojson() {
  const fc = toFeatureCollectionPreview();
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai-models.geojson';
  a.click();
  URL.revokeObjectURL(url);
  toast('Downloaded ai-models.geojson.');
}

async function editMeta() {
  const edition = prompt('Edition label:', state.meta.edition || '');
  if (edition === null) return;
  const compiler = prompt('Compiler note:', state.meta.compiler || '');
  if (compiler === null) return;
  try {
    await api('/meta', { method: 'PUT', body: JSON.stringify({ edition, compiler }) });
    await refresh();
    toast('Meta updated.');
  } catch (err) {
    toast(err.message, 'danger');
  }
}

// ──────────────  editions panel

function renderEditions() {
  const count = state.editions.length;
  $('#editions-count').textContent = count ? `${count} saved` : '0 saved';

  const list = $('#editions-list');
  if (count === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:32px 18px">
      No editions saved yet.<br>Use <em>Save Edition ✦</em> to archive the current catalogue.
    </div>`;
    return;
  }
  list.innerHTML = state.editions.map(ed => `
    <div class="edition-item">
      <span class="ed-label">${escapeHtml(ed.label)}</span>
      <div class="ed-meta">
        <span>${ed.date}</span>
        <span>${ed.features} model${ed.features !== 1 ? 's' : ''}</span>
        <a href="/data/${escapeHtml(ed.file)}" download
           style="color:var(--gold);border-bottom:1px solid rgba(201,165,68,.3);margin-left:auto">
          Download ↓
        </a>
      </div>
      ${ed.note ? `<div class="ed-note">${escapeHtml(ed.note)}</div>` : ''}
    </div>`).join('');
}

function bindEditionsToggle() {
  $('#editions-toggle').addEventListener('click', () => {
    const panel = $('#editions-panel');
    const open  = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    $('#editions-toggle').style.borderBottom =
      open ? '1px solid var(--line)' : 'none';
  });
}

// ──────────────  save edition modal

function bindEditionModal() {
  $('#btn-save-edition').addEventListener('click', openEditionModal);
  $('#modal-close').addEventListener('click',  closeEditionModal);
  $('#modal-cancel').addEventListener('click', closeEditionModal);
  $('#modal-confirm').addEventListener('click', confirmSaveEdition);
  $('#edition-modal').addEventListener('click', e => {
    if (e.target === $('#edition-modal')) closeEditionModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#edition-modal').style.display !== 'none') {
      closeEditionModal();
    }
  });
}

function openEditionModal() {
  const count = state.models.length;
  $('#modal-count').textContent = `${count} model${count !== 1 ? 's' : ''}`;
  // pre-fill label from current meta edition as a starting point
  $('#ed-label').value = state.meta.edition ? `${state.meta.edition} — snapshot` : '';
  $('#ed-note').value  = '';
  $('#edition-modal').style.display = 'grid';
  setTimeout(() => $('#ed-label').focus(), 50);
}

function closeEditionModal() {
  $('#edition-modal').style.display = 'none';
}

async function confirmSaveEdition() {
  const label = $('#ed-label').value.trim();
  const note  = $('#ed-note').value.trim();
  if (!label) {
    $('#ed-label').focus();
    toast('An edition label is required.', 'danger');
    return;
  }
  try {
    const ed = await api('/editions', {
      method: 'POST',
      body: JSON.stringify({ label, note }),
    });
    closeEditionModal();
    await refresh();
    // Ensure the editions panel is open so the user sees their new entry
    $('#editions-panel').style.display = 'block';
    toast(`Edition "${ed.label}" saved — ${ed.features} models archived.`);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

// ──────────────  utilities

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast is-visible ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}
