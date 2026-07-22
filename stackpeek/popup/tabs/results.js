/*
 * StackPeek — Results tab renderer.
 *
 * Pure view layer: given a detection result, render grouped categories with
 * confidence bars and click-to-expand "why it matched" detail. No detection or
 * network logic here. Handles three states: initial/idle, empty (nothing above
 * threshold), and populated (one or many simultaneous detections).
 */
(function () {
  'use strict';

  var esc = function (v) { return window.SP_text.escapeHtml(v); };

  function tierClass(conf) {
    if (conf >= 80) { return 'tier-high'; }
    if (conf >= 50) { return 'tier-med'; }
    return 'tier-low';
  }

  function reasonsHtml(reasons) {
    if (!reasons || !reasons.length) {
      return '<div class="sp-reason">matched: (heuristic)</div>';
    }
    var seen = {};
    var parts = [];
    for (var i = 0; i < reasons.length; i++) {
      var label = reasons[i].label;
      if (seen[label]) { continue; }
      seen[label] = true;
      parts.push('<div class="sp-reason">matched: ' + esc(label) + '</div>');
    }
    return parts.join('');
  }

  function itemHtml(item) {
    var conf = item.confidence;
    var impliedTag = item.implied ? '<span class="sp-implied" title="Inferred as a dependency of another detected technology">inferred</span>' : '';
    return '' +
      '<div class="sp-item" tabindex="0" role="button" aria-expanded="false">' +
        '<div class="sp-item-row">' +
          '<span class="sp-item-name">' + esc(item.name) + impliedTag + '</span>' +
          '<span class="sp-item-pct">' + conf + '%</span>' +
        '</div>' +
        '<div class="sp-bar"><div class="sp-bar-fill ' + tierClass(conf) + '" style="width:' + conf + '%"></div></div>' +
        '<div class="sp-reasons" hidden>' + reasonsHtml(item.reasons) + '</div>' +
      '</div>';
  }

  function categoryHtml(group) {
    var items = '';
    for (var i = 0; i < group.items.length; i++) { items += itemHtml(group.items[i]); }
    return '' +
      '<section class="sp-cat">' +
        '<h3 class="sp-cat-head">' + esc(group.category) +
          '<span class="sp-cat-count">' + group.items.length + '</span>' +
        '</h3>' +
        '<div class="sp-items">' + items + '</div>' +
      '</section>';
  }

  // Render into `container`. `result` may be null for the idle state.
  function render(container, result) {
    if (!result) {
      container.innerHTML =
        '<div class="sp-idle">' +
          '<div class="sp-idle-icon" aria-hidden="true">🔍</div>' +
          '<p class="sp-idle-title">Ready when you are.</p>' +
          '<p class="sp-idle-sub">Click <strong>Detect stack on this page</strong> to see what this site is built on. Nothing runs until you ask.</p>' +
        '</div>';
      return;
    }

    var head = '' +
      '<div class="sp-result-head">' +
        '<div class="sp-host" title="' + esc(result.url) + '">' + esc(result.hostname || result.url || 'this page') + '</div>' +
        '<div class="sp-result-meta">' + result.count + ' ' + (result.count === 1 ? 'technology' : 'technologies') + ' detected</div>' +
      '</div>';

    var note = '';
    if (result.headerNote) {
      note = '<div class="sp-note" title="' + esc(result.headerNote) + '">Response headers weren’t readable on this page — detection used page &amp; script signals only.</div>';
    }

    if (!result.count) {
      container.innerHTML = head + note +
        '<div class="sp-empty">' +
          '<div class="sp-empty-icon" aria-hidden="true">❓</div>' +
          '<p class="sp-empty-title">Couldn’t confidently identify the stack.</p>' +
          '<p class="sp-empty-sub">This may be a custom build, a heavily-obfuscated site, or a page that hides its signals. No confident matches crossed the threshold — so StackPeek won’t guess.</p>' +
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
    var isHidden = reasons.hasAttribute('hidden');
    if (isHidden) {
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
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggleItem(el);
          }
        });
      })(items[i]);
    }
  }

  window.SP_results = { render: render };
})();
