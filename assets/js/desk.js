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
  // tools
  tools: [],
  filteredToolIds: null,
  activeToolId: null,
  activeTab: 'models',
  editingEditionId: null,
  deletingEditionId: null,
  deletingEditionLabel: null,
};

const MODALITIES   = ['text', 'image', 'audio', 'video', 'code', '3d'];
const TYPES        = ['proprietary', 'open-weight'];
const CATEGORIES   = ['assistant', 'search', 'ide', 'codegen', 'devtool', 'text-to-image', 'text-to-speech', 'text-to-video', 'music'];

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
  bindConfirmDeleteModal();
  bindEditEditionModal();
  bindMetaModal();
  bindTabSwitcher();
  bindToolForm();
  bindToolSearch();
  try {
    await refresh();
    newEntry();
  } catch (err) {
    toast(`Cannot reach server: ${err.message}`, 'danger');
  }
})();

async function refresh() {
  const [meta, list, edList, toolList] = await Promise.all([
    api('/meta'),
    api('/models'),
    api('/editions'),
    api('/tools'),
  ]);
  state.meta     = meta;
  state.models   = list.models;
  state.editions = edList.editions;
  state.tools    = toolList.tools;
  renderAll();
}

// ──────────────  rendering

function renderAll() {
  renderStatline();
  renderList();
  renderEditions();
  renderPreview();
  renderToolsList();
  renderToolsPreview();
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

  $('#btn-add-submodel').addEventListener('click', addSubmodelRow);
  $('#btn-add-link').addEventListener('click', () => addLinkRow());
}

// ──────────────  links editor

function addLinkRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'submodel-row';
  row.style.gridTemplateColumns = '1fr 1.8fr 28px';
  row.innerHTML = `
    <input type="text" class="lk-label" placeholder="Paper / GitHub / HF…" value="${escapeHtml(data.label || '')}">
    <input type="url"  class="lk-url"   placeholder="https://…"             value="${escapeHtml(data.url   || '')}">
    <button type="button" class="del-row" title="Remove">×</button>`;
  row.querySelector('.del-row').addEventListener('click', () => {
    row.remove();
    refreshLinksUI();
  });
  $('#link-rows').appendChild(row);
  refreshLinksUI();
  row.querySelector('.lk-label').focus();
}

function refreshLinksUI() {
  const rows  = $$('#link-rows .submodel-row');
  const empty = $('#links-empty');
  const count = $('#links-count');
  if (empty) empty.style.display = rows.length ? 'none' : 'block';
  if (count) count.textContent = `${rows.length} link${rows.length !== 1 ? 's' : ''}`;
}

function populateLinks(links = []) {
  $('#link-rows').innerHTML = '';
  links.forEach(l => addLinkRow(l));
  if (links.length === 0) refreshLinksUI();
}

function readLinks() {
  return $$('#link-rows .submodel-row').map(row => ({
    label: row.querySelector('.lk-label').value.trim(),
    url:   row.querySelector('.lk-url').value.trim(),
  })).filter(l => l.url);
}

// ──────────────  submodels editor

function addSubmodelRow(data = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const row = document.createElement('div');
  row.className = 'submodel-row';
  row.innerHTML = `
    <input type="text"  class="sm-name"   placeholder="model:7b"         value="${escapeHtml(data.name           || '')}">
    <input type="text"  class="sm-ver"    placeholder="2.5"               value="${escapeHtml(data.version        || '')}">
    <input type="text"  class="sm-params" placeholder="7B"                value="${escapeHtml(data.parameters     || '')}">
    <input type="url"   class="sm-ollama" placeholder="https://ollama.com/…" value="${escapeHtml(data.ollamaUrl   || '')}">
    <input type="url"   class="sm-hf"     placeholder="https://huggingface.co/…" value="${escapeHtml(data.huggingfaceUrl || '')}">
    <input type="date"  class="sm-date"   value="${escapeHtml(data.addedAt || today)}">
    <button type="button" class="del-row" title="Remove">×</button>`;

  row.querySelector('.del-row').addEventListener('click', () => {
    row.remove();
    refreshSubmodelsUI();
  });

  $('#submodel-rows').appendChild(row);
  refreshSubmodelsUI();
  row.querySelector('.sm-name').focus();
}

