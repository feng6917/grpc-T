# grpc-T

gRPC-Web 调试面板（Chrome DevTools 扩展），用于在浏览器中查看 gRPC-Web 请求的参数与返回值。

## 安装

1. 打开 `chrome://extensions`，开启「开发者模式」
2. 「加载已解压的扩展程序」选择本目录
3. 打开目标页面的 DevTools，选择 **grpc-T** 面板

> 也可直接把 release 包 `grpc-T-v<版本>.zip` 拖到 Edge 的扩展程序页面安装（Chrome 需解压后拖入文件夹）。

## 打包

运行仓库根目录的 `pack.cmd`（内部调用 `pack.ps1`，已绕过 PowerShell 执行策略限制）：

```powershell
.\pack.cmd            # 版本号自动读取 manifest.json 的 version
.\pack.cmd 1.0.1      # 或手动指定版本号（会自动同步 manifest.json 的 version）
```

产物为 `grpc-T-v<版本>.zip`，脚本会自检路径格式（正斜杠、`manifest.json` 在包根目录）。

**注意**：不要改用 `Compress-Archive`（zip 内部路径为反斜杠，Edge 解包后资源加载失败）或 `tar.exe -a`（带 `./` 前缀条目，Edge 报 "Could not unzip extension for install"）。

## 功能

- **请求列表**：名称 / 时间 / 耗时 / 体积 分列展示，慢请求（≥1s）橙色高亮、失败请求红色
- **详情查看**：点选请求后右侧展示完整地址、请求参数 / 响应结果 JSON 树（默认展开 3 层）
- **复制 JSON**：一键复制当前标签页的格式化 JSON
- **隐藏零值**：可按请求参数 / 响应结果分别过滤零值与空字段
- **内容过滤**：方法 / 包含内容 / 排除内容 三重过滤，条件自动记忆；包含内容的关键词在 JSON 树中高亮
- **自动跟随**：滚动条在底部时自动跟随最新请求
- **日志上限**：最多保留 500 条（FIFO），长时间抓包不卡顿
- **主题**：GitHub Light / Solarized Light / One Dark / Nord / Monokai 五种经典主题，跟随系统深浅色
- **稳定连接**：Service Worker 保活 + 断线自动重连，长时间挂机不丢请求

## 技术说明

- 基于 gRPC-Web 客户端拦截（`inject.js`）与 connect-web 拦截器（`connect-web-interceptor.js`）双通道采集
- Manifest V3，后台 Service Worker 心跳保活，面板/内容脚本断线自动重连
