// Known operators get a fixed, recognizable color. Anything else encountered
// in the data (an operator name we didn't anticipate) still gets its own
// distinct color, assigned on the fly from the palette below, instead of
// collapsing into a single gray "Other" bucket.
const BASE_OPERATOR_COLORS = {
  Waymo: "#2f6fed",
  Zoox: "#7c5cf5",
  Nuro: "#f59e0b",
  WeRide: "#10b981",
  Cruise: "#ef4444",
  Aurora: "#06b6d4",
  Other: "#8b94a3"
};
const FALLBACK_PALETTE = ["#ec4899", "#eab308", "#84cc16", "#a855f7", "#f97316", "#14b8a6"];
const assignedColors = {};
let paletteIndex = 0;

function colorForOperator(operator) {
  const key = (operator || 'Other').trim();
  if (BASE_OPERATOR_COLORS[key]) return BASE_OPERATOR_COLORS[key];
  if (!assignedColors[key]) {
    assignedColors[key] = FALLBACK_PALETTE[paletteIndex % FALLBACK_PALETTE.length];
    paletteIndex += 1;
  }
  return assignedColors[key];
}

let crashes = [];
let selectedId = null;
let markers = {};
let currentFilter = '';
let seriousOnly = false;
let shownStoryIds = new Set();
let currentStory = null;
let mapFitted = false;

const map = L.map('map', { zoomControl: true }).setView([36.8, -119.6], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

function getFiltered() {
  const f = currentFilter.toLowerCase();
  return crashes.filter(c => {
    if (seriousOnly && c.story !== 'serious') return false;
    if (!f) return true;
    return (c.operator || '').toLowerCase().includes(f) ||
      (c.city || '').toLowerCase().includes(f) ||
      (c.id || '').toLowerCase().includes(f);
  });
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
    renderHero();
    renderStats();
    showRandomStory();
    fitMapToData();
  } catch (err) {
    document.getElementById('listHeader').textContent = 'Failed to load data';
    list.innerHTML = `<div class="error-banner">Couldn't load crash data: ${escapeHtml(err.message)}. Check that HERMAI_API_KEY and the source site/endpoint are set correctly in .env.</div>`;
  }
}

// ---------- Hero ----------
function renderHero() {
  const total = crashes.length;
  document.getElementById('heroCount').textContent = total;
  document.getElementById('heroCount2').textContent = total;
}

// ---------- Notable stories ----------
function getNotableStories() {
  return crashes.filter(c => c.story === 'notable');
}

function showRandomStory() {
  const pool = getNotableStories();
  const card = document.getElementById('storyCard');
  if (!pool.length) {
    card.innerHTML = '<div class="story-empty">No standout low-severity reports surfaced in the current data. Check back after the next refresh.</div>';
    currentStory = null;
    return;
  }
  // Prefer one not shown yet this session; reset once we've cycled through all of them.
  let candidates = pool.filter(c => !shownStoryIds.has(c.id));
  if (!candidates.length) {
    shownStoryIds.clear();
    candidates = pool;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  shownStoryIds.add(pick.id);
  currentStory = pick;
  renderStoryCard(pick);
}

function renderStoryCard(c) {
  const card = document.getElementById('storyCard');
  card.innerHTML = `
    <div class="story-headline">${escapeHtml(c.headline)}</div>
    <div class="story-meta">
      <span>📍 ${escapeHtml(c.city)}</span>
      <span>🗓 ${escapeHtml(c.date)}</span>
      <span>Report ${escapeHtml(c.id)}</span>
      <span>${escapeHtml(c.operator)}</span>
    </div>
    <div class="story-narrative">${escapeHtml(c.narrative)}</div>
  `;
}

async function shareStory() {
  if (!currentStory) return;
  const text = `${currentStory.headline} — ${currentStory.city}, ${currentStory.date} (Report ${currentStory.id})`;
  const url = `${location.origin}${location.pathname}#report-${encodeURIComponent(currentStory.id)}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'CrashTracker report', text, url }); return; } catch (e) { /* user cancelled — fall through */ }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    const btn = document.getElementById('shareStoryBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    alert(`${text}\n${url}`);
  }
}

// ---------- Map: one labeled bubble per city, not per-crash pins ----------
function bubbleIcon(count, color, isSelected) {
  const size = Math.min(22 + Math.sqrt(count) * 8, 60);
  const ring = isSelected ? `box-shadow:0 0 0 3px #ffffff, 0 0 0 5px ${color};` : `box-shadow:0 0 0 2px ${color}55;`;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #0b0f14;${ring}display:flex;align-items:center;justify-content:center;">
             <span class="city-bubble-label">${count}</span>
           </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function renderMarkers() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const filtered = getFiltered();

  // NHTSA only reports city, not a street address, so every crash in the same
  // city shares one coordinate. Rather than faking individual pin positions,
  // group by city and show one bubble labeled with the real count.
  const groups = new Map();
  filtered.forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const key = `${c.lat},${c.lng}`;
    if (!groups.has(key)) groups.set(key, { city: c.city, lat: c.lat, lng: c.lng, crashes: [] });
    groups.get(key).crashes.push(c);
  });

  groups.forEach(group => {
    const counts = {};
    group.crashes.forEach(c => { counts[c.operator] = (counts[c.operator] || 0) + 1; });
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const color = colorForOperator(dominant);
    const isSelected = selectedId && group.crashes.some(c => c.id === selectedId);

    const marker = L.marker([group.lat, group.lng], {
      icon: bubbleIcon(group.crashes.length, color, isSelected)
    }).addTo(map);
    marker.bindTooltip(`${group.city} — ${group.crashes.length} report${group.crashes.length === 1 ? '' : 's'}`, { direction: 'top' });
    marker.on('click', () => {
      document.getElementById('searchInput').value = group.city;
      applyFilter(group.city);
      document.getElementById('tabCrashes').click();
    });
    markers[`${group.lat},${group.lng}`] = marker;
  });

  const onMap = filtered.filter(c => c.lat != null && c.lng != null).length;
  document.getElementById('mapCount').textContent = onMap;
}

