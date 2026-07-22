/*
 * StackPeek — History tab renderer.
 *
 * Shows the last 20 detected sites (domain, top CMS/framework, date). Each row
 * is a stored SNAPSHOT: clicking it re-renders the saved result in the Results
 * tab. It NEVER re-fetches, re-injects, or re-scans — the snapshot is exactly
 * what was detected at that moment.
 */
(function () {
  'use strict';

  var esc = function (v) { return window.SP_text.escapeHtml(v); };

  /**
   * @param {HTMLElement} container
   * @param {Array} list  history entries (newest first)
   * @param {Function} onSelect  called with the entry when a row is clicked
   * @param {Function} onClear   called when "Clear history" is clicked
   */
  function render(container, list, onSelect, onClear) {
    if (!list || !list.length) {
      container.innerHTML =
        '<div class="sp-empty">' +
          '<div class="sp-empty-icon" aria-hidden="true">🕓</div>' +
          '<p class="sp-empty-title">No history yet.</p>' +
          '<p class="sp-empty-sub">Sites you detect will appear here — the last 20, newest first. Stored locally on this device only.</p>' +
        '</div>';
      return;
    }

    var rows = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var top = e.top ? e.top : '—';
      var topCat = e.topCategory ? e.topCategory : '';
      var when = window.SP_text.formatShortDate(e.when);
      rows += '' +
        '<button class="sp-hist-row" data-idx="' + i + '">' +
          '<div class="sp-hist-main">' +
            '<span class="sp-hist-host">' + esc(e.hostname || '') + '</span>' +
            '<span class="sp-hist-top">' + esc(top) + (topCat ? ' <span class="sp-hist-cat">· ' + esc(topCat) + '</span>' : '') + '</span>' +
          '</div>' +
          '<div class="sp-hist-side">' +
            '<span class="sp-hist-count">' + (e.count || 0) + '</span>' +
            '<span class="sp-hist-when">' + esc(when) + '</span>' +
          '</div>' +
        '</button>';
    }

    container.innerHTML =
      '<div class="sp-hist-tools">' +
        '<span class="sp-hist-label">Last ' + list.length + ' detected ' + (list.length === 1 ? 'site' : 'sites') + '</span>' +
        '<button class="sp-clear" type="button">Clear history</button>' +
      '</div>' +
      '<div class="sp-hist-list">' + rows + '</div>';

    var rowEls = container.querySelectorAll('.sp-hist-row');
    for (var r = 0; r < rowEls.length; r++) {
      (function (el) {
        el.addEventListener('click', function () {
          var idx = parseInt(el.getAttribute('data-idx'), 10);
          if (!isNaN(idx) && list[idx] && typeof onSelect === 'function') { onSelect(list[idx]); }
        });
      })(rowEls[r]);
    }

    var clearBtn = container.querySelector('.sp-clear');
    if (clearBtn && typeof onClear === 'function') {
      clearBtn.addEventListener('click', function () { onClear(); });
    }
  }

  window.SP_history = { render: render };
})();
