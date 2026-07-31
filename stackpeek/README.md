# StackPeek — Website Tech Stack Detector

**See what any website is built on — CMS, frameworks, analytics, ad tech,
hosting, page builders — with one click.**

No account. No lookup limits. No monthly cap. No telemetry. StackPeek runs
entirely in your browser against the page you're already looking at. **100%
local.** That's the whole point: the commercial incumbents gate detection behind
sign-ups and per-lookup quotas — StackPeek never does, because there is no server
to meter.

---

## Install (load unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the **`stackpeek/`** folder (the one
   containing `manifest.json`).
5. Pin the StackPeek icon to your toolbar.
6. Navigate to any website and **click the StackPeek icon** — a **side panel**
   docks on the right and detects the current page automatically. It stays open
   while you browse; hit **Rescan** (↻) after navigating, or click the icon
   again on any page.

StackPeek opens as a clean, light **Chrome side panel** with real technology
logos, versions, confidence, and click-to-expand evidence for every detection.

No build step, no `npm install`, no bundler. The folder loads and runs as-is
(Manifest V3, vanilla JavaScript). Permissions: `activeTab`, `scripting`,
`storage`, `sidePanel` — no host permissions.

---

## What it detects

**152 real fingerprint entries** across 23 categories (see
`data/fingerprints.js`). This database — its breadth and accuracy — is the
product.

| Category | Count | Examples |
|---|---|---|
| **CMS** | 16 | WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, Ghost, Duda, BigCommerce, Magento, HubSpot, Contentful, Sanity, Craft, TYPO3 |
| **Ecommerce** | 6 | WooCommerce, Klaviyo, Yotpo, Judge.me, Recharge, Stamped.io |
| **Framework** | 15 | React, Vue, Next.js, Nuxt, Angular, Svelte, jQuery, Gatsby, Alpine, Ember, Preact, Backbone, Remix, Astro, SolidJS |
| **UI Framework** | 9 | Bootstrap, Tailwind CSS, Material UI, Emotion, styled-components, Ant Design, Chakra UI, Bulma, Foundation |
| **JS Library** | 10 | Lodash, Underscore, Moment.js, Axios, GSAP, Swiper, Slick, Modernizr, D3.js, Popper.js |
| **Page Builder** | 4 | Elementor, Divi, WPBakery, Beaver Builder |
| **Analytics** | 12 | GA4, Universal Analytics, Hotjar, Clarity, Mixpanel, Segment, Amplitude, Plausible, Matomo, Fathom, Heap, Yandex Metrica |
| **A/B Testing** | 3 | Optimizely, VWO, Google Optimize |
| **Tag Manager** | 3 | Google Tag Manager, Tealium, Adobe Experience/DTM |
| **Ad Tech** | 11 | AdSense, Meta Pixel, Criteo, Taboola, Outbrain, Google Publisher Tag, X Pixel, LinkedIn, TikTok, Pinterest, Snapchat |
| **Consent / Privacy** | 4 | OneTrust, Cookiebot, Usercentrics, Osano |
| **Monitoring** | 4 | Sentry, New Relic, LogRocket, Datadog RUM |
| **Chat / Support** | 7 | Intercom, Zendesk, Drift, Tawk.to, Crisp, LiveChat, Freshchat |
| **Payments** | 6 | Stripe, PayPal, Razorpay, Braintree, Square, Adyen |
| **Video** | 3 | YouTube, Vimeo, Wistia |
| **Maps** | 3 | Google Maps, Mapbox, Leaflet |
| **Fonts** | 3 | Google Fonts, Adobe Fonts (Typekit), Font Awesome |
| **CAPTCHA / Security** | 3 | reCAPTCHA, hCaptcha, Cloudflare Turnstile |
| **Security / WAF** | 4 | HSTS, Imperva, Sucuri, Akamai |
| **CDN / Hosting** | 10 | Cloudflare, Vercel, Netlify, CloudFront, Fastly, jsDelivr, unpkg, cdnjs, Google Hosted Libraries, GitHub Pages |
| **Web Server** | 6 | Nginx, Apache, IIS, LiteSpeed, OpenResty, Caddy |
| **Programming Language** | 5 | PHP, ASP.NET, Ruby on Rails, Java, Express |
| **Miscellaneous** | 5 | Open Graph, PWA, RSS/Atom, OneSignal, Mailchimp |

**Version detection:** where a version is exposed (e.g. `jquery-3.6.3.min.js`,
`Server: nginx/1.24.0`, `<meta generator="WordPress 6.5">`, GA4/GTM property
IDs), StackPeek captures and shows it as a badge next to the name.

GA4 vs. Universal Analytics are distinguished (the `G-` vs. `UA-` convention).
WordPress-only technologies (Elementor, Divi, WooCommerce, …) **imply**
WordPress — a page reporting *WordPress + Elementor + WooCommerce + GA4 + GTM*
simultaneously is correct, not a conflict.

