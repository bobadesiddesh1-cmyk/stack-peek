/*
 * StackPeek — Fingerprint database (the core IP).
 *
 * 71 real, currently-accurate technology fingerprints. Each entry declares
 * per-signal-type match patterns with a weight. Weights are additive; the
 * detection engine sums matched weights per technology and normalizes to a
 * 0-100 confidence (see engine/detect.js).
 *
 * Weighting philosophy:
 *   - meta generator / dedicated response header  = near-certain (85-95)
 *   - unique global var / unique CDN script path   = strong        (65-85)
 *   - unique cookie / unique DOM marker            = solid         (50-70)
 *   - generic class-name / framework heuristic     = weak          (10-45)
 *
 * Pattern types per entry.patterns:
 *   html   : [{ re, weight }]  tested against the (capped) page outerHTML.
 *                              Also covers DOM-structure fingerprints, since
 *                              every id/class attribute is present in outerHTML.
 *   script : [{ re, weight }]  tested against the joined <script src> URLs.
 *   link   : [{ re, weight }]  tested against the joined <link href> URLs.
 *   meta   : [{ re, weight }]  tested against <meta name="generator"> content.
 *   global : [{ name, weight }] tested for existence of window[name].
 *   cookie : [{ re, weight }]  tested against joined document.cookie names.
 *   header : [{ name, re?, weight }] tested against response headers
 *                              (name present, optionally value matches re).
 *
 * `re` values are plain strings compiled once (case-insensitive) at load time
 * in detect.js — never recompiled per page.
 *
 * `implies` lists other technology names this one strongly indicates (e.g.
 * Elementor implies WordPress). The engine boosts implied parents, never
 * suppresses siblings — a page legitimately matching WordPress + Elementor +
 * WooCommerce is correct, not a conflict.
 */