function refreshSubmodelsUI() {
  const rows = $$('#submodel-rows .submodel-row');
  const empty = $('#submodels-empty');
  const count = $('#submodels-count');
  if (empty) empty.style.display = rows.length ? 'none' : 'block';
  if (count) count.textContent = `${rows.length} variant${rows.length !== 1 ? 's' : ''}`;
}

function populateSubmodels(submodels = []) {
  $('#submodel-rows').innerHTML = '';
  submodels.forEach(s => addSubmodelRow(s));
  if (submodels.length === 0) refreshSubmodelsUI();
}

function readSubmodels() {
  return $$('#submodel-rows .submodel-row').map(row => ({
    name:           row.querySelector('.sm-name').value.trim(),
    version:        row.querySelector('.sm-ver').value.trim(),
    parameters:     row.querySelector('.sm-params').value.trim(),
    ollamaUrl:      row.querySelector('.sm-ollama').value.trim(),
    huggingfaceUrl: row.querySelector('.sm-hf').value.trim(),
    addedAt:        row.querySelector('.sm-date').value.trim(),
  })).filter(s => s.name || s.parameters);
}

function newEntry() {
  state.activeId = null;
  $('#form').reset();
  $('#form-mode').textContent = 'New entry';
  $('#btn-delete').style.display = 'none';
  $$('#mod-grid .mod-toggle').forEach(t => t.classList.remove('is-on'));
  $('#f-type').value = 'proprietary';
  populateLinks([]);
  populateSubmodels([]);
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
  $('#f-date').value = m.releaseDate || '';
  $('#f-params').value = m.parameters;
  $('#f-url').value = m.url;
  $('#f-notes').value = m.notes || '';
  $$('#mod-grid .mod-toggle').forEach(t =>
    t.classList.toggle('is-on', m.modality.includes(t.dataset.mod)));
  populateLinks(m.links || []);
  populateSubmodels(m.submodels || []);
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
    releaseDate: $('#f-date').value || '',
    parameters: $('#f-params').value.trim() || 'undisclosed',
    url: $('#f-url').value.trim(),
    notes: $('#f-notes').value.trim(),
    modality: modality.length ? modality : ['text'],
    links: readLinks(),
    submodels: readSubmodels(),
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

function editMeta() {
  $('#meta-edition').value  = state.meta.edition  || '';
  $('#meta-compiler').value = state.meta.compiler || '';
  $('#meta-updated').value  = state.meta.updated  || '—';
  $('#meta-modal').style.display = 'grid';
  setTimeout(() => $('#meta-edition').focus(), 50);
}

function bindMetaModal() {
  $('#meta-modal-close').addEventListener('click',   closeMetaModal);
  $('#meta-modal-cancel').addEventListener('click',  closeMetaModal);
  $('#meta-modal-confirm').addEventListener('click', confirmMeta);
  $('#meta-modal').addEventListener('click', e => {
    if (e.target === $('#meta-modal')) closeMetaModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#meta-modal').style.display !== 'none') closeMetaModal();
  });
}

function closeMetaModal() {
  $('#meta-modal').style.display = 'none';
}

async function confirmMeta() {
  const edition  = $('#meta-edition').value.trim();
  const compiler = $('#meta-compiler').value.trim();
  if (!edition) {
    $('#meta-edition').focus();
    return toast('Edition label is required.', 'danger');
  }
  try {
    await api('/meta', { method: 'PUT', body: JSON.stringify({ edition, compiler }) });
    closeMetaModal();
    await refresh();
    toast('Metadata saved.');
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
    <div class="edition-item" data-ed-id="${escapeHtml(ed.id)}">
      <div class="ed-header">
        <span class="ed-label">${escapeHtml(ed.label)}</span>
        <div class="ed-actions">
          <button class="btn btn-sm btn-edit-ed" data-id="${escapeHtml(ed.id)}" title="Edit metadata">Edit</button>
          <button class="btn btn-sm danger btn-del-ed" data-id="${escapeHtml(ed.id)}" data-label="${escapeHtml(ed.label)}" title="Delete edition">Delete</button>
        </div>
      </div>
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

  list.querySelectorAll('.btn-edit-ed').forEach(btn => {
    btn.addEventListener('click', () => {
      const ed = state.editions.find(e => e.id === btn.dataset.id);
      if (ed) openEditEditionModal(ed);
    });
  });

  list.querySelectorAll('.btn-del-ed').forEach(btn => {
    btn.addEventListener('click', () => deleteEdition(btn.dataset.id, btn.dataset.label));
  });
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

// ──────────────  edit / delete edition

function bindConfirmDeleteModal() {
  $('#confirm-delete-close').addEventListener('click',   closeConfirmDeleteModal);
  $('#confirm-delete-cancel').addEventListener('click',  closeConfirmDeleteModal);
  $('#confirm-delete-confirm').addEventListener('click', executeDeleteEdition);
  $('#confirm-delete-modal').addEventListener('click', e => {
    if (e.target === $('#confirm-delete-modal')) closeConfirmDeleteModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#confirm-delete-modal').style.display !== 'none') {
      closeConfirmDeleteModal();
    }
  });
}

function openConfirmDeleteModal(id, label) {
  state.deletingEditionId    = id;
  state.deletingEditionLabel = label;
  $('#confirm-delete-label').textContent = `"${label}"`;
  $('#confirm-delete-modal').style.display = 'grid';
  $('#confirm-delete-cancel').focus();
}

function closeConfirmDeleteModal() {
  $('#confirm-delete-modal').style.display = 'none';
  state.deletingEditionId    = null;
  state.deletingEditionLabel = null;
}

async function executeDeleteEdition() {
  const { deletingEditionId: id, deletingEditionLabel: label } = state;
  closeConfirmDeleteModal();
  try {
    await api(`/editions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
    toast(`Edition "${label}" deleted.`, 'danger');
  } catch (err) {
    toast(err.message, 'danger');
  }
}

function bindEditEditionModal() {
  $('#edit-edition-close').addEventListener('click',   closeEditEditionModal);
  $('#edit-edition-cancel').addEventListener('click',  closeEditEditionModal);
  $('#edit-edition-confirm').addEventListener('click', confirmEditEdition);
  $('#edit-edition-modal').addEventListener('click', e => {
    if (e.target === $('#edit-edition-modal')) closeEditEditionModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#edit-edition-modal').style.display !== 'none') {
      closeEditEditionModal();
    }
  });
}

function openEditEditionModal(ed) {
  state.editingEditionId = ed.id;
  $('#eed-label').value = ed.label;
  $('#eed-note').value  = ed.note || '';
  $('#edit-edition-modal').style.display = 'grid';
  setTimeout(() => $('#eed-label').focus(), 50);
}

function closeEditEditionModal() {
  $('#edit-edition-modal').style.display = 'none';
  state.editingEditionId = null;
}

async function confirmEditEdition() {
  const label = $('#eed-label').value.trim();
  const note  = $('#eed-note').value.trim();
  if (!label) {
    $('#eed-label').focus();
    return toast('Edition label is required.', 'danger');
  }
  try {
    const updated = await api(`/editions/${encodeURIComponent(state.editingEditionId)}`, {
      method: 'PUT',
      body: JSON.stringify({ label, note }),
    });
    closeEditEditionModal();
    await refresh();
    $('#editions-panel').style.display = 'block';
    toast(`Edition "${updated.label}" updated.`);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

function deleteEdition(id, label) {
  openConfirmDeleteModal(id, label);
}

// ──────────────  tab switcher

function bindTabSwitcher() {
  const tabs = $$('.desk-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      state.activeTab = target;
      tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === target));
      const mg = $('#models-grid');
      const tg = $('#tools-grid');
      if (mg) mg.style.display = target === 'models' ? '' : 'none';
      if (tg) tg.style.display = target === 'tools'  ? '' : 'none';
    });
  });
}

// ──────────────  tools list

function renderToolsList() {
  const list  = $('#tools-list');
  const count = $('#tools-count');
  if (!list) return;
  const ids   = state.filteredToolIds || state.tools.map(t => t.id);
  const items = state.tools.filter(t => ids.includes(t.id));

  if (count) count.textContent = `${items.length} / ${state.tools.length}`;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">No tools match.</div>`;
    return;
  }
  list.innerHTML = items.map(t => `
    <button class="entry ${state.activeToolId === t.id ? 'is-active' : ''}" data-id="${t.id}">
      <span class="ent-name">${escapeHtml(t.name)}</span>
      <span class="ent-org">${escapeHtml(t.organization)} · ${escapeHtml(t.country)}</span>
      <span class="ent-type">${escapeHtml(t.category)}</span>
    </button>`).join('');

  list.querySelectorAll('.entry').forEach(btn => {
    btn.addEventListener('click', () => loadToolIntoForm(btn.dataset.id));
  });
}

function renderToolsPreview() {
  const el = $('#tools-json-preview');
  if (!el) return;
  const fc = {
    type: 'FeatureCollection',
    features: state.tools.map(t => {
      const { lat, lng, ...properties } = t;
      return { type: 'Feature', id: t.id,
               geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
    }),
  };
  el.innerHTML = highlightJson(JSON.stringify(fc, null, 2));
}

// ──────────────  tools form

function bindToolForm() {
  const form = $('#tool-form');
  if (!form) return;
  form.addEventListener('submit', e => { e.preventDefault(); saveToolEntry(); });
  $('#btn-tool-new').addEventListener('click', newToolEntry);
  $('#btn-tool-delete').addEventListener('click', deleteToolEntry);
  const sel = $('#ft-category');
  if (sel) sel.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

function bindToolSearch() {
  const el = $('#tool-search');
  if (!el) return;
  el.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { state.filteredToolIds = null; return renderToolsList(); }
    state.filteredToolIds = state.tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.organization.toLowerCase().includes(q) ||
      (t.country || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    ).map(t => t.id);
    renderToolsList();
  });
}

function newToolEntry() {
  state.activeToolId = null;
  const form = $('#tool-form');
  if (form) form.reset();
  $('#tool-form-mode').textContent = 'New tool';
  $('#btn-tool-delete').style.display = 'none';
  renderToolsList();
}

function loadToolIntoForm(id) {
  const t = state.tools.find(x => x.id === id);
  if (!t) return;
  state.activeToolId = id;
  $('#tool-form-mode').textContent = `Editing № ${state.tools.indexOf(t) + 1}`;
  $('#btn-tool-delete').style.display = '';
  $('#ft-id').value           = t.id;
  $('#ft-name').value         = t.name;
  $('#ft-org').value          = t.organization;
  $('#ft-country').value      = t.country;
  $('#ft-city').value         = t.city;
  $('#ft-lat').value          = t.lat;
  $('#ft-lng').value          = t.lng;
  $('#ft-category').value     = t.category;
  $('#ft-year').value         = t.year;
  $('#ft-date').value         = t.releaseDate || '';
  $('#ft-retired').value      = t.retiredDate || '';
  $('#ft-url').value          = t.url;
  $('#ft-notes').value        = t.notes || '';
  $('#ft-builton').value      = Array.isArray(t.builtOn) ? t.builtOn.join(', ') : '';
  renderToolsList();
}

function readToolForm() {
  const builtOnRaw = ($('#ft-builton').value || '').trim();
  const builtOn = builtOnRaw
    ? builtOnRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  return {
    id: $('#ft-id').value || undefined,
    name:         $('#ft-name').value.trim(),
    organization: $('#ft-org').value.trim(),
    country:      $('#ft-country').value.trim(),
    city:         $('#ft-city').value.trim(),
    lat:          parseFloat($('#ft-lat').value),
    lng:          parseFloat($('#ft-lng').value),
    category:     $('#ft-category').value,
    year:         parseInt($('#ft-year').value, 10),
    releaseDate:  $('#ft-date').value || '',
    retiredDate:  $('#ft-retired').value || '',
    url:          $('#ft-url').value.trim(),
    notes:        $('#ft-notes').value.trim(),
    builtOn,
  };
}

async function saveToolEntry() {
  const t = readToolForm();
  if (!t.name || !t.organization) {
    return toast('Name and organisation are required.', 'danger');
  }
  try {
    let saved;
    if (state.activeToolId) {
      saved = await api('/tools/' + encodeURIComponent(state.activeToolId), {
        method: 'PUT', body: JSON.stringify(t),
      });
      toast(`Updated "${saved.name}".`);
    } else {
      saved = await api('/tools', {
        method: 'POST', body: JSON.stringify(t),
      });
      toast(`Added "${saved.name}". GeoJSON regenerated.`);
    }
    state.activeToolId = saved.id;
    await refresh();
    loadToolIntoForm(saved.id);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

async function deleteToolEntry() {
  if (!state.activeToolId) return;
  const t = state.tools.find(x => x.id === state.activeToolId);
  if (!confirm(`Remove "${t.name}" from the atlas?`)) return;
  try {
    await api('/tools/' + encodeURIComponent(state.activeToolId), { method: 'DELETE' });
    toast(`Removed "${t.name}". GeoJSON regenerated.`, 'danger');
    await refresh();
    newToolEntry();
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
