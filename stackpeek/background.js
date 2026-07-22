/*
 * StackPeek — background service worker (MV3).
 *
 * Orchestration only. It owns no detection logic and makes no external
 * requests of its own. On a scan request from the popup it:
 *   1. resolves the active tab,
 *   2. injects the self-contained signal collector into that tab,
 *   3. injects the self-contained same-origin header reader into that tab,
 *   4. returns both raw payloads to the popup, which runs the engine + renders.
 *
 * The injected functions come from importScripts below — a single source of
 * truth shared with any test harness. They are passed to executeScript by
 * reference; chrome serializes them (they are fully self-contained, so this is
 * safe) and runs them in the page.
 *
 * All injection is gated on the user's click (activeTab). No host permissions,
 * no automatic scanning, no content scripts registered for page loads.
 */
'use strict';

importScripts('inject/collect-signals.js', 'engine/headers.js');

// Pages we cannot inject into (browser-internal / store / other extensions).
function isRestrictedUrl(url) {
  if (!url) { return true; }
  return /^(chrome|edge|brave|about|chrome-extension|moz-extension|devtools|view-source):/i.test(url) ||
    /^https:\/\/chrome\.google\.com\/webstore/i.test(url) ||
    /^https:\/\/chromewebstore\.google\.com/i.test(url);
}

function getActiveTab() {
  return new Promise(function (resolve, reject) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!tabs || !tabs.length) { reject(new Error('No active tab found.')); return; }
        resolve(tabs[0]);
      });
    } catch (e) { reject(e); }
  });
}

function runCollector(tabId, fn) {
  return chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: fn,
    world: 'MAIN' // access page's real window globals (window.Shopify, __NEXT_DATA__, ...)
  }).then(function (frames) {
    if (frames && frames.length && frames[0]) { return frames[0].result; }
    return null;
  });
}

function handleScan(sendResponse) {
  getActiveTab().then(function (tab) {
    if (isRestrictedUrl(tab.url)) {
      sendResponse({
        ok: false,
        error: 'StackPeek can\'t scan this page (browser-internal or Web Store page). Open a normal website and try again.'
      });
      return;
    }

    // Collect DOM/global signals first (always available), then headers
    // (best-effort). A header failure never fails the scan.
    runCollector(tab.id, self.collectSignalsInPage).then(function (signals) {
      if (!signals) {
        sendResponse({ ok: false, error: 'Could not read the page. Try reloading the tab and scanning again.' });
        return;
      }
      runCollector(tab.id, self.collectHeadersInPage).then(function (headerResult) {
        sendResponse({
          ok: true,
          signals: signals,
          headerResult: headerResult || { headers: {}, ok: false, note: 'no header data' }
        });
      }).catch(function () {
        // Headers are corroborating only — proceed without them.
        sendResponse({
          ok: true,
          signals: signals,
          headerResult: { headers: {}, ok: false, note: 'header injection blocked' }
        });
      });
    }).catch(function (err) {
      var msg = 'Injection failed.';
      try { if (err && err.message) { msg = 'Injection failed: ' + err.message; } } catch (e) {}
      sendResponse({ ok: false, error: msg });
    });
  }).catch(function (err) {
    var msg = 'Could not access the active tab.';
    try { if (err && err.message) { msg = err.message; } } catch (e) {}
    sendResponse({ ok: false, error: msg });
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'SP_SCAN') {
    handleScan(sendResponse);
    return true; // keep the message channel open for the async response
  }
  return false;
});
