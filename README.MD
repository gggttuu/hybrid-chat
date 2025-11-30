# 第三次作业 Hybrid Chat （Web + Node + Android WebView）

这是一个完整的 **Hybrid 聊天应用** 项目，包含：

- 基于 **Web 技术** 的聊天前端（QQ 气泡风格）
- 基于 **Node.js + WebSocket** 的聊天后端
- 基于 **Android WebView + JS Bridge** 的 App 端封装  

满足作业中的基础要求 & 进阶要求，并做了一些额外优化。

---

## 1. 功能总览

### ✅ 基础要求对应

1. **使用 Web 技术实现聊天基础功能**
   - 文本输入框、发送按钮、聊天记录展示
   - 使用 `userId + roomId` 标识用户/房间
   - 使用 **WebSocket** 实时收发消息
2. **App 端集成 WebView + 原生能力**
   - Android 使用 WebView 加载 Web 聊天页面
   - 通过 `JavascriptInterface` 暴露原生能力给 H5：
     - 获取设备信息
     - 申请麦克风 / 摄像头权限
     - 发送 App 本地通知（通知栏）
3. **Server 端（Node.js）实现消息收发**
   - 使用 `Express + ws` 搭建本地服务
   - 提供 WebSocket 聊天通道
   - 提供 HTTP 接口：房间管理 / 历史记录 / 搜索 / 文件上传

### ✅ 进阶要求对应