**Precision:** bare product-name-as-word matches are weighted below the display
threshold, so a page merely *mentioning* a technology in its text (e.g. the word
"recharge" on a banking site) never produces a false detection — a real signal
(CDN host, global variable, or dedicated header) is always required to surface a
result.

---

## How detection works

Detection is **on-demand** — it runs only when you click the button, never
automatically on page load. This keeps it fast and non-invasive, and lets the
extension work with just `activeTab` (no broad host permissions).

When you click **Detect stack on this page**, the background service worker
injects two small, self-contained functions into the current tab and collects
**seven signal sources**:

1. **HTML source patterns** — regex/string matches against the page's
   `outerHTML`: `<meta name="generator">` tags (checked first, weighted
   highest — a near-certain signal), comment markers, class/ID conventions.
2. **Script `src` patterns** — every `<script src>` URL, matched against known
   CDN paths and bundle-naming conventions (`/wp-content/`, `cdn.shopify.com`,
   `/_next/static/`, `static.hotjar.com`, `googletagmanager.com/gtm.js`, …).
3. **Link / stylesheet `href` patterns** — theme paths and framework
   signatures. Weighted low (weak signals).
4. **Global JS variables** — existence checks against `window` for known
   globals (`window.Shopify`, `window.__NEXT_DATA__`, `window.__NUXT__`,
   `window.dataLayer`, `window.fbq`, `window.elementorFrontend`, …). Every
   probe is a `typeof window[name] !== 'undefined'` guard — never a direct
   property access that could throw, never a function call.
5. **HTTP response headers** — read via a **same-origin self-`fetch`** of the
   current page (`Server`, `X-Powered-By`, `X-Generator`, `X-Drupal-Cache`,
   `cf-ray`, `x-vercel-id`, `x-shopid`, …). See *Limitations* below.
6. **Cookie names** — `document.cookie` parsed for known non-HttpOnly
   name patterns (`woocommerce_*`, `wp-settings-*`, `_shopify_*`, …).
7. **DOM structure fingerprints** — page-builder wrapper markers
   (`elementor-*`, `et_pb_*`, Webflow's `w-*` / `data-wf-page`, Squarespace's
   `sqs-*`). These live in `outerHTML`, so they're matched in the HTML pass.

### Scoring & confidence

