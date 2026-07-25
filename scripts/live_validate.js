/*
 * StackPeek live validation harness.
 *
 * Drives real Chromium to real websites, runs the EXTENSION'S OWN
 * collectSignalsInPage() + collectHeadersInPage() inside each page (the exact
 * self-contained functions chrome.scripting.executeScript would inject), then
 * runs the EXTENSION'S OWN detect() engine on the results — i.e. the real
 * detection code path, exercised on live DOMs. Only the popup chrome is not
 * involved.
 */
const { chromium } = require('playwright-core');
const path = require('path');

// Load the real extension modules.
const ROOT = path.join(__dirname, '..', 'stackpeek');
const { collectSignalsInPage } = require(path.join(ROOT, 'inject', 'collect-signals.js'));
const { collectHeadersInPage } = require(path.join(ROOT, 'engine', 'headers.js'));

// Give detect.js a window with the fingerprint DB (it reads window.SP_*).
global.window = {};
const fp = require(path.join(ROOT, 'data', 'fingerprints.js'));
global.window.SP_FINGERPRINTS = fp.FINGERPRINTS;
global.window.SP_CATEGORY_ORDER = fp.CATEGORY_ORDER;
require(path.join(ROOT, 'engine', 'detect.js'));
const detect = global.window.SP_detect;

const SITES = process.argv.slice(2);

function fmt(result, ms) {
  const lines = [];
  lines.push(`   ${result.count} detected · ${ms} ms` + (result.headerNote ? '  (headers blocked: ' + result.headerNote + ')' : ''));
  for (const cat of result.categories) {
    const items = cat.items.map(i => i.name + (i.version ? ' ' + i.version : '') + ` (${i.confidence}%${i.implied ? ' inferred' : ''})`).join(', ');
    lines.push(`   ${cat.category}: ${items}`);
  }
  if (!result.count) lines.push('   (nothing crossed the confidence threshold)');
  return lines.join('\n');
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    proxy: { server: process.env.HTTPS_PROXY },
    args: [
      '--no-sandbox',
      '--disable-quic',
      '--test-type',
      '--disable-gpu',
      '--ignore-certificate-errors',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });

  for (const url of SITES) {
    const page = await ctx.newPage();
    const t0 = Date.now();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(3000); // let late analytics/globals attach
      const signals = await page.evaluate(collectSignalsInPage);
      let headerResult = { headers: {}, ok: false, note: 'not run' };
      try { headerResult = await page.evaluate(collectHeadersInPage); } catch (e) { headerResult = { headers: {}, ok: false, note: 'header eval failed' }; }
      const result = detect(signals, headerResult);
      const ms = Date.now() - t0;
      console.log(`\n=== ${signals.hostname || url} ===`);
      console.log(fmt(result, ms));
    } catch (err) {
      console.log(`\n=== ${url} ===`);
      console.log('   NAV FAILED: ' + (err && err.message ? err.message.split('\n')[0] : err));
    } finally {
      await page.close();
    }
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
