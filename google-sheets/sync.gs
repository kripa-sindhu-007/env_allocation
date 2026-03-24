// ============================================
// Google Apps Script — Env Manager Sheet Sync
// Paste this in Extensions > Apps Script
// ============================================

var API_BASE = 'https://envmanag.vercel.app/api';

// Sheet structure:
// Status tabs:  BE - APIs, BE - Portal, FE - PWA, FE - Portal
// History tabs: History - BE APIs, History - BE Portal, History - FE PWA, History - FE Portal

var CATEGORIES = [
  { key: 'Backend-APIs',    statusTab: 'BE - APIs',    historyTab: 'History - BE APIs' },
  { key: 'Backend-Portal',  statusTab: 'BE - Portal',  historyTab: 'History - BE Portal' },
  { key: 'Frontend-PWA',    statusTab: 'FE - PWA',     historyTab: 'History - FE PWA' },
  { key: 'Frontend-Portal', statusTab: 'FE - Portal',  historyTab: 'History - FE Portal' }
];

var HEADER_BG = '#0f172a';
var HEADER_FG = '#ffffff';
var FREE_BG = '#dcfce7';
var FREE_FG = '#15803d';
var INUSE_BG = '#fee2e2';
var INUSE_FG = '#dc2626';
var RESERVE_BG = '#fef3c7';
var RESERVE_FG = '#92400e';
var RELEASE_BG = '#dbeafe';
var RELEASE_FG = '#1e40af';
var NOTE_BG = '#f3e8ff';
var NOTE_FG = '#6b21a8';
var BORDER_COLOR = '#e2e8f0';

