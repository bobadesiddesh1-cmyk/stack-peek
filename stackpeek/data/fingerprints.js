/*
 * StackPeek — Fingerprint database (the core IP).
 *
 * ~155 real technology fingerprints across 22 categories. Each entry declares
 * per-signal-type match patterns with a weight; the engine (engine/detect.js)
 * sums matched weights per technology and normalizes to a 0-100 confidence.
 *
 * Weighting philosophy (tightened for precision — see the false-positive fixes
 * below):
 *   - meta generator / dedicated response header  = near-certain (85-95)
 *   - unique global var / unique CDN script host   = strong        (65-85)
 *   - unique cookie / unique DOM marker            = solid         (50-70)
 *   - shared/DOM heuristic                         = weak          (30-45)
 *   - bare product word in HTML                    = trace  (<=24)  (never
 *     enough ALONE to cross the 25 display threshold — it only corroborates a
 *     stronger signal). This is the rule that kills noise like "recharge" text
 *     on a bank site or "amplitude" in prose triggering a detection.
 *
 * Precision fixes baked in (were false positives before):
 *   - Recharge: requires the `rechargecdn` host, not the bare word "recharge".
 *   - Gatsby:   dropped `framework-<hash>.js` (Next.js emits that too); relies
 *               on `___gatsby` markers + `/page-data/`.
 *   - Google Publisher Tag: requires `googletag.pubads/cmd/defineSlot` or the
 *               gpt.js host, not the bare substring "googletag" (which lives
 *               inside "googletagmanager.com").
 *
 * Pattern types per entry.patterns:
 *   html   : [{ re, weight }]   tested against the (capped) page outerHTML.
 *   script : [{ re, weight }]   tested against joined <script src> URLs.
 *   link   : [{ re, weight }]   tested against joined <link href> URLs.
 *   meta   : [{ re, weight }]   tested against <meta name="generator"> content.
 *   global : [{ name, weight }] existence of window[name].
 *   cookie : [{ re, weight }]   tested against joined document.cookie names.
 *   header : [{ name, re?, weight }] response header present (+ optional value).
 *
 * entry.version (optional): [{ src, re, header? }] — src in
 *   'script'|'html'|'meta'|'header'. `re` has ONE capture group with the
 *   version. First non-empty match wins; shown as a badge in the popup.
 *
 * `re` strings are compiled once (case-insensitive) at load time in detect.js.
 * `implies` lists technologies this one strongly indicates (Elementor => WP):
 *   the engine boosts/surfaces parents, never suppresses siblings.
 */