- Each matched signal contributes its weight. Within one signal type we take the
  **max** matched weight (overlapping patterns don't stack); across signal types
  we **sum**. The total is normalized to a **0–100 confidence** via
  `min(100, round(sum))`.
- Meta-generator and dedicated response headers carry near-certain weight
  (85–95); unique globals and CDN script paths are strong (65–85); unique
  cookies and DOM markers are solid (50–70); generic heuristics are weak
  (10–45).
- Only technologies scoring **≥ 25** are shown, sorted by confidence within each
  category. If nothing crosses the threshold, StackPeek says so honestly rather
  than guessing.
- Click any detected item to expand **which signals matched** ("matched: meta
  generator tag, script src pattern, JS global: window.Shopify") — full
  transparency into *why* it was detected.

### Performance

All regexes are **compiled once** at first scan and cached on the fingerprint
objects (never recompiled). Signals are pre-joined once per scan, so each
pattern is a single string test — no per-fingerprint DOM re-scan. A typical page
(moderate HTML, ~20 scripts, all 152 fingerprints) scores in a couple of
milliseconds; the end-to-end scan (including injection) completes well under a
second and never freezes the tab. The popup shows the measured scan time.

---

## Limitations (stated honestly)

- **`Set-Cookie` / HttpOnly cookies are not readable.** The Fetch API never
  exposes the `Set-Cookie` response header to JavaScript, and HttpOnly cookies
  (`wordpress_logged_in_*`, HttpOnly `PHPSESSID`, `__cf_bm`, HttpOnly Shopify
  session cookies, …) are invisible to `document.cookie` by design. StackPeek
  reads only the JS-readable non-HttpOnly cookie names plus the response headers
  the Fetch API *does* expose. We do **not** pretend to see more.
- **Header reading can be blocked.** Some pages sit behind a redirect whose final
  response is opaque, or set a strict CSP `connect-src` that blocks the
  self-fetch. When that happens, header signals are simply absent and detection
  falls back to DOM/script/global signals — the popup notes when headers weren't
  readable. Header detection is corroborating, never required.
- **CDN/hosting hints are observable-only.** Cloudflare, Vercel, Netlify, and
  CloudFront are inferred from headers/scripts that *may* be present; absence of
  a hint is not proof of absence, and their confidence weights reflect that.
- **The page must be a normal web page.** Browser-internal pages
  (`chrome://…`), the Web Store, and other extensions cannot be scanned —
  StackPeek says so instead of failing silently.
- **Fingerprints drift over time.** Vendors change CDN paths, globals, and
  markers. The database reflects current, real-world signatures as of this
  release; keeping it accurate is ongoing maintenance.

---

## Permissions & privacy

- **Permissions:** `activeTab`, `scripting`, `storage` — nothing else. No
  `host_permissions`, no `<all_urls>`, no content scripts registered on page
  load. Injection happens only after your click, into the current tab only.
- **Network:** exactly **one** request ever leaves your browser because of
  StackPeek — the same-origin self-`fetch` of the current page, to read its own
  response headers. There are **zero** requests to any StackPeek server (there
  is none), zero analytics, zero telemetry.
- **Storage:** detection history (last 20 sites) is kept in
  `chrome.storage.local` — on this device only, never synced across devices,
  never uploaded. Clear it any time from the History tab.

---

## Using it

- **Detect** — click the button. Results appear grouped by category with a
  confidence bar per technology.
- **Expand** — click any item to see the matched signals.
- **Copy summary** — produces a clean, paste-ready block for a prospecting sheet
  or client note, e.g.:

  ```
  example.com — detected by StackPeek
  CMS: WordPress (95%)
  Ecommerce: WooCommerce (88%)
  Page Builder: Elementor (90%)
  Analytics: Google Analytics 4 (80%), Google Tag Manager (85%)
  (no account, no lookup limits — StackPeek, 100% local)
  ```

- **History** — the last 20 detected sites (domain, top CMS/framework, date).
  Each row is a stored snapshot; clicking it re-renders that exact result — it
  **never** re-fetches or re-scans.

---

## Acceptance tests

Walk through these after loading unpacked:

1. **Zero console errors.** Open DevTools on any page, run a scan → no errors
   from the popup, background worker, or injected code.
2. **WordPress + Elementor site** → WordPress and Elementor both detected with
   high confidence; WooCommerce also flagged if present; expanding shows
   meta-generator + script-src evidence. Elementor/WooCommerce imply WordPress.
3. **Shopify store** → Shopify detected via `window.Shopify` + `cdn.shopify.com`
   script pattern; common apps (Klaviyo, Yotpo, Judge.me) detected if present.
4. **Next.js site** → detected via `window.__NEXT_DATA__` + `/_next/static/`
   bundle pattern (and the `x-powered-by: Next.js` header where present).
5. **Custom / unusual site with no recognizable stack** → honest "Couldn't
   confidently identify the stack — may be a custom build" state, no false
   positives.
6. **Copy summary** → produces a clean, readable text block (format above).
7. **History** logs the last 20 sites; clicking a row shows the snapshot and
   does **not** re-fetch.
8. **Speed** → the popup reports a scan time well under a second on a normal
   page; the tab never freezes.

---

## File structure

```
stackpeek/
├── manifest.json                 # MV3, activeTab + scripting + storage only
├── background.js                 # injection orchestration (service worker)
├── inject/collect-signals.js     # self-contained page signal extractor
├── engine/
│   ├── detect.js                 # scoring/matching engine, confidence, implies
│   └── headers.js                # same-origin self-fetch header reader
├── data/fingerprints.js          # 152-entry fingerprint database (the core IP)
├── popup/
│   ├── popup.html / popup.css / popup.js
│   └── tabs/{results.js, history.js}
├── shared/{storage.js, textutil.js}
├── icons/{16,32,48,128}
├── DECISIONS.md
└── README.md
```

---

## Chrome Web Store listing (draft)

**Title:** StackPeek — Website Tech Stack Detector

**Summary (132 chars):**
> No lookup limits, no account. See any site's CMS, framework, analytics & ad
> tech in one click. 100% local, private, free.

**Description:** _(written as prose — no brand-list keyword stuffing, which the
Web Store rejects as excessive metadata under "Spam and Placement in the Store")_

> See what any website is built on — in one click.
>
> StackPeek reveals a website's technology stack in a clean side panel: its
> content management system, front-end framework, e-commerce platform,
> analytics, advertising tools, hosting, and more. Each detection shows the
> technology's logo, its version where available, and the exact evidence behind
> it.
>
> Built for SEO and marketing professionals researching prospects and
> competitors, developers curious about how a site is built, and agencies
> qualifying leads.
>
> WHY STACKPEEK IS DIFFERENT
> - 100% local. Detection runs against the page you're already viewing, inside
>   your browser. The only network request it makes is reading the current
>   page's own response headers. There's no server, no account, and no
>   telemetry.
> - No lookup limits. Because there's nothing to meter, you can check as many
>   sites as you like — free.
> - Transparent. Click any result to see which signals matched, so you can trust
>   what you're seeing.
> - Practical. Copy a clean summary of a site's stack for your notes, and keep a
>   local history of the sites you've checked — stored only on your device.
>
> HOW IT WORKS
> Detection runs only when you click the StackPeek icon — never automatically.
> StackPeek reads the current page's markup, scripts, and response headers,
> matches them against its built-in database of technology signatures, and shows
> the results grouped by category. Everything happens on your device.
>
> PRIVATE BY DESIGN
> StackPeek requests only the minimal permissions needed to inspect the tab you
> choose to scan. It has no access to other sites, collects no personal data,
> and sends nothing anywhere.
>
> Free. Private. Unlimited.