(function () {
  'use strict';

  var CATEGORY_ORDER = [
    'CMS',
    'Ecommerce',
    'Framework',
    'Page Builder',
    'Analytics',
    'Ad Tech',
    'Chat / Support',
    'CAPTCHA / Security',
    'CDN / Hosting'
  ];

  var FINGERPRINTS = [
    /* ---------------------------------------------------------------- CMS */
    {
      name: 'WordPress',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'WordPress', weight: 95 }],
        html: [
          { re: '/wp-content/', weight: 70 },
          { re: '/wp-includes/', weight: 60 },
          { re: '/wp-json/', weight: 45 }
        ],
        script: [{ re: '/wp-(content|includes)/', weight: 70 }],
        link: [{ re: '/wp-content/', weight: 55 }],
        cookie: [{ re: 'wordpress_|wp-settings-|wp_woocommerce', weight: 60 }],
        header: [{ name: 'link', re: 'api\\.w\\.org', weight: 60 }]
      }
    },
    {
      name: 'Shopify',
      category: 'CMS',
      patterns: {
        global: [{ name: 'Shopify', weight: 85 }],
        script: [{ re: 'cdn\\.shopify(cloud)?\\.com|/cdn/shop/', weight: 80 }],
        html: [{ re: 'cdn\\.shopify\\.com|Shopify\\.theme|shopify-section|shopify-features', weight: 60 }],
        cookie: [{ re: '_shopify_|_secure_session_id|cart_currency|_shopify_y', weight: 55 }],
        header: [
          { name: 'x-shopid', weight: 80 },
          { name: 'x-shopify-stage', weight: 75 },
          { name: 'x-sorting-hat-shopid', weight: 75 }
        ]
      }
    },
    {
      name: 'Wix',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Wix\\.com Website Builder', weight: 90 }],
        global: [{ name: 'wixBiSession', weight: 70 }, { name: 'wixPerformanceMeasurements', weight: 65 }],
        script: [{ re: 'static\\.parastorage\\.com|static\\.wixstatic\\.com', weight: 80 }],
        html: [{ re: 'wix-warmup-data|X-Wix|_wixCIDX|wixstatic\\.com', weight: 55 }],
        header: [{ name: 'x-wix-request-id', weight: 80 }]
      }
    },
    {
      name: 'Squarespace',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Squarespace', weight: 90 }],
        script: [{ re: 'static1?\\.squarespace\\.com|squarespace\\.com/universal', weight: 75 }],
        html: [{ re: 'Static\\.SQUARESPACE_CONTEXT|squarespace\\.com|sqs-block|static1\\.squarespace', weight: 60 }],
        header: [{ name: 'x-contextid', weight: 55 }]
      }
    },
    {
      name: 'Webflow',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Webflow', weight: 90 }],
        global: [{ name: 'Webflow', weight: 75 }],
        html: [
          { re: 'data-wf-page|data-wf-site', weight: 75 },
          { re: 'class="[^"]*\\bw-(nav|container|row|col|button|form)\\b', weight: 45 }
        ],
        script: [{ re: 'assets(-global)?\\.website-files\\.com|webflow\\.[a-z0-9]+\\.js', weight: 70 }]
      }
    },
    {
      name: 'Joomla',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Joomla', weight: 90 }],
        html: [{ re: '/media/jui/|option=com_|/components/com_|Joomla!', weight: 55 }],
        script: [{ re: '/media/system/js/|/media/jui/|/media/vendor/', weight: 65 }]
      }
    },
    {
      name: 'Drupal',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Drupal', weight: 88 }],
        global: [{ name: 'Drupal', weight: 80 }],
        html: [{ re: 'sites/(all|default)/|data-drupal-|drupal-settings-json|drupal\\.js', weight: 60 }],
        script: [{ re: '/sites/(all|default)/|/core/misc/drupal', weight: 65 }],
        header: [
          { name: 'x-generator', re: 'Drupal', weight: 85 },
          { name: 'x-drupal-cache', weight: 80 },
          { name: 'x-drupal-dynamic-cache', weight: 78 }
        ]
      }
    },
    {
      name: 'Ghost',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Ghost', weight: 88 }],
        html: [{ re: 'content/images/|ghost-url|data-ghost|gh-|casper', weight: 45 }],
        script: [{ re: '/ghost/portal|/ghost/assets/|cards\\.min\\.js|sodo-search', weight: 55 }]
      }
    },
    {
      name: 'Duda',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'Duda Website Builder|Duda', weight: 78 }],
        script: [{ re: '(irp|lirp|static)\\.cdn-website\\.com|d1csarkz8obe9u', weight: 70 }],
        html: [{ re: 'dmRespRow|dmBody|_duda_|cdn-website\\.com|dudaone', weight: 60 }]
      }
    },
    {
      name: 'BigCommerce',
      category: 'CMS',
      patterns: {
        global: [{ name: 'BCData', weight: 85 }],
        script: [{ re: 'cdn\\d*\\.bigcommerce\\.com|/stencil/', weight: 75 }],
        html: [{ re: 'bigcommerce\\.com|data-stencil-|/stencil/', weight: 55 }]
      }
    },
    {
      name: 'Magento / Adobe Commerce',
      category: 'CMS',
      patterns: {
        html: [{ re: 'Magento_|data-mage-init|mage/cookies|/static/version\\d+/|magento', weight: 60 }],
        script: [{ re: '/static/(frontend|version)|mage/|requirejs/require\\.js', weight: 55 }],
        cookie: [{ re: 'mage-cache-sessid|X-Magento-Vary|form_key', weight: 55 }],
        header: [{ name: 'x-magento-cache-debug', weight: 80 }]
      }
    },
    {
      name: 'HubSpot CMS',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'HubSpot', weight: 85 }],
        global: [{ name: '_hsq', weight: 72 }, { name: 'hbspt', weight: 72 }],
        script: [{ re: 'js\\.hs-scripts\\.com|js\\.hs-analytics\\.net|js\\.hsforms\\.net|hs-banner\\.com', weight: 70 }],
        html: [{ re: 'hs-scripts|_hsenc|hubspot|hsforms', weight: 45 }]
      }
    },
    {
      name: 'Contentful',
      category: 'CMS',
      patterns: {
        script: [{ re: '(images|assets|videos)\\.ctfassets\\.net|cdn\\.contentful', weight: 60 }],
        html: [{ re: 'ctfassets\\.net|contentful', weight: 45 }]
      }
    },
    {
      name: 'Sanity',
      category: 'CMS',
      patterns: {
        script: [{ re: 'cdn\\.sanity\\.io', weight: 60 }],
        html: [{ re: 'cdn\\.sanity\\.io|__sanity', weight: 45 }]
      }
    },
    {
      name: 'Craft CMS',
      category: 'CMS',
      patterns: {
        header: [{ name: 'x-powered-by', re: 'Craft CMS', weight: 85 }],
        html: [{ re: 'craftcms|/cpresources/', weight: 50 }],
        cookie: [{ re: 'CraftSessionId', weight: 65 }]
      }
    },
    {
      name: 'TYPO3',
      category: 'CMS',
      patterns: {
        meta: [{ re: 'TYPO3', weight: 88 }],
        html: [{ re: 'typo3temp|typo3conf|/typo3/|TYPO3', weight: 55 }],
        script: [{ re: '/typo3conf/|/typo3temp/', weight: 55 }]
      }
    },

    /* -------------------------------------------------------- Ecommerce */
    {
      name: 'WooCommerce',
      category: 'Ecommerce',
      implies: ['WordPress'],
      patterns: {
        global: [{ name: 'wc_add_to_cart_params', weight: 55 }, { name: 'woocommerce_params', weight: 55 }],
        html: [{ re: 'woocommerce|wc-block-|wc_fragments|add_to_cart_button|class="[^"]*woocommerce', weight: 72 }],
        script: [{ re: '/plugins/woocommerce/|woocommerce/assets', weight: 70 }],
        cookie: [{ re: 'woocommerce_|wp_woocommerce_session_', weight: 65 }]
      }
    },
    {
      name: 'Klaviyo',
      category: 'Ecommerce',
      patterns: {
        global: [{ name: 'klaviyo', weight: 68 }, { name: '_klOnsite', weight: 65 }],
        script: [{ re: 'static\\.klaviyo\\.com|a\\.klaviyo\\.com|klaviyo\\.js', weight: 80 }],
        html: [{ re: 'klaviyo', weight: 45 }]
      }
    },
    {
      name: 'Yotpo',
      category: 'Ecommerce',
      patterns: {
        global: [{ name: 'yotpo', weight: 60 }],
        script: [{ re: 'staticw2\\.yotpo\\.com|cdn-loyalty\\.yotpo\\.com|cdn-widgetsrepository\\.yotpo\\.com', weight: 75 }],
        html: [{ re: 'yotpo', weight: 45 }]
      }
    },
    {
      name: 'Judge.me',
      category: 'Ecommerce',
      patterns: {
        script: [{ re: 'cdn\\.judge\\.me|judge\\.me/', weight: 75 }],
        html: [{ re: 'jdgm-|judgeme|judge\\.me', weight: 55 }]
      }
    },
    {
      name: 'Recharge',
      category: 'Ecommerce',
      patterns: {
        script: [{ re: 'static\\.rechargecdn\\.com|rechargepayments|rechargeapps', weight: 72 }],
        html: [{ re: 'recharge|rc_widget|rechargecdn', weight: 45 }]
      }
    },
    {
      name: 'Stamped.io',
      category: 'Ecommerce',
      patterns: {
        script: [{ re: 'cdn-stamped-io|stamped\\.io', weight: 72 }],
        html: [{ re: 'stamped-io|stamped\\.io', weight: 45 }]
      }
    },

    /* -------------------------------------------------------- Framework */
    {
      name: 'React',
      category: 'Framework',
      patterns: {
        global: [{ name: 'React', weight: 45 }],
        html: [{ re: 'data-reactroot|data-reactid|_reactListening|__reactContainer', weight: 55 }],
        script: [{ re: 'react(-dom)?(\\.production)?(\\.min)?\\.js|/react@\\d|/react/umd/', weight: 55 }]
      }
    },
    {
      name: 'Vue.js',
      category: 'Framework',
      patterns: {
        global: [{ name: 'Vue', weight: 55 }, { name: '__VUE__', weight: 50 }],
        html: [{ re: 'data-v-[a-f0-9]{8}|data-server-rendered|v-cloak|__vue__', weight: 55 }],
        script: [{ re: 'vue(@|\\.)(runtime|global|\\d)|vue\\.(min|runtime)|/vue@\\d', weight: 55 }]
      }
    },
    {
      name: 'Next.js',
      category: 'Framework',
      implies: ['React'],
      patterns: {
        global: [{ name: '__NEXT_DATA__', weight: 90 }],
        html: [{ re: 'id="__next"|/_next/static/|__NEXT_DATA__', weight: 75 }],
        script: [{ re: '/_next/static/', weight: 80 }],
        header: [{ name: 'x-powered-by', re: 'Next\\.js', weight: 85 }]
      }
    },
    {
      name: 'Nuxt.js',
      category: 'Framework',
      implies: ['Vue.js'],
      patterns: {
        global: [{ name: '__NUXT__', weight: 90 }],
        html: [{ re: 'id="__nuxt"|id="__layout"|/_nuxt/|window\\.__NUXT__', weight: 75 }],
        script: [{ re: '/_nuxt/', weight: 80 }]
      }
    },
    {
      name: 'Angular',
      category: 'Framework',
      patterns: {
        global: [{ name: 'getAllAngularRootElements', weight: 60 }, { name: 'ng', weight: 40 }],
        html: [{ re: 'ng-version=|_nghost-|_ngcontent-|ng-app|ng-star-inserted', weight: 65 }],
        script: [{ re: 'zone\\.js|@angular|(runtime|polyfills|main)\\.[a-f0-9]+\\.js|angular(\\.min)?\\.js', weight: 50 }]
      }
    },
    {
      name: 'Svelte / SvelteKit',
      category: 'Framework',
      patterns: {
        html: [{ re: 'svelte-[a-z0-9]{5,}|data-sveltekit|__sveltekit', weight: 60 }],
        script: [{ re: '/_app/immutable/|/build/bundle.*svelte|svelte', weight: 65 }]
      }
    },
    {
      name: 'jQuery',
      category: 'Framework',
      patterns: {
        global: [{ name: 'jQuery', weight: 70 }],
        script: [{ re: 'jquery[-.](\\d|min|slim)|code\\.jquery\\.com|/jquery@\\d|ajax\\.googleapis\\.com/ajax/libs/jquery', weight: 55 }]
      }
    },
    {
      name: 'Gatsby',
      category: 'Framework',
      implies: ['React'],
      patterns: {
        global: [{ name: '___gatsby', weight: 60 }],
        html: [{ re: 'id="___gatsby"|___gatsby|gatsby-focus-wrapper', weight: 70 }],
        script: [{ re: '/page-data/|webpack-runtime-[a-f0-9]+\\.js|framework-[a-f0-9]+\\.js', weight: 50 }]
      }
    },
    {
      name: 'Alpine.js',
      category: 'Framework',
      patterns: {
        global: [{ name: 'Alpine', weight: 70 }],
        html: [{ re: '\\bx-data=|\\bx-init=|\\bx-show=|\\b@click=', weight: 50 }],
        script: [{ re: 'alpinejs|alpine(\\.min)?\\.js|cdn\\.jsdelivr\\.net/npm/alpinejs', weight: 65 }]
      }
    },
    {
      name: 'Ember.js',
      category: 'Framework',
      patterns: {
        global: [{ name: 'Ember', weight: 75 }],
        html: [{ re: 'ember-view|id="ember\\d+"|ember-application', weight: 65 }],
        script: [{ re: 'ember\\.(debug|prod|min)?\\.js|/assets/vendor[^"]*ember', weight: 50 }]
      }
    },
    {
      name: 'Preact',
      category: 'Framework',
      patterns: {
        global: [{ name: 'preact', weight: 55 }],
        html: [{ re: '__preact|preact', weight: 40 }],
        script: [{ re: 'preact(\\.min)?\\.js|/preact@\\d', weight: 60 }]
      }
    },
    {
      name: 'Backbone.js',
      category: 'Framework',
      patterns: {
        global: [{ name: 'Backbone', weight: 75 }],
        script: [{ re: 'backbone(-min|\\.min)?\\.js|/backbone@\\d', weight: 55 }]
      }
    },

    /* ------------------------------------------------------ Page Builder */
    {
      name: 'Elementor',
      category: 'Page Builder',
      implies: ['WordPress'],
      patterns: {
        meta: [{ re: 'Elementor', weight: 90 }],
        global: [{ name: 'elementorFrontend', weight: 80 }],
        html: [{ re: 'elementor-|data-elementor-|class="[^"]*elementor', weight: 75 }],
        script: [{ re: '/elementor/assets/|elementor-frontend', weight: 75 }]
      }
    },
    {
      name: 'Divi',
      category: 'Page Builder',
      implies: ['WordPress'],
      patterns: {
        meta: [{ re: 'Divi', weight: 80 }],
        html: [{ re: 'et_pb_|class="et_|id="et-|et-db|et_divi', weight: 72 }],
        script: [{ re: '/themes/Divi/|et-core|divi-custom', weight: 65 }]
      }
    },
    {
      name: 'WPBakery Page Builder',
      category: 'Page Builder',
      implies: ['WordPress'],
      patterns: {
        html: [{ re: 'vc_row|wpb_|js_composer|vc_column|vc_custom_', weight: 70 }],
        script: [{ re: 'js_composer|wpbakery', weight: 65 }],
        link: [{ re: 'js_composer', weight: 55 }]
      }
    },
    {
      name: 'Beaver Builder',
      category: 'Page Builder',
      implies: ['WordPress'],
      patterns: {
        html: [{ re: 'fl-builder|fl-node-|fl-row-|fl-module-', weight: 70 }],
        script: [{ re: 'bb-plugin|fl-builder', weight: 65 }]
      }
    },

    /* --------------------------------------------------------- Analytics */
    {
      name: 'Google Analytics 4',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'gtag', weight: 55 }],
        script: [{ re: 'googletagmanager\\.com/gtag/js', weight: 75 }],
        html: [{ re: "G-[A-Z0-9]{8,}|gtag\\('config',\\s*'G-", weight: 80 }]
      }
    },
    {
      name: 'Google Analytics (Universal)',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'ga', weight: 40 }],
        script: [{ re: 'google-analytics\\.com/(analytics|ga)\\.js', weight: 70 }],
        html: [{ re: "UA-\\d{4,}-\\d+|ga\\('create'|_gaq\\.push", weight: 70 }]
      }
    },
    {
      name: 'Google Tag Manager',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'google_tag_manager', weight: 70 }],
        script: [{ re: 'googletagmanager\\.com/gtm\\.js', weight: 85 }],
        html: [{ re: 'googletagmanager\\.com/ns\\.html|GTM-[A-Z0-9]{4,}', weight: 75 }]
      }
    },
    {
      name: 'Hotjar',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'hj', weight: 72 }, { name: '_hjSettings', weight: 72 }],
        script: [{ re: 'static\\.hotjar\\.com|script\\.hotjar\\.com', weight: 80 }],
        html: [{ re: 'hotjar|hjSiteSettings|_hjSettings', weight: 50 }]
      }
    },
    {
      name: 'Microsoft Clarity',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'clarity', weight: 72 }],
        script: [{ re: '(www\\.)?clarity\\.ms/tag|clarity\\.ms/s/', weight: 80 }],
        html: [{ re: 'clarity\\.ms|clarity\\("set"|clarity\\("start"', weight: 55 }]
      }
    },
    {
      name: 'Mixpanel',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'mixpanel', weight: 78 }],
        script: [{ re: 'cdn\\.mxpnl\\.com|cdn4?\\.mxpnl|mixpanel', weight: 70 }],
        html: [{ re: 'mixpanel', weight: 40 }]
      }
    },
    {
      name: 'Segment',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'analytics', weight: 45 }],
        script: [{ re: 'cdn\\.segment\\.(com|io)/analytics\\.js|cdn\\.segment', weight: 80 }],
        html: [{ re: 'analytics\\.load\\(|cdn\\.segment\\.', weight: 55 }]
      }
    },
    {
      name: 'Amplitude',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'amplitude', weight: 78 }],
        script: [{ re: 'cdn\\.amplitude\\.com|api\\.amplitude\\.com|amplitude-\\d', weight: 70 }],
        html: [{ re: 'amplitude', weight: 40 }]
      }
    },
    {
      name: 'Plausible',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'plausible', weight: 65 }],
        script: [{ re: 'plausible\\.io/js|plausible', weight: 80 }],
        html: [{ re: 'data-domain=|plausible', weight: 45 }]
      }
    },
    {
      name: 'Matomo',
      category: 'Analytics',
      patterns: {
        global: [{ name: '_paq', weight: 72 }, { name: 'Matomo', weight: 68 }, { name: 'Piwik', weight: 55 }],
        script: [{ re: 'matomo\\.js|piwik\\.js|matomo\\.php', weight: 75 }],
        html: [{ re: 'matomo|piwik', weight: 45 }]
      }
    },
    {
      name: 'Fathom Analytics',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'fathom', weight: 65 }],
        script: [{ re: 'cdn\\.usefathom\\.com', weight: 80 }],
        html: [{ re: 'usefathom|data-site="[A-Z]{6,}"', weight: 45 }]
      }
    },
    {
      name: 'Heap',
      category: 'Analytics',
      patterns: {
        global: [{ name: 'heap', weight: 76 }],
        script: [{ re: 'cdn\\.heapanalytics\\.com|heapanalytics', weight: 72 }],
        html: [{ re: 'heapanalytics|heap\\.load', weight: 45 }]
      }
    },

    /* ----------------------------------------------------------- Ad Tech */
    {
      name: 'Google AdSense',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'adsbygoogle', weight: 68 }],
        script: [{ re: 'pagead2\\.googlesyndication\\.com|adsbygoogle\\.js', weight: 80 }],
        html: [{ re: 'adsbygoogle|ca-pub-\\d+|data-ad-client', weight: 65 }]
      }
    },
    {
      name: 'Facebook Pixel',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'fbq', weight: 78 }, { name: '_fbq', weight: 68 }],
        script: [{ re: 'connect\\.facebook\\.net/[^"\']*/fbevents\\.js', weight: 80 }],
        html: [{ re: "fbevents\\.js|fbq\\('init'|facebook\\.com/tr\\?", weight: 65 }]
      }
    },
    {
      name: 'Criteo',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'criteo_q', weight: 65 }],
        script: [{ re: 'static\\.criteo\\.net|criteo', weight: 75 }],
        html: [{ re: 'criteo', weight: 45 }]
      }
    },
    {
      name: 'Taboola',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: '_taboola', weight: 70 }],
        script: [{ re: 'cdn\\.taboola\\.com|taboola', weight: 75 }],
        html: [{ re: 'taboola', weight: 45 }]
      }
    },
    {
      name: 'Outbrain',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'OBR', weight: 60 }],
        script: [{ re: 'widgets\\.outbrain\\.com|outbrain', weight: 75 }],
        html: [{ re: 'outbrain|ob_widget|OB-', weight: 45 }]
      }
    },
    {
      name: 'Google Publisher Tag',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'googletag', weight: 68 }],
        script: [{ re: 'securepubads\\.g\\.doubleclick\\.net/tag/js/gpt\\.js|googletagservices\\.com/tag/js/gpt', weight: 80 }],
        html: [{ re: 'googletag|data-google-query-id', weight: 45 }]
      }
    },
    {
      name: 'X (Twitter) Pixel',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'twq', weight: 70 }],
        script: [{ re: 'static\\.ads-twitter\\.com|analytics\\.twitter\\.com', weight: 78 }],
        html: [{ re: "twq\\('init'|ads-twitter", weight: 50 }]
      }
    },
    {
      name: 'LinkedIn Insight Tag',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: '_linkedin_data_partner_ids', weight: 70 }],
        script: [{ re: 'snap\\.licdn\\.com/li\\.lms-analytics|px\\.ads\\.linkedin\\.com', weight: 78 }],
        html: [{ re: '_linkedin_partner_id|licdn\\.com/li\\.lms', weight: 55 }]
      }
    },
    {
      name: 'TikTok Pixel',
      category: 'Ad Tech',
      patterns: {
        global: [{ name: 'ttq', weight: 72 }],
        script: [{ re: 'analytics\\.tiktok\\.com', weight: 78 }],
        html: [{ re: 'ttq\\.load|analytics\\.tiktok', weight: 50 }]
      }
    },

    /* --------------------------------------------------- Chat / Support */
    {
      name: 'Intercom',
      category: 'Chat / Support',
      patterns: {
        global: [{ name: 'Intercom', weight: 80 }],
        script: [{ re: 'widget\\.intercom\\.io|js\\.intercomcdn\\.com', weight: 75 }],
        html: [{ re: 'intercomSettings|intercom\\.io|intercomcdn', weight: 50 }]
      }
    },
    {
      name: 'Zendesk',
      category: 'Chat / Support',
      patterns: {
        global: [{ name: 'zE', weight: 75 }, { name: 'zEmbed', weight: 70 }],
        script: [{ re: 'static\\.zdassets\\.com|zopim\\.com|zendesk', weight: 75 }],
        html: [{ re: 'zdassets|zopim|zendesk', weight: 50 }]
      }
    },
    {
      name: 'Drift',
      category: 'Chat / Support',
      patterns: {
        global: [{ name: 'drift', weight: 72 }, { name: 'driftt', weight: 68 }],
        script: [{ re: 'js\\.driftt\\.com|widget\\.drift\\.com', weight: 75 }],
        html: [{ re: 'driftt|drift\\.com/', weight: 45 }]
      }
    },
    {
      name: 'Tawk.to',
      category: 'Chat / Support',
      patterns: {
        global: [{ name: 'Tawk_API', weight: 80 }],
        script: [{ re: 'embed\\.tawk\\.to|tawk\\.to', weight: 80 }],
        html: [{ re: 'tawk\\.to|Tawk_API', weight: 50 }]
      }
    },
    {
      name: 'Crisp',
      category: 'Chat / Support',
      patterns: {
        global: [{ name: '$crisp', weight: 80 }, { name: 'CRISP_WEBSITE_ID', weight: 75 }],
        script: [{ re: 'client\\.crisp\\.chat', weight: 78 }],
        html: [{ re: 'crisp\\.chat|CRISP_WEBSITE_ID', weight: 50 }]
      }
    },

    /* ------------------------------------------------ CAPTCHA / Security */
    {
      name: 'reCAPTCHA',
      category: 'CAPTCHA / Security',
      patterns: {
        global: [{ name: 'grecaptcha', weight: 72 }],
        script: [{ re: '(www\\.google\\.com|www\\.gstatic\\.com|www\\.recaptcha\\.net)/recaptcha/', weight: 75 }],
        html: [{ re: 'g-recaptcha|grecaptcha|data-sitekey', weight: 50 }]
      }
    },
    {
      name: 'hCaptcha',
      category: 'CAPTCHA / Security',
      patterns: {
        global: [{ name: 'hcaptcha', weight: 72 }],
        script: [{ re: 'js\\.hcaptcha\\.com|hcaptcha\\.com/1/api\\.js', weight: 78 }],
        html: [{ re: 'h-captcha|hcaptcha', weight: 55 }]
      }
    },
    {
      name: 'Cloudflare Turnstile',
      category: 'CAPTCHA / Security',
      patterns: {
        global: [{ name: 'turnstile', weight: 68 }],
        script: [{ re: 'challenges\\.cloudflare\\.com/turnstile', weight: 85 }],
        html: [{ re: 'cf-turnstile|turnstile', weight: 55 }]
      }
    },

    /* ------------------------------------------------------ CDN / Hosting */
    {
      name: 'Cloudflare',
      category: 'CDN / Hosting',
      patterns: {
        script: [{ re: 'static\\.cloudflareinsights\\.com|/cdn-cgi/', weight: 55 }],
        html: [{ re: 'cdn-cgi/|cloudflareinsights|__cf_bm', weight: 40 }],
        header: [
          { name: 'cf-ray', weight: 85 },
          { name: 'server', re: 'cloudflare', weight: 80 },
          { name: 'cf-cache-status', weight: 72 }
        ]
      }
    },
    {
      name: 'Vercel',
      category: 'CDN / Hosting',
      patterns: {
        html: [{ re: '/_vercel/|vercel\\.app', weight: 35 }],
        header: [
          { name: 'x-vercel-id', weight: 85 },
          { name: 'server', re: 'Vercel', weight: 80 },
          { name: 'x-vercel-cache', weight: 78 }
        ]
      }
    },
    {
      name: 'Netlify',
      category: 'CDN / Hosting',
      patterns: {
        html: [{ re: 'netlify\\.app|/.netlify/', weight: 35 }],
        header: [
          { name: 'x-nf-request-id', weight: 85 },
          { name: 'server', re: 'Netlify', weight: 80 }
        ]
      }
    },
    {
      name: 'AWS CloudFront',
      category: 'CDN / Hosting',
      patterns: {
        header: [
          { name: 'x-amz-cf-id', weight: 80 },
          { name: 'via', re: 'cloudfront', weight: 72 },
          { name: 'x-cache', re: 'cloudfront', weight: 55 },
          { name: 'server', re: 'AmazonS3', weight: 50 }
        ]
      }
    }
  ];

  var api = { FINGERPRINTS: FINGERPRINTS, CATEGORY_ORDER: CATEGORY_ORDER };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.SP_FINGERPRINTS = FINGERPRINTS;
    window.SP_CATEGORY_ORDER = CATEGORY_ORDER;
  }
})();
