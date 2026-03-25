// ============================================
// CONFIGURATION
// Change this to your deployed Vercel URL
// ============================================
const API_BASE = 'https://envmanag.vercel.app/api';

// Navigation structure
const NAV = {
  Backend: ['APIs', 'Portal'],
  Frontend: ['PWA', 'Portal'],
};
const GROUPS = Object.keys(NAV);

// ============================================
// State
// ============================================
let currentUser = null;
let allEnvironments = [];
let activeGroup = GROUPS[0];
let activeSubTab = NAV[activeGroup][0];
let openHistoryId = null;
let editingNoteId = null;
let searchQuery = '';
let refreshTimer = null;

// ============================================
// DOM refs
// ============================================
const $modal = document.getElementById('username-modal');
const $app = document.getElementById('app');
const $groupBar = document.getElementById('group-bar');
const $tabs = document.getElementById('tab-bar');
const $context = document.getElementById('context-banner');
const $envList = document.getElementById('env-list');
const $activity = document.getElementById('activity-list');
const $userDisplay = document.getElementById('user-display');
const $loading = document.getElementById('loading');
const $error = document.getElementById('error-banner');

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const stored = await chrome.storage.local.get([
    'username',
    'activeGroup',
    'activeSubTab',
  ]);
  if (stored.activeGroup && GROUPS.includes(stored.activeGroup)) {
    activeGroup = stored.activeGroup;
  }
  if (
    stored.activeSubTab &&
    NAV[activeGroup] &&
    NAV[activeGroup].includes(stored.activeSubTab)
  ) {
    activeSubTab = stored.activeSubTab;
  } else {
    activeSubTab = NAV[activeGroup][0];
  }
  if (stored.username) {
    currentUser = stored.username;
    showApp();
  } else {
    showModal();
  }
}

// ============================================
// Username modal
// ============================================
function showModal() {
  $modal.style.display = 'flex';
  $app.style.display = 'none';

  const input = document.getElementById('username-input');
  const btn = document.getElementById('username-save');

  btn.addEventListener('click', saveUsername);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveUsername();
  });

  setTimeout(() => input.focus(), 50);
}

async function saveUsername() {
  const input = document.getElementById('username-input');
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }

  currentUser = name;
  await chrome.storage.local.set({ username: name });
  showApp();
}

// ============================================
// App
// ============================================
function showApp() {
  $modal.style.display = 'none';
  $app.style.display = 'block';
  $userDisplay.textContent = currentUser;

  renderNav();
  loadEnvironments();
  loadActivity();

  // Auto-refresh every 30s
  refreshTimer = setInterval(() => {
    loadEnvironments();
    loadActivity();
  }, 30000);

  // Manual refresh
  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadEnvironments();
    loadActivity();
  });

  // Click username to edit
  $userDisplay.addEventListener('click', () => {
    const newName = prompt('Change your name:', currentUser);
    if (newName && newName.trim() && newName.trim() !== currentUser) {
      currentUser = newName.trim();
      chrome.storage.local.set({ username: currentUser });
      $userDisplay.textContent = currentUser;
    }
  });

  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderEnvironments();
  });

  // Event delegation
  $groupBar.addEventListener('click', handleGroupClick);
  $tabs.addEventListener('click', handleTabClick);
  $envList.addEventListener('click', handleEnvClick);
  $envList.addEventListener('keydown', handleEnvKeydown);
}

// ============================================
// Category key
// ============================================
function getCategoryKey() {
  return activeGroup + '-' + activeSubTab;
}

function getThemeClass() {
  return 'theme-' + activeGroup.toLowerCase();
}

