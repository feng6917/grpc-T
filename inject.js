(() => {
  window.__GRPCWEB_DEVTOOLS__ = function (clients) {
    if (clients.constructor !== Array) {
      return;
    }
    const postType = "__GRPCWEB_DEVTOOLS__";
    var StreamInterceptor = function (method, request, stream) {
      this._callbacks = {};
      const methodType = "server_streaming";
      // 起始时间与累计响应体积，用于流式统计
      var startTime = Date.now();
      var totalSize = 0;
      window.postMessage({
        type: postType,
        method,
        methodType,
        request: request.toObject(),
      });
      stream.on("data", (response) => {
        var resObj = response.toObject();
        var chunkSize = JSON.stringify(resObj).length;
        totalSize += chunkSize;
        window.postMessage({
          type: postType,
          method,
          methodType,
          response: resObj,
          // 距流开始的耗时与本条消息体积
          duration: Date.now() - startTime,
          responseSize: chunkSize,
        });
        if (!!this._callbacks["data"]) {
          this._callbacks["data"](response);
        }
      });
      stream.on("metadata", (status) => {
        window.postMessage({
          type: postType,
          method,
          methodType,
          response: status,
        });
        if (!!this._callbacks["metadata"]) {
          this._callbacks["metadata"](status);
        }
      });
      stream.on("status", (status) => {
        if (status.code === 0) {
          window.postMessage({
            type: postType,
            method,
            methodType,
            response: "EOF",
            // 流结束：总耗时与累计体积
            duration: Date.now() - startTime,
            responseSize: totalSize,
          });
        }
        if (!!this._callbacks["status"]) {
          this._callbacks["status"](status);
        }
      });
      stream.on("error", (error) => {
        if (error.code !== 0) {
          window.postMessage({
            type: postType,
            method,
            methodType,
            error: {
              code: error.code,
              message: error.message,
            },
            duration: Date.now() - startTime,
          });
        }
        if (!!this._callbacks["error"]) {
          this._callbacks["error"](error);
        }
      });
      stream.on("end", () => {
        window.postMessage({
          type: postType,
          method,
          methodType,
          duration: Date.now() - startTime,
        });
        if (!!this._callbacks["end"]) {
          this._callbacks["end"]();
        }
      });
      this._stream = stream;
    };
    StreamInterceptor.prototype.on = function (type, callback) {
      this._callbacks[type] = callback;
      return this;
    };
    StreamInterceptor.prototype.removeListener = function (type, callback) {
      delete this._callbacks[type];
      return this;
    };
    StreamInterceptor.prototype.cancel = function () {
      this._stream.cancel();
    };
    clients.forEach((client) => {
      client.client_.rpcCall_ = client.client_.rpcCall;
      client.client_.rpcCall2 = function (
        method,
        request,
        metadata,
        methodInfo,
        callback
      ) {
        var posted = false;
        // 起始时间，用于统计本次调用耗时
        var startTime = Date.now();
        var newCallback = function (err, response) {
          if (!posted) {
            var resObj = err ? undefined : response.toObject();
            window.postMessage(
              {
                type: postType,
                method,
                methodType: "unary",
                request: request.toObject(),
                response: resObj,
                error: err || undefined,
                // 耗时（ms）与响应体积（JSON 字符数）
                duration: Date.now() - startTime,
                responseSize: resObj
                  ? JSON.stringify(resObj).length
                  : undefined,
              },
              "*"
            );
            posted = true;
          }
          callback(err, response);
        };
        return this.rpcCall_(
          method,
          request,
          metadata,
          methodInfo,
          newCallback
        );
      };
      client.client_.rpcCall = client.client_.rpcCall2;
      client.client_.unaryCall = function (
        method,
        request,
        metadata,
        methodInfo
      ) {
        return new Promise((resolve, reject) => {
          this.rpcCall2(
            method,
            request,
            metadata,
            methodInfo,
            function (error, response) {
              error ? reject(error) : resolve(response);
            }
          );
        });
      };
      client.client_.serverStreaming_ = client.client_.serverStreaming;
      client.client_.serverStreaming2 = function (
        method,
        request,
        metadata,
        methodInfo
      ) {
        var stream = client.client_.serverStreaming_(
          method,
          request,
          metadata,
          methodInfo
        );
        var si = new StreamInterceptor(method, request, stream);
        return si;
      };
      client.client_.serverStreaming = client.client_.serverStreaming2;
    });
  };
})();
