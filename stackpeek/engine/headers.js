/*
 * StackPeek — Same-origin HTTP response header reader.
 *
 * `collectHeadersInPage()` is executed IN THE PAGE via
 * chrome.scripting.executeScript. Like the signal collector it is fully
 * SELF-CONTAINED (no outer-scope references) and never throws — on any failure
 * it resolves to `{ headers: {}, ok: false, note: <reason> }` so the detection
 * engine simply proceeds without header signals.
 *
 * How it works:
 *   We issue a single same-origin GET to the page's own URL. Because it is
 *   same-origin, the browser exposes the full set of response headers to
 *   script (a cross-origin fetch would hide all but the CORS-safelisted ones).
 *   The request is almost always served from the HTTP cache since the page is
 *   already loaded; we never read the body.
 *
 * DOCUMENTED LIMITATIONS (see README):
 *   - `Set-Cookie` is NEVER exposed to `fetch()`/XHR by the platform, so
 *     HttpOnly cookies (wordpress_logged_in, PHPSESSID set HttpOnly, __cf_bm,
 *     _shopify_s HttpOnly variants, etc.) cannot be read here. StackPeek relies
 *     on JS-readable `document.cookie` names plus the response headers the Fetch
 *     API does expose. We do not pretend otherwise.
 *   - Some sites route the document through a redirect whose final response is
 *     opaque, or set a strict CSP `connect-src` that blocks the self-fetch. In
 *     those cases header signals are simply absent; DOM/script/global signals
 *     still drive detection.
 *   - Headers stripped by an intermediary proxy (or not sent on a cached 304)
 *     won't appear. Header detection is therefore corroborating, not required.
 *
 * Returns (structured-clone-safe):
 *   { headers: { [lowerCaseName]: value }, ok: boolean, note?: string }
 */
function collectHeadersInPage() {
  'use strict';
  return new Promise(function (resolve) {
    var done = false;
    function finish(result) {
      if (done) { return; }
      done = true;
      resolve(result);
    }

    // Hard timeout so a hung request never blocks the scan.
    var timer = null;
    try {
      timer = setTimeout(function () {
        finish({ headers: {}, ok: false, note: 'header fetch timed out' });
      }, 3000);
    } catch (e) { /* setTimeout unavailable is impossible in a page, ignore */ }

    try {
      var href = location.href;
      fetch(href, {
        method: 'GET',
        credentials: 'include',
        cache: 'force-cache',
        redirect: 'follow'
      }).then(function (resp) {
        var map = {};
        try {
          resp.headers.forEach(function (value, key) {
            try { map[String(key).toLowerCase()] = String(value); } catch (e1) { /* skip one */ }
          });
        } catch (e2) { /* headers not iterable — leave map empty */ }
        if (timer) { try { clearTimeout(timer); } catch (e3) {} }
        finish({ headers: map, ok: true });
      }).catch(function (err) {
        if (timer) { try { clearTimeout(timer); } catch (e4) {} }
        var reason = 'header fetch failed';
        try { if (err && err.message) { reason = 'header fetch failed: ' + err.message; } } catch (e5) {}
        finish({ headers: {}, ok: false, note: reason });
      });
    } catch (eOuter) {
      if (timer) { try { clearTimeout(timer); } catch (e6) {} }
      finish({ headers: {}, ok: false, note: 'header fetch threw synchronously' });
    }
  });
}

try {
  if (typeof self !== 'undefined') { self.collectHeadersInPage = collectHeadersInPage; }
} catch (e) { /* ignore */ }
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { collectHeadersInPage: collectHeadersInPage };
}