// ============================================
// Navigation rendering
// ============================================
function renderNav() {
  var groupIcons = { Backend: '{ }', Frontend: '&lt;/&gt;' };
  $groupBar.innerHTML = GROUPS.map(
    (g) =>
      '<button class="group-btn ' +
      g.toLowerCase() +
      (g === activeGroup ? ' active' : '') +
      '" data-group="' +
      g +
      '"><span class="g-icon">' +
      groupIcons[g] +
      '</span> ' +
      g +
      '</button>'
  ).join('');

  // Sub-tabs
  const theme = getThemeClass();
  $tabs.className = 'tab-bar ' + theme;
  $tabs.innerHTML = NAV[activeGroup]
    .map(
      (t) =>
        '<button class="tab' +
        (t === activeSubTab ? ' active' : '') +
        '" data-tab="' +
        t +
        '">' +
        t +
        '</button>'
    )
    .join('');

  // Context banner
  $context.className = 'context-banner ' + theme;
  $context.textContent = '$ ~/' + activeGroup.toLowerCase() + '/' + activeSubTab.toLowerCase();
}

function handleGroupClick(e) {
  const btn = e.target.closest('[data-group]');
  if (!btn || btn.dataset.group === activeGroup) return;

  activeGroup = btn.dataset.group;
  activeSubTab = NAV[activeGroup][0];
  chrome.storage.local.set({ activeGroup, activeSubTab });
  resetViewState();
  renderNav();
  renderEnvironments();
  loadActivity();
}

function handleTabClick(e) {
  const btn = e.target.closest('[data-tab]');
  if (!btn || btn.dataset.tab === activeSubTab) return;

  activeSubTab = btn.dataset.tab;
  chrome.storage.local.set({ activeSubTab });
  resetViewState();
  renderNav();
  renderEnvironments();
  loadActivity();
}

function resetViewState() {
  openHistoryId = null;
  editingNoteId = null;
  searchQuery = '';
  document.getElementById('search-input').value = '';
}

// ============================================
// Data loading
// ============================================
async function loadEnvironments() {
  try {
    const res = await fetch(API_BASE + '/environments');
    if (!res.ok) throw new Error('Failed to fetch');
    allEnvironments = await res.json();

    // Natural sort by name
    allEnvironments.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    $loading.style.display = 'none';
    renderEnvironments();
  } catch (err) {
    $loading.style.display = 'none';
    if (allEnvironments.length === 0) {
      $envList.innerHTML =
        '<div style="padding:20px;text-align:center;color:#94a3b8">' +
        'Could not connect to API.<br>Check API_BASE in popup.js</div>';
    }
    showError('Failed to load environments');
  }
}

async function loadActivity() {
  try {
    const res = await fetch(
      API_BASE + '/history?category=' + encodeURIComponent(getCategoryKey())
    );
    const data = await res.json();
    renderActivity(data);
  } catch (_) {
    $activity.innerHTML =
      '<div class="activity-empty">Could not load activity</div>';
  }
}

async function loadHistory(envId) {
  const panel = document.getElementById('history-' + envId);
  if (!panel) return;

  try {
    const res = await fetch(API_BASE + '/history?envId=' + envId);
    const data = await res.json();

    if (!data.length) {
      panel.innerHTML = '<div class="history-empty">No activity yet</div>';
      return;
    }

    panel.innerHTML = data
      .map((h) => {
        const verb =
          h.action === 'reserve'
            ? 'reserved'
            : h.action === 'release'
              ? 'released'
              : 'updated note on';
        const noteText =
          h.note ? ' &mdash; &quot;' + escapeHtml(h.note) + '&quot;' : '';
        return (
          '<div class="history-item"><strong>' +
          escapeHtml(h.user_name) +
          '</strong> ' +
          verb +
          noteText +
          ' <span class="time">' +
          relativeTime(h.created_at) +
          '</span></div>'
        );
      })
      .join('');
  } catch (_) {
    panel.innerHTML = '<div class="history-empty">Failed to load</div>';
  }
}

// ============================================
// Rendering
// ============================================
function getActiveEnvs() {
  const catKey = getCategoryKey();
  let envs = allEnvironments.filter((e) => e.category === catKey);
  if (searchQuery) {
    envs = envs.filter((e) => e.name.toLowerCase().includes(searchQuery));
  }
  return envs;
}

function getGroupKey(name) {
  if (name.includes('alpha')) return 'alpha';
  return name.split('-')[0];
}

