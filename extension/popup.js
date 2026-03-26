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

// Human-readable titles for each tab
const TAB_TITLES = {
  'Backend-APIs':    'Backend API Servers',
  'Backend-Portal':  'Admin Portal — Backend',
  'Frontend-PWA':    'Progressive Web Apps',
  'Frontend-Portal': 'Admin Portal — Frontend',
};

// ============================================
// State
// ============================================
let currentUser = null;
let currentUserId = null;
let currentRole = null;
let allEnvironments = [];
let activeGroup = GROUPS[0];
let activeSubTab = NAV[activeGroup][0];
let openHistoryId = null;
let editingNoteId = null;
let searchQuery = '';
let refreshTimer = null;
let pendingReserveEnvId = null;
let qaUsers = [];
let allNotifications = [];

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
const $reserveModal = document.getElementById('reserve-modal');
const $notifWrapper = document.getElementById('notif-wrapper');
const $notifBadge = document.getElementById('notif-badge');
const $notifDropdown = document.getElementById('notif-dropdown');
const $notifList = document.getElementById('notif-list');

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const stored = await chrome.storage.local.get([
    'username',
    'userId',
    'userRole',
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
  if (stored.username && stored.userRole && stored.userId) {
    currentUser = stored.username;
    currentUserId = stored.userId;
    currentRole = stored.userRole;
    showApp();
  } else {
    showModal();
  }
}

// ============================================
// Username + Role modal
// ============================================
function showModal() {
  $modal.style.display = 'flex';
  $app.style.display = 'none';

  const input = document.getElementById('username-input');
  const btn = document.getElementById('username-save');
  const roleBtns = document.querySelectorAll('.role-btn');
  const pinBoxes = document.querySelectorAll('.pin-box');
  let selectedRole = 'developer';

  roleBtns.forEach((rb) => {
    rb.addEventListener('click', () => {
      roleBtns.forEach((b) => b.classList.remove('active'));
      rb.classList.add('active');
      selectedRole = rb.dataset.role;
    });
  });

  // PIN auto-advance
  pinBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '');
      box.classList.toggle('filled', !!box.value);
      if (box.value && i < pinBoxes.length - 1) {
        pinBoxes[i + 1].focus();
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        pinBoxes[i - 1].value = '';
        pinBoxes[i - 1].classList.remove('filled');
        pinBoxes[i - 1].focus();
      }
      if (e.key === 'Enter') saveUsername(selectedRole);
    });
    // Handle paste on any box — fill all 4 from pasted digits
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 4);
      digits.split('').forEach((d, j) => {
        if (pinBoxes[j]) {
          pinBoxes[j].value = d;
          pinBoxes[j].classList.add('filled');
        }
      });
      const next = pinBoxes[Math.min(digits.length, pinBoxes.length - 1)];
      if (next) next.focus();
    });
  });

  btn.addEventListener('click', () => saveUsername(selectedRole));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pinBoxes[0].focus();
  });

  setTimeout(() => input.focus(), 50);
}

async function saveUsername(role) {
  const input = document.getElementById('username-input');
  const $err = document.getElementById('modal-error');
  const pinBoxes = document.querySelectorAll('.pin-box');
  const name = input.value.trim();
  const pin = Array.from(pinBoxes).map((b) => b.value).join('');

  if (!name) {
    input.focus();
    return;
  }
  if (pin.length !== 4) {
    $err.textContent = 'Please enter your 4-digit PIN';
    $err.style.display = 'block';
    pinBoxes[pin.length] ? pinBoxes[pin.length].focus() : pinBoxes[0].focus();
    return;
  }

  $err.textContent = '';
  $err.style.display = 'none';

  try {
    const res = await fetch(API_BASE + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, pin }),
    });

    if (!res.ok) {
      const data = await res.json();
      $err.textContent = data.error || 'Registration failed';
      $err.style.display = 'block';
      return;
    }

    const user = await res.json();
    currentUser = user.name;
    currentUserId = user.id;
    currentRole = user.role;
    await chrome.storage.local.set({ username: currentUser, userId: currentUserId, userRole: currentRole });

    showApp();
    if (user.restored) {
      showToast('Welcome back, ' + currentUser + '!');
    }
  } catch (_) {
    // Offline fallback — let them in without backend confirmation
    currentUser = name;
    currentRole = role;
    await chrome.storage.local.set({ username: name, userRole: role });
    showApp();
  }
}

