// Map of Panel connections. The 'tabId' is used as key.
// There are two connections/ports for every tabId
// 1) Port to the panel script
// 2) Port to the content script
//
// Example:
// connections[1].panel => pane port
// connections[1].content => content port
var connections = {};

// Keepalive: MV3 service workers are terminated after ~30s of inactivity.
// Once terminated, all long-lived ports break and the connections map is
// lost, so the panel stops receiving new gRPC calls until the page and the
// DevTools panel are both reopened. While there is at least one open
// connection, periodically post a ping message to reset the SW idle timer
// and keep the whole chain alive.
var KEEPALIVE_INTERVAL_MS = 20000;
var keepaliveTimer = null;

function startKeepalive() {
  if (keepaliveTimer) {
    return;
  }
  keepaliveTimer = setInterval(sendKeepalive, KEEPALIVE_INTERVAL_MS);
}

function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function sendKeepalive() {
  var hasConnection = false;
  Object.keys(connections).forEach(function (tabId) {
    Object.keys(connections[tabId]).forEach(function (name) {
      try {
        connections[tabId][name].postMessage({ action: "keepalive" });
        hasConnection = true;
      } catch (e) {
        // Port is already dead; ignore.
      }
    });
  });
  if (!hasConnection) {
    stopKeepalive();
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name != "panel" && port.name != "content") {
    return;
  }

  var extensionListener = (message) => {
    var tabId =
      port.sender.tab && port.sender.tab.id >= 0
        ? port.sender.tab.id
        : message.tabId;

    // The original connection event doesn't include the tab ID of the
    // DevTools page, so we need to send it explicitly (attached
    // to the 'init' event).
    if (message.action == "init") {
      if (!connections[tabId]) {
        connections[tabId] = {};
      }
      connections[tabId][port.name] = port;
      startKeepalive();
      return;
    }

    // Other messages are relayed to specified target if any
    // and if the connection exists.
    if (message.target) {
      var conn = connections[tabId] && connections[tabId][message.target];
      if (conn) {
        conn.postMessage(message);
      }
    }
  };

  // Listen to messages sent from the panel script.
  port.onMessage.addListener(extensionListener);

  // Remove panel connection on disconnect.
  port.onDisconnect.addListener(function (port) {
    port.onMessage.removeListener(extensionListener);

    var tabs = Object.keys(connections);
    for (var i = 0, len = tabs.length; i < len; i++) {
      if (connections[tabs[i]][port.name] === port) {
        delete connections[tabs[i]][port.name];

        // If there is not port associated to the tab, remove it
        // from the connections map.
        if (Object.keys(connections[tabs[i]]).length === 0) {
          delete connections[tabs[i]];
        }
        break;
      }
    }

    if (Object.keys(connections).length === 0) {
      stopKeepalive();
    }
  });
});
