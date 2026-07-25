/*
 * StackPeek live validation via server-side fetch.
 *
 * Fetches each real site's actual HTML + real HTTP response headers (through the
 * session's egress proxy) and runs the EXTENSION'S OWN detect() engine on them.
 *
 * Honest limitation vs. the in-browser extension: there is no JS runtime here,
 * so window-globals (window.Shopify, window.__NEXT_DATA__, ...) are NOT probed —
 * this run exercises only the HTML / <script src> / <link> / <meta> / response-
 * header signals. Those carry most strong signatures and ALL version captures,
 * so it's a faithful test of the fingerprint matching, the false-positive fixes,
 * and version detection. In the real extension the globals add extra confidence.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', 'stackpeek');

global.window = {};
const fp = require(path.join(ROOT, 'data', 'fingerprints.js'));
global.window.SP_FINGERPRINTS = fp.FINGERPRINTS;
global.window.SP_CATEGORY_ORDER = fp.CATEGORY_ORDER;
require(path.join(ROOT, 'engine', 'detect.js'));
const detect = global.window.SP_detect;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function attr(tagRe, attrName, html) {
  var out = [];
  var m;
  var re = new RegExp(tagRe, 'gi');
  while ((m = re.exec(html))) {
    var tag = m[0];
    var am = new RegExp(attrName + '=["\\\']([^"\\\']+)["\\\']', 'i').exec(tag);
    if (am && am[1]) out.push(am[1]);
  }
  return out;
}

function metaGenerators(html) {
  var out = [];
  var re = /<meta[^>]+>/gi, m;
  while ((m = re.exec(html))) {
    var tag = m[0];
    if (/name=["']generator["']/i.test(tag)) {
      var cm = /content=["']([^"']+)["']/i.exec(tag);
      if (cm && cm[1]) out.push(cm[1]);
    }
  }
  return out;
}

function fmt(result, ms) {
  var lines = [];
  lines.push('   ' + result.count + ' detected · ' + ms + ' ms (headers: ' + (result.headerNote ? 'partial' : 'read') + ', no JS globals)');
  result.categories.forEach(function (c) {
    lines.push('   ' + c.category + ': ' + c.items.map(function (i) {
      return i.name + (i.version ? ' ' + i.version : '') + ' (' + i.confidence + '%' + (i.implied ? ' inferred' : '') + ')';
    }).join(', '));
  });
  if (!result.count) lines.push('   (nothing crossed the confidence threshold)');
  return lines.join('\n');
}

async function run(url) {
  var t0 = Date.now();
  try {
    var res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml' } });
    var html = await res.text();
    if (html.length > 2000000) html = html.slice(0, 2000000);
    var headers = {};
    res.headers.forEach(function (v, k) { headers[k.toLowerCase()] = v; });
    var u = new URL(res.url || url);
    var signals = {
      url: res.url || url,
      hostname: u.hostname,
      title: '',
      html: html,
      scripts: attr('<script[^>]+src=[^>]*>', 'src', html),
      links: attr('<link[^>]+href=[^>]*>', 'href', html),
      metaGenerators: metaGenerators(html),
      globals: {},
      cookies: []
    };
    var result = detect(signals, { headers: headers, ok: true });
    console.log('\n=== ' + u.hostname + ' ===');
    console.log(fmt(result, Date.now() - t0));
  } catch (e) {
    console.log('\n=== ' + url + ' ===');
    console.log('   FETCH FAILED: ' + (e && e.message ? e.message : e));
  }
}

(async () => {
  var urls = process.argv.slice(2);
  for (var i = 0; i < urls.length; i++) { await run(urls[i]); }
})();