// ============================================
// App
// ============================================
function showApp() {
  $modal.style.display = 'none';
  $app.style.display = 'block';
  $userDisplay.textContent = currentUser;

  // Show notification bell for QA users
  if (currentRole === 'qa') {
    $notifWrapper.style.display = 'block';
    loadNotifications();
  }

  renderNav();
  loadEnvironments();
  loadActivity();

  // Auto-refresh every 30s
  refreshTimer = setInterval(() => {
    loadEnvironments();
    loadActivity();
    if (currentRole === 'qa') loadNotifications();
  }, 30000);

  // Manual refresh
  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadEnvironments();
    loadActivity();
    if (currentRole === 'qa') loadNotifications();
  });

  // Click username to edit
  $userDisplay.addEventListener('click', () => {
    const newName = prompt('Change your name:', currentUser);
    if (newName && newName.trim() && newName.trim() !== currentUser) {
      currentUser = newName.trim();
      chrome.storage.local.set({ username: currentUser });
      $userDisplay.textContent = currentUser;
      // Update backend
      fetch(API_BASE + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser, role: currentRole }),
      }).catch(() => {});
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

  // Reserve modal events
  document.getElementById('reserve-confirm').addEventListener('click', confirmReserve);
  document.getElementById('reserve-cancel').addEventListener('click', closeReserveModal);

  // Notification bell events
  document.getElementById('notif-btn').addEventListener('click', toggleNotifDropdown);
  document.getElementById('notif-mark-all').addEventListener('click', markAllNotificationsRead);

  // Close notification dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notif-wrapper')) {
      $notifDropdown.style.display = 'none';
    }
  });
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
  const titleKey = activeGroup + '-' + activeSubTab;
  const tabTitle = TAB_TITLES[titleKey] || (activeGroup + ' ' + activeSubTab);
  $context.className = 'context-banner ' + theme;
  $context.innerHTML =
    '<span class="context-title">' + tabTitle + '</span>' +
    '<span class="context-path">$ ~/' + activeGroup.toLowerCase() + '/' + activeSubTab.toLowerCase() + '</span>';
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

const HISTORY_LIMIT = 20;
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
    const res = await fetch(API_BASE + '/history?envId=' + envId + '&limit=' + HISTORY_LIMIT);
    const data = (await res.json() || []).slice(0, HISTORY_LIMIT);

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

    // Ask the server to purge entries beyond the limit
    fetch(API_BASE + '/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envId, keepLast: HISTORY_LIMIT }),
    }).catch(() => {});
  } catch (_) {
    panel.innerHTML = '<div class="history-empty">Failed to load</div>';
  }
}

// ============================================
// QA Users loading (for reserve modal)
// ============================================
async function loadQAUsers() {
  try {
    const res = await fetch(API_BASE + '/users?role=qa');
    if (!res.ok) return [];
    qaUsers = await res.json();
    return qaUsers;
  } catch (_) {
    return [];
  }
}

// ============================================
// Notifications
// ============================================
async function loadNotifications() {
  try {
    const res = await fetch(
      API_BASE + '/notifications?userId=' + encodeURIComponent(currentUserId)
    );
    if (!res.ok) return;
    allNotifications = await res.json();
    renderNotifBadge();
  } catch (_) {
    // Silent fail
  }
}

function getUnreadNotifications() {
  return allNotifications.filter((n) => !n.is_read);
}

function renderNotifBadge() {
  const count = getUnreadNotifications().length;
  if (count > 0) {
    $notifBadge.textContent = count > 99 ? '99+' : String(count);
    $notifBadge.style.display = 'flex';
  } else {
    $notifBadge.style.display = 'none';
  }
}

function toggleNotifDropdown(e) {
  e.stopPropagation();
  const isOpen = $notifDropdown.style.display === 'block';
  $notifDropdown.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) renderNotifList();
}

function renderNotifList() {
  const $markAllBtn = document.getElementById('notif-mark-all');
  const hasUnread = getUnreadNotifications().length > 0;
  $markAllBtn.disabled = !hasUnread;

  if (allNotifications.length === 0) {
    $notifList.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }

  $notifList.innerHTML = allNotifications
    .map((n) => {
      const noteText = n.note ? ' — "' + escapeHtml(n.note) + '"' : '';
      const envName = n.env_name || 'an environment';
      const readClass = n.is_read ? ' notif-read' : '';
      return (
        '<div class="notif-item' + readClass + '" data-notif-id="' + n.id + '">' +
        '<div class="notif-content">' +
        '<strong>' + escapeHtml(n.from_user) + '</strong> reserved ' +
        '<strong>' + escapeHtml(envName) + '</strong>' +
        noteText +
        '</div>' +
        '<span class="notif-time">' + relativeTime(n.created_at) + '</span>' +
        '</div>'
      );
    })
    .join('');
}