function fitMapToData() {
  if (mapFitted) return;
  const points = crashes.filter(c => c.lat != null && c.lng != null).map(c => [c.lat, c.lng]);
  if (!points.length) return;
  map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
  mapFitted = true;
}

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function renderList() {
  const list = document.getElementById('crashList');
  list.innerHTML = '';
  const filtered = getFiltered();

  document.getElementById('crashCount').textContent = filtered.length;
  const scopeLabel = seriousOnly ? 'SERIOUS INCIDENTS' : 'CRASHES';
  document.getElementById('listHeader').textContent = currentFilter
    ? `${filtered.length} OF ${crashes.length} ${scopeLabel} MATCH — CALIFORNIA, 2026`
    : `${filtered.length} ${scopeLabel} REPORTED — CALIFORNIA, 2026`;

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card' + (c.id === selectedId ? ' selected' : '');
    const color = colorForOperator(c.operator);
    const badgeClass = c.severity === 'fatality' ? 'fatality' : (c.severity === 'injury' ? 'injury' : 'damage');
    const badgeText = c.severity === 'fatality' ? 'FATALITY REPORTED' : (c.severity === 'injury' ? 'INJURY REPORTED' : 'PROPERTY DAMAGE');
    const noCoordsNote = (c.lat == null) ? '<div class="no-coords-note">Not shown on map — city not in lookup table</div>' : '';

    card.innerHTML = `
      <div class="avatar" style="background:${color};">${initials(c.operator)}</div>
      <div class="card-body">
        <div class="card-top">
          <div>
            <div class="operator-name">${escapeHtml(c.operator)}</div>
            <div class="model-sub">${escapeHtml(c.id)}</div>
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
  renderMarkers();
  const c = crashes.find(x => x.id === id);
  if (c) {
    if (c.lat != null && c.lng != null) {
      map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
    }
    showDetailPanel(c);
  }
}

function showDetailPanel(c) {
  const panel = document.getElementById('detailPanel');
  const color = colorForOperator(c.operator);
  const badgeClass = c.severity === 'fatality' ? 'fatality' : (c.severity === 'injury' ? 'injury' : 'damage');
  const badgeText = c.severity === 'fatality' ? 'FATALITY REPORTED' : (c.severity === 'injury' ? 'INJURY REPORTED' : 'PROPERTY DAMAGE');

  panel.innerHTML = `
    <div class="detail-top">
      <div class="detail-avatar" style="background:${color};">${initials(c.operator)}</div>
      <div class="detail-heading">
        <div class="detail-operator">${escapeHtml(c.operator)}</div>
        <div class="detail-model">Report ${escapeHtml(c.id)}</div>
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
    renderMarkers();
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
        <div class="avatar" style="background:${colorForOperator(op)};">${initials(op)}</div>
        <div>
          <div class="leader-name">${escapeHtml(op)}</div>
          <div class="leader-sub">${count} report${count === 1 ? '' : 's'} — share of reports, not a safety ranking</div>
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

// ---------- Stats section ----------
function renderStats() {
  const total = crashes.length || 1;

  const stopped = crashes.filter(c => c.stoppedOrParked).length;
  document.getElementById('statStopped').textContent = `${Math.round((stopped / total) * 100)}%`;

  const metro = crashes.filter(c => /san francisco|los angeles/i.test(c.city || '')).length;
  document.getElementById('statMetro').textContent = `${Math.round((metro / total) * 100)}%`;

  const waymo = crashes.filter(c => (c.operator || '').toLowerCase() === 'waymo').length;
  document.getElementById('statWaymo').textContent = `${Math.round((waymo / total) * 100)}%`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

document.getElementById('searchInput').addEventListener('input', e => applyFilter(e.target.value));

document.getElementById('seriousFilterBtn').addEventListener('click', () => {
  seriousOnly = !seriousOnly;
  document.getElementById('seriousFilterBtn').classList.toggle('active', seriousOnly);
  document.getElementById('seriousFilterBtn').textContent = seriousOnly ? 'Showing serious only ✕' : 'Serious incidents only';
  renderMarkers();
  renderList();
});

document.getElementById('anotherStoryBtn').addEventListener('click', showRandomStory);
document.getElementById('shareStoryBtn').addEventListener('click', shareStory);

document.getElementById('seriousLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('searchInput').value = '';
  seriousOnly = false;
  document.getElementById('seriousFilterBtn').classList.remove('active');
  document.getElementById('seriousFilterBtn').textContent = 'Serious incidents only';
  applyFilter('');
  document.getElementById('tabCrashes').click();
  document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
});

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