function renderEnvironments() {
  const envs = getActiveEnvs();

  // Group by name prefix (all alpha variants together)
  const groups = {};
  envs.forEach((env) => {
    const key = getGroupKey(env.name);
    if (!groups[key]) groups[key] = [];
    groups[key].push(env);
  });

  let html = '<div class="env-list-inner">';
  let cardIndex = 0;

  for (const [prefix, groupEnvs] of Object.entries(groups)) {
    html += '<div class="env-group-title">' + prefix + '</div>';

    groupEnvs.forEach((env) => {
      const isFree = env.status === 'free';
      const isStale = !isFree && isEnvStale(env.updated_at);
      const time = relativeTime(env.updated_at);

      html +=
        '<div class="env-card status-' +
        env.status +
        (isStale ? ' stale' : '') +
        '" style="--i:' + cardIndex + '">';
      cardIndex++;

      // Top row with status dot
      html +=
        '<div class="env-row">' +
        '<span class="status-dot ' + (isFree ? 'free' : 'in-use') + '"></span>' +
        '<span class="env-name">' +
        escapeHtml(env.name) +
        '</span>' +
        '<span class="env-badge ' +
        (isFree ? 'free' : 'in-use') +
        '">' +
        (isFree ? 'Free' : 'In Use') +
        '</span>' +
        '<span class="env-meta">' +
        time +
        '</span>' +
        '</div>';

      // Details (in-use only)
      if (!isFree) {
        html += '<div class="env-details">';
        html +=
          '<span class="env-owner">by ' + escapeHtml(env.owner) + '</span>';
        if (env.note) {
          html +=
            '<span class="env-note">&quot;' +
            escapeHtml(env.note) +
            '&quot;</span>';
        }
        if (isStale) {
          html += '<span class="stale-tag">stale</span>';
        }
        html += '</div>';
      }

      // Note editing
      if (editingNoteId === env.id) {
        html +=
          '<div class="note-input-row">' +
          '<input class="note-input" data-env-id="' +
          env.id +
          '" value="' +
          escapeHtml(env.note || '') +
          '" placeholder="Add a note...">' +
          '<button class="btn btn-save" data-action="save-note" data-env-id="' +
          env.id +
          '">Save</button>' +
          '<button class="btn btn-cancel" data-action="cancel-note">Cancel</button>' +
          '</div>';
      }

      // Action buttons
      html += '<div class="env-actions">';
      if (isFree) {
        html +=
          '<button class="btn btn-reserve" data-action="reserve" data-env-id="' +
          env.id +
          '">Reserve</button>';
      } else {
        html +=
          '<button class="btn btn-release" data-action="release" data-env-id="' +
          env.id +
          '">Release</button>';
        if (editingNoteId !== env.id) {
          html +=
            '<button class="btn btn-note" data-action="edit-note" data-env-id="' +
            env.id +
            '">&#9998; Note</button>';
        }
      }
      html +=
        '<button class="btn btn-history" data-action="toggle-history" data-env-id="' +
        env.id +
        '">' +
        (openHistoryId === env.id ? '&#9650;' : '&#9660;') +
        ' History</button>';
      html += '</div>';

      // History panel
      if (openHistoryId === env.id) {
        html +=
          '<div class="history-panel" id="history-' +
          env.id +
          '"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin:4px auto"></div></div>';
      }

      html += '</div>';
    });
  }

  if (envs.length === 0 && searchQuery) {
    html += '<div class="no-results">No environments match "' + escapeHtml(searchQuery) + '"</div>';
  }

  html += '</div>';
  $envList.innerHTML = html;

  if (openHistoryId) {
    loadHistory(openHistoryId);
  }

  if (editingNoteId) {
    const inp = $envList.querySelector(
      '.note-input[data-env-id="' + editingNoteId + '"]'
    );
    if (inp) inp.focus();
  }
}