(function () {
  'use strict';

  var CATEGORY_ORDER = [
    'CMS',
    'Ecommerce',
    'Framework',
    'UI Framework',
    'JS Library',
    'Page Builder',
    'Analytics',
    'A/B Testing',
    'Tag Manager',
    'Ad Tech',
    'Consent / Privacy',
    'Monitoring',
    'Chat / Support',
    'Payments',
    'Video',
    'Maps',
    'Fonts',
    'CAPTCHA / Security',
    'Security / WAF',
    'CDN / Hosting',
    'Web Server',
    'Programming Language',
    'Miscellaneous'
  ];

  var FINGERPRINTS = [
    /* ---------------------------------------------------------------- CMS */
    {
      name: 'WordPress', category: 'CMS',
      version: [{ src: 'meta', re: 'WordPress\\s+([\\d.]+)' }],
      patterns: {
        meta: [{ re: 'WordPress', weight: 95 }],
        html: [{ re: '/wp-content/', weight: 70 }, { re: '/wp-includes/', weight: 60 }, { re: '/wp-json/', weight: 40 }],
        script: [{ re: '/wp-(content|includes)/', weight: 70 }],
        link: [{ re: '/wp-content/', weight: 55 }],
        cookie: [{ re: 'wordpress_|wp-settings-', weight: 60 }],
        header: [{ name: 'link', re: 'api\\.w\\.org', weight: 60 }]
      }
    },
    {
      name: 'Shopify', category: 'CMS',
      patterns: {
        global: [{ name: 'Shopify', weight: 85 }],
        script: [{ re: 'cdn\\.shopify(cloud)?\\.com|/cdn/shop/', weight: 80 }],
        html: [{ re: 'cdn\\.shopify\\.com|Shopify\\.theme|shopify-section|shopify-features', weight: 55 }],
        cookie: [{ re: '_shopify_|_secure_session_id|cart_currency', weight: 55 }],
        header: [{ name: 'x-shopid', weight: 80 }, { name: 'x-shopify-stage', weight: 75 }, { name: 'x-sorting-hat-shopid', weight: 75 }]
      }
    },
    {
      name: 'Wix', category: 'CMS',
      patterns: {
        meta: [{ re: 'Wix\\.com Website Builder', weight: 90 }],
        global: [{ name: 'wixBiSession', weight: 70 }, { name: 'wixPerformanceMeasurements', weight: 65 }],
        script: [{ re: 'static\\.parastorage\\.com|static\\.wixstatic\\.com', weight: 80 }],
        html: [{ re: 'wix-warmup-data|_wixCIDX|wixstatic\\.com', weight: 50 }],
        header: [{ name: 'x-wix-request-id', weight: 80 }]
      }
    },
    {
      name: 'Squarespace', category: 'CMS',
      patterns: {
        meta: [{ re: 'Squarespace', weight: 90 }],
        script: [{ re: 'static1?\\.squarespace\\.com|squarespace\\.com/universal', weight: 75 }],
        html: [{ re: 'Static\\.SQUARESPACE_CONTEXT|static1\\.squarespace|sqs-block', weight: 55 }]
      }
    },
    {
      name: 'Webflow', category: 'CMS',
      patterns: {
        meta: [{ re: 'Webflow', weight: 90 }],
        global: [{ name: 'Webflow', weight: 75 }],
        html: [{ re: 'data-wf-page|data-wf-site', weight: 75 }, { re: 'class="[^"]*\\bw-(nav|container|row|col|button|form)\\b', weight: 40 }],
        script: [{ re: 'assets(-global)?\\.website-files\\.com|webflow\\.[a-z0-9]+\\.js', weight: 70 }]
      }
    },
    {
      name: 'Joomla', category: 'CMS',
      version: [{ src: 'meta', re: 'Joomla!?\\s*-?\\s*([\\d.]+)' }],
      patterns: {
        meta: [{ re: 'Joomla', weight: 90 }],
        html: [{ re: '/media/jui/|option=com_|/components/com_', weight: 55 }],
        script: [{ re: '/media/system/js/|/media/jui/|/media/vendor/', weight: 65 }]
      }
    },
    {
      name: 'Drupal', category: 'CMS',
      version: [{ src: 'meta', re: 'Drupal\\s+([\\d.]+)' }, { src: 'header', header: 'x-generator', re: 'Drupal\\s+([\\d.]+)' }],
      patterns: {
        meta: [{ re: 'Drupal', weight: 88 }],
        global: [{ name: 'Drupal', weight: 80 }],
        html: [{ re: 'sites/(all|default)/|data-drupal-|drupal-settings-json', weight: 55 }],
        script: [{ re: '/sites/(all|default)/|/core/misc/drupal', weight: 65 }],
        header: [{ name: 'x-generator', re: 'Drupal', weight: 85 }, { name: 'x-drupal-cache', weight: 80 }, { name: 'x-drupal-dynamic-cache', weight: 78 }]
      }
    },
    {
      name: 'Ghost', category: 'CMS',
      version: [{ src: 'meta', re: 'Ghost\\s+([\\d.]+)' }],
      patterns: {
        meta: [{ re: 'Ghost', weight: 88 }],
        html: [{ re: 'content/images/|ghost-url|data-ghost|gh-canvas', weight: 40 }],
        script: [{ re: '/ghost/portal|/ghost/assets/|sodo-search', weight: 55 }]
      }
    },
    {
      name: 'Duda', category: 'CMS',
      patterns: {
        meta: [{ re: 'Duda Website Builder|Duda', weight: 78 }],
        script: [{ re: '(irp|lirp|static)\\.cdn-website\\.com|d1csarkz8obe9u', weight: 70 }],
        html: [{ re: 'dmRespRow|dmBody|_duda_|cdn-website\\.com', weight: 50 }]
      }
    },
    {
      name: 'BigCommerce', category: 'CMS',
      patterns: {
        global: [{ name: 'BCData', weight: 85 }],
        script: [{ re: 'cdn\\d*\\.bigcommerce\\.com|/stencil/', weight: 75 }],
        html: [{ re: 'bigcommerce\\.com|data-stencil-', weight: 45 }]
      }
    },
    {
      name: 'Magento / Adobe Commerce', category: 'CMS',
      patterns: {
        html: [{ re: 'Magento_|data-mage-init|mage/cookies|/static/version\\d+/', weight: 60 }],
        script: [{ re: '/static/(frontend|version)|mage/|requirejs/require\\.js', weight: 50 }],
        cookie: [{ re: 'mage-cache-sessid|X-Magento-Vary|form_key', weight: 55 }],
        header: [{ name: 'x-magento-cache-debug', weight: 80 }]
      }
    },
    {
      name: 'HubSpot CMS', category: 'CMS',
      patterns: {
        meta: [{ re: 'HubSpot', weight: 85 }],
        global: [{ name: '_hsq', weight: 72 }, { name: 'hbspt', weight: 72 }],
        script: [{ re: 'js\\.hs-scripts\\.com|js\\.hs-analytics\\.net|js\\.hsforms\\.net|hs-banner\\.com', weight: 70 }],
        html: [{ re: 'hs-scripts|_hsenc|hsforms', weight: 35 }]
      }
    },
    {
      name: 'Contentful', category: 'CMS',
      patterns: {
        script: [{ re: '(images|assets|videos)\\.ctfassets\\.net|cdn\\.contentful', weight: 60 }],
        html: [{ re: 'ctfassets\\.net', weight: 40 }]
      }
    },
    {
      name: 'Sanity', category: 'CMS',
      patterns: { script: [{ re: 'cdn\\.sanity\\.io', weight: 60 }], html: [{ re: 'cdn\\.sanity\\.io', weight: 40 }] }
    },
    {
      name: 'Craft CMS', category: 'CMS',
      patterns: {
        header: [{ name: 'x-powered-by', re: 'Craft CMS', weight: 85 }],
        html: [{ re: '/cpresources/', weight: 45 }],
        cookie: [{ re: 'CraftSessionId', weight: 65 }]
      }
    },
    {
      name: 'TYPO3', category: 'CMS',
      patterns: {
        meta: [{ re: 'TYPO3', weight: 88 }],
        html: [{ re: 'typo3temp|typo3conf|/typo3/', weight: 55 }],
        script: [{ re: '/typo3conf/|/typo3temp/', weight: 55 }]
      }
    },

    /* -------------------------------------------------------- Ecommerce */
    {
      name: 'WooCommerce', category: 'Ecommerce', implies: ['WordPress'],
      patterns: {
        global: [{ name: 'wc_add_to_cart_params', weight: 55 }, { name: 'woocommerce_params', weight: 55 }],
        html: [{ re: 'woocommerce-page|wc-block-|wc_fragments|class="[^"]*woocommerce', weight: 70 }],
        script: [{ re: '/plugins/woocommerce/|woocommerce/assets', weight: 70 }],
        cookie: [{ re: 'woocommerce_|wp_woocommerce_session_', weight: 65 }]
      }
    },
    {
      name: 'Klaviyo', category: 'Ecommerce',
      patterns: {
        global: [{ name: 'klaviyo', weight: 65 }, { name: '_klOnsite', weight: 62 }],
        script: [{ re: 'static\\.klaviyo\\.com|a\\.klaviyo\\.com|klaviyo\\.js', weight: 80 }]
      }
    },
    {
      name: 'Yotpo', category: 'Ecommerce',
      patterns: {
        global: [{ name: 'yotpo', weight: 58 }],
        script: [{ re: 'staticw2\\.yotpo\\.com|cdn-loyalty\\.yotpo\\.com|cdn-widgetsrepository\\.yotpo\\.com', weight: 75 }]
      }
    },
    {
      name: 'Judge.me', category: 'Ecommerce',
      patterns: { script: [{ re: 'cdn\\.judge\\.me', weight: 75 }], html: [{ re: 'jdgm-widget|judge\\.me', weight: 50 }] }
    },
    {
      name: 'Recharge', category: 'Ecommerce',
      patterns: { script: [{ re: 'static\\.rechargecdn\\.com|rechargepayments', weight: 75 }], html: [{ re: 'rechargecdn\\.com', weight: 45 }] }
    },
    {
      name: 'Stamped.io', category: 'Ecommerce',
      patterns: { script: [{ re: 'cdn-stamped-io|stamped\\.io/js', weight: 72 }], html: [{ re: 'stamped-io|data-widget-stamped', weight: 45 }] }
    },

    /* -------------------------------------------------------- Framework */
    {
      name: 'React', category: 'Framework',
      patterns: {
        global: [{ name: 'React', weight: 45 }],
        html: [{ re: 'data-reactroot|data-reactid|_reactListening|__reactContainer', weight: 55 }],
        script: [{ re: 'react(-dom)?(\\.production)?(\\.min)?\\.js|/react@\\d|/react/umd/', weight: 55 }]
      }
    },
    {
      name: 'Vue.js', category: 'Framework',
      version: [{ src: 'script', re: 'vue@([\\d.]+)' }],
      patterns: {
        global: [{ name: 'Vue', weight: 55 }, { name: '__VUE__', weight: 50 }],
        html: [{ re: 'data-v-[a-f0-9]{8}|data-server-rendered|v-cloak', weight: 55 }],
        script: [{ re: 'vue(@|\\.)(runtime|global|\\d)|vue\\.(min|runtime)|/vue@\\d', weight: 55 }]
      }
    },
    {
      name: 'Next.js', category: 'Framework', implies: ['React'],
      version: [{ src: 'header', header: 'x-powered-by', re: 'Next\\.js\\s*([\\d.]+)' }],
      patterns: {
        global: [{ name: '__NEXT_DATA__', weight: 90 }],
        html: [{ re: 'id="__next"|/_next/static/', weight: 75 }],
        script: [{ re: '/_next/static/', weight: 80 }],
        header: [{ name: 'x-powered-by', re: 'Next\\.js', weight: 85 }]
      }
    },
    {
      name: 'Nuxt.js', category: 'Framework', implies: ['Vue.js'],
      patterns: {
        global: [{ name: '__NUXT__', weight: 90 }],
        html: [{ re: 'id="__nuxt"|id="__layout"|/_nuxt/', weight: 75 }],
        script: [{ re: '/_nuxt/', weight: 80 }]
      }
    },
    {
      name: 'Angular', category: 'Framework',
      version: [{ src: 'html', re: 'ng-version="([\\d.]+)"' }],
      patterns: {
        global: [{ name: 'getAllAngularRootElements', weight: 60 }, { name: 'ng', weight: 22 }],
        html: [{ re: 'ng-version=', weight: 80 }, { re: '_nghost-|_ngcontent-|ng-star-inserted', weight: 55 }],
        script: [{ re: 'zone\\.js|@angular|(runtime|polyfills|main)\\.[a-f0-9]+\\.js', weight: 45 }]
      }
    },
    {
      name: 'Svelte / SvelteKit', category: 'Framework',
      patterns: {
        html: [{ re: 'svelte-[a-z0-9]{5,}|data-sveltekit', weight: 58 }],
        script: [{ re: '/_app/immutable/|/build/bundle[^"]*svelte', weight: 65 }]
      }
    },
    {
      name: 'jQuery', category: 'Framework',
      version: [{ src: 'script', re: 'jquery[.\\-]([0-9]+\\.[0-9]+\\.[0-9]+)' }, { src: 'html', re: 'jquery[^"\\\']*?[?&]ver=([0-9]+\\.[0-9]+\\.[0-9]+)' }],
      patterns: {
        global: [{ name: 'jQuery', weight: 70 }],
        script: [{ re: 'jquery[-.](\\d|min|slim)|code\\.jquery\\.com|/jquery@\\d|ajax\\.googleapis\\.com/ajax/libs/jquery', weight: 55 }]
      }
    },
    {
      name: 'Gatsby', category: 'Framework', implies: ['React'],
      patterns: {
        global: [{ name: '___gatsby', weight: 70 }],
        html: [{ re: 'id="___gatsby"|gatsby-focus-wrapper|___gatsby', weight: 72 }],
        script: [{ re: '/page-data/(sq/)?|gatsby-chunk-mapping', weight: 55 }]
      }
    },
    {
      name: 'Alpine.js', category: 'Framework',
      patterns: {
        global: [{ name: 'Alpine', weight: 70 }],
        html: [{ re: '\\bx-data=|\\bx-init=|\\b@click=|\\bx-show=', weight: 42 }],
        script: [{ re: 'alpinejs|alpine(\\.min)?\\.js|jsdelivr\\.net/npm/alpinejs', weight: 65 }]
      }
    },
    {
      name: 'Ember.js', category: 'Framework',
      patterns: {
        global: [{ name: 'Ember', weight: 75 }],
        html: [{ re: 'ember-view|id="ember\\d+"|ember-application', weight: 60 }],
        script: [{ re: 'ember\\.(debug|prod|min)?\\.js|/assets/vendor[^"]*ember', weight: 45 }]
      }
    },
    {
      name: 'Preact', category: 'Framework',
      patterns: { global: [{ name: 'preact', weight: 55 }], script: [{ re: 'preact(\\.min)?\\.js|/preact@\\d', weight: 60 }] }
    },
    {
      name: 'Backbone.js', category: 'Framework',
      patterns: { global: [{ name: 'Backbone', weight: 75 }], script: [{ re: 'backbone(-min|\\.min)?\\.js|/backbone@\\d', weight: 55 }] }
    },
    {
      name: 'Remix', category: 'Framework', implies: ['React'],
      patterns: {
        global: [{ name: '__remixContext', weight: 82 }],
        html: [{ re: '__remixContext|window\\.__remix', weight: 65 }],
        script: [{ re: '/build/_shared/|@remix-run', weight: 45 }]
      }
    },
    {
      name: 'Astro', category: 'Framework',
      patterns: { html: [{ re: 'astro-island|astro-[a-z0-9]{6}|<astro-', weight: 60 }, { re: 'data-astro-', weight: 55 }] }
    },
    {
      name: 'SolidJS', category: 'Framework',
      patterns: { html: [{ re: '_$HY|data-hk=', weight: 45 }], script: [{ re: 'solid-js|/solid@\\d', weight: 55 }] }
    },

    /* ----------------------------------------------------- UI Framework */
    {
      name: 'Bootstrap', category: 'UI Framework',
      version: [{ src: 'link', re: 'bootstrap[@/]([\\d.]+)' }, { src: 'script', re: 'bootstrap[@/]([\\d.]+)' }],
      patterns: {
        link: [{ re: 'bootstrap(\\.min)?\\.css|bootstrap[@/][\\d.]+', weight: 65 }],
        script: [{ re: 'bootstrap(\\.bundle)?(\\.min)?\\.js|bootstrap[@/][\\d.]+', weight: 55 }],
        html: [{ re: 'class="[^"]*\\b(navbar-(expand|brand|toggler)|col-(sm|md|lg|xl)-\\d|btn-(primary|secondary))\\b', weight: 45 }]
      }
    },
    {
      name: 'Tailwind CSS', category: 'UI Framework',
      patterns: {
        link: [{ re: 'tailwind(\\.min)?\\.css', weight: 60 }],
        html: [{ re: 'class="[^"]*\\b(flex|grid|hidden)\\b[^"]*\\b(items-(center|start|end)|justify-(center|between)|gap-\\d|px-\\d|py-\\d)\\b', weight: 45 }]
      }
    },
    {
      name: 'Material UI', category: 'UI Framework', implies: ['React'],
      patterns: {
        html: [{ re: 'class="[^"]*\\bMui[A-Z][a-zA-Z]+-root\\b|MuiButtonBase-root|jss\\d+', weight: 62 }],
        script: [{ re: '@mui/|@material-ui/|material-ui', weight: 55 }]
      }
    },
    {
      name: 'Emotion', category: 'UI Framework',
      patterns: { html: [{ re: 'data-emotion=|<style data-emotion|css-[a-z0-9]{6,}-e[a-z0-9]', weight: 55 }] }
    },
    {
      name: 'styled-components', category: 'UI Framework',
      patterns: { html: [{ re: 'data-styled(-version)?=|class="[^"]*\\bsc-[a-zA-Z0-9]{5,}\\b', weight: 55 }] }
    },
    {
      name: 'Ant Design', category: 'UI Framework', implies: ['React'],
      patterns: { html: [{ re: 'class="[^"]*\\bant-(btn|layout|row|col|menu|input|form)\\b', weight: 60 }], script: [{ re: 'antd(\\.min)?\\.js|/antd@', weight: 50 }] }
    },
    {
      name: 'Chakra UI', category: 'UI Framework', implies: ['React'],
      patterns: { html: [{ re: 'class="[^"]*\\bchakra-(button|stack|container|heading|text)\\b|data-chakra', weight: 58 }] }
    },
    {
      name: 'Bulma', category: 'UI Framework',
      patterns: { link: [{ re: 'bulma(\\.min)?\\.css|bulma[@/][\\d.]+', weight: 60 }], html: [{ re: 'class="[^"]*\\b(column is-\\d|button is-(primary|link|info))\\b', weight: 40 }] }
    },
    {
      name: 'Foundation', category: 'UI Framework',
      patterns: { link: [{ re: 'foundation(\\.min)?\\.css', weight: 58 }], script: [{ re: 'foundation(\\.min)?\\.js', weight: 50 }], html: [{ re: 'class="[^"]*\\b(top-bar|orbit-container|reveal-modal)\\b', weight: 40 }] }
    },

    /* ------------------------------------------------------- JS Library */
    {
      name: 'Lodash', category: 'JS Library',
      version: [{ src: 'script', re: 'lodash[@/]([\\d.]+)' }],
      patterns: { script: [{ re: 'lodash(\\.min)?\\.js|/lodash@\\d|cdnjs[^"]*lodash', weight: 60 }] }
    },
    {
      name: 'Underscore.js', category: 'JS Library',
      patterns: { script: [{ re: 'underscore(-min|\\.min)?\\.js|/underscore@\\d', weight: 60 }] }
    },
    {
      name: 'Moment.js', category: 'JS Library',
      version: [{ src: 'script', re: 'moment[@/.-]([\\d]+\\.[\\d]+\\.[\\d]+)' }],
      patterns: { global: [{ name: 'moment', weight: 55 }], script: [{ re: 'moment(\\.min)?\\.js|/moment@\\d|cdnjs[^"]*moment', weight: 60 }] }
    },
    {
      name: 'Axios', category: 'JS Library',
      patterns: { global: [{ name: 'axios', weight: 55 }], script: [{ re: 'axios(\\.min)?\\.js|/axios@\\d', weight: 60 }] }
    },
    {
      name: 'GSAP', category: 'JS Library',
      patterns: { global: [{ name: 'gsap', weight: 60 }], script: [{ re: 'gsap(\\.min)?\\.js|TweenMax|greensock|/gsap@\\d', weight: 65 }] }
    },
    {
      name: 'Swiper', category: 'JS Library',
      patterns: { global: [{ name: 'Swiper', weight: 55 }], html: [{ re: 'swiper-container|swiper-slide|swiper-wrapper', weight: 50 }], script: [{ re: 'swiper(-bundle)?(\\.min)?\\.js|/swiper@\\d', weight: 60 }] }
    },
    {
      name: 'Slick Carousel', category: 'JS Library',
      patterns: { html: [{ re: 'slick-slider|slick-track|slick-slide', weight: 55 }], script: [{ re: 'slick(\\.min)?\\.js', weight: 55 }] }
    },
    {
      name: 'Modernizr', category: 'JS Library',
      patterns: { global: [{ name: 'Modernizr', weight: 70 }], script: [{ re: 'modernizr(\\.min|-custom)?[^"]*\\.js', weight: 60 }] }
    },
    {
      name: 'D3.js', category: 'JS Library',
      patterns: { global: [{ name: 'd3', weight: 45 }], script: [{ re: 'd3(\\.min)?\\.js|/d3@\\d|d3js\\.org', weight: 60 }] }
    },
    {
      name: 'Popper.js', category: 'JS Library',
      patterns: { global: [{ name: 'Popper', weight: 45 }], script: [{ re: 'popper(\\.min)?\\.js|@popperjs/', weight: 55 }] }
    },

    /* ------------------------------------------------------ Page Builder */
    {
      name: 'Elementor', category: 'Page Builder', implies: ['WordPress'],
      version: [{ src: 'meta', re: 'Elementor\\s+([\\d.]+)' }],
      patterns: {
        meta: [{ re: 'Elementor', weight: 90 }],
        global: [{ name: 'elementorFrontend', weight: 80 }],
        html: [{ re: 'elementor-widget|data-elementor-|class="[^"]*elementor', weight: 72 }],
        script: [{ re: '/elementor/assets/|elementor-frontend', weight: 72 }]
      }
    },
    {
      name: 'Divi', category: 'Page Builder', implies: ['WordPress'],
      patterns: {
        meta: [{ re: 'Divi', weight: 78 }],
        html: [{ re: 'et_pb_|class="et_|id="et-|et-db', weight: 70 }],
        script: [{ re: '/themes/Divi/|et-core|divi-custom', weight: 62 }]
      }
    },
    {
      name: 'WPBakery Page Builder', category: 'Page Builder', implies: ['WordPress'],
      patterns: { html: [{ re: 'vc_row|wpb_|js_composer|vc_column', weight: 68 }], script: [{ re: 'js_composer|wpbakery', weight: 62 }], link: [{ re: 'js_composer', weight: 50 }] }
    },
    {
      name: 'Beaver Builder', category: 'Page Builder', implies: ['WordPress'],
      patterns: { html: [{ re: 'fl-builder|fl-node-|fl-row-|fl-module-', weight: 68 }], script: [{ re: 'bb-plugin|fl-builder', weight: 62 }] }
    },

    /* --------------------------------------------------------- Analytics */
    {
      name: 'Google Analytics 4', category: 'Analytics',
      version: [{ src: 'html', re: '(G-[A-Z0-9]{8,})', cs: true }],
      patterns: {
        global: [{ name: 'gtag', weight: 50 }],
        script: [{ re: 'googletagmanager\\.com/gtag/js', weight: 75 }],
        html: [{ re: "G-[A-Z0-9]{9,}", weight: 78, cs: true }, { re: "gtag\\('config',\\s*'G-", weight: 78 }]
      }
    },
    {
      name: 'Google Analytics (Universal)', category: 'Analytics',
      version: [{ src: 'html', re: '(UA-\\d{4,}-\\d+)' }],
      patterns: {
        global: [{ name: 'ga', weight: 24 }],
        script: [{ re: 'google-analytics\\.com/(analytics|ga)\\.js', weight: 70 }],
        html: [{ re: "UA-\\d{4,}-\\d+|ga\\('create'|_gaq\\.push", weight: 68 }]
      }
    },
    {
      name: 'Hotjar', category: 'Analytics',
      patterns: {
        global: [{ name: 'hj', weight: 70 }, { name: '_hjSettings', weight: 70 }],
        script: [{ re: 'static\\.hotjar\\.com|script\\.hotjar\\.com', weight: 80 }],
        html: [{ re: 'hjSiteSettings|_hjSettings', weight: 45 }]
      }
    },
    {
      name: 'Microsoft Clarity', category: 'Analytics',
      patterns: {
        global: [{ name: 'clarity', weight: 70 }],
        script: [{ re: '(www\\.)?clarity\\.ms/tag|clarity\\.ms/s/', weight: 80 }],
        html: [{ re: 'clarity\\.ms|clarity\\("set"|clarity\\("start"', weight: 45 }]
      }
    },
    {
      name: 'Mixpanel', category: 'Analytics',
      patterns: { global: [{ name: 'mixpanel', weight: 76 }], script: [{ re: 'cdn\\.mxpnl\\.com|cdn4?\\.mxpnl', weight: 72 }] }
    },
    {
      name: 'Segment', category: 'Analytics',
      patterns: { global: [{ name: 'analytics', weight: 18 }], script: [{ re: 'cdn\\.segment\\.(com|io)/analytics', weight: 80 }], html: [{ re: 'analytics\\.load\\(|cdn\\.segment\\.', weight: 45 }] }
    },
    {
      name: 'Amplitude', category: 'Analytics',
      patterns: { global: [{ name: 'amplitude', weight: 76 }], script: [{ re: 'cdn\\.amplitude\\.com|api\\.amplitude\\.com|amplitude-\\d', weight: 70 }] }
    },
    {
      name: 'Plausible', category: 'Analytics',
      patterns: { global: [{ name: 'plausible', weight: 62 }], script: [{ re: 'plausible\\.io/js', weight: 80 }] }
    },
    {
      name: 'Matomo', category: 'Analytics',
      patterns: { global: [{ name: '_paq', weight: 70 }, { name: 'Matomo', weight: 65 }, { name: 'Piwik', weight: 50 }], script: [{ re: 'matomo\\.js|piwik\\.js|matomo\\.php', weight: 75 }] }
    },
    {
      name: 'Fathom Analytics', category: 'Analytics',
      patterns: { global: [{ name: 'fathom', weight: 62 }], script: [{ re: 'cdn\\.usefathom\\.com|usefathom', weight: 80 }] }
    },
    {
      name: 'Heap', category: 'Analytics',
      patterns: { global: [{ name: 'heap', weight: 74 }], script: [{ re: 'cdn\\.heapanalytics\\.com', weight: 72 }] }
    },
    {
      name: 'Yandex Metrica', category: 'Analytics',
      patterns: { global: [{ name: 'ym', weight: 55 }, { name: 'yaCounter', weight: 55 }], script: [{ re: 'mc\\.yandex\\.ru/metrika|yandex\\.ru/watch', weight: 78 }] }
    },

    /* ------------------------------------------------------- A/B Testing */
    {
      name: 'Optimizely', category: 'A/B Testing',
      patterns: { global: [{ name: 'optimizely', weight: 65 }], script: [{ re: 'cdn\\.optimizely\\.com', weight: 80 }] }
    },
    {
      name: 'VWO', category: 'A/B Testing',
      patterns: { global: [{ name: 'VWO', weight: 62 }, { name: '_vwo_code', weight: 62 }], script: [{ re: 'dev\\.visualwebsiteoptimizer\\.com|/vwo_', weight: 78 }] }
    },
    {
      name: 'Google Optimize', category: 'A/B Testing',
      patterns: { script: [{ re: 'optimize\\.google\\.com/optimize', weight: 70 }], html: [{ re: 'OPT-[A-Z0-9]{6,}', weight: 55, cs: true }, { re: 'async-hide', weight: 20 }] }
    },

    /* ------------------------------------------------------ Tag Manager */
    {
      name: 'Google Tag Manager', category: 'Tag Manager',
      version: [{ src: 'html', re: '(GTM-[A-Z0-9]{5,})', cs: true }],
      patterns: {
        global: [{ name: 'google_tag_manager', weight: 70 }],
        script: [{ re: 'googletagmanager\\.com/gtm\\.js', weight: 85 }],
        html: [{ re: 'googletagmanager\\.com/ns\\.html', weight: 72 }, { re: 'GTM-[A-Z0-9]{5,}', weight: 72, cs: true }]
      }
    },
    {
      name: 'Tealium', category: 'Tag Manager',
      patterns: { global: [{ name: 'utag', weight: 60 }], script: [{ re: 'tags\\.tiqcdn\\.com|tealium', weight: 78 }] }
    },
    {
      name: 'Adobe Experience / DTM', category: 'Tag Manager',
      patterns: { global: [{ name: '_satellite', weight: 72 }], script: [{ re: 'assets\\.adobedtm\\.com', weight: 78 }] }
    },

    /* ----------------------------------------------------------- Ad Tech */
    {
      name: 'Google AdSense', category: 'Ad Tech',
      patterns: {
        global: [{ name: 'adsbygoogle', weight: 65 }],
        script: [{ re: 'pagead2\\.googlesyndication\\.com|adsbygoogle\\.js', weight: 80 }],
        html: [{ re: 'adsbygoogle|ca-pub-\\d+|data-ad-client', weight: 60 }]
      }
    },
    {
      name: 'Facebook Pixel', category: 'Ad Tech',
      patterns: {
        global: [{ name: 'fbq', weight: 76 }, { name: '_fbq', weight: 65 }],
        script: [{ re: 'connect\\.facebook\\.net/[^"\']*/fbevents\\.js', weight: 80 }],
        html: [{ re: "fbevents\\.js|fbq\\('init'|facebook\\.com/tr\\?", weight: 55 }]
      }
    },
    {
      name: 'Criteo', category: 'Ad Tech',
      patterns: { global: [{ name: 'criteo_q', weight: 62 }], script: [{ re: 'static\\.criteo\\.net', weight: 75 }] }
    },
    {
      name: 'Taboola', category: 'Ad Tech',
      patterns: { global: [{ name: '_taboola', weight: 68 }], script: [{ re: 'cdn\\.taboola\\.com', weight: 75 }] }
    },
    {
      name: 'Outbrain', category: 'Ad Tech',
      patterns: { global: [{ name: 'OBR', weight: 58 }], script: [{ re: 'widgets\\.outbrain\\.com', weight: 75 }] }
    },
    {
      name: 'Google Publisher Tag', category: 'Ad Tech',
      patterns: {
        global: [{ name: 'googletag', weight: 55 }],
        script: [{ re: 'securepubads\\.g\\.doubleclick\\.net/tag/js/gpt\\.js|googletagservices\\.com/tag/js/gpt', weight: 82 }],
        html: [{ re: 'googletag\\.(pubads|cmd|defineSlot)|data-google-query-id', weight: 55 }]
      }
    },
    {
      name: 'X (Twitter) Pixel', category: 'Ad Tech',
      patterns: { global: [{ name: 'twq', weight: 68 }], script: [{ re: 'static\\.ads-twitter\\.com|analytics\\.twitter\\.com', weight: 78 }] }
    },
    {
      name: 'LinkedIn Insight Tag', category: 'Ad Tech',
      patterns: { global: [{ name: '_linkedin_data_partner_ids', weight: 68 }], script: [{ re: 'snap\\.licdn\\.com/li\\.lms-analytics|px\\.ads\\.linkedin\\.com', weight: 78 }] }
    },
    {
      name: 'TikTok Pixel', category: 'Ad Tech',
      patterns: { global: [{ name: 'ttq', weight: 70 }], script: [{ re: 'analytics\\.tiktok\\.com', weight: 78 }] }
    },
    {
      name: 'Pinterest Tag', category: 'Ad Tech',
      patterns: { global: [{ name: 'pintrk', weight: 68 }], script: [{ re: 's\\.pinimg\\.com/ct', weight: 78 }] }
    },
    {
      name: 'Snapchat Pixel', category: 'Ad Tech',
      patterns: { global: [{ name: 'snaptr', weight: 68 }], script: [{ re: 'sc-static\\.net/scevent', weight: 78 }] }
    },

    /* ------------------------------------------------- Consent / Privacy */
    {
      name: 'OneTrust', category: 'Consent / Privacy',
      patterns: { global: [{ name: 'OneTrust', weight: 68 }], script: [{ re: 'cdn\\.cookielaw\\.org|onetrust', weight: 80 }], html: [{ re: 'optanon|onetrust', weight: 45 }] }
    },
    {
      name: 'Cookiebot', category: 'Consent / Privacy',
      patterns: { global: [{ name: 'Cookiebot', weight: 68 }], script: [{ re: 'consent\\.cookiebot\\.com', weight: 80 }] }
    },
    {
      name: 'Usercentrics', category: 'Consent / Privacy',
      patterns: { global: [{ name: 'usercentrics', weight: 60 }], script: [{ re: 'app\\.usercentrics\\.eu|usercentrics', weight: 78 }] }
    },
    {
      name: 'Osano', category: 'Consent / Privacy',
      patterns: { script: [{ re: 'cmp\\.osano\\.com|osano', weight: 75 }], html: [{ re: 'osano-cm', weight: 45 }] }
    },

    /* ---------------------------------------------------------- Monitoring */
    {
      name: 'Sentry', category: 'Monitoring',
      patterns: { global: [{ name: 'Sentry', weight: 65 }], script: [{ re: 'browser\\.sentry-cdn\\.com|@sentry/|js\\.sentry-cdn\\.com', weight: 78 }] }
    },
    {
      name: 'New Relic', category: 'Monitoring',
      patterns: { global: [{ name: 'newrelic', weight: 62 }, { name: 'NREUM', weight: 62 }], script: [{ re: 'js-agent\\.newrelic\\.com|bam\\.nr-data\\.net', weight: 78 }] }
    },
    {
      name: 'LogRocket', category: 'Monitoring',
      patterns: { global: [{ name: 'LogRocket', weight: 66 }], script: [{ re: 'cdn\\.logrocket\\.(io|com)|cdn\\.lr-', weight: 78 }] }
    },
    {
      name: 'Datadog RUM', category: 'Monitoring',
      patterns: { global: [{ name: 'DD_RUM', weight: 66 }], script: [{ re: 'www\\.datadoghq-browser-agent\\.com|datadog', weight: 72 }] }
    },

    /* --------------------------------------------------- Chat / Support */
    {
      name: 'Intercom', category: 'Chat / Support',
      patterns: { global: [{ name: 'Intercom', weight: 78 }], script: [{ re: 'widget\\.intercom\\.io|js\\.intercomcdn\\.com', weight: 75 }], html: [{ re: 'intercomSettings', weight: 45 }] }
    },
    {
      name: 'Zendesk', category: 'Chat / Support',
      patterns: { global: [{ name: 'zE', weight: 72 }, { name: 'zEmbed', weight: 68 }], script: [{ re: 'static\\.zdassets\\.com|zopim\\.com', weight: 75 }] }
    },
    {
      name: 'Drift', category: 'Chat / Support',
      patterns: { global: [{ name: 'drift', weight: 70 }, { name: 'driftt', weight: 65 }], script: [{ re: 'js\\.driftt\\.com|widget\\.drift\\.com', weight: 75 }] }
    },
    {
      name: 'Tawk.to', category: 'Chat / Support',
      patterns: { global: [{ name: 'Tawk_API', weight: 78 }], script: [{ re: 'embed\\.tawk\\.to', weight: 80 }] }
    },
    {
      name: 'Crisp', category: 'Chat / Support',
      patterns: { global: [{ name: '$crisp', weight: 78 }, { name: 'CRISP_WEBSITE_ID', weight: 72 }], script: [{ re: 'client\\.crisp\\.chat', weight: 78 }] }
    },
    {
      name: 'LiveChat', category: 'Chat / Support',
      patterns: { global: [{ name: 'LiveChatWidget', weight: 70 }, { name: '__lc', weight: 55 }], script: [{ re: 'cdn\\.livechatinc\\.com', weight: 78 }] }
    },
    {
      name: 'Freshchat', category: 'Chat / Support',
      patterns: { global: [{ name: 'fcWidget', weight: 66 }], script: [{ re: 'wchat\\.freshchat\\.com|fw-cdn\\.com', weight: 78 }] }
    },

    /* ----------------------------------------------------------- Payments */
    {
      name: 'Stripe', category: 'Payments',
      patterns: { global: [{ name: 'Stripe', weight: 62 }], script: [{ re: 'js\\.stripe\\.com', weight: 82 }], html: [{ re: 'stripe\\.com/v3|__stripe_', weight: 45 }] }
    },
    {
      name: 'PayPal', category: 'Payments',
      patterns: { global: [{ name: 'paypal', weight: 45 }], script: [{ re: 'paypal\\.com/sdk/js|paypalobjects\\.com', weight: 78 }] }
    },
    {
      name: 'Razorpay', category: 'Payments',
      patterns: { global: [{ name: 'Razorpay', weight: 68 }], script: [{ re: 'checkout\\.razorpay\\.com|razorpay', weight: 80 }] }
    },
    {
      name: 'Braintree', category: 'Payments',
      patterns: { global: [{ name: 'braintree', weight: 55 }], script: [{ re: 'js\\.braintreegateway\\.com', weight: 80 }] }
    },
    {
      name: 'Square', category: 'Payments',
      patterns: { script: [{ re: 'squareup\\.com|js\\.squarecdn\\.com|square\\.com/v2', weight: 75 }] }
    },
    {
      name: 'Adyen', category: 'Payments',
      patterns: { script: [{ re: 'checkoutshopper-live\\.adyen\\.com|adyen\\.com', weight: 75 }], html: [{ re: 'adyen-checkout', weight: 45 }] }
    },

    /* -------------------------------------------------------------- Video */
    {
      name: 'YouTube', category: 'Video',
      patterns: { global: [{ name: 'YT', weight: 40 }], html: [{ re: 'youtube(-nocookie)?\\.com/embed|img\\.youtube\\.com|youtu\\.be/', weight: 60 }], script: [{ re: 'youtube\\.com/iframe_api|s\\.ytimg\\.com', weight: 60 }] }
    },
    {
      name: 'Vimeo', category: 'Video',
      patterns: { html: [{ re: 'player\\.vimeo\\.com/video|vimeocdn\\.com', weight: 60 }], script: [{ re: 'player\\.vimeo\\.com/api/player', weight: 65 }] }
    },
    {
      name: 'Wistia', category: 'Video',
      patterns: { global: [{ name: 'Wistia', weight: 62 }], html: [{ re: 'wistia_|wistia\\.com', weight: 50 }], script: [{ re: 'fast\\.wistia\\.(com|net)', weight: 75 }] }
    },

    /* --------------------------------------------------------------- Maps */
    {
      name: 'Google Maps', category: 'Maps',
      patterns: { script: [{ re: 'maps\\.googleapis\\.com/maps/api|maps\\.google\\.com/maps', weight: 78 }], html: [{ re: 'maps\\.googleapis\\.com|gm-style', weight: 45 }] }
    },
    {
      name: 'Mapbox', category: 'Maps',
      patterns: { global: [{ name: 'mapboxgl', weight: 68 }], script: [{ re: 'api\\.mapbox\\.com|mapbox-gl(\\.min)?\\.js', weight: 78 }] }
    },
    {
      name: 'Leaflet', category: 'Maps',
      patterns: { html: [{ re: 'leaflet-container|leaflet-pane', weight: 55 }], script: [{ re: 'leaflet(\\.min)?\\.js|unpkg[^"]*leaflet', weight: 62 }] }
    },

    /* -------------------------------------------------------------- Fonts */
    {
      name: 'Google Fonts', category: 'Fonts',
      patterns: { link: [{ re: 'fonts\\.googleapis\\.com|fonts\\.gstatic\\.com', weight: 72 }], html: [{ re: 'fonts\\.googleapis\\.com', weight: 45 }] }
    },
    {
      name: 'Adobe Fonts (Typekit)', category: 'Fonts',
      patterns: { link: [{ re: 'use\\.typekit\\.net', weight: 72 }], script: [{ re: 'use\\.typekit\\.net|p\\.typekit\\.net', weight: 72 }] }
    },
    {
      name: 'Font Awesome', category: 'Fonts',
      patterns: { link: [{ re: 'font-?awesome|fontawesome|kit\\.fontawesome\\.com|use\\.fontawesome\\.com', weight: 65 }], html: [{ re: 'class="[^"]*\\bfa[srlbd]?\\b\\s+fa-|fontawesome', weight: 45 }] }
    },

    /* ------------------------------------------------ CAPTCHA / Security */
    {
      name: 'reCAPTCHA', category: 'CAPTCHA / Security',
      patterns: { global: [{ name: 'grecaptcha', weight: 70 }], script: [{ re: '(www\\.google\\.com|www\\.gstatic\\.com|www\\.recaptcha\\.net)/recaptcha/', weight: 75 }], html: [{ re: 'g-recaptcha|data-sitekey', weight: 45 }] }
    },
    {
      name: 'hCaptcha', category: 'CAPTCHA / Security',
      patterns: { global: [{ name: 'hcaptcha', weight: 70 }], script: [{ re: 'js\\.hcaptcha\\.com|hcaptcha\\.com/1/api\\.js', weight: 78 }], html: [{ re: 'h-captcha', weight: 50 }] }
    },
    {
      name: 'Cloudflare Turnstile', category: 'CAPTCHA / Security',
      patterns: { global: [{ name: 'turnstile', weight: 65 }], script: [{ re: 'challenges\\.cloudflare\\.com/turnstile', weight: 85 }], html: [{ re: 'cf-turnstile', weight: 50 }] }
    },

    /* -------------------------------------------------------- Security / WAF */
    {
      name: 'HSTS', category: 'Security / WAF',
      patterns: { header: [{ name: 'strict-transport-security', weight: 60 }] }
    },
    {
      name: 'Imperva (Incapsula)', category: 'Security / WAF',
      patterns: { header: [{ name: 'x-iinfo', weight: 82 }], cookie: [{ re: 'visid_incap|incap_ses', weight: 70 }] }
    },
    {
      name: 'Sucuri', category: 'Security / WAF',
      patterns: { header: [{ name: 'x-sucuri-id', weight: 82 }, { name: 'server', re: 'Sucuri', weight: 78 }] }
    },
    {
      name: 'Akamai', category: 'Security / WAF',
      patterns: { header: [{ name: 'x-akamai-transformed', weight: 78 }, { name: 'server', re: 'AkamaiGHost', weight: 78 }] }
    },

    /* ------------------------------------------------------ CDN / Hosting */
    {
      name: 'Cloudflare', category: 'CDN / Hosting',
      patterns: {
        script: [{ re: 'static\\.cloudflareinsights\\.com|/cdn-cgi/', weight: 50 }],
        html: [{ re: 'cdn-cgi/|cloudflareinsights', weight: 35 }],
        cookie: [{ re: '__cf_bm|cf_clearance', weight: 55 }],
        header: [{ name: 'cf-ray', weight: 85 }, { name: 'server', re: 'cloudflare', weight: 80 }, { name: 'cf-cache-status', weight: 70 }]
      }
    },
    {
      name: 'Vercel', category: 'CDN / Hosting',
      patterns: { html: [{ re: '/_vercel/|vercel\\.app', weight: 30 }], header: [{ name: 'x-vercel-id', weight: 85 }, { name: 'server', re: 'Vercel', weight: 80 }, { name: 'x-vercel-cache', weight: 78 }] }
    },
    {
      name: 'Netlify', category: 'CDN / Hosting',
      patterns: { html: [{ re: 'netlify\\.app|/\\.netlify/', weight: 30 }], header: [{ name: 'x-nf-request-id', weight: 85 }, { name: 'server', re: 'Netlify', weight: 80 }] }
    },
    {
      name: 'AWS CloudFront', category: 'CDN / Hosting',
      patterns: { header: [{ name: 'x-amz-cf-id', weight: 80 }, { name: 'via', re: 'cloudfront', weight: 72 }, { name: 'x-cache', re: 'cloudfront', weight: 55 }, { name: 'server', re: 'AmazonS3', weight: 50 }] }
    },
    {
      name: 'Fastly', category: 'CDN / Hosting',
      patterns: { header: [{ name: 'x-served-by', re: 'cache', weight: 60 }, { name: 'x-timer', weight: 55 }, { name: 'via', re: 'varnish', weight: 45 }, { name: 'x-fastly-request-id', weight: 82 }] }
    },
    {
      name: 'jsDelivr', category: 'CDN / Hosting',
      patterns: { script: [{ re: 'cdn\\.jsdelivr\\.net', weight: 68 }], link: [{ re: 'cdn\\.jsdelivr\\.net', weight: 60 }] }
    },
    {
      name: 'unpkg', category: 'CDN / Hosting',
      patterns: { script: [{ re: 'unpkg\\.com', weight: 66 }], link: [{ re: 'unpkg\\.com', weight: 58 }] }
    },
    {
      name: 'cdnjs (Cloudflare)', category: 'CDN / Hosting',
      patterns: { script: [{ re: 'cdnjs\\.cloudflare\\.com', weight: 66 }], link: [{ re: 'cdnjs\\.cloudflare\\.com', weight: 58 }] }
    },
    {
      name: 'Google Hosted Libraries', category: 'CDN / Hosting',
      patterns: { script: [{ re: 'ajax\\.googleapis\\.com/ajax/libs', weight: 64 }] }
    },
    {
      name: 'GitHub Pages', category: 'CDN / Hosting',
      patterns: { header: [{ name: 'server', re: 'GitHub\\.com', weight: 80 }, { name: 'x-github-request-id', weight: 82 }] }
    },

    /* ------------------------------------------------------- Web Server */
    {
      name: 'Nginx', category: 'Web Server',
      version: [{ src: 'header', header: 'server', re: 'nginx/([\\d.]+)' }],
      patterns: { header: [{ name: 'server', re: 'nginx', weight: 78 }] }
    },
    {
      name: 'Apache', category: 'Web Server',
      version: [{ src: 'header', header: 'server', re: 'Apache/([\\d.]+)' }],
      patterns: { header: [{ name: 'server', re: 'Apache', weight: 78 }] }
    },
    {
      name: 'Microsoft IIS', category: 'Web Server',
      version: [{ src: 'header', header: 'server', re: 'IIS/([\\d.]+)' }],
      patterns: { header: [{ name: 'server', re: 'Microsoft-IIS', weight: 80 }] }
    },
    {
      name: 'LiteSpeed', category: 'Web Server',
      patterns: { header: [{ name: 'server', re: 'LiteSpeed', weight: 80 }] }
    },
    {
      name: 'OpenResty', category: 'Web Server',
      patterns: { header: [{ name: 'server', re: 'openresty', weight: 78 }] }
    },
    {
      name: 'Caddy', category: 'Web Server',
      patterns: { header: [{ name: 'server', re: 'Caddy', weight: 78 }] }
    },

    /* -------------------------------------------------- Programming Language */
    {
      name: 'PHP', category: 'Programming Language',
      version: [{ src: 'header', header: 'x-powered-by', re: 'PHP/([\\d.]+)' }],
      patterns: { header: [{ name: 'x-powered-by', re: 'PHP', weight: 80 }], cookie: [{ re: 'PHPSESSID', weight: 60 }] }
    },
    {
      name: 'ASP.NET', category: 'Programming Language',
      version: [{ src: 'header', header: 'x-aspnet-version', re: '([\\d.]+)' }],
      patterns: { header: [{ name: 'x-powered-by', re: 'ASP\\.NET', weight: 80 }, { name: 'x-aspnet-version', weight: 82 }], cookie: [{ re: 'ASP\\.NET_SessionId|\\.ASPXAUTH', weight: 60 }] }
    },
    {
      name: 'Ruby on Rails', category: 'Programming Language',
      patterns: { header: [{ name: 'x-powered-by', re: 'Phusion Passenger', weight: 70 }, { name: 'x-runtime', weight: 45 }], cookie: [{ re: '_rails|_session_id', weight: 40 }] }
    },
    {
      name: 'Java', category: 'Programming Language',
      patterns: { cookie: [{ re: 'JSESSIONID', weight: 68 }], header: [{ name: 'x-powered-by', re: 'Servlet|JSP', weight: 72 }] }
    },
    {
      name: 'Express', category: 'Programming Language',
      patterns: { header: [{ name: 'x-powered-by', re: 'Express', weight: 82 }] }
    },

    /* ------------------------------------------------------ Miscellaneous */
    {
      name: 'Open Graph', category: 'Miscellaneous',
      patterns: { html: [{ re: 'property="og:(title|type|image|url|description)"', weight: 55 }] }
    },
    {
      name: 'Progressive Web App', category: 'Miscellaneous',
      patterns: { html: [{ re: 'rel="manifest"|rel=manifest', weight: 55 }] }
    },
    {
      name: 'RSS / Atom Feed', category: 'Miscellaneous',
      patterns: { html: [{ re: 'type="application/(rss|atom)\\+xml"', weight: 55 }] }
    },
    {
      name: 'OneSignal', category: 'Miscellaneous',
      patterns: { global: [{ name: 'OneSignal', weight: 66 }], script: [{ re: 'cdn\\.onesignal\\.com|onesignal\\.com/sdks', weight: 78 }] }
    },
    {
      name: 'Mailchimp', category: 'Miscellaneous',
      patterns: { script: [{ re: 'chimpstatic\\.com|list-manage\\.com|mc\\.us\\d+\\.list-manage', weight: 72 }], html: [{ re: 'mc4wp|mailchimp', weight: 40 }] }
    }
  ];

  var api = { FINGERPRINTS: FINGERPRINTS, CATEGORY_ORDER: CATEGORY_ORDER };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.SP_FINGERPRINTS = FINGERPRINTS;
    window.SP_CATEGORY_ORDER = CATEGORY_ORDER;
  }
})();
