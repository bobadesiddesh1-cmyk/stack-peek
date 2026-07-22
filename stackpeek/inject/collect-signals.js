/*
 * StackPeek — Injected signal collector.
 *
 * `collectSignalsInPage()` is executed IN THE PAGE via
 * chrome.scripting.executeScript({ func: collectSignalsInPage }). It is
 * therefore fully SELF-CONTAINED: it references no outer-scope variables, no
 * imports, and no helpers defined elsewhere. Everything it needs — including
 * the list of window globals to probe — is declared inside it.
 *
 * Hard guarantees (see DECISIONS.md):
 *   - Every extraction step is wrapped in try/catch. A single failing step
 *     degrades to an empty result for that signal, never throwing.
 *   - Global probes use `typeof window[name] !== 'undefined'` and never invoke
 *     functions or traverse nested properties on unknown globals. This cannot
 *     throw even on exotic pages (e.g. a global defined as a throwing getter is
 *     never touched, only its existence is tested — and even that is guarded).
 *   - The returned outerHTML is capped (2 MB) to keep the message payload small;
 *     generator/meta/comment signatures live near the top of the document so the
 *     cap effectively never drops a real signal.
 *
 * Returns a plain, structured-clone-safe object:
 *   {
 *     url, hostname, title,
 *     html            : string (capped),
 *     scripts         : string[]   (script src URLs),
 *     links           : string[]   (link href URLs),
 *     metaGenerators  : string[]   (<meta name="generator"> contents),
 *     globals         : { [name]: true },
 *     cookies         : string[]   (non-HttpOnly cookie names),
 *     collectedAt     : number     (ms epoch, page clock)
 *   }
 */
function collectSignalsInPage() {
  'use strict';

  var HTML_CAP = 2000000; // 2 MB — see DECISIONS.md

  // Fixed roster of window globals to probe. Kept in sync with the `global`
  // patterns in data/fingerprints.js. Existence-only checks; never invoked.
  var GLOBAL_NAMES = [
    'Shopify', 'wixBiSession', 'wixPerformanceMeasurements', 'Webflow', 'Drupal',
    'BCData', '_hsq', 'hbspt', 'wc_add_to_cart_params', 'woocommerce_params',
    'klaviyo', '_klOnsite', 'yotpo', 'React', 'Vue', '__VUE__', '__NEXT_DATA__',
    '__NUXT__', 'getAllAngularRootElements', 'ng', 'jQuery', '___gatsby',
    'Alpine', 'Ember', 'preact', 'Backbone', 'elementorFrontend', 'gtag', 'ga',
    'google_tag_manager', 'dataLayer', 'hj', '_hjSettings', 'clarity',
    'mixpanel', 'analytics', 'amplitude', 'plausible', '_paq', 'Matomo', 'Piwik',
    'fathom', 'heap', 'adsbygoogle', 'fbq', '_fbq', 'criteo_q', '_taboola',
    'OBR', 'googletag', 'twq', '_linkedin_data_partner_ids', 'ttq', 'Intercom',
    'zE', 'zEmbed', 'drift', 'driftt', 'Tawk_API', '$crisp', 'CRISP_WEBSITE_ID',
    'grecaptcha', 'hcaptcha', 'turnstile', 'wp'
  ];

  var out = {
    url: '',
    hostname: '',
    title: '',
    html: '',
    scripts: [],
    links: [],
    metaGenerators: [],
    globals: {},
    cookies: [],
    collectedAt: 0
  };

  // --- Location / title ---------------------------------------------------
  try {
    out.url = String(location.href || '');
    out.hostname = String(location.hostname || '');
  } catch (e) { /* leave defaults */ }
  try { out.title = String(document.title || ''); } catch (e) { /* ignore */ }
  try { out.collectedAt = Date.now(); } catch (e) { out.collectedAt = 0; }

  // --- Full outer HTML (capped) ------------------------------------------
  try {
    var raw = '';
    if (document.documentElement && document.documentElement.outerHTML) {
      raw = document.documentElement.outerHTML;
    }
    out.html = raw.length > HTML_CAP ? raw.slice(0, HTML_CAP) : raw;
  } catch (e) { out.html = ''; }

  // --- <script src> URLs --------------------------------------------------
  try {
    var scriptEls = document.querySelectorAll('script[src]');
    for (var i = 0; i < scriptEls.length; i++) {
      try {
        var s = scriptEls[i].getAttribute('src');
        if (s) { out.scripts.push(String(s)); }
      } catch (e2) { /* skip one script */ }
    }
  } catch (e) { /* leave scripts as-is */ }

  // --- <link href> URLs ---------------------------------------------------
  try {
    var linkEls = document.querySelectorAll('link[href]');
    for (var j = 0; j < linkEls.length; j++) {
      try {
        var h = linkEls[j].getAttribute('href');
        if (h) { out.links.push(String(h)); }
      } catch (e3) { /* skip one link */ }
    }
  } catch (e) { /* leave links as-is */ }

  // --- <meta name="generator"> contents ----------------------------------
  try {
    var metaEls = document.querySelectorAll('meta[name="generator" i], meta[property="generator" i]');
    for (var k = 0; k < metaEls.length; k++) {
      try {
        var c = metaEls[k].getAttribute('content');
        if (c) { out.metaGenerators.push(String(c)); }
      } catch (e4) { /* skip one meta */ }
    }
  } catch (e) { /* leave metaGenerators as-is */ }

  // --- window globals (existence only, never invoked) --------------------
  for (var g = 0; g < GLOBAL_NAMES.length; g++) {
    var name = GLOBAL_NAMES[g];
    try {
      // typeof on a bracket access is the safest possible probe: it does not
      // throw for undeclared identifiers and does not call getters' side-logic
      // beyond value resolution, which we immediately discard.
      if (typeof window[name] !== 'undefined') {
        out.globals[name] = true;
      }
    } catch (eg) {
      // A throwing getter or exotic proxy — treat as "not detected".
    }
  }

  // --- document.cookie names (non-HttpOnly only) -------------------------
  try {
    var cookieStr = '';
    try { cookieStr = String(document.cookie || ''); } catch (ec) { cookieStr = ''; }
    if (cookieStr) {
      var parts = cookieStr.split(';');
      for (var p = 0; p < parts.length; p++) {
        var eq = parts[p].indexOf('=');
        var cname = (eq >= 0 ? parts[p].slice(0, eq) : parts[p]);
        cname = cname.replace(/^\s+|\s+$/g, '');
        if (cname) { out.cookies.push(cname); }
      }
    }
  } catch (e) { /* leave cookies as-is */ }

  return out;
}

// Expose for service-worker importScripts (background.js reads the function
// object off self/globalThis) and for any test harness. In the injected page
// context this assignment is harmless.
try {
  if (typeof self !== 'undefined') { self.collectSignalsInPage = collectSignalsInPage; }
} catch (e) { /* ignore */ }
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { collectSignalsInPage: collectSignalsInPage };
}
