// ============================================
// Background service worker for QA notifications
// Polls the API for unread notifications and shows
// native Chrome notifications.
// ============================================

const API_BASE = 'https://envmanag.vercel.app/api';
const ALARM_NAME = 'check-notifications';
const POLL_INTERVAL_MINUTES = 1;

let isChecking = false;

// On install / update, set up the alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
});

// Also ensure alarm exists on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
});

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForNotifications();
  }
});

async function checkForNotifications() {
  // Prevent concurrent runs
  if (isChecking) return;
  isChecking = true;

  try {
    const stored = await chrome.storage.local.get(['userId', 'userRole', 'shownNotifIds']);
    const userId = stored.userId;
    const role = stored.userRole;
    const shownIds = stored.shownNotifIds || [];

    // Only poll for QA users
    if (!userId || role !== 'qa') return;

    const res = await fetch(
      API_BASE + '/notifications?userId=' + encodeURIComponent(userId)
    );
    if (!res.ok) return;

    const notifications = await res.json();
    if (!notifications) return;

    // Filter unread for badge count and chrome notifications
    const unread = notifications.filter((n) => !n.is_read);

    // Update badge with unread count
    const count = unread.length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#fb7185' });

    if (unread.length === 0) return;

    // Use string IDs for consistent comparison
    const shownSet = new Set(shownIds.map(String));
    let hasNew = false;

    for (const notif of unread) {
      const idStr = String(notif.id);
      if (shownSet.has(idStr)) continue;

      shownSet.add(idStr);
      hasNew = true;

      const noteText = notif.note ? ' — "' + notif.note + '"' : '';
      const envName = notif.env_name || 'an environment';

      chrome.notifications.create('env-notif-' + idStr, {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Environment Reserved',
        message: notif.from_user + ' reserved ' + envName + noteText,
        priority: 2
      });
    }

    if (hasNew) {
      const pruned = Array.from(shownSet).slice(-20);
      await chrome.storage.local.set({ shownNotifIds: pruned });
    }
  } catch (_) {
    // Silently fail — will retry on next alarm
  } finally {
    isChecking = false;
  }
}

// When user clicks a notification, clear it
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'check-notifications') {
    checkForNotifications().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'clear-badge') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
    return true;
  }
});