// ============================================
// Main sync
// ============================================
function syncAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var response = UrlFetchApp.fetch(API_BASE + '/environments');
  var allEnvs = JSON.parse(response.getContentText());

  CATEGORIES.forEach(function(cat) {
    var envs = allEnvs.filter(function(e) { return e.category === cat.key; });
    envs.sort(function(a, b) {
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    syncStatusSheet(ss, cat.statusTab, cat.key, envs);
    syncHistorySheet(ss, cat.historyTab, cat.key);
  });
}

// ============================================
// Status sheet per category
// ============================================
function syncStatusSheet(ss, tabName, categoryKey, envs) {
  var sheet = getOrCreateSheet(ss, tabName);
  sheet.clear();
  sheet.clearConditionalFormatRules();

  var groupLabel = categoryKey.replace('-', ' / ');
  var headers = ['Environment', 'Status', 'Owner', 'Note', 'Last Updated'];

  // Title row
  sheet.getRange(1, 1).setValue(groupLabel).setFontSize(13).setFontWeight('bold').setFontColor('#334155');
  sheet.getRange(1, headers.length).setValue('Last synced: ' + new Date().toLocaleString())
    .setFontSize(9).setFontColor('#94a3b8').setHorizontalAlignment('right');
  sheet.setRowHeight(1, 30);

  // Headers
  var headerRange = sheet.getRange(2, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold').setBackground(HEADER_BG).setFontColor(HEADER_FG);
  headerRange.setHorizontalAlignment('center');

  if (!envs.length) return;

  // Data rows
  var rows = envs.map(function(env) {
    var isFree = env.status === 'free';
    return [
      env.name,
      isFree ? 'FREE' : 'IN USE',
      env.owner || '',
      env.note || '',
      env.updated_at ? formatDate(env.updated_at) : ''
    ];
  });

  var dataRange = sheet.getRange(3, 1, rows.length, headers.length);
  dataRange.setValues(rows);
  dataRange.setBorder(true, true, true, true, true, true, BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);

  // Color-code each row based on status
  for (var i = 0; i < rows.length; i++) {
    var row = i + 3;
    var statusCell = sheet.getRange(row, 2);
    var rowRange = sheet.getRange(row, 1, 1, headers.length);

    if (rows[i][1] === 'FREE') {
      statusCell.setBackground(FREE_BG).setFontColor(FREE_FG).setFontWeight('bold');
      rowRange.setBackground('#f8fafc');
    } else {
      statusCell.setBackground(INUSE_BG).setFontColor(INUSE_FG).setFontWeight('bold');
      rowRange.setBackground('#fff5f5');
    }

    // Env name column — monospace bold
    sheet.getRange(row, 1).setFontWeight('bold');
  }

  // Column widths
  sheet.setColumnWidth(1, 120); // Environment
  sheet.setColumnWidth(2, 80);  // Status
  sheet.setColumnWidth(3, 100); // Owner
  sheet.setColumnWidth(4, 200); // Note
  sheet.setColumnWidth(5, 160); // Last Updated

  sheet.setFrozenRows(2);

  // Summary at bottom
  var freeCount = envs.filter(function(e) { return e.status === 'free'; }).length;
  var usedCount = envs.length - freeCount;
  var summaryRow = rows.length + 4;
  sheet.getRange(summaryRow, 1).setValue('Summary').setFontWeight('bold').setFontColor('#334155');
  sheet.getRange(summaryRow, 2).setValue(freeCount + ' Free').setBackground(FREE_BG).setFontColor(FREE_FG).setFontWeight('bold');
  sheet.getRange(summaryRow, 3).setValue(usedCount + ' In Use').setBackground(INUSE_BG).setFontColor(INUSE_FG).setFontWeight('bold');
}

// ============================================
// History sheet per category
// ============================================
function syncHistorySheet(ss, tabName, categoryKey) {
  var sheet = getOrCreateSheet(ss, tabName);
  sheet.clear();

  // Fetch history for this category
  var response = UrlFetchApp.fetch(API_BASE + '/history?category=' + encodeURIComponent(categoryKey));
  var history = JSON.parse(response.getContentText());

  var groupLabel = categoryKey.replace('-', ' / ') + ' — Activity Log';
  var headers = ['Time', 'Environment', 'Action', 'User', 'Note'];

  // Title
  sheet.getRange(1, 1).setValue(groupLabel).setFontSize(13).setFontWeight('bold').setFontColor('#334155');
  sheet.setRowHeight(1, 30);

  // Headers
  var headerRange = sheet.getRange(2, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold').setBackground(HEADER_BG).setFontColor(HEADER_FG);
  headerRange.setHorizontalAlignment('center');

  if (!history.length) {
    sheet.getRange(3, 1).setValue('No activity yet').setFontColor('#94a3b8').setFontStyle('italic');
    sheet.setFrozenRows(2);
    return;
  }

  var rows = history.map(function(h) {
    var envName = h.environments && h.environments.name ? h.environments.name : '';
    return [
      h.created_at ? formatDate(h.created_at) : '',
      envName,
      h.action,
      h.user_name,
      h.note || ''
    ];
  });

  var dataRange = sheet.getRange(3, 1, rows.length, headers.length);
  dataRange.setValues(rows);
  dataRange.setBorder(true, true, true, true, true, true, BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);

  // Color-code action column
  for (var i = 0; i < rows.length; i++) {
    var row = i + 3;
    var actionCell = sheet.getRange(row, 3);
    var action = rows[i][2];

    if (action === 'reserve') {
      actionCell.setValue('RESERVE').setBackground(RESERVE_BG).setFontColor(RESERVE_FG).setFontWeight('bold');
    } else if (action === 'release') {
      actionCell.setValue('RELEASE').setBackground(RELEASE_BG).setFontColor(RELEASE_FG).setFontWeight('bold');
    } else {
      actionCell.setValue('NOTE').setBackground(NOTE_BG).setFontColor(NOTE_FG).setFontWeight('bold');
    }

    // Env name bold
    sheet.getRange(row, 2).setFontWeight('bold');
    // Time column muted
    sheet.getRange(row, 1).setFontColor('#64748b');
  }

  // Column widths
  sheet.setColumnWidth(1, 160); // Time
  sheet.setColumnWidth(2, 120); // Environment
  sheet.setColumnWidth(3, 90);  // Action
  sheet.setColumnWidth(4, 100); // User
  sheet.setColumnWidth(5, 200); // Note

  sheet.setFrozenRows(2);
}

// ============================================
// Helpers
// ============================================
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function formatDate(isoStr) {
  var d = new Date(isoStr);
  var day = pad(d.getDate());
  var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  var hr = pad(d.getHours());
  var min = pad(d.getMinutes());
  return day + ' ' + mon + ' ' + d.getFullYear() + ', ' + hr + ':' + min;
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ============================================
// Run once to set up auto-sync every 5 minutes
// ============================================
function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('syncAll')
    .timeBased()
    .everyMinutes(5)
    .create();
}
