# StackPeek — Build Decisions

This log records every non-obvious choice made during the build, including
defaults picked where the spec left something genuinely unspecified.

## Architecture

- **Manifest V3, vanilla JS, no build step.** The folder in `stackpeek/` loads
  unpacked at `chrome://extensions` and runs as-is. No bundler, transpiler, or
  package manager is involved.
- **On-demand detection only.** Detection runs when the user clicks the button
  in the popup — never automatically on page load. This keeps the extension
  fast and non-invasive, and lets us avoid broad host permissions.
- **Permissions:** `activeTab`, `scripting`, `storage` only. No
  `host_permissions`, no `<all_urls>`. The `activeTab` grant (activated by the
  user's click on the toolbar icon → popup → button) authorizes a one-time
  script injection into the current tab. This is the entire permission surface.
- **Injection model.** `background.js` (the service worker) receives a message
  from the popup, then calls `chrome.scripting.executeScript` to run two
  self-contained functions in the page: the signal collector
  (`inject/collect-signals.js`'s function body) and the same-origin header
  fetch. Results are returned to the popup, which runs the detection engine and
  renders.

  - **DECISION:** The detection engine (`engine/detect.js`) and fingerprint DB
    (`data/fingerprints.js`) run in the **popup context**, not the page. Reason:
    keeping the heavy matching logic out of the injected code minimizes what we
    execute in arbitrary pages (smaller attack/perf surface) and keeps the
    injected payload to pure, self-contained DOM extraction. The injected
    functions must be self-contained (no closures), which is easy for
    extraction but awkward for a 60+ entry database + engine. So the page
    returns raw signals; the popup scores them.

## Signal collection

- **Self-contained injected function.** `collectSignalsInPage()` references no
  outer-scope variables and is serialized by `chrome.scripting.executeScript`.
  Everything it needs is defined inside it.
- **Every check guarded.** Each extraction step is wrapped in try/catch and all
  global lookups use `typeof window.X !== 'undefined'` before any property
  access. A single failing check degrades to "not detected" and never throws.
- **DECISION — global variable probing.** We only test for *existence* of known
  globals (and, for a few, a shallow `typeof` on one nested property that is
  safe, e.g. `window.dataLayer` being an array). We never invoke functions or
  deeply traverse unknown objects. This guarantees no page-state mutation and no
  throwing on exotic pages (e.g. pages that define `window.ga` as a getter that
  throws — the `typeof` guard short-circuits before we touch it).
- **HTML cap.** `document.documentElement.outerHTML` can be multi-MB on some
  pages. **DECISION:** we cap the serialized HTML we return to the popup at
  2,000,000 characters (2 MB) to keep the message payload and regex passes fast.
  Meta/generator/comment signatures live in `<head>` and early body, so the cap
  practically never drops a real signal. Documented in README.

## Header reading

- **Same-origin self-fetch.** `engine/headers.js` performs
  `fetch(location.href, { method: 'GET' })` from the page context (injected),
  reading `Server`, `X-Powered-By`, `X-Generator`, `X-Drupal-*`, `Via`,
  `X-Shopify-*`, etc. from the response headers.
- **DECISION — GET not HEAD.** Some servers/CDNs behave differently for HEAD
  (or disallow it), and a GET to the already-loaded same-origin URL is nearly
  always served from cache. We do not read the body. If the fetch fails
  (opaque, CORS on a redirect, offline), header signals are simply absent and
  detection falls back to DOM/script/global signals.
- **Honest limitation.** `Set-Cookie` and any `HttpOnly` cookies are **not**
  readable from JS by design. `fetch` does not expose `Set-Cookie` to script.
  We therefore rely on `document.cookie` (non-HttpOnly names only) plus response
  headers the Fetch API *does* expose. This is stated plainly in the README —
  we never pretend to read HttpOnly cookies.

## Scoring

- **Per-signal weights.** Each fingerprint entry assigns a weight to each of its
  patterns. Meta-generator matches carry the highest weight (near-certain);
  weak heuristics (generic class-name conventions, CSS framework guesses) carry
  low weight.
- **DECISION — normalization.** Raw summed weight per technology is normalized
  to a 0–100 confidence via `min(100, round(rawScore))`. Weights are chosen so
  that a single strong signal (e.g. meta generator = 90) already clears the
  display threshold, and corroborating signals push toward 100. This is simpler
  and more predictable than a softmax and produces intuitive numbers.
- **Threshold = 25.** Technologies scoring below 25 are hidden to avoid noise.
- **Multi-match is expected.** WordPress + Elementor + WooCommerce + GA4 + GTM
  can all be reported simultaneously; nothing is mutually exclusive except where
  a fingerprint explicitly `implies` a parent (e.g. Elementor implies WordPress
  — we boost, never suppress).

## UI

- **DECISION — plain popup, no Shadow DOM.** The spec mentions Shadow DOM but
  notes "the popup itself is already isolated." An extension popup document is a
  fully isolated top-level document with its own CSS scope, so a Shadow root
  adds nothing here. We use a normal popup document with scoped class names
  (`.sp-` prefix) for consistency. Documented as an intentional deviation.
- **Two tabs:** Results and History. Results shows grouped categories with
  confidence bars and click-to-expand match reasons. History shows the last 20
  detected sites (domain, top CMS/framework, date) as read-only snapshots.
- **Copy summary** builds a one-line-per-category plain-text block.

## Storage

- **`chrome.storage.local`** holds the rolling history (max 20, newest first).
  No sync storage (avoids surfacing browsing history across a user's devices —
  privacy-first). No external persistence, ever.

## Privacy

- Zero external requests except the single same-origin self-fetch for headers on
  the current page. Zero telemetry, zero analytics, zero account, zero lookup
  limits. This is the core value proposition versus commercial incumbents and is
  stated in the popup footer and the README.

## Icons

- **DECISION — generated placeholder PNGs.** Real 16/32/48/128 PNG icons are
  generated at build time (a simple magnifying-glass-over-layers mark) so the
  extension loads without missing-asset warnings. They are committed as binary
  PNGs. Swap for branded art before Web Store submission.
