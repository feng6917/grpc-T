// Inject script for grpc-web
let s = document.createElement("script");
s.type = "text/javascript";
s.src = chrome.runtime.getURL("inject.js");
s.onload = function () {
  this.parentNode.removeChild(this);
};
(document.head || document.documentElement).appendChild(s);

// Inject script for connect-web
var cs = document.createElement("script");
cs.src = chrome.runtime.getURL("connect-web-interceptor.js");
cs.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(cs);

var port;

function setupPortIfNeeded() {
  if (!port && chrome && chrome.runtime) {
    port = chrome.runtime.connect(null, { name: "content" });
    port.postMessage({ action: "init" });
    port.onDisconnect.addListener(() => {
      // 仅重置端口引用，保留 window 的 message 监听器。
      // 若在此处移除监听器，Service Worker 回收断开后页面产生的
      // gRPC 消息将无人接收，导致重连机制失效、请求永远不再显示。
      port = null;
    });
  }
}

function sendGRPCNetworkCall(data) {
  try {
    setupPortIfNeeded();
    if (port) {
      port.postMessage({
        action: "gRPCNetworkCall",
        target: "panel",
        data,
      });
    }
  } catch (e) {
    // 端口失效（如扩展重载）时重置引用，下一条消息会自动重连，避免中断监听。
    port = null;
  }
}

function handleMessageEvent(event) {
  if (event.source != window) return;
  if (event.data.type && event.data.type == "__GRPCWEB_DEVTOOLS__") {
    sendGRPCNetworkCall(event.data);
  }
}

window.addEventListener("message", handleMessageEvent, false);
