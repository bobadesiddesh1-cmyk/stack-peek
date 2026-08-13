/* Build a static preview of the side-panel UI (real sidepanel.css + real
 * bundled logos + a sample elementor.com result) for visual approval. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'stackpeek');
const LOGOS = require(path.join(ROOT, 'data', 'logos.js'));

const CAT_COLOR = { 'CMS':'#3b6fe0','Ecommerce':'#16a34a','Framework':'#7c3aed','UI Framework':'#db2777','JS Library':'#0891b2','Page Builder':'#ea580c','Analytics':'#d97706','Tag Manager':'#059669','Ad Tech':'#dc2626','Chat / Support':'#0284c7','Payments':'#15803d','Video':'#e11d48','Maps':'#2563eb','Fonts':'#c026d3','CAPTCHA / Security':'#b91c1c','CDN / Hosting':'#4f46e5','Web Server':'#475569','Programming Language':'#b45309','Miscellaneous':'#64748b' };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const tier = c => c>=80?'t-high':c>=50?'t-med':'t-low';
function mono(n){ const m=String(n).replace(/[^a-z0-9]/i,''); return (m[0]||'?').toUpperCase(); }
function logo(item){
  const l = LOGOS[item.name];
  if (l) return `<span class="sp-tile"><svg viewBox="0 0 24 24" fill="#${l.h}"><path d="${l.p}"/></svg></span>`;
  const c = CAT_COLOR[item.category]||'#64748b';
  return `<span class="sp-tile sp-mono" style="background:${c}">${esc(mono(item.name))}</span>`;
}
const CHEV = '<svg class="sp-chev" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function row(it, open){
  const ver = it.version?`<span class="sp-ver">${esc(it.version)}</span>`:'';
  const evi = (it.evi||[]).map(e=>`<div class="sp-evi-row"><span class="sp-chip sp-chip-${e.t}">${e.t==='global'?'global':e.t}</span><span class="sp-evi-text">${e.x}</span></div>`).join('');
  return `<div class="sp-row${open?' sp-open':''}" tabindex="0">${logo(it)}<div class="sp-main-col"><div class="sp-name-line"><span class="sp-name">${esc(it.name)}</span>${ver}</div><div class="sp-sub">${esc(it.sub)}</div></div>${CHEV}</div>`+
    `<div class="sp-evi"${open?' style="display:block"':''}><div class="sp-evi-label">Evidence</div>${evi}</div>`;
}
function cat(name, items){
  return `<div class="sp-cat"><div class="sp-cat-head"><span class="sp-cat-name">${esc(name)}</span><span class="sp-cat-count">${items.length}</span><span class="sp-cat-rule"></span></div>${items.map((it,i)=>row(it, name==='CMS'&&i===0)).join('')}</div>`;
}

const DATA = [
  ['CMS',[{name:'WordPress',category:'CMS',c:100,version:'7.0.2',sub:'generator tag · script URL · HTTP header',evi:[{t:'meta',x:'matched the page&rsquo;s generator meta tag'},{t:'script',x:'a known script URL pattern (<code>/wp-content/</code>)'},{t:'header',x:'response header <code>link: api.w.org</code>'}]}]],
  ['Page Builder',[{name:'Elementor',category:'Page Builder',c:100,version:'4.2.0',sub:'generator tag · HTML pattern'}]],
  ['Framework',[{name:'jQuery',category:'Framework',c:55,version:'3.7.1',sub:'script URL'}]],
  ['JS Library',[{name:'Swiper',category:'JS Library',c:100,sub:'HTML pattern · script URL'},{name:'GSAP',category:'JS Library',c:65,sub:'script URL'}]],
  ['Tag Manager',[{name:'Google Tag Manager',category:'Tag Manager',c:72,version:'GTM-NJK8HW',sub:'script URL'}]],
  ['Fonts',[{name:'Font Awesome',category:'Fonts',c:45,sub:'stylesheet'}]],
  ['CDN / Hosting',[{name:'Cloudflare',category:'CDN / Hosting',c:100,sub:'HTTP header'},{name:'jsDelivr',category:'CDN / Hosting',c:68,sub:'script URL'},{name:'unpkg',category:'CDN / Hosting',c:66,sub:'script URL'}]],
  ['Miscellaneous',[{name:'Open Graph',category:'Miscellaneous',c:55,sub:'HTML pattern'},{name:'RSS / Atom Feed',category:'Miscellaneous',c:55,sub:'HTML pattern'}]]
];
const results = DATA.map(([n,items])=>cat(n,items)).join('');

let css = fs.readFileSync(path.join(ROOT,'sidepanel','sidepanel.css'),'utf8');
css = css.replace('html, body { margin: 0; padding: 0; height: 100%; }','');
css = css.replace('body {\n  font-family', '.panel {\n  font-family');

const logo48 = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT,'icons','icon48.png')).toString('base64');

const html = `<title>StackPeek — Side Panel Preview</title>
<style>
${css}
.stage { min-height:100vh; margin:0; background:linear-gradient(160deg,#eef1f6,#e3e8f0); display:flex; flex-direction:column; align-items:center; gap:20px; padding:38px 20px 60px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
.hd { text-align:center; max-width:600px; }
.hd h1 { margin:0 0 8px; font-size:22px; font-weight:680; letter-spacing:-.5px; color:#1a1f2b; }
.hd p { margin:0; font-size:13.5px; color:#5b6474; line-height:1.6; }
.win { width:390px; border-radius:14px; overflow:hidden; box-shadow:0 24px 60px rgba(30,41,80,.22), 0 0 0 1px rgba(0,0,0,.05); background:#fff; }
.winbar { height:32px; background:#f2f4f8; border-bottom:1px solid #e7e9ef; display:flex; align-items:center; padding:0 12px; gap:6px; }
.winbar i { width:9px; height:9px; border-radius:50%; display:block; } .winbar .a{background:#ff5f57}.winbar .b{background:#febc2e}.winbar .c{background:#28c840}
.winbar span { margin-left:8px; font-size:11px; color:#8a93a5; }
.panel { width:390px; height:640px; overflow-y:auto; }
.panel .sp { height:640px; }
.cap { font-size:12px; color:#7a8393; text-align:center; max-width:420px; }
</style>
<div class="stage">
  <div class="hd"><h1>StackPeek — new side panel</h1><p>Clean &amp; light, real technology logos, docked panel. The actual <code>sidepanel.css</code> with real bundled logos, populated from the live <b>elementor.com</b> scan. Click a row to expand its evidence.</p></div>
  <div class="win">
    <div class="winbar"><i class="a"></i><i class="b"></i><i class="c"></i><span>Side panel</span></div>
    <div class="panel"><div class="sp">
      <header class="sp-top"><div class="sp-brand"><img class="sp-logo" src="${logo48}" alt=""><span class="sp-word">Stack<b>Peek</b></span></div>
        <div class="sp-top-actions"><button class="sp-icon-btn"><svg viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="sp-icon-btn"><svg viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>
      </header>
      <nav class="sp-tabs"><button class="sp-tab is-active">Detected</button><button class="sp-tab">History</button></nav>
      <div class="sp-site"><div class="sp-site-host">elementor.com</div><div class="sp-site-meta">13 technologies detected</div></div>
      <main class="sp-body"><section class="sp-panel is-active">${results}</section></main>
      <footer class="sp-foot"><div class="sp-foot-row"><span class="sp-foot-badge">100% local</span><span class="sp-foot-text">No account · no limits · no telemetry</span></div><a class="sp-credit" href="https://www.buildwithsiddesh.com/?utm_source=stackpeek&amp;utm_medium=extension&amp;utm_campaign=sidepanel" target="_blank" rel="noopener"><svg class="sp-bws" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#c8f135"/><path d="M7.4 7.6 C5.9 8.2 5.2 9.4 5.4 11 C5.6 12.4 5.2 13.4 4.2 14 C5.4 14.7 5.9 15.8 5.7 17.3 C5.5 18.9 6.1 20.2 7.6 20.9" stroke="#0a0a0c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M24.6 7.6 C26.1 8.2 26.8 9.4 26.6 11 C26.4 12.4 26.8 13.4 27.8 14 C26.6 14.7 26.1 15.8 26.3 17.3 C26.5 18.9 25.9 20.2 24.4 20.9" stroke="#0a0a0c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 7.8 H17 C19.2 7.8 20.7 9 20.7 11 C20.7 12.4 19.9 13.4 18.6 13.9 C20.2 14.3 21.1 15.5 21.1 17.1 C21.1 19.2 19.5 20.4 17.2 20.4 H12 Z M14.7 10.1 V12.9 H16.7 C17.7 12.9 18.3 12.4 18.3 11.5 C18.3 10.6 17.7 10.1 16.7 10.1 Z M14.7 15 V18.1 H17 C18 18.1 18.6 17.5 18.6 16.5 C18.6 15.6 18 15 17 15 Z" fill="#0a0a0c"/></svg><span class="sp-credit-txt"><span class="sp-credit-kicker">Peeked &amp; shipped by</span><span class="sp-credit-brand">Build with Siddesh</span></span><svg class="sp-credit-go" viewBox="0 0 16 16" fill="none"><path d="M5 11L11 5M11 5H6M11 5V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a></footer>
    </div></div>
  </div>
  <p class="cap">This is a static mockup of the real panel — the shipped extension renders exactly this from live detection. The panel is resizable; drag it wider for more room.</p>
</div>
<script>
document.querySelectorAll('.sp-row').forEach(function(r){ r.addEventListener('click',function(){ var open=r.classList.toggle('sp-open'); var e=r.nextElementSibling; if(e&&e.classList.contains('sp-evi')) e.style.display=open?'block':'none'; }); });
</script>`;

fs.writeFileSync(path.join(__dirname,'..','scratch_preview_panel.html'), html);
console.log('preview written');
