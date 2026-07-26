/*
 * StackPeek — side panel controller + light renderer.
 *
 * The panel runs the detection engine (window.SP_detect) on raw signals the
 * background worker collects from the active tab and stashes under
 * `sp_scan_input`. The panel reads that, renders, and re-renders whenever a new
 * scan arrives (storage.onChanged). Real technology logos come from
 * window.SP_LOGOS; anything without one gets a colored monogram tile.
 */
(function () {
  'use strict';

  var esc = function (v) { return window.SP_text.escapeHtml(v); };
  var SCAN_KEY = 'sp_scan_input';

  var els = {};
  var currentResult = null;

  var CAT_COLOR = {
    'CMS': '#3b6fe0', 'Ecommerce': '#16a34a', 'Framework': '#7c3aed', 'UI Framework': '#db2777',
    'JS Library': '#0891b2', 'Page Builder': '#ea580c', 'Analytics': '#d97706', 'A/B Testing': '#ca8a04',
    'Tag Manager': '#059669', 'Ad Tech': '#dc2626', 'Consent / Privacy': '#64748b', 'Monitoring': '#9333ea',
    'Chat / Support': '#0284c7', 'Payments': '#15803d', 'Video': '#e11d48', 'Maps': '#2563eb',
    'Fonts': '#c026d3', 'CAPTCHA / Security': '#b91c1c', 'Security / WAF': '#dc2626',
    'CDN / Hosting': '#4f46e5', 'Web Server': '#475569', 'Programming Language': '#b45309',
    'Miscellaneous': '#64748b'
  };

  var SHORT = { meta: 'generator tag', html: 'HTML pattern', script: 'script URL', link: 'stylesheet', global: 'JS global', cookie: 'cookie', header: 'HTTP header', implied: 'dependency' };
  var CHIP = { meta: 'meta', html: 'html', script: 'script', link: 'link', global: 'global', cookie: 'cookie', header: 'header', implied: 'inferred' };

  var CHEV = '<svg class="sp-chev" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function $(id) { return document.getElementById(id); }

  function monogram(name) {
    var m = String(name || '?').replace(/[^a-z0-9]/i, '');
    return (m.charAt(0) || '?').toUpperCase();
  }

  function logoHtml(item) {
    var logo = window.SP_LOGOS && window.SP_LOGOS[item.name];
    if (logo) {
      return '<span class="sp-tile"><svg viewBox="0 0 24 24" fill="#' + esc(logo.h) + '" aria-hidden="true"><path d="' + logo.p + '"/></svg></span>';
    }
    var color = CAT_COLOR[item.category] || '#64748b';
    return '<span class="sp-tile sp-mono" style="background:' + color + '">' + esc(monogram(item.name)) + '</span>';
  }

  function subLine(reasons) {
    if (!reasons || !reasons.length) { return 'heuristic match'; }
    var seen = {}, parts = [];
    for (var i = 0; i < reasons.length && parts.length < 3; i++) {
      var s = SHORT[reasons[i].type] || reasons[i].type;
      if (seen[s]) { continue; }
      seen[s] = true; parts.push(s);
    }
    return parts.join(' · ');
  }

  function eviRow(reason) {
    var type = reason.type || 'html', label = reason.label || '', text;
    if (type === 'global' && label.indexOf('JS global:') === 0) {
      text = 'reads <code>' + esc(label.replace('JS global:', '').trim()) + '</code>';
    } else if (type === 'header' && label.indexOf('HTTP header:') === 0) {
      text = 'response header <code>' + esc(label.replace('HTTP header:', '').trim()) + '</code>';
    } else if (type === 'meta') { text = 'matched the page&rsquo;s generator meta tag';
    } else if (type === 'script') { text = 'a known script URL pattern';
    } else if (type === 'link') { text = 'a stylesheet / link pattern';
    } else if (type === 'cookie') { text = 'a known cookie name';
    } else if (type === 'implied') { text = esc(label);
    } else { text = 'a signature in the page HTML'; }
    return '<div class="sp-evi-row"><span class="sp-chip sp-chip-' + esc(type) + '">' + esc(CHIP[type] || type) + '</span><span class="sp-evi-text">' + text + '</span></div>';
  }

  function eviHtml(reasons) {
    var out = '<div class="sp-evi-label">Evidence</div>';
    if (!reasons || !reasons.length) { return out + '<div class="sp-evi-row"><span class="sp-evi-text">heuristic match</span></div>'; }
    var seen = {};
    for (var i = 0; i < reasons.length; i++) {
      var k = reasons[i].type + '|' + reasons[i].label;
      if (seen[k]) { continue; } seen[k] = true;
      out += eviRow(reasons[i]);
    }
    return out;
  }

  function rowHtml(item) {
    var ver = item.version ? '<span class="sp-ver">' + esc(item.version) + '</span>' : '';
    var inf = item.implied ? '<span class="sp-inferred">inferred</span>' : '';
    return '' +
      '<div class="sp-row" tabindex="0" role="button" aria-expanded="false">' +
        logoHtml(item) +
        '<div class="sp-main-col">' +
          '<div class="sp-name-line"><span class="sp-name">' + esc(item.name) + '</span>' + ver + inf + '</div>' +
          '<div class="sp-sub">' + esc(subLine(item.reasons)) + '</div>' +
        '</div>' +
        CHEV +
      '</div>' +
      '<div class="sp-evi">' + eviHtml(item.reasons) + '</div>';
  }

  function catHtml(group) {
    var rows = '';
    for (var i = 0; i < group.items.length; i++) { rows += rowHtml(group.items[i]); }
    return '<div class="sp-cat"><div class="sp-cat-head"><span class="sp-cat-name">' + esc(group.category) + '</span><span class="sp-cat-count">' + group.items.length + '</span><span class="sp-cat-rule"></span></div>' + rows + '</div>';
  }

  function renderResults(result) {
    if (!result) {
      els.site.hidden = true;
      els.resultsRoot.innerHTML = state('&#128269;', 'Detecting this page&hellip;', 'Reading the page&rsquo;s signals — one moment.', true);
      return;
    }
    els.site.hidden = false;
    els.siteHost.textContent = result.hostname || result.url || 'this page';
    els.siteMeta.textContent = result.count + ' ' + (result.count === 1 ? 'technology' : 'technologies') + ' detected';

    var note = result.headerNote ? '<div class="sp-note"><span aria-hidden="true">&#9888;</span><span>Response headers weren&rsquo;t readable here &mdash; used page &amp; script signals only.</span></div>' : '';

    if (!result.count) {
      els.resultsRoot.innerHTML = note + state('&#129301;', 'No confident match', 'This may be a custom build or a site that hides its signals — so StackPeek won&rsquo;t guess.', false);
      return;
    }
    var body = '';
    for (var i = 0; i < result.categories.length; i++) { body += catHtml(result.categories[i]); }
    els.resultsRoot.innerHTML = note + body;
    bindRows(els.resultsRoot);
  }

  function state(icon, title, sub, spinning) {
    var ic = spinning ? '<div class="sp-spin-dot"></div>' : '<div style="font-size:24px">' + icon + '</div>';
    return '<div class="sp-state"><div class="sp-state-ic">' + ic + '</div><div class="sp-state-title">' + title + '</div><p class="sp-state-sub">' + sub + '</p></div>';
  }

  function bindRows(root) {
    var rows = root.querySelectorAll('.sp-row');
    for (var i = 0; i < rows.length; i++) {
      (function (el) {
        function toggle() {
          var open = el.classList.toggle('sp-open');
          el.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      })(rows[i]);
    }
  }

  // ---- data flow ---------------------------------------------------------
  function applyScanInput(input) {
    if (!input) { renderResults(null); return; }
    if (input.error) {
      els.site.hidden = true;
      els.resultsRoot.innerHTML = state('&#9888;', 'Can&rsquo;t scan this tab', esc(input.error), false);
      els.copy.disabled = true;
      return;
    }
    if (!input.ok || !input.signals) { renderResults(null); return; }
    var result;
    try { result = window.SP_detect(input.signals, input.headerResult); }
    catch (e) { els.resultsRoot.innerHTML = state('&#9888;', 'Engine error', esc((e && e.message) || 'unknown'), false); return; }
    currentResult = result;
    renderResults(result);
    els.copy.disabled = false;
    saveHistory(result);
  }

  function loadFromStorage() {
    try {
      chrome.storage.local.get(SCAN_KEY, function (data) {
        applyScanInput((data && data[SCAN_KEY]) || null);
      });
    } catch (e) { renderResults(null); }
  }

  function saveHistory(result) {
    if (!result || !result.hostname) { return; }
    var top = window.SP_text.topLabel(result);
    var topCat = '';
    if (result.flat && result.flat.length) {
      for (var i = 0; i < result.flat.length; i++) { if (result.flat[i].name === top) { topCat = result.flat[i].category; break; } }
    }
    var snap = { hostname: result.hostname, url: result.url, title: result.title, when: result.collectedAt || 0, count: result.count, top: top, topCategory: topCat, result: result };
    try { window.SP_storage.addHistory(snap); } catch (e) {}
  }

  // ---- tabs / history ----------------------------------------------------
  function activate(which) {
    var r = which === 'results';
    els.tabResults.classList.toggle('is-active', r);
    els.tabHistory.classList.toggle('is-active', !r);
    els.tabResults.setAttribute('aria-selected', String(r));
    els.tabHistory.setAttribute('aria-selected', String(!r));
    els.panelResults.classList.toggle('is-active', r);
    els.panelHistory.classList.toggle('is-active', !r);
    els.panelResults.hidden = !r; els.panelHistory.hidden = r;
    if (!r) { loadHistory(); }
  }

  function loadHistory() {
    window.SP_storage.getHistory().then(function (list) {
      if (!list || !list.length) {
        els.historyRoot.innerHTML = state('&#128340;', 'No history yet', 'Sites you detect appear here — the last 20, on this device only.', false);
        return;
      }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        rows += '<button class="sp-hist-row" data-idx="' + i + '">' +
          '<div class="sp-hist-main"><div class="sp-hist-host">' + esc(e.hostname || '') + '</div>' +
          '<div class="sp-hist-top">' + esc(e.top || '—') + (e.topCategory ? ' · ' + esc(e.topCategory) : '') + '</div></div>' +
          '<div class="sp-hist-side"><span class="sp-hist-count">' + (e.count || 0) + '</span><span class="sp-hist-when">' + esc(window.SP_text.formatShortDate(e.when)) + '</span></div></button>';
      }
      els.historyRoot.innerHTML = '<div class="sp-hist-tools"><span class="sp-hist-label">Last ' + list.length + ' detected</span><button class="sp-clear">Clear</button></div>' + rows;
      var rowEls = els.historyRoot.querySelectorAll('.sp-hist-row');
      for (var r = 0; r < rowEls.length; r++) {
        (function (el) { el.addEventListener('click', function () { var idx = +el.getAttribute('data-idx'); if (list[idx] && list[idx].result) { currentResult = list[idx].result; renderResults(list[idx].result); els.copy.disabled = false; activate('results'); toast('Snapshot from ' + (window.SP_text.formatWhen(list[idx].when) || 'earlier') + ' · not re-fetched'); } }); })(rowEls[r]);
      }
      var clr = els.historyRoot.querySelector('.sp-clear');
      if (clr) { clr.addEventListener('click', function () { window.SP_storage.clearHistory().then(loadHistory); }); }
    });
  }

  // ---- actions -----------------------------------------------------------
  var toastTimer = null;
  function toast(msg, kind) {
    els.toast.textContent = msg || '';
    els.toast.className = 'sp-toast' + (msg ? ' is-show' : '') + (kind === 'error' ? ' is-error' : '');
    if (toastTimer) { clearTimeout(toastTimer); }
    if (msg) { toastTimer = setTimeout(function () { els.toast.textContent = ''; els.toast.className = 'sp-toast'; }, 3200); }
  }

  function rescan() {
    els.rescan.classList.add('is-spinning');
    try {
      chrome.runtime.sendMessage({ type: 'SP_RESCAN' }, function () {
        setTimeout(function () { els.rescan.classList.remove('is-spinning'); }, 500);
        if (chrome.runtime.lastError) { toast('Couldn’t rescan — click the StackPeek icon on the page.', 'error'); }
      });
    } catch (e) { els.rescan.classList.remove('is-spinning'); }
  }

  function copySummary() {
    if (!currentResult) { return; }
    var text = window.SP_text.buildSummary(currentResult);
    function ok() { els.copy.classList.add('is-copied'); toast('Summary copied to clipboard'); setTimeout(function () { els.copy.classList.remove('is-copied'); }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok).catch(function () { toast('Couldn’t copy.', 'error'); }); }
    else { toast('Clipboard unavailable.', 'error'); }
  }

  // ---- init --------------------------------------------------------------
  function init() {
    els.rescan = $('rescan-btn'); els.copy = $('copy-btn');
    els.tabResults = $('tab-results'); els.tabHistory = $('tab-history');
    els.panelResults = $('panel-results'); els.panelHistory = $('panel-history');
    els.resultsRoot = $('results-root'); els.historyRoot = $('history-root');
    els.site = $('site-bar'); els.siteHost = $('site-host'); els.siteMeta = $('site-meta');
    els.toast = $('toast');

    els.rescan.addEventListener('click', rescan);
    els.copy.addEventListener('click', copySummary);
    els.tabResults.addEventListener('click', function () { activate('results'); });
    els.tabHistory.addEventListener('click', function () { activate('history'); });

    renderResults(null); // loading
    loadFromStorage();

    // re-render when the background stores a fresh scan
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes[SCAN_KEY]) { applyScanInput(changes[SCAN_KEY].newValue); }
      });
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', init);
})();
