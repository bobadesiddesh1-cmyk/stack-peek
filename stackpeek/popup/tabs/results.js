/*
 * StackPeek — Results tab renderer.
 *
 * Pure view layer: given a detection result, render grouped categories with
 * confidence bars and click-to-expand "why it matched" detail (as signal-type
 * chips). No detection or network logic here. Handles idle, empty, and
 * populated states.
 */
(function () {
  'use strict';

  var esc = function (v) { return window.SP_text.escapeHtml(v); };

  // Per-category accent (a small glowing dot) — aids scanning, adds richness.
  var CAT_COLOR = {
    'CMS': '#5b8def',
    'Ecommerce': '#3dd68c',
    'Framework': '#a78bfa',
    'UI Framework': '#f472b6',
    'JS Library': '#38bdf8',
    'Page Builder': '#fb923c',
    'Analytics': '#f2b344',
    'A/B Testing': '#fbbf24',
    'Tag Manager': '#34d399',
    'Ad Tech': '#f87171',
    'Consent / Privacy': '#94a3b8',
    'Monitoring': '#c084fc',
    'Chat / Support': '#22d3ee',
    'Payments': '#4ade80',
    'Video': '#fb7185',
    'Maps': '#60a5fa',
    'Fonts': '#e879f9',
    'CAPTCHA / Security': '#fca5a5',
    'Security / WAF': '#f87171',
    'CDN / Hosting': '#818cf8',
    'Web Server': '#94a3b8',
    'Programming Language': '#fbbf24',
    'Miscellaneous': '#7c89a0'
  };

  var CHEVRON = '<svg class="sp-chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function tierClass(conf) {
    if (conf >= 80) { return 'tier-high'; }
    if (conf >= 50) { return 'tier-med'; }
    return 'tier-low';
  }

  // Turn a reason into a chip (signal type) + a human description.
  function reasonRow(reason) {
    var type = reason.type || 'html';
    var label = reason.label || '';
    var text;
    if (type === 'global' && label.indexOf('JS global:') === 0) {
      text = 'reads <code>' + esc(label.replace('JS global:', '').trim()) + '</code>';
    } else if (type === 'header' && label.indexOf('HTTP header:') === 0) {
      text = 'response header <code>' + esc(label.replace('HTTP header:', '').trim()) + '</code>';
    } else if (type === 'meta') {
      text = 'matched the page&rsquo;s generator meta tag';
    } else if (type === 'script') {
      text = 'a known script URL pattern';
    } else if (type === 'link') {
      text = 'a stylesheet / link pattern';
    } else if (type === 'cookie') {
      text = 'a known cookie name';
    } else if (type === 'implied') {
      text = esc(label);
    } else {
      text = 'a signature in the page HTML';
    }
    return '<div class="sp-reason">' +
      '<span class="sp-chip sp-chip-' + esc(type) + '">' + esc(chipLabel(type)) + '</span>' +
      '<span class="sp-reason-text">' + text + '</span>' +
      '</div>';
  }

  function chipLabel(type) {
    var map = { meta: 'meta', html: 'html', script: 'script', link: 'link', global: 'global', cookie: 'cookie', header: 'header', implied: 'inferred' };
    return map[type] || type;
  }

  function reasonsHtml(reasons) {
    var rows = '<div class="sp-reasons-label">Evidence</div>';
    if (!reasons || !reasons.length) {
      return rows + '<div class="sp-reason"><span class="sp-reason-text">heuristic match</span></div>';
    }
    var seen = {};
    for (var i = 0; i < reasons.length; i++) {
      var key = reasons[i].type + '|' + reasons[i].label;
      if (seen[key]) { continue; }
      seen[key] = true;
      rows += reasonRow(reasons[i]);
    }
    return rows;
  }

  function itemHtml(item) {
    var conf = item.confidence;
    var impliedTag = item.implied ? '<span class="sp-implied" title="Inferred as a dependency of another detected technology">inferred</span>' : '';
    var verTag = item.version ? '<span class="sp-ver">' + esc(item.version) + '</span>' : '';
    return '' +
      '<div class="sp-item" tabindex="0" role="button" aria-expanded="false">' +
        '<div class="sp-item-row">' +
          '<span class="sp-item-name"><span class="sp-nm">' + esc(item.name) + '</span>' + verTag + impliedTag + '</span>' +
          '<span class="sp-item-right">' +
            '<span class="sp-item-pct">' + conf + '%</span>' + CHEVRON +
          '</span>' +
        '</div>' +
        '<div class="sp-bar"><div class="sp-bar-fill ' + tierClass(conf) + '" style="width:' + conf + '%"></div></div>' +
        '<div class="sp-reasons" hidden>' + reasonsHtml(item.reasons) + '</div>' +
      '</div>';
  }

  function categoryHtml(group) {
    var color = CAT_COLOR[group.category] || '#7c89a0';
    var items = '';
    for (var i = 0; i < group.items.length; i++) { items += itemHtml(group.items[i]); }
    return '' +
      '<section class="sp-cat">' +
        '<h3 class="sp-cat-head">' +
          '<span class="sp-cat-dot" style="background:' + color + ';color:' + color + '"></span>' +
          esc(group.category) +
          '<span class="sp-cat-count">' + group.items.length + '</span>' +
        '</h3>' +
        '<div class="sp-items">' + items + '</div>' +
      '</section>';
  }

  function render(container, result) {
    if (!result) {
      container.innerHTML =
        '<div class="sp-idle">' +
          '<div class="sp-idle-icon" aria-hidden="true">&#128269;</div>' +
          '<p class="sp-idle-title">Ready when you are</p>' +
          '<p class="sp-idle-sub">Hit <strong>Detect stack on this page</strong> to see what this site is built on. Nothing runs until you ask.</p>' +
        '</div>';
      return;
    }

    var head = '' +
      '<div class="sp-result-head">' +
        '<div class="sp-host" title="' + esc(result.url) + '">' + esc(result.hostname || result.url || 'this page') + '</div>' +
        '<div class="sp-result-meta">' + result.count + ' ' + (result.count === 1 ? 'technology' : 'technologies') + '</div>' +
      '</div>';

    var note = '';
    if (result.headerNote) {
      note = '<div class="sp-note"><span aria-hidden="true">&#9888;</span><span>Response headers weren&rsquo;t readable here &mdash; used page &amp; script signals only.</span></div>';
    }

    if (!result.count) {
      container.innerHTML = head + note +
        '<div class="sp-empty">' +
          '<div class="sp-empty-icon" aria-hidden="true">&#129301;</div>' +
          '<p class="sp-empty-title">Couldn&rsquo;t confidently identify the stack</p>' +
          '<p class="sp-empty-sub">This may be a custom build or a site that hides its signals. No confident matches crossed the threshold &mdash; so StackPeek won&rsquo;t guess.</p>' +
        '</div>';
      return;
    }

    var body = '';
    for (var i = 0; i < result.categories.length; i++) { body += categoryHtml(result.categories[i]); }
    container.innerHTML = head + note + body;
    bindExpanders(container);
  }

  function toggleItem(item) {
    var reasons = item.querySelector('.sp-reasons');
    if (!reasons) { return; }
    if (reasons.hasAttribute('hidden')) {
      reasons.removeAttribute('hidden');
      item.setAttribute('aria-expanded', 'true');
      item.classList.add('sp-open');
    } else {
      reasons.setAttribute('hidden', '');
      item.setAttribute('aria-expanded', 'false');
      item.classList.remove('sp-open');
    }
  }

  function bindExpanders(container) {
    var items = container.querySelectorAll('.sp-item');
    for (var i = 0; i < items.length; i++) {
      (function (el) {
        el.addEventListener('click', function () { toggleItem(el); });
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggleItem(el); }
        });
      })(items[i]);
    }
  }

  window.SP_results = { render: render };
})();
