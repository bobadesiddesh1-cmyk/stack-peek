/* Generate Chrome Web Store graphic assets (screenshots + promo tiles) by
 * rendering real UI/branding HTML with Playwright and capturing JPEG (no alpha,
 * which the store requires). Output: scratchpad/store/*.jpg */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'stackpeek');
const OUT = '/tmp/claude-0/-home-user-stack-peek/b53a80eb-4b01-5099-9fde-ebbdd415d793/scratchpad/store';
fs.mkdirSync(OUT, { recursive: true });

const LOGOS = require(path.join(ROOT, 'data', 'logos.js'));
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'icons', 'icon128.png')).toString('base64');

// --- panel CSS (scope body -> .panel) ---
let css = fs.readFileSync(path.join(ROOT, 'sidepanel', 'sidepanel.css'), 'utf8');
css = css.replace('html, body { margin: 0; padding: 0; height: 100%; }', '');
css = css.replace('body {\n  font-family', '.panel {\n  font-family');

const CAT_COLOR = { 'CMS':'#3b6fe0','Page Builder':'#ea580c','Framework':'#7c3aed','JS Library':'#0891b2','Tag Manager':'#059669','Fonts':'#c026d3','CDN / Hosting':'#4f46e5','Miscellaneous':'#64748b' };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function mono(n){ const m=String(n).replace(/[^a-z0-9]/i,''); return (m[0]||'?').toUpperCase(); }
function logo(it){ const l=LOGOS[it.name]; if(l) return `<span class="sp-tile"><svg viewBox="0 0 24 24" fill="#${l.h}"><path d="${l.p}"/></svg></span>`; const c=CAT_COLOR[it.category]||'#64748b'; return `<span class="sp-tile sp-mono" style="background:${c}">${esc(mono(it.name))}</span>`; }
const CHEV='<svg class="sp-chev" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function row(it,open){ const ver=it.version?`<span class="sp-ver">${esc(it.version)}</span>`:''; const evi=(it.evi||[]).map(e=>`<div class="sp-evi-row"><span class="sp-chip sp-chip-${e.t}">${e.t}</span><span class="sp-evi-text">${e.x}</span></div>`).join(''); return `<div class="sp-row${open?' sp-open':''}">${logo(it)}<div class="sp-main-col"><div class="sp-name-line"><span class="sp-name">${esc(it.name)}</span>${ver}</div><div class="sp-sub">${esc(it.sub)}</div></div>${CHEV}</div><div class="sp-evi"${open?' style="display:block"':''}>${open?`<div class="sp-evi-label">Evidence</div>${evi}`:''}</div>`; }
function cat(name,items,openFirst){ return `<div class="sp-cat"><div class="sp-cat-head"><span class="sp-cat-name">${esc(name)}</span><span class="sp-cat-count">${items.length}</span><span class="sp-cat-rule"></span></div>${items.map((it,i)=>row(it,openFirst&&i===0)).join('')}</div>`; }

const DATA = [
  ['CMS',[{name:'WordPress',category:'CMS',c:100,version:'7.0.2',sub:'generator tag · script URL · HTTP header',evi:[{t:'meta',x:'matched the page&rsquo;s generator meta tag'},{t:'script',x:'a known script URL pattern (<code>/wp-content/</code>)'},{t:'header',x:'response header <code>link: api.w.org</code>'}]}]],
  ['Page Builder',[{name:'Elementor',category:'Page Builder',c:100,version:'4.2.0',sub:'generator tag · HTML pattern'}]],
  ['Framework',[{name:'jQuery',category:'Framework',c:55,version:'3.7.1',sub:'script URL'}]],
  ['JS Library',[{name:'Swiper',category:'JS Library',c:100,sub:'HTML pattern · script URL'},{name:'GSAP',category:'JS Library',c:65,sub:'script URL'}]],
  ['Tag Manager',[{name:'Google Tag Manager',category:'Tag Manager',c:72,version:'GTM-NJK8HW',sub:'script URL'}]],
  ['CDN / Hosting',[{name:'Cloudflare',category:'CDN / Hosting',c:100,sub:'HTTP header'},{name:'jsDelivr',category:'CDN / Hosting',c:68,sub:'script URL'}]],
  ['Fonts',[{name:'Font Awesome',category:'Fonts',c:45,sub:'stylesheet'}]]
];
function panel(openEvidence){
  const body = DATA.map(([n,items])=>cat(n,items, openEvidence && n==='CMS')).join('');
  return `<div class="panel"><div class="sp">
    <header class="sp-top"><div class="sp-brand"><img class="sp-logo" src="${icon}"><span class="sp-word">Stack<b>Peek</b></span></div>
      <div class="sp-top-actions"><button class="sp-icon-btn"><svg viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="sp-icon-btn"><svg viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div></header>
    <nav class="sp-tabs"><button class="sp-tab is-active">Detected</button><button class="sp-tab">History</button></nav>
    <div class="sp-site"><div class="sp-site-host">elementor.com</div><div class="sp-site-meta">13 technologies detected</div></div>
    <main class="sp-body"><section class="sp-panel is-active">${body}</section></main>
    <footer class="sp-foot"><span class="sp-foot-badge">100% local</span><span class="sp-foot-text">No account · no limits · no telemetry</span></footer>
  </div></div>`;
}

