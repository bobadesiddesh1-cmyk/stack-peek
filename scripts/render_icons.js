/*
 * StackPeek icon generator — faceted prism mark.
 *
 * Renders stackpeek/icons/icon{16,32,48,128}.png from a hand-authored SVG via
 * resvg (crisp gradients + facets). Detail is size-aware: the thin facet
 * outline, gloss, and drop shadow are dropped at small sizes so the mark stays
 * clean at 16px. Re-run: `node scripts/render_icons.js`.
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'stackpeek', 'icons');

// Diamond geometry (viewBox 128). Scale slightly up at small sizes to fill.
function diamond(scale) {
  const cx = 64, cy = 64;
  const T = [64, 30], R = [100, 64], B = [64, 100], L = [28, 64], C = [64, 64];
  const s = (p) => [cx + (p[0] - cx) * scale, cy + (p[1] - cy) * scale];
  const pt = (p) => { const q = s(p); return q[0].toFixed(1) + ',' + q[1].toFixed(1); };
  return { pt, T, R, B, L, C, s };
}

function svg(size) {
  const detail = size >= 48;
  const d = diamond(detail ? 1 : 1.12);
  const gloss = detail
    ? `<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    : '';
  const shadow = detail
    ? `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3.2" flood-color="#0a1020" flood-opacity="0.30"/></filter>`
    : '';
  const glossRect = detail ? `<rect x="4" y="4" width="120" height="66" rx="28" fill="url(#gl)"/>` : '';
  const outline = detail
    ? `<polygon points="${d.pt(d.T)} ${d.pt(d.R)} ${d.pt(d.B)} ${d.pt(d.L)}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.5" stroke-linejoin="round"/>`
    : '';
  const rx = size >= 48 ? 28 : 26;
  const gopen = detail ? '<g filter="url(#sh)">' : '<g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cf5"/><stop offset="1" stop-color="#4338ca"/></linearGradient>
    ${gloss}${shadow}
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="${rx}" fill="url(#g)"/>
  ${glossRect}
  ${gopen}
    <polygon points="${d.pt(d.T)} ${d.pt(d.R)} ${d.pt(d.C)}" fill="#ffffff"/>
    <polygon points="${d.pt(d.R)} ${d.pt(d.C)} ${d.pt(d.B)}" fill="#c9d2ff"/>
    <polygon points="${d.pt(d.C)} ${d.pt(d.L)} ${d.pt(d.B)}" fill="#aab7f7"/>
    <polygon points="${d.pt(d.L)} ${d.pt(d.C)} ${d.pt(d.T)}" fill="#e7ebff"/>
    ${outline}
  </g>
</svg>`;
}

[16, 32, 48, 128].forEach(function (size) {
  const png = new Resvg(svg(size), { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(OUT, 'icon' + size + '.png'), png);
  console.log('wrote icon' + size + '.png');
});
