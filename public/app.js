const OPERATOR_COLORS = {
  Waymo: "#2f6fed",
  Zoox: "#7c5cf5",
  Other: "#8b94a3"
};

let crashes = [];
let selectedId = null;
let markers = {};
let currentFilter = '';

const map = L.map('map', { zoomControl: true }).setView([36.8, -119.6], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

function getFiltered() {
  const f = currentFilter.toLowerCase();
  if (!f) return crashes;
  return crashes.filter(c =>
    (c.operator || '').toLowerCase().includes(f) ||
    (c.city || '').toLowerCase().includes(f) ||
    (c.id || '').toLowerCase().includes(f)
  );
}

function applyFilter(value) {
  currentFilter = value || '';
  renderMarkers();
  renderList();
}

async function loadCrashes() {
  const list = document.getElementById('crashList');
  try {
    const res = await fetch('/api/crashes');
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.detail || payload.error || 'Unknown error');

    crashes = payload.crashes || [];
    applyFilter('');
    renderLeaderboard();
  } catch (err) {
    document.getElementById('listHeader').textContent = 'Failed to load data';
    list.innerHTML = `<div class="error-banner">Couldn't load crash data: ${escapeHtml(err.message)}. Check that HERMAI_API_KEY and the source site/endpoint are set correctly in .env.</div>`;
  }
}

function makeIcon(color, isSelected) {
  const size = isSelected ? 22 : 16;
  const ring = isSelected ? `box-shadow:0 0 0 3px #ffffff, 0 0 0 5px ${color};` : `box-shadow:0 0 0 2px ${color}55;`;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #0b0f14;${ring}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function renderMarkers() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const filtered = getFiltered();
  filtered.forEach(c => {
    if (c.lat == null || c.lng == null) return; // no city match in geocode table — listed but not pinned
    const marker = L.marker([c.lat, c.lng], { icon: makeIcon(OPERATOR_COLORS[c.operator] || OPERATOR_COLORS.Other, c.id === selectedId) }).addTo(map);
    marker.on('click', () => selectCard(c.id));
    markers[c.id] = marker;
  });

  const onMap = filtered.filter(c => c.lat != null && c.lng != null).length;
  document.getElementById('mapCount').textContent = onMap;
}

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function renderList() {
  const list = document.getElementById('crashList');
  list.innerHTML = '';
  const filtered = getFiltered();

  document.getElementById('crashCount').textContent = filtered.length;
  document.getElementById('listHeader').textContent = currentFilter
    ? `${filtered.length} OF ${crashes.length} CRASHES MATCH — CALIFORNIA, 2026`
    : `${crashes.length} CRASHES REPORTED — CALIFORNIA, 2026`;

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card' + (c.id === selectedId ? ' selected' : '');
    const color = OPERATOR_COLORS[c.operator] || OPERATOR_COLORS.Other;
    const badgeClass = c.severity === 'fatality' ? 'fatality' : (c.severity === 'injury' ? 'injury' : 'damage');
    const badgeText = c.severity === 'fatality' ? 'FATALITY REPORTED' : (c.severity === 'injury' ? 'INJURY REPORTED' : 'PROPERTY DAMAGE');
    const noCoordsNote = (c.lat == null) ? '<div class="no-coords-note">Not shown on map — city not in lookup table</div>' : '';

    card.innerHTML = `
      <div class="avatar" style="background:${color};">${initials(c.operator)}</div>
      <div class="card-body">
        <div class="card-top">
          <div>
            <div class="operator-name">${escapeHtml(c.operator)}</div>
            <div class="model-sub">${escapeHtml(c.make)}</div>
          </div>
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="meta-row">📍 ${escapeHtml(c.city)}</div>
        <div class="meta-row">🗓 ${escapeHtml(c.date)}</div>
        <div class="narrative">${escapeHtml(c.narrative)}</div>
        ${noCoordsNote}
      </div>
    `;
    card.addEventListener('click', () => selectCard(c.id));
    list.appendChild(card);
  });
}

function selectCard(id) {
  selectedId = id;
  renderList();
  updateMarkerHighlights();
  const c = crashes.find(x => x.id === id);
  if (c) {
    if (c.lat != null && c.lng != null) {
      map.flyTo([c.lat, c.lng], 12, { duration: 0.6 });
    }
    showDetailPanel(c);
  }
}

