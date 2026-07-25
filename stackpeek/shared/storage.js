/*
 * StackPeek — storage helper.
 *
 * Wraps chrome.storage.local for the rolling detection history. History is a
 * list of at most HISTORY_MAX snapshots, newest first. Each snapshot is a
 * point-in-time record; clicking it in the History tab shows the snapshot and
 * never re-fetches or re-scans anything.
 *
 * We deliberately use storage.local (not storage.sync) so detection history is
 * never propagated across a user's devices — a privacy-first default.
 */
(function () {
  'use strict';

  var HISTORY_KEY = 'sp_history';
  var HISTORY_MAX = 20;

  function getHistory() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(HISTORY_KEY, function (data) {
          try {
            if (chrome.runtime && chrome.runtime.lastError) { resolve([]); return; }
            var list = (data && data[HISTORY_KEY]) || [];
            resolve(Array.isArray(list) ? list : []);
          } catch (e) { resolve([]); }
        });
      } catch (e) { resolve([]); }
    });
  }

  /**
   * Prepend a snapshot, de-duplicating by hostname (keeps the newest scan of a
   * given host at the top), and cap to HISTORY_MAX.
   * @param {object} snapshot { hostname, url, title, top, topCategory, count, when, categories }
   */
  function addHistory(snapshot) {
    return getHistory().then(function (list) {
      var filtered = list.filter(function (entry) {
        return entry && entry.hostname !== snapshot.hostname;
      });
      filtered.unshift(snapshot);
      if (filtered.length > HISTORY_MAX) { filtered = filtered.slice(0, HISTORY_MAX); }
      return new Promise(function (resolve) {
        try {
          var payload = {};
          payload[HISTORY_KEY] = filtered;
          chrome.storage.local.set(payload, function () { resolve(filtered); });
        } catch (e) { resolve(filtered); }
      });
    });
  }

  // Last detection result, stashed so the full-tab view can render it.
  var LASTVIEW_KEY = 'sp_lastview';
  function setLastView(result) {
    return new Promise(function (resolve) {
      try {
        var payload = {};
        payload[LASTVIEW_KEY] = result || null;
        chrome.storage.local.set(payload, function () { resolve(true); });
      } catch (e) { resolve(false); }
    });
  }
  function getLastView() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(LASTVIEW_KEY, function (data) {
          try {
            if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
            resolve((data && data[LASTVIEW_KEY]) || null);
          } catch (e) { resolve(null); }
        });
      } catch (e) { resolve(null); }
    });
  }

  function clearHistory() {
    return new Promise(function (resolve) {
      try {
        var payload = {};
        payload[HISTORY_KEY] = [];
        chrome.storage.local.set(payload, function () { resolve(true); });
      } catch (e) { resolve(false); }
    });
  }

  var api = {
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    setLastView: setLastView,
    getLastView: getLastView,
    HISTORY_MAX: HISTORY_MAX
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.SP_storage = api; }
})();