function renderActivity(data) {
  if (!data || !data.length) {
    $activity.innerHTML = '<div class="activity-empty">No activity yet</div>';
    return;
  }

  $activity.innerHTML = data
    .map((h) => {
      const verb =
        h.action === 'reserve'
          ? 'reserved'
          : h.action === 'release'
            ? 'released'
            : 'updated note on';
      const envName =
        h.environments && h.environments.name ? h.environments.name : '?';
      return (
        '<div class="activity-item"><strong>' +
        escapeHtml(h.user_name) +
        '</strong> ' +
        verb +
        ' <strong>' +
        escapeHtml(envName) +
        '</strong> <span class="time">' +
        relativeTime(h.created_at) +
        '</span></div>'
      );
    })
    .join('');
}

// ============================================
// Event handlers (delegation)
// ============================================
function handleEnvClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const envId = Number(btn.dataset.envId);

  switch (action) {
    case 'reserve':
      reserveEnv(envId);
      break;
    case 'release':
      releaseEnv(envId);
      break;
    case 'edit-note':
      editingNoteId = envId;
      renderEnvironments();
      break;
    case 'save-note':
      saveNote(envId);
      break;
    case 'cancel-note':
      editingNoteId = null;
      renderEnvironments();
      break;
    case 'toggle-history':
      openHistoryId = openHistoryId === envId ? null : envId;
      renderEnvironments();
      break;
  }
}

function handleEnvKeydown(e) {
  if (!e.target.classList.contains('note-input')) return;
  if (e.key === 'Enter') {
    saveNote(Number(e.target.dataset.envId));
  } else if (e.key === 'Escape') {
    editingNoteId = null;
    renderEnvironments();
  }
}

// ============================================
// Actions
// ============================================
async function reserveEnv(envId) {
  const env = allEnvironments.find((e) => e.id === envId);
  if (!env || env.status === 'in-use') return;

  // Optimistic update
  env.status = 'in-use';
  env.owner = currentUser;
  env.updated_at = new Date().toISOString();
  renderEnvironments();

  try {
    const res = await fetch(API_BASE + '/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envId, user: currentUser }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to reserve');
    }

    showToast('Reserved ' + env.name);
    await loadEnvironments();
    loadActivity();
  } catch (err) {
    showToast('Reserve failed: ' + err.message, true);
    await loadEnvironments();
  }
}

async function releaseEnv(envId) {
  const env = allEnvironments.find((e) => e.id === envId);
  if (!env || env.status === 'free') return;
  var envName = env.name;

  // Optimistic update
  env.status = 'free';
  env.owner = null;
  env.note = null;
  env.updated_at = new Date().toISOString();
  if (openHistoryId === envId) openHistoryId = null;
  if (editingNoteId === envId) editingNoteId = null;
  renderEnvironments();

  try {
    const res = await fetch(API_BASE + '/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envId, user: currentUser }),
    });

    if (!res.ok) throw new Error('Failed to release');

    showToast('Released ' + envName);
    await loadEnvironments();
    loadActivity();
  } catch (err) {
    showToast('Release failed: ' + err.message, true);
    await loadEnvironments();
  }
}

async function saveNote(envId) {
  const input = $envList.querySelector(
    '.note-input[data-env-id="' + envId + '"]'
  );
  const note = input ? input.value.trim() : '';

  // Optimistic update
  const env = allEnvironments.find((e) => e.id === envId);
  if (env) {
    env.note = note || null;
    env.updated_at = new Date().toISOString();
  }
  editingNoteId = null;
  renderEnvironments();

  try {
    await fetch(API_BASE + '/update-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envId, user: currentUser, note }),
    });

    await loadEnvironments();
    loadActivity();
  } catch (err) {
    showError('Failed to update note');
    await loadEnvironments();
  }
}

// ============================================
// Helpers
// ============================================
function relativeTime(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function isEnvStale(updatedAt) {
  return Date.now() - new Date(updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, isError) {
  var toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  toast.textContent = msg;
  toast.style.display = 'block';
  // Force reflow for animation restart
  toast.offsetHeight;
  toast.classList.add('toast-show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function() {
    toast.classList.remove('toast-show');
    setTimeout(function() { toast.style.display = 'none'; }, 300);
  }, 2500);
}

function showError(msg) {
  $error.textContent = msg;
  $error.style.display = 'block';
  setTimeout(() => {
    $error.style.display = 'none';
  }, 3000);
}
