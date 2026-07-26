/*
 * StackPeek — background service worker (MV3).
 *
 * Orchestration only; owns no detection logic and makes no external requests.
 * Flow:
 *   1. User clicks the toolbar icon → chrome.action.onClicked fires. This is a
 *      user gesture that (a) lets us open the side panel and (b) grants
 *      `activeTab` for the current tab.
 *   2. We open the side panel for that tab and inject the two self-contained
 *      collectors (signals + same-origin headers) into the page.
 *   3. We stash the raw payload under `sp_scan_input`; the side panel reads it
 *      (via storage) and runs the engine + renders.
 *
 * The side panel's "Rescan" button messages us (SP_RESCAN); we re-inject into
 * the active tab. `activeTab` persists for a tab until it navigates, so a
 * rescan of the same page works; a failure (grant lost / restricted page) is
 * reported back as an error state.
 *
 * Permissions: activeTab, scripting, storage, sidePanel — no host permissions,
 * no automatic scanning, no content scripts on page load.
 */
'use strict';

importScripts('inject/collect-signals.js', 'engine/headers.js');

var SCAN_KEY = 'sp_scan_input';

function store(obj) {
  return new Promise(function (resolve) {
    try {
      var p = {}; p[SCAN_KEY] = obj;
      chrome.storage.local.set(p, function () { resolve(); });
    } catch (e) { resolve(); }
  });
}

function runInPage(tabId, fn) {
  return chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: fn,
    world: 'MAIN'
  }).then(function (frames) {
    return (frames && frames.length && frames[0]) ? frames[0].result : null;
  });
}

function scanTab(tabId) {
  // Signal 'scanning' so the panel can show its loading state promptly.
  return store({ ok: false, scanning: true, ts: Date.now() }).then(function () {
    return runInPage(tabId, self.collectSignalsInPage);
  }).then(function (signals) {
    if (!signals) {
      return store({ error: 'Could not read this page. Try reloading the tab, then click the StackPeek icon again.', ts: Date.now() });
    }
    return runInPage(tabId, self.collectHeadersInPage).then(function (headerResult) {
      return store({ ok: true, signals: signals, headerResult: headerResult || { headers: {}, ok: false, note: 'no header data' }, ts: Date.now() });
    }).catch(function () {
      return store({ ok: true, signals: signals, headerResult: { headers: {}, ok: false, note: 'header injection blocked' }, ts: Date.now() });
    });
  }).catch(function (err) {
    var msg = 'StackPeek can’t scan this page. Open a normal website (not a browser or Web Store page) and click the icon again.';
    try { if (err && err.message && /No tab|cannot|Cannot|Missing/.test(err.message)) { /* keep friendly msg */ } } catch (e) {}
    return store({ error: msg, ts: Date.now() });
  });
}

function getActiveTabId() {
  return new Promise(function (resolve, reject) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!tabs || !tabs.length) { reject(new Error('No active tab.')); return; }
        resolve(tabs[0].id);
      });
    } catch (e) { reject(e); }
  });
}

// Toolbar icon click: open the panel + scan (activeTab granted here).
chrome.action.onClicked.addListener(function (tab) {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(function () {
        try { chrome.sidePanel.open({ windowId: tab.windowId }); } catch (e) {}
      });
    }
  } catch (e) {}
  if (tab && tab.id != null) { scanTab(tab.id); }
});

// Rescan request from the panel.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'SP_RESCAN') {
    getActiveTabId().then(function (tabId) { return scanTab(tabId); })
      .then(function () { sendResponse({ ok: true }); })
      .catch(function () {
        store({ error: 'Couldn’t reach the active tab. Click the StackPeek icon on the page you want to scan.', ts: Date.now() });
        sendResponse({ ok: false });
      });
    return true; // async
  }
  return false;
});
