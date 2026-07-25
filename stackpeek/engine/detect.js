/*
 * StackPeek — Detection engine.
 *
 * Runs in the POPUP context (has access to window.SP_FINGERPRINTS). It takes the
 * raw signals collected from the page + the response headers, matches them
 * against the fingerprint database, and produces scored, grouped results.
 *
 * Performance (see DECISIONS.md / README acceptance tests):
 *   - Every `re` in the database is compiled to a RegExp ONCE, lazily on first
 *     detect() call, and cached on the fingerprint object. Never recompiled.
 *   - Signals are pre-joined once per scan (scripts, links, cookies, meta) so
 *     each pattern is a single string test — no per-fingerprint DOM re-scan.
 *   - A typical page (moderate HTML, ~20 scripts, 71 fingerprints) scores in a
 *     couple of milliseconds.
 *
 * Scoring:
 *   - Within one signal type, we take the MAX matched weight (overlapping
 *     patterns don't stack). Across signal types we SUM. Confidence =
 *     min(100, round(sum)).
 *   - Only technologies scoring >= MIN_CONFIDENCE (25) are shown.
 *   - `implies` boosts/surfaces parents (Elementor => WordPress), never
 *     suppresses siblings. Multi-tech pages are correct, not conflicts.
 */
(function () {
  'use strict';

  var MIN_CONFIDENCE = 25;
  var IMPLY_MIN_CHILD = 40;     // child must be at least this to imply a parent
  var IMPLY_PARENT_FLOOR = 55;  // implied parent shown at >= this confidence
  var IMPLY_BOOST = 15;         // added to an already-detected parent

  var REASON_LABEL = {
    meta: 'meta generator tag',
    html: 'HTML source pattern',
    script: 'script src pattern',
    link: 'stylesheet / link pattern',
    global: 'JS global variable',
    cookie: 'cookie name',
    header: 'HTTP response header'
  };

  var compiled = false;

  // Compile every `re` string once, caching the RegExp on the pattern object.
  function compileFingerprints(fingerprints) {
    if (compiled) { return; }
    var types = ['html', 'script', 'link', 'meta', 'cookie', 'header'];
    for (var i = 0; i < fingerprints.length; i++) {
      var fp = fingerprints[i];
      if (!fp.patterns) { continue; }
      for (var t = 0; t < types.length; t++) {
        var arr = fp.patterns[types[t]];
        if (!arr) { continue; }
        for (var p = 0; p < arr.length; p++) {
          if (arr[p].re && !arr[p]._rx) {
            try {
              // `cs: true` opts a pattern into case-SENSITIVE matching — needed
              // for uppercase IDs (GA4 `G-...`, GTM `GTM-...`) so they don't
              // match lowercase CSS class names like `g-animation`.
              arr[p]._rx = new RegExp(arr[p].re, arr[p].cs ? '' : 'i');
            } catch (e) {
              // A malformed pattern is disabled rather than breaking the engine.
              arr[p]._rx = null;
            }
          }
        }
      }
      // version capture patterns (one capture group each)
      if (fp.version) {
        for (var vv = 0; vv < fp.version.length; vv++) {
          if (fp.version[vv].re && !fp.version[vv]._rx) {
            try { fp.version[vv]._rx = new RegExp(fp.version[vv].re, fp.version[vv].cs ? '' : 'i'); }
            catch (e2) { fp.version[vv]._rx = null; }
          }
        }
      }
    }
    compiled = true;
  }

  // Pull a version string from a fingerprint's version patterns (first hit wins).
  function extractVersion(fp, ctx) {
    if (!fp.version) { return ''; }
    for (var i = 0; i < fp.version.length; i++) {
      var v = fp.version[i];
      var rx = v._rx;
      if (!rx) { continue; }
      var hay = '';
      if (v.src === 'script') { hay = ctx.scriptsJoined; }
      else if (v.src === 'html') { hay = ctx.html; }
      else if (v.src === 'meta') { hay = ctx.metaJoined; }
      else if (v.src === 'header') { hay = (v.header && ctx.headers[v.header]) || ''; }
      if (!hay) { continue; }
      try {
        var m = rx.exec(hay);
        if (m && m[1]) { return m[1]; }
      } catch (e) { /* ignore one bad match */ }
    }
    return '';
  }

  // Return the highest matched weight for a string-tested pattern array, plus
  // an optional list of specific matched tokens (for header/global detail).
  function bestStringMatch(arr, haystack) {
    var best = 0;
    if (!arr || !haystack) { return best; }
    for (var i = 0; i < arr.length; i++) {
      var rx = arr[i]._rx;
      if (rx && rx.test(haystack)) {
        if (arr[i].weight > best) { best = arr[i].weight; }
      }
    }
    return best;
  }

  // Meta patterns test against each generator string individually.
  function bestMetaMatch(arr, generators) {
    var best = 0;
    if (!arr || !generators || !generators.length) { return best; }
    for (var i = 0; i < arr.length; i++) {
      var rx = arr[i]._rx;
      if (!rx) { continue; }
      for (var g = 0; g < generators.length; g++) {
        if (rx.test(generators[g])) {
          if (arr[i].weight > best) { best = arr[i].weight; }
          break;
        }
      }
    }
    return best;
  }

  function globalMatch(arr, globals, matchedNames) {
    var best = 0;
    if (!arr || !globals) { return best; }
    for (var i = 0; i < arr.length; i++) {
      if (globals[arr[i].name]) {
        matchedNames.push(arr[i].name);
        if (arr[i].weight > best) { best = arr[i].weight; }
      }
    }
    return best;
  }

  function headerMatch(arr, headers, matchedNames) {
    var best = 0;
    if (!arr || !headers) { return best; }
    for (var i = 0; i < arr.length; i++) {
      var h = arr[i];
      var val = headers[h.name];
      if (typeof val === 'undefined') { continue; }
      var ok;
      if (h.re) {
        var rx = h._valRx;
        if (!rx) {
          try { rx = h._valRx = new RegExp(h.re, 'i'); } catch (e) { rx = h._valRx = null; }
        }
        ok = rx ? rx.test(val) : false;
      } else {
        ok = true; // presence alone matches
      }
      if (ok) {
        matchedNames.push(h.name);
        if (h.weight > best) { best = h.weight; }
      }
    }
    return best;
  }

  /**
   * @param {object} signals  output of collectSignalsInPage()
   * @param {object} headerResult  output of collectHeadersInPage() or null
   * @returns {object} grouped, scored detection result
   */
  function detect(signals, headerResult) {
    var fingerprints = (typeof window !== 'undefined' && window.SP_FINGERPRINTS) || [];
    var categoryOrder = (typeof window !== 'undefined' && window.SP_CATEGORY_ORDER) || [];
    compileFingerprints(fingerprints);

    signals = signals || {};
    var headers = (headerResult && headerResult.headers) || {};
    var headerNote = (headerResult && !headerResult.ok && headerResult.note) ? headerResult.note : '';

    // Pre-join once.
    var scriptsJoined = (signals.scripts || []).join('\n');
    var linksJoined = (signals.links || []).join('\n');
    var cookiesJoined = (signals.cookies || []).join(';');
    var html = signals.html || '';
    var generators = signals.metaGenerators || [];
    var globals = signals.globals || {};

    var vctx = {
      scriptsJoined: scriptsJoined,
      html: html,
      metaJoined: generators.join('\n'),
      headers: headers
    };

    var byName = {}; // name -> result object

    for (var i = 0; i < fingerprints.length; i++) {
      var fp = fingerprints[i];
      var pat = fp.patterns || {};
      var score = 0;
      var reasons = [];

      var wMeta = bestMetaMatch(pat.meta, generators);
      if (wMeta > 0) { score += wMeta; reasons.push({ type: 'meta', label: REASON_LABEL.meta }); }

      var wHtml = bestStringMatch(pat.html, html);
      if (wHtml > 0) { score += wHtml; reasons.push({ type: 'html', label: REASON_LABEL.html }); }

      var wScript = bestStringMatch(pat.script, scriptsJoined);
      if (wScript > 0) { score += wScript; reasons.push({ type: 'script', label: REASON_LABEL.script }); }

      var wLink = bestStringMatch(pat.link, linksJoined);
      if (wLink > 0) { score += wLink; reasons.push({ type: 'link', label: REASON_LABEL.link }); }

      var gNames = [];
      var wGlobal = globalMatch(pat.global, globals, gNames);
      if (wGlobal > 0) {
        var gLabel = 'JS global: ' + gNames.map(function (n) { return 'window.' + n; }).join(', ');
        score += wGlobal; reasons.push({ type: 'global', label: gLabel });
      }

      var wCookie = bestStringMatch(pat.cookie, cookiesJoined);
      if (wCookie > 0) { score += wCookie; reasons.push({ type: 'cookie', label: REASON_LABEL.cookie }); }

      var hNames = [];
      var wHeader = headerMatch(pat.header, headers, hNames);
      if (wHeader > 0) {
        var hLabel = 'HTTP header: ' + hNames.join(', ');
        score += wHeader; reasons.push({ type: 'header', label: hLabel });
      }

      if (score <= 0) { continue; }

      byName[fp.name] = {
        name: fp.name,
        category: fp.category,
        confidence: Math.min(100, Math.round(score)),
        rawScore: score,
        reasons: reasons,
        version: extractVersion(fp, vctx),
        implies: fp.implies || [],
        implied: false
      };
    }

    // Implication pass: a confident child surfaces/boosts its declared parents.
    var names = Object.keys(byName);
    for (var n = 0; n < names.length; n++) {
      var child = byName[names[n]];
      if (child.confidence < IMPLY_MIN_CHILD || !child.implies.length) { continue; }
      for (var pI = 0; pI < child.implies.length; pI++) {
        var parentName = child.implies[pI];
        var parent = byName[parentName];
        if (parent) {
          // Boost an already-detected parent.
          parent.confidence = Math.min(100, parent.confidence + IMPLY_BOOST);
          parent.reasons.push({ type: 'implied', label: 'implied by ' + child.name });
        } else {
          // Surface a parent that's a hard dependency of the child.
          var def = findFingerprint(fingerprints, parentName);
          byName[parentName] = {
            name: parentName,
            category: def ? def.category : 'CMS',
            confidence: IMPLY_PARENT_FLOOR,
            rawScore: IMPLY_PARENT_FLOOR,
            reasons: [{ type: 'implied', label: 'implied by ' + child.name }],
            version: '',
            implies: def && def.implies ? def.implies : [],
            implied: true
          };
        }
      }
    }

    // Threshold + assemble.
    var kept = [];
    var allNames = Object.keys(byName);
    for (var a = 0; a < allNames.length; a++) {
      var item = byName[allNames[a]];
      if (item.confidence >= MIN_CONFIDENCE) { kept.push(item); }
    }

    // Flat list sorted by confidence desc (ties: name asc) for summary/history.
    kept.sort(function (x, y) {
      if (y.confidence !== x.confidence) { return y.confidence - x.confidence; }
      return x.name < y.name ? -1 : (x.name > y.name ? 1 : 0);
    });

    // Group by category in canonical order; unknown categories appended.
    var groups = {};
    for (var c = 0; c < kept.length; c++) {
      var cat = kept[c].category || 'Other';
      if (!groups[cat]) { groups[cat] = []; }
      groups[cat].push(kept[c]);
    }
    var orderedCats = [];
    for (var o = 0; o < categoryOrder.length; o++) {
      if (groups[categoryOrder[o]]) { orderedCats.push(categoryOrder[o]); }
    }
    for (var gk in groups) {
      if (groups.hasOwnProperty(gk) && orderedCats.indexOf(gk) === -1) { orderedCats.push(gk); }
    }
    var categories = [];
    for (var oc = 0; oc < orderedCats.length; oc++) {
      var list = groups[orderedCats[oc]];
      list.sort(function (x, y) {
        if (y.confidence !== x.confidence) { return y.confidence - x.confidence; }
        return x.name < y.name ? -1 : (x.name > y.name ? 1 : 0);
      });
      categories.push({ category: orderedCats[oc], items: list });
    }

    return {
      url: signals.url || '',
      hostname: signals.hostname || '',
      title: signals.title || '',
      collectedAt: signals.collectedAt || 0,
      headerNote: headerNote,
      categories: categories,
      flat: kept,
      count: kept.length
    };
  }

  function findFingerprint(fingerprints, name) {
    for (var i = 0; i < fingerprints.length; i++) {
      if (fingerprints[i].name === name) { return fingerprints[i]; }
    }
    return null;
  }

  var api = { detect: detect, MIN_CONFIDENCE: MIN_CONFIDENCE };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.SP_detect = detect; window.SP_DETECT_API = api; }
})();
