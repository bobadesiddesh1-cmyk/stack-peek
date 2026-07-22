/*
 * StackPeek — popup controller.
 *
 * Wires the UI: tab switching, the on-demand Detect button (message → injection
 * → engine → render), Copy summary, and the History tab. All detection scoring
 * happens here in the popup via window.SP_detect; the page only ever returns
 * raw signals.
 */
(function () {
  'use strict';

  var els = {};
  var currentResult = null;   // latest rendered result (live scan or snapshot)
  var scanning = false;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, kind) {
    els.status.textContent = msg || '';
    els.status.className = 'sp-status' + (msg ? (' is-' + (kind || 'info')) : '');
  }

  function setScanning(on) {
    scanning = on;
    els.detect.disabled = on;
    els.detect.classList.toggle('is-loading', on);
    els.detectLabel.innerHTML = on
      ? '<span class="sp-spin" aria-hidden="true"></span>Detecting…'
      : 'Detect stack on this page';
  }

  // ---- Tabs --------------------------------------------------------------
  function activateTab(which) {
    var isResults = which === 'results';
    els.tabResults.classList.toggle('is-active', isResults);
    els.tabHistory.classList.toggle('is-active', !isResults);
    els.tabResults.setAttribute('aria-selected', String(isResults));
    els.tabHistory.setAttribute('aria-selected', String(!isResults));
    els.panelResults.classList.toggle('is-active', isResults);
    els.panelHistory.classList.toggle('is-active', !isResults);
    if (isResults) { els.panelHistory.setAttribute('hidden', ''); els.panelResults.removeAttribute('hidden'); }
    else { els.panelResults.setAttribute('hidden', ''); els.panelHistory.removeAttribute('hidden'); loadHistory(); }
  }

  // ---- Detection ---------------------------------------------------------
  function runScan() {
    if (scanning) { return; }
    setScanning(true);
    setStatus('');
    els.copy.disabled = true;
    els.copy.classList.remove('is-copied');
    els.copy.textContent = 'Copy summary';

    var t0 = Date.now();
    chrome.runtime.sendMessage({ type: 'SP_SCAN' }, function (resp) {
      setScanning(false);

      if (chrome.runtime.lastError) {
        setStatus('Couldn’t reach the extension worker. Reload the page and retry.', 'error');
        return;
      }
      if (!resp || !resp.ok) {
        setStatus((resp && resp.error) || 'Scan failed.', 'error');
        return;
      }

      var result;
      try {
        result = window.SP_detect(resp.signals, resp.headerResult);
      } catch (e) {
        setStatus('Detection engine error: ' + (e && e.message ? e.message : 'unknown'), 'error');
        return;
      }

      currentResult = result;
      window.SP_results.render(els.resultsRoot, result);
      els.copy.disabled = false;

      var ms = Date.now() - t0;
      if (result.count) {
        setStatus('Scanned in ' + ms + ' ms · ' + result.count + ' detected.', 'info');
      } else {
        setStatus('Scanned in ' + ms + ' ms · nothing crossed the confidence threshold.', 'info');
      }

      saveSnapshot(result);
    });
  }

  function topCategoryOf(result) {
    if (!result.flat || !result.flat.length) { return ''; }
    var topName = window.SP_text.topLabel(result);
    for (var i = 0; i < result.flat.length; i++) {
      if (result.flat[i].name === topName) { return result.flat[i].category; }
    }
    return result.flat[0].category;
  }

  function saveSnapshot(result) {
    if (!result || !result.hostname) { return; }
    var snapshot = {
      hostname: result.hostname,
      url: result.url,
      title: result.title,
      when: result.collectedAt || Date.now(),
      count: result.count,
      top: window.SP_text.topLabel(result),
      topCategory: topCategoryOf(result),
      result: result // full result kept so History re-renders without re-scanning
    };
    try { window.SP_storage.addHistory(snapshot); } catch (e) { /* non-fatal */ }
  }

  // ---- Copy summary ------------------------------------------------------
  function copySummary() {
    if (!currentResult) { return; }
    var text = window.SP_text.buildSummary(currentResult);

    function ok() {
      els.copy.textContent = 'Copied ✓';
      els.copy.classList.add('is-copied');
      setTimeout(function () {
        els.copy.textContent = 'Copy summary';
        els.copy.classList.remove('is-copied');
      }, 1600);
    }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok();
      } catch (e) {
        setStatus('Couldn’t copy to clipboard.', 'error');
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(fallback);
    } else {
      fallback();
    }
  }

  // ---- History -----------------------------------------------------------
  function loadHistory() {
    window.SP_storage.getHistory().then(function (list) {
      window.SP_history.render(els.historyRoot, list, onHistorySelect, onHistoryClear);
    });
  }

  function onHistorySelect(entry) {
    if (!entry || !entry.result) { return; }
    currentResult = entry.result;
    window.SP_results.render(els.resultsRoot, entry.result);
    els.copy.disabled = false;
    activateTab('results');
    var when = window.SP_text.formatWhen(entry.when);
    setStatus('Snapshot from ' + (when || 'a previous scan') + ' · not re-fetched.', 'info');
  }

  function onHistoryClear() {
    window.SP_storage.clearHistory().then(function () { loadHistory(); });
  }

  // ---- Init --------------------------------------------------------------
  function init() {
    els.detect = $('detect-btn');
    els.detectLabel = els.detect.querySelector('.sp-detect-label');
    els.copy = $('copy-btn');
    els.tabResults = $('tab-results');
    els.tabHistory = $('tab-history');
    els.panelResults = $('panel-results');
    els.panelHistory = $('panel-history');
    els.resultsRoot = $('results-root');
    els.historyRoot = $('history-root');
    els.status = $('status');

    window.SP_results.render(els.resultsRoot, null); // idle state

    els.detect.addEventListener('click', runScan);
    els.copy.addEventListener('click', copySummary);
    els.tabResults.addEventListener('click', function () { activateTab('results'); });
    els.tabHistory.addEventListener('click', function () { activateTab('history'); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
