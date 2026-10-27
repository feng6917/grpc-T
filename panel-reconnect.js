// Panel port auto-reconnect.
// This script MUST be loaded BEFORE the panel bundle (see index.html).
//
// The panel bundle opens a single long-lived port to the background service
// worker and never reconnects. When MV3 terminates the service worker, the
// port dies and the panel silently stops receiving gRPC calls until the
// page + panel are reloaded.
//
// To avoid rebuilding the panel bundle, we wrap chrome.runtime.connect and
// return a self-healing port: on disconnect it transparently reconnects,
// replays the panel "init" handshake and re-attaches the original message
// listeners, so the rest of the app keeps working unchanged.
(function () {
  'use strict';

  if (!window.chrome || !chrome.runtime || !chrome.runtime.connect) {
    return;
  }

  var originalConnect = chrome.runtime.connect.bind(chrome.runtime);

  chrome.runtime.connect = function (extensionId, connectInfo) {
    var info =
      typeof extensionId === 'object' && extensionId !== null
        ? extensionId
        : connectInfo;

    // Only wrap the panel's named port; leave every other connection intact.
    if (!info || info.name !== 'panel') {
      return originalConnect(extensionId, connectInfo);
    }
    return createAutoReconnectPort(info);
  };

  function createAutoReconnectPort(connectInfo) {
    var messageListeners = [];
    var disconnectListeners = [];
    var current = null;
    var reconnectTimer = null;
    var closed = false;

    function forwardMessage(message, port) {
      // Copy the list: a listener may remove itself while being called.
      messageListeners.slice().forEach(function (listener) {
        try {
          listener(message, port);
        } catch (e) {
          // Never let one listener break the others.
        }
      });
    }

    function handleDisconnect() {
      disconnectListeners.slice().forEach(function (listener) {
        try {
          listener(current);
        } catch (e) {}
      });
      scheduleReconnect();
    }

    function attach(port, isFirstConnect) {
      port.onMessage.addListener(forwardMessage);
      port.onDisconnect.addListener(handleDisconnect);
      current = port;

      // On reconnects, replay the panel handshake expected by background.js.
      // The first connect is followed by the bundle's own init message.
      if (!isFirstConnect) {
        try {
          port.postMessage({
            tabId: chrome.devtools.inspectedWindow.tabId,
            action: 'init',
          });
        } catch (e) {}
      }
    }

    function scheduleReconnect() {
      if (closed || reconnectTimer) {
        return;
      }
      // Give the (possibly restarting) service worker a moment to come up.
      reconnectTimer = setTimeout(tryReconnect, 300);
    }

    function tryReconnect() {
      reconnectTimer = null;
      if (closed) {
        return;
      }
      try {
        attach(originalConnect(connectInfo), false);
      } catch (e) {
        // The service worker is not ready yet; keep retrying with backoff.
        reconnectTimer = setTimeout(tryReconnect, 1000);
      }
    }

    var wrapper = {
      name: connectInfo.name,
      postMessage: function (message) {
        if (!current) {
          return;
        }
        try {
          current.postMessage(message);
        } catch (e) {
          // Port died mid-send; onDisconnect will trigger the reconnect.
        }
      },
      disconnect: function () {
        closed = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (current) {
          current.disconnect();
          current = null;
        }
      },
      onMessage: makeEventProxy(messageListeners),
      onDisconnect: makeEventProxy(disconnectListeners),
    };

    try {
      attach(originalConnect(connectInfo), true);
    } catch (e) {
      // First connect failed (e.g. worker starting up); retry in background.
      scheduleReconnect();
    }

    return wrapper;
  }

  function makeEventProxy(listeners) {
    return {
      addListener: function (listener) {
        listeners.push(listener);
      },
      removeListener: function (listener) {
        var index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      },
      hasListener: function (listener) {
        return listeners.indexOf(listener) !== -1;
      },
    };
  }
})();
// Append to panel-reconnect.js: keep the list header aligned with the data
// rows by compensating for the ACTUAL vertical scrollbar width at runtime
// (works for classic, custom-styled and overlay scrollbars alike).

// Append: in-tree keyword highlighting via the CSS Custom Highlight API.
// Highlights every occurrence of the 包含内容 filter keyword inside the JSON
// tree, WITHOUT touching React-managed DOM (uses CSS.highlights + Range).
(function grpcHighlightMatches() {
  'use strict';

  var INCLUDE_PH = '\u5305\u542b\u5185\u5bb9\u8fc7\u6ee4'; // placeholder: 包含内容过滤
  var PANE_SEL = '.grpc-json-pane';
  var REG_NAME = 'grpc-match';
  var MAX_RANGES = 500;

  function getKeyword() {
    var input = document.querySelector('input[placeholder="' + INCLUDE_PH + '"]');
    return input ? String(input.value || '').trim() : '';
  }

  function buildRanges(root, kw) {
    var ranges = [];
    var lower = kw.toLowerCase();
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode()) && ranges.length < MAX_RANGES) {
      var text = node.nodeValue || '';
      if (text.length < lower.length) continue;
      var lt = text.toLowerCase();
      var idx = lt.indexOf(lower);
      while (idx >= 0 && ranges.length < MAX_RANGES) {
        var r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + lower.length);
        ranges.push(r);
        idx = lt.indexOf(lower, idx + lower.length);
      }
    }
    return ranges;
  }

  var pending = null;
  function schedule() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      apply();
    }, 120);
  }

  function apply() {
    // Feature guard: needs the CSS Custom Highlight API (Chrome 105+).
    if (!window.Highlight || !window.CSS || !CSS.highlights) return;
    var pane = document.querySelector(PANE_SEL);
    var kw = getKeyword();
    var ranges = (pane && kw) ? buildRanges(pane, kw) : [];
    if (ranges.length) {
      var hl = new Highlight();
      ranges.forEach(function (r) { hl.add(r); });
      CSS.highlights.set(REG_NAME, hl);
    } else {
      CSS.highlights.delete(REG_NAME);
    }
  }

  // Re-compute on any DOM change under the app (tree renders, tab switches,
  // filter edits); the actual scan only walks the JSON pane, so it is cheap.
  var mo = new MutationObserver(schedule);
  function watch() {
    var root = document.querySelector('.app-contents') || document.body;
    if (root && !root.__grpcHighlightObserved) {
      root.__grpcHighlightObserved = true;
      mo.observe(root, { childList: true, subtree: true, characterData: true });
    }
    // also listen to filter input edits directly (input events do not mutate DOM)
    var input = document.querySelector('input[placeholder="' + INCLUDE_PH + '"]');
    if (input && !input.__grpcHighlightBound) {
      input.__grpcHighlightBound = true;
      input.addEventListener('input', schedule);
    }
  }

  setInterval(function () { watch(); schedule(); }, 500);
})();