const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif`;
function screenshot(headline, sub, openEvidence){
  return `<!doctype html><meta charset="utf-8"><style>${css}
  html,body{margin:0} .shot{width:1280px;height:800px;display:flex;align-items:center;gap:60px;padding:0 80px;box-sizing:border-box;font-family:${FONT};
    background:radial-gradient(120% 100% at 100% 0%,#ede9fe 0%,#eef2ff 40%,#e7ecfb 100%);}
  .left{flex:1;max-width:520px}
  .chip{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid #e6e9ef;border-radius:999px;padding:7px 14px 7px 8px;box-shadow:0 2px 8px rgba(40,50,90,.06)}
  .chip img{width:26px;height:26px;border-radius:7px} .chip b{font-size:15px;color:#1a1f2b;font-weight:650} .chip b span{color:#5b46e5}
  h1{font-size:46px;line-height:1.1;letter-spacing:-1.2px;color:#171b28;margin:26px 0 16px;font-weight:720}
  p{font-size:19px;line-height:1.55;color:#59617a;margin:0 0 26px;max-width:460px}
  .ticks{display:flex;flex-direction:column;gap:11px}
  .tick{display:flex;align-items:center;gap:11px;font-size:16px;color:#2b3145;font-weight:560}
  .tick i{width:22px;height:22px;border-radius:50%;background:#ecfdf3;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:13px;border:1px solid #c3ead1}
  .panel{width:400px;height:672px;overflow:hidden;border-radius:18px;box-shadow:0 30px 70px rgba(50,40,110,.24),0 0 0 1px rgba(20,20,50,.05);background:#fff}
  .panel .sp{min-height:0}
  </style>
  <div class="shot"><div class="left">
    <div class="chip"><img src="${icon}"><b>Stack<span>Peek</span></b></div>
    <h1>${headline}</h1><p>${sub}</p>
    <div class="ticks"><div class="tick"><i>&#10003;</i> No account, no sign-up</div><div class="tick"><i>&#10003;</i> No lookup limits, ever</div><div class="tick"><i>&#10003;</i> 100% local &mdash; nothing leaves your browser</div></div>
  </div>${panel(openEvidence)}</div>`;
}
function promo(w,h,big){
  const logos = ['react','shopify','wordpress','googletagmanager','cloudflare','stripe','vuedotjs','nextdotjs'];
  const strip = big ? `<div class="strip">${['WordPress','Shopify','React','Next.js','Google Tag Manager','Cloudflare','Stripe','jQuery'].map(n=>{const l=LOGOS[n];return l?`<span class="lg"><svg viewBox="0 0 24 24" fill="#${l.h}"><path d="${l.p}"/></svg></span>`:''}).join('')}</div>`:'';
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}
  .tile{width:${w}px;height:${h}px;box-sizing:border-box;font-family:${FONT};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${big?18:10}px;text-align:center;
    background:linear-gradient(135deg,#6d5cf0 0%,#4338ca 60%,#3730a3 100%);color:#fff;position:relative;overflow:hidden}
  .tile::after{content:"";position:absolute;inset:0;background:radial-gradient(80% 60% at 50% -10%,rgba(255,255,255,.18),transparent 60%)}
  img.ic{width:${big?96:64}px;height:${big?96:64}px;border-radius:${big?22:15}px;box-shadow:0 8px 24px rgba(0,0,0,.28);position:relative;z-index:1}
  .wm{font-size:${big?54:30}px;font-weight:740;letter-spacing:-1px;position:relative;z-index:1}
  .tg{font-size:${big?21:13.5}px;opacity:.9;max-width:${big?720:360}px;position:relative;z-index:1;line-height:1.4}
  .strip{display:flex;gap:22px;margin-top:14px;position:relative;z-index:1;opacity:.95}
  .lg{width:34px;height:34px;background:#fff;border-radius:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.2)}
  .lg svg{width:20px;height:20px}
  </style>
  <div class="tile"><img class="ic" src="${icon}"><div class="wm">StackPeek</div><div class="tg">See what any website is built on &mdash; CMS, frameworks, analytics, ad tech, hosting. One click, 100% local.</div>${strip}</div>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox','--disable-gpu','--force-color-profile=srgb'] });
  const shots = [
    ['screenshot_1', 1280, 800, screenshot('Know what any website is built on', 'One click reveals the CMS, frameworks, analytics, ad tech, payments, hosting and more &mdash; with real logos and versions.', false)],
    ['screenshot_2', 1280, 800, screenshot('See the evidence behind every detection', 'Click any technology to see exactly which signals matched &mdash; meta tags, script URLs, JavaScript globals, response headers.', true)],
    ['screenshot_3', 1280, 800, screenshot('Built for prospecting &amp; competitor research', 'Copy a clean stack summary into your sheet, keep a local history of every site &mdash; no account, no limits, 100% private.', false)],
    ['small_promo_440x280', 440, 280, promo(440,280,false)],
    ['marquee_promo_1400x560', 1400, 560, promo(1400,560,true)]
  ];
  for (const [name,w,h,html] of shots){
    const page = await browser.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
    await page.setContent(html, { waitUntil:'load' });
    await page.waitForTimeout(250);
    const buf = await page.screenshot({ type:'jpeg', quality:92, clip:{x:0,y:0,width:w,height:h} });
    fs.writeFileSync(`${OUT}/${name}.jpg`, buf);
    await page.close();
    console.log('wrote', name);
  }
  await browser.close();
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