- **音频 / 视频发送（使用本地文件）**
  - 前端通过 `<input type="file">` 选择本地文件
  - 后端 `/upload` 接口接收文件，支持：
    - 图片（image/*）
    - 音频（audio/*）
    - 视频（video/*）
    - 其他文件（file）
- **多人群聊**
  - 使用 `roomId` 区分不同房间
  - 同一房间内所有用户实时收发消息
- **房间管理（开房间 / 密码 / 人数上限 / 群主）**
  - 第一个人可以“开房间”，设置：
    - 房间 ID
    - 群主（ownerId）
    - 密码（可选）
    - 最大人数
  - 其他人必须输入 **正确房间密码** 才能加入
- **聊天记录懒加载**
  - 不自动加载历史
  - 点击“加载历史”按钮，按时间倒序分页向上加载
- **聊天记录持久化存储 & 可追溯**
  - 消息保存在 `server/messages.json` 中
  - 提供 `/messages` 接口按时间分页获取
  - 提供 `/messages/search` 接口按关键字搜索
- **其他创意功能**
  - QQ 风格对话气泡布局：
    - 自己的消息：绿色气泡，右对齐
    - 别人的消息：白色气泡，左对齐
  - 在线人数显示（房间内连接数）
  - 输入法 emoji 按钮
  - Android 端支持选择文件（通过系统文件选择器）
  - Android 端本地通知（消息提醒）  
  - Web 端使用 `:smile:` 等短码自动替换为 emoji

---

## 2. 技术栈

### Web 前端（`/web`）

- 原生 HTML5 / CSS3 / JavaScript
- WebSocket（浏览器内置）
- 简单 Media 标签（`<img> / <audio> / <video>`）

### Server 后端（`/server`）

- Node.js (推荐 ≥ 16)
- Express —— HTTP 服务
- ws —— WebSocket 服务
- multer —— 文件上传
- 持久化：`messages.json` 文件

### Android App（`/android-app`）

- Kotlin
- WebView
- `JavascriptInterface`（JS 与原生交互）
- NotificationCompat（本地通知）
- 权限管理（相机 / 麦克风 / 通知）

---

## 3. 项目目录结构

```text
hybrid-chat/
├── server/                # Node.js 服务
│   ├── server.js          # 主服务代码（HTTP + WebSocket）
│   ├── package.json
│   ├── package-lock.json
│   ├── messages.json      # 聊天记录（运行时产生，可删除）
│   └── uploads/           # 上传文件（运行时产生，可删除）
├── web/                   # Web 前端
│   ├── index.html         # 聊天页面（布局 + 样式）
│   └── chat.js            # 前端逻辑（WebSocket、懒加载等）
└── android-app/           # Android Studio 工程
    ├── app/
    │   └── src/main/
    │       ├── java/.../MainActivity.kt
    │       ├── java/.../WebAppInterface.kt
    │       └── res/layout/activity_main.xml
    ├── build.gradle
    └── ...
```

## 4. 快速启动（TL;DR）

### 4.1 启动后端 + Web

```
# 1. 进入 server 目录
cd server

# 2. 安装依赖（第一次）
npm install

# 3. 启动服务
node server.js
```

启动成功后，终端会输出类似：

```
🚀 HTTP server listening on http://localhost:3000
```

然后在浏览器中访问：

```
http://localhost:3000/index.html
```

就能看到 Web 版本的聊天页面。

------

### 4.2 在 Android 模拟器里运行 App

1. 确保 **server** 已在本机运行：`node server.js`
2. 用 Android Studio 打开 `android-app/` 目录
3. 找到 `MainActivity.kt`，确认 `CHAT_URL` 如下：

```
// 模拟器访问 PC 本机地址（固定写法）
private const val CHAT_URL = "http://10.0.2.2:3000/index.html"
```

1. 选择一个模拟器（或新建 Pixel / API 30+）
2. 点击 Run ▶️
    即可在模拟器中看到与 Web 一样的聊天界面。

------

### 4.3 在真机上运行 App（同一 Wi-Fi）

1. 确保手机和电脑在 **同一个局域网 Wi-Fi**（比如都连家里路由器）
2. 在电脑上查 IP，如：`192.168.0.10`
3. 保持 `node server.js` 在跑
4. 在 `MainActivity.kt` 中改为：

```
// 真机访问 PC，本机 IP 请改成自己的
private const val CHAT_URL = "http://192.168.0.10:3000/index.html"
```

1. 打开安卓手机开发者模式 + USB 调试
2. 用 Android Studio 选择真机运行
    即可在手机里访问电脑上的 Node 服务。

------

## 5. 后端 server 详细说明

### 5.1 静态资源映射

`server/server.js` 中：

```
const WEB_DIR = path.join(__dirname, '..', 'web');
app.use(express.static(WEB_DIR));                // 映射 web 目录为静态资源
app.use('/uploads', express.static(UPLOAD_DIR)); // 映射上传文件
app.get('/', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});
```

- 访问 `/index.html` 或 `/` 会返回 `web/index.html`
- 前端中的 `/uploads/xxx` 路径会从 `server/uploads` 读取

------

### 5.2 HTTP 接口设计

#### 1）文件上传：`POST /upload`

- **说明**：上传图片 / 音频 / 视频 / 其他文件
- **请求体**：`multipart/form-data`，字段名为 `file`
- **返回示例**：

```
{
  "ok": true,
  "url": "/uploads/1680000000000-test.png",
  "fileType": "image/png",
  "fileName": "test.png"
}
```

前端拿到 `url` 后拼成 `http://host:3000 + url` 用于展示或播放。

------

#### 2）创建房间：`POST /rooms`

- **说明**：创建一个房间，并指定群主 / 密码 / 最大人数
- **请求体 JSON**：

```
{
  "roomId": "1",
  "ownerId": "gzy",
  "password": "123456",   // 可选，空字符串表示无密码
  "maxUsers": 10          // 可选，0 或空表示不限
}
```

- **响应示例**：

```
{
  "ok": true,
  "data": {
    "roomId": "1",
    "ownerId": "gzy",
    "hasPassword": true,
    "maxUsers": 10
  }
}
```

> **已有同名房间时会返回 400**：`房间已存在`

------

#### 3）获取房间信息：`GET /rooms/:roomId`

- **说明**：获取房间基本信息 + 在线人数
- **响应示例**：

```
{
  "ok": true,
  "data": {
    "roomId": "1",
    "ownerId": "gzy",
    "hasPassword": true,
    "maxUsers": 10,
    "onlineCount": 3
  }
}
```

------

#### 4）获取历史消息：`GET /messages`

- **说明**：懒加载历史记录（向上翻页）
- **请求参数**：

| 参数名   | 必填 | 说明                                 |
| -------- | ---- | ------------------------------------ |
| roomId   | 是   | 房间 ID                              |
| password | 否   | 房间密码（如果房间设置了密码则必填） |
| before   | 否   | 时间戳（毫秒），只返回小于该时间的   |
| limit    | 否   | 每次最多条数（默认 20，最大 100）    |

- **返回**：

```
{
  "ok": true,
  "data": [
    {
      "id": "xxx",
      "roomId": "1",
      "from": "gzy",
      "type": "text",
      "content": "hello",
      "url": "",
      "fileName": "",
      "fileType": "",
      "clientMsgId": null,
      "createdAt": 1680000000000
    }
  ]
}
```

> 若 `password` 不正确，则返回 `403` + `房间密码错误`。
>  前端会提示用户无法查看该房间历史。

------

#### 5）搜索消息：`GET /messages/search`

- **说明**：在指定房间内按关键字搜索
- **请求参数**：

| 参数名   | 必填 | 说明                        |
| -------- | ---- | --------------------------- |
| roomId   | 是   | 房间 ID                     |
| keyword  | 是   | 关键字（content/file/from） |
| password | 否   | 房间密码（有密码时必填）    |

搜索范围包括：

- 文本内容：`content`
- 文件名：`fileName`
- 发送者：`from`

------

### 5.3 WebSocket 协议

WebSocket 使用与 HTTP 相同的地址（`ws://host:3000`），
 前端通过 `new WebSocket("ws://localhost:3000")` 连接。

#### 消息格式（客户端 → 服务端）

1）加入房间：

```
{
  "action": "join",
  "roomId": "1",
  "userId": "gzy",
  "password": "123456"
}
```

- 如果房间不存在：收到系统消息提示 “房间不存在，请先创建房间”
- 密码错误：系统消息 “房间密码错误”
- 人数已满：系统消息 “房间人数已满，无法加入”
- 加入成功：
  - 给自己：`你已加入房间：xxx（群主：ownerId）`
  - 给房间其他人：`gzy 加入了房间`
  - 自动推送当前房间在线人数

2）发送聊天消息：

```
{
  "action": "chat",
  "roomId": "1",           // 仅用于标识，权限以 ws.roomId 为准
  "from": "gzy",
  "type": "text",          // text / image / audio / video / file
  "content": "hello",      // 文本消息时使用
  "url": "",               // 文件消息时使用
  "fileName": "",          // 文件消息时显示名称
  "fileType": "",          // MIME type
  "clientMsgId": "xxxxxx"  // 客户端生成，用于状态同步
}
```

服务端会：

- 拒绝：未成功 join 的连接发送消息（没有 `ws.roomId`）
- 拒绝：不在房间成员列表中的连接发消息
- 接受：保存到 `messages.json`，并广播给房间所有人

#### 消息格式（服务端 → 客户端）

1）系统消息 `type = "system"`：

```
{
  "id": "xxx",
  "roomId": "1",
  "from": "系统",
  "type": "system",
  "content": "gzy 加入了房间",
  "systemType": "info",    // info / error / onlineCount
  "onlineCount": 3,
  "createdAt": 1680000000000
}
```

2）普通聊天消息 `type != "system"`：

```
{
  "id": "xxx",
  "roomId": "1",
  "from": "gzy",
  "type": "text",
  "content": "hello",
  "url": "",
  "fileName": "",
  "fileType": "",
  "clientMsgId": "客户端传过来的那个",
  "createdAt": 1680000000000
}
```

前端如果发现 `clientMsgId` 与本地 pending 消息一致，就会把“发送中…”更新为“已送达”。

------

### 5.4 数据持久化

- 所有消息都保存在 `server/messages.json` 中
- 每条消息包含：
  - `roomId / from / type / content / url / fileName / fileType / createdAt`
- 服务启动时读取 `messages.json`，写入时覆盖保存
- 文件上传保存在 `server/uploads` 目录，下次重启仍可访问

------

## 6. Web 前端详细说明（`/web`）

### 6.1 启动方式

Web 不需要单独起服务器，只要 Node 已经运行：

```
cd server
node server.js
```

然后访问：

```
http://localhost:3000/index.html
```

就会打开 `web/index.html`。

------

### 6.2 页面布局 & 使用流程

#### 顶部房间管理区

包含以下输入框 & 按钮：

- **用户 ID**：标识自己（如 `gzy`）
- **房间 ID**：加入哪个房间（如 `1`、`room1`）
- **密码**：房间密码（可选）
- **人数上限**：最大人数，0 或留空表示不限
- 按钮：
  - `开房间`：创建房间（设置群主 + 密码 + 人数上限）
  - `加入房间`：建立 WebSocket 连接并加入指定房间
  - `加载历史`：按时间向上懒加载聊天记录

另外显示：

- 房间信息：`房间: 1 | 群主: gzy | 密码: 有密码 | 人数上限: 10`
- 当前在线人数：`当前在线：X 人`（由 WebSocket 推送更新）

#### 搜索区

- 输入框：关键字
- 按钮：
  - `搜索`：调用 `/messages/search`，搜索当前房间的所有历史记录
  - `清除搜索`：退出搜索模式，清空聊天窗口，需要手动再点“加载历史”

#### 聊天消息区

- 使用 QQ 风格气泡布局
- 自己的消息：
  - 右对齐，绿色背景，右下角小尖角
- 他人的消息：
  - 左对齐，白色背景，左下角小尖角
- 系统消息：
  - 淡灰色文字，居中显示（如“xxx 加入了房间”）

每条消息气泡包含：

- 发送者 ID
- 消息内容（文本 / 图片 / 音频播放器 / 视频播放器 / 文件链接）
- 右下角显示发送时间 + 状态：
  - 自己发送时：
    - 刚点发送：`发送中...`
    - 收到服务器广播：更新为 `已送达`

#### 底部输入区

- Emoji 按钮：点击直接把 emoji 插入输入框
- 输入框：回车发送（`Enter` 发送，`Shift+Enter` 换行）
- 发送按钮：点击发送文本消息
- 文件发送区：
  - `Choose File`：打开系统文件选择框（Android 端已适配）
  - `发文件(音频/视频等)`：上传并展示

------

### 6.3 Web 端与原生交互（AndroidNative）

页面中可以通过 `window.AndroidNative` 获取到原生注入的对象（Android 端 WebView 注入）。

示例：

```
// 1. 获取设备信息（JSON 字符串）
if (window.AndroidNative && AndroidNative.getDeviceInfo) {
  const infoStr = AndroidNative.getDeviceInfo();
  const info = JSON.parse(infoStr);
  console.log(info);
}

// 2. 申请相机 + 麦克风权限
if (window.AndroidNative && AndroidNative.requestCameraAndMic) {
  AndroidNative.requestCameraAndMic();
}

window.onNativePermissionResult = function (granted) {
  console.log("camera+mic permission:", granted);
};

// 3. 申请通知权限（Android 13+）
if (window.AndroidNative && AndroidNative.requestNotificationPermission) {
  AndroidNative.requestNotificationPermission();
}

window.onNotificationPermissionReady = function () {
  console.log("notification permission ready");
};

// 4. 发送本地通知
if (window.AndroidNative && AndroidNative.showNotification) {
  AndroidNative.showNotification("新聊天消息", "你有一条来自房间 1 的新消息");
}

// 5. 展示 Toast
if (window.AndroidNative && AndroidNative.showToast) {
  AndroidNative.showToast("这是来自 H5 的提示");
}
```

------

## 7. Android App 详细说明（`/android-app`）

Android 工程位于 `android-app` 目录，可直接用 Android Studio 打开。

### 7.1 主要文件

- `app/src/main/java/.../MainActivity.kt`
  - 配置 WebView（启用 JS、DOM Storage）
  - 处理 `<input type="file">` 的文件选择（`onShowFileChooser`）
  - 处理 WebRTC 权限 (`onPermissionRequest`)
  - 申请系统权限（相机、麦克风、通知）
  - 创建通知通道 + 发送本地通知
  - 注入 `AndroidNative` JS 接口
- `app/src/main/java/.../WebAppInterface.kt`
  - 通过 `@JavascriptInterface` 暴露方法给 H5
  - 实现 `getDeviceInfo / requestCameraAndMic / showNotification / showToast`
- `app/src/main/res/layout/activity_main.xml`
  - 顶部标题 + 下方全屏 WebView

### 7.2 WebView 关键配置

```
val settings = webView.settings
settings.javaScriptEnabled = true
settings.domStorageEnabled = true
settings.loadsImagesAutomatically = true
settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
settings.allowFileAccess = true
settings.allowContentAccess = true

webView.webViewClient = object : WebViewClient() {}

webView.webChromeClient = object : WebChromeClient() {
    // 处理文件选择
    override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
    ): Boolean { ... }

    // 处理 WebRTC 权限申请
    override fun onPermissionRequest(request: PermissionRequest?) { ... }
}

// 注入 JS Bridge
webView.addJavascriptInterface(WebAppInterface(this), "AndroidNative")
```

------

### 7.3 权限与通知

`AndroidManifest.xml` 中声明：

```
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<application
    ...
    android:usesCleartextTraffic="true">
    ...
</application>
```

本地通知使用 `NotificationCompat`，通道 ID 为 `chat_channel`，在 `MainActivity` 中创建并发送。

------

## 8. 作业要求对照表

| 作业要求                                       | 本项目对应实现                                               |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Web 技术实现聊天基础前端                       | `web/index.html + chat.js`：输入框、按钮、聊天记录、WebSocket 收发 |
| 用户身份使用 ID                                | 顶部输入框 `用户ID`，所有消息包含 `from = userId`            |
| 使用 WebSocket 接收服务端推送                  | `chat.js` 中 `new WebSocket(...)` + `onmessage`              |
| App 集成 WebView / LynxView                    | `android-app` 中 `activity_main.xml` + `MainActivity.kt`     |
| 原生方法：设备信息 / 麦克风视频权限 / 消息推送 | `WebAppInterface.kt` + `AndroidNative.*`                     |
| Server 端使用 Node.js 提供消息接收与推送       | `server/server.js` 使用 Express + ws                         |
| 进阶：音频、视频发送（本地文件）               | `<input type="file">` + `/upload` + `<audio>` / `<video>` 展示 |
| 进阶：多人群聊                                 | `roomId` 区分房间，所有同房间用户共享消息                    |
| 进阶：聊天记录懒加载                           | `GET /messages` + “加载历史”按钮                             |
| 进阶：聊天记录持久化 & 可追溯                  | `messages.json` 持久化 + 搜索接口                            |

| 进阶：创意功能                                 | QQ 气泡样式、在线人数显示、搜索、emoji、Android 本地通知等   |

## 9. 最终效果图

 