function updateMarkerHighlights() {
  crashes.forEach(c => {
    const marker = markers[c.id];
    if (marker) marker.setIcon(makeIcon(OPERATOR_COLORS[c.operator] || OPERATOR_COLORS.Other, c.id === selectedId));
  });
}

function showDetailPanel(c) {
  const panel = document.getElementById('detailPanel');
  const color = OPERATOR_COLORS[c.operator] || OPERATOR_COLORS.Other;
  const badgeClass = c.severity === 'fatality' ? 'fatality' : (c.severity === 'injury' ? 'injury' : 'damage');
  const badgeText = c.severity === 'fatality' ? 'FATALITY REPORTED' : (c.severity === 'injury' ? 'INJURY REPORTED' : 'PROPERTY DAMAGE');

  panel.innerHTML = `
    <div class="detail-top">
      <div class="detail-avatar" style="background:${color};">${initials(c.operator)}</div>
      <div class="detail-heading">
        <div class="detail-operator">${escapeHtml(c.operator)}</div>
        <div class="detail-model">${escapeHtml(c.make)}</div>
      </div>
      <button class="detail-close" id="detailCloseBtn">✕</button>
    </div>
    <div class="detail-badge-row"><span class="badge ${badgeClass}">${badgeText}</span></div>
    <div class="detail-meta">
      <div>📍 ${escapeHtml(c.city)}</div>
      <div>🗓 ${escapeHtml(c.date)}</div>
    </div>
    <div class="detail-grid">
      <div>
        <div class="detail-label">CRASH WITH</div>
        <div class="detail-value">${escapeHtml(c.crashWith || '—')}</div>
      </div>
      <div>
        <div class="detail-label">MOVEMENT</div>
        <div class="detail-value">${escapeHtml(c.movement || '—')}</div>
      </div>
    </div>
    <div class="detail-narrative"><span class="icon">📄</span><span>${escapeHtml(c.narrative)}</span></div>
    <div class="approx-note">📍 Approximate city location — NHTSA does not report exact coordinates.</div>
  `;
  panel.classList.remove('hidden');
  document.getElementById('detailCloseBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.add('hidden');
    selectedId = null;
    renderList();
    updateMarkerHighlights();
  });
}

function renderLeaderboard() {
  const counts = {};
  crashes.forEach(c => { counts[c.operator] = (counts[c.operator] || 0) + 1; });
  const total = crashes.length || 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const container = document.getElementById('leaderList');
  container.innerHTML = '';

  sorted.forEach(([op, count], i) => {
    const pct = ((count / total) * 100).toFixed(0);
    const row = document.createElement('div');
    row.className = 'leader-row';
    row.innerHTML = `
      <div class="leader-left">
        <div class="leader-rank">#${i + 1}</div>
        <div class="avatar" style="background:${OPERATOR_COLORS[op] || OPERATOR_COLORS.Other};">${initials(op)}</div>
        <div>
          <div class="leader-name">${escapeHtml(op)}</div>
          <div class="leader-sub">${count} crash${count === 1 ? '' : 'es'} reported</div>
        </div>
      </div>
      <div>
        <div class="leader-count">${count}</div>
        <div class="leader-pct">${pct}% of total</div>
      </div>
    `;
    container.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

document.getElementById('searchInput').addEventListener('input', e => applyFilter(e.target.value));

document.querySelectorAll('.mobile-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mobile-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.body.classList.toggle('mobile-view-list', view === 'list');
    document.body.classList.toggle('mobile-view-map', view === 'map');
    if (view === 'map') {
      // Leaflet mis-measures a container that was display:none — force a resize check
      setTimeout(() => map.invalidateSize(), 50);
    }
  });
});
document.body.classList.add('mobile-view-list');
window.addEventListener('resize', () => map.invalidateSize());

document.getElementById('tabCrashes').addEventListener('click', () => {
  document.getElementById('tabCrashes').classList.add('active');
  document.getElementById('tabLeaderboard').classList.remove('active');
  document.getElementById('crashesView').classList.remove('hidden');
  document.getElementById('leaderboardView').classList.add('hidden');
});
document.getElementById('tabLeaderboard').addEventListener('click', () => {
  document.getElementById('tabLeaderboard').classList.add('active');
  document.getElementById('tabCrashes').classList.remove('active');
  document.getElementById('leaderboardView').classList.remove('hidden');
  document.getElementById('crashesView').classList.add('hidden');
});

loadCrashes();