async function markAllNotificationsRead() {
  const unread = getUnreadNotifications();
  if (unread.length === 0) return;

  const ids = unread.map((n) => n.id);

  try {
    await fetch(API_BASE + '/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds: ids }),
    });

    allNotifications.forEach((n) => { n.is_read = true; });
    renderNotifBadge();
    renderNotifList();

    chrome.runtime.sendMessage({ type: 'clear-badge' }).catch(() => {});
  } catch (_) {
    showError('Failed to mark notifications as read');
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
        // Title — shown prominently
        if (env.note) {
          html +=
            '<div class="env-res-title">' +
            escapeHtml(env.note) +
            '</div>';
        }
        html += '<div class="env-details">';
        html +=
          '<span class="env-owner">by ' + escapeHtml(env.owner) + '</span>';
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
        env.id + '">' +
        (openHistoryId === env.id ? '&#9650;' : '&#9660;') +
        ' History</button>';
      html += '</div>';

      // History panel (last 5 entries only)
      if (openHistoryId === env.id) {
        html +=
          '<div class="history-panel" id="history-' + env.id +
          '"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin:4px auto"></div></div>';
      }

      html += '</div>';
    });
  }

  if (searchQuery === 'whoami') {
    html +=
      '<div class="whoami-egg">' +
      '<div class="whoami-line"><span class="whoami-prompt">$</span> whoami</div>' +
      '<div class="whoami-output">' +
      '<span class="whoami-field">user</span><span class="whoami-sep">::</span><span class="whoami-val">kripa sindhu</span>' +
      '</div>' +
      '<div class="whoami-output">' +
      '<span class="whoami-field">role</span><span class="whoami-sep">::</span><span class="whoami-val">built this</span>' +
      '</div>' +
      '<div class="whoami-cursor">_</div>' +
      '</div>';
  } else if (envs.length === 0 && searchQuery) {
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
      openReserveModal(envId);
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
// Reserve modal
// ============================================
async function openReserveModal(envId) {
  const env = allEnvironments.find((e) => e.id === envId);
  if (!env || env.status === 'in-use') return;

  pendingReserveEnvId = envId;
  document.getElementById('reserve-env-name').textContent = env.name;
  document.getElementById('reserve-note-input').value = '';

  const $qaList = document.getElementById('qa-select-list');
  $qaList.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:4px auto"></div>';

  $reserveModal.style.display = 'flex';

  const users = await loadQAUsers();
  if (users.length === 0) {
    $qaList.innerHTML = '<div class="qa-empty">No QA users registered yet</div>';
  } else {
    $qaList.innerHTML = users
      .map(
        (u) =>
          '<label class="qa-checkbox-label">' +
          '<input type="checkbox" class="qa-checkbox" value="' +
          escapeHtml(u.id) +
          '">' +
          '<span class="qa-checkbox-custom"></span>' +
          '<span class="qa-checkbox-name">' +
          escapeHtml(u.name) +
          '</span>' +
          '</label>'
      )
      .join('');
  }

  setTimeout(() => document.getElementById('reserve-note-input').focus(), 50);
}

function closeReserveModal() {
  $reserveModal.style.display = 'none';
  pendingReserveEnvId = null;
}

async function confirmReserve() {
  if (!pendingReserveEnvId) return;

  const envId = pendingReserveEnvId;
  const env = allEnvironments.find((e) => e.id === envId);
  if (!env || env.status === 'in-use') {
    closeReserveModal();
    return;
  }

  const note = document.getElementById('reserve-note-input').value.trim();
  const selectedQA = Array.from(document.querySelectorAll('.qa-checkbox:checked')).map(
    (cb) => cb.value
  );

  closeReserveModal();

  // Optimistic update
  env.status = 'in-use';
  env.owner = currentUser;
  env.note = note || null;
  env.updated_at = new Date().toISOString();
  renderEnvironments();

  try {
    const body = { envId, user: currentUser, userId: currentUserId };
    if (note) body.note = note;
    if (selectedQA.length > 0) body.notifyQA = selectedQA;

    const res = await fetch(API_BASE + '/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to reserve');
    }

    var msg = 'Reserved ' + env.name;
    if (selectedQA.length > 0) {
      const notifiedNames = selectedQA.map((id) => {
        const u = qaUsers.find((q) => String(q.id) === String(id));
        return u ? u.name : id;
      });
      msg += ' (notified ' + notifiedNames.join(', ') + ')';
    }
    showToast(msg);
    await loadEnvironments();
    loadActivity();
  } catch (err) {
    showToast('Reserve failed: ' + err.message, true);
    await loadEnvironments();
  }
}

// ============================================
// Actions
// ============================================
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
