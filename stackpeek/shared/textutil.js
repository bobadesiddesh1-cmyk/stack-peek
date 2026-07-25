/*
 * StackPeek — text utilities.
 *
 * Small, dependency-free helpers shared by the popup: HTML escaping (all page-
 * derived strings are escaped before insertion into the DOM), date formatting
 * for the History tab, and the "Copy summary" plain-text block builder.
 */
(function () {
  'use strict';

  // Escape a string for safe insertion as text/attribute content. Every value
  // sourced from the scanned page (names come from our own DB, but URLs/titles
  // and reason labels are rendered too) passes through here.
  function escapeHtml(value) {
    var s = String(value == null ? '' : value);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // "2026-07-22 14:03" style, from a ms-epoch. Falls back gracefully.
  function formatWhen(ms) {
    try {
      var d = new Date(ms);
      if (isNaN(d.getTime())) { return ''; }
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  // Relative-ish short label for history rows.
  function formatShortDate(ms) {
    try {
      var d = new Date(ms);
      if (isNaN(d.getTime())) { return ''; }
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    } catch (e) { return ''; }
  }

  /**
   * Build a clean, paste-ready plain-text summary from a detection result.
   * Example:
   *   example.com — detected by StackPeek
   *   CMS: WordPress (95%)
   *   Ecommerce: WooCommerce (88%)
   *   Page Builder: Elementor (90%)
   *   Analytics: Google Analytics 4 (80%), Google Tag Manager (85%)
   *   (no account, no lookup limits — stackpeek, 100% local)
   */
  function buildSummary(result) {
    var lines = [];
    var host = result.hostname || result.url || 'this page';
    lines.push(host + ' — detected by StackPeek');

    if (!result.categories || !result.categories.length) {
      lines.push('Couldn\'t confidently identify the stack — may be a custom build.');
    } else {
      for (var i = 0; i < result.categories.length; i++) {
        var group = result.categories[i];
        if (!group.items.length) { continue; }
        var parts = [];
        for (var j = 0; j < group.items.length; j++) {
          var it = group.items[j];
          var nm = it.version ? it.name + ' ' + it.version : it.name;
          parts.push(nm + ' (' + it.confidence + '%)');
        }
        lines.push(group.category + ': ' + parts.join(', '));
      }
    }
    lines.push('(no account, no lookup limits — StackPeek, 100% local)');
    return lines.join('\n');
  }

  // Short "top technology" label for a history row: prefer CMS, else Framework,
  // else the highest-confidence item overall.
  function topLabel(result) {
    if (!result.flat || !result.flat.length) { return ''; }
    var preferred = ['CMS', 'Ecommerce', 'Framework'];
    for (var p = 0; p < preferred.length; p++) {
      for (var i = 0; i < result.flat.length; i++) {
        if (result.flat[i].category === preferred[p]) { return result.flat[i].name; }
      }
    }
    return result.flat[0].name;
  }

  var api = {
    escapeHtml: escapeHtml,
    formatWhen: formatWhen,
    formatShortDate: formatShortDate,
    buildSummary: buildSummary,
    topLabel: topLabel
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.SP_text = api; }
})();
