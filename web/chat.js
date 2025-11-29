// ================== 基本配置 ==================
const SERVER_HOST = "localhost";    // Node 服务所在主机
const WS_URL = `ws://${SERVER_HOST}:3000`;
const HTTP_BASE = `http://${SERVER_HOST}:3000`;

// ================== 状态 ==================
let ws = null;
let earliestTimestamp = Date.now() + 1;
let isLoadingHistory = false;
let hasMoreHistory = true;
let inSearchMode = false;

// clientMsgId -> DOM 气泡，用来更新“发送中/已送达”
const pendingMessages = new Map();

// ================== DOM 获取 ==================
const messagesDiv       = document.getElementById("messages");
const userIdInput       = document.getElementById("userId");
const roomIdInput       = document.getElementById("roomId");
const roomPasswordInput = document.getElementById("roomPassword");
const maxUsersInput     = document.getElementById("maxUsers");
const msgInput          = document.getElementById("msgInput");
const fileInput         = document.getElementById("fileInput");
const loadMoreBtn       = document.getElementById("loadMoreBtn");
const onlineInfo        = document.getElementById("onlineInfo");
const roomInfoSpan      = document.getElementById("roomInfo");

const searchInput       = document.getElementById("searchInput");
const searchBtn         = document.getElementById("searchBtn");
const clearSearchBtn    = document.getElementById("clearSearchBtn");

const createRoomBtn     = document.getElementById("createRoomBtn");
const joinBtn           = document.getElementById("joinBtn");
const sendBtn           = document.getElementById("sendBtn");
const sendFileBtn       = document.getElementById("sendFileBtn");

// Emoji 映射
const emojiMap = {
  ":smile:": "😄",
  ":laugh:": "😂",
  ":heart:": "❤️",
  ":thumbsup:": "👍",
  ":sad:": "😢"
};

function applyEmojiShortcodes(text) {
  let result = text;
  Object.entries(emojiMap).forEach(([k, v]) => {
    result = result.split(k).join(v);
  });
  return result;
}

// ================== 工具方法 ==================
function generateClientMsgId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function setOnlineCount(count) {
  onlineInfo.textContent = `当前在线：${count} 人`;
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function fetchRoomInfo(roomId) {
  if (!roomId) return;
  try {
    const res = await fetch(`${HTTP_BASE}/rooms/${encodeURIComponent(roomId)}`);
    const data = await res.json();
    if (!data.ok) return;
    const room = data.data;
    const hasPwd = room.hasPassword ? "有密码" : "无密码";
    const limit = room.maxUsers > 0 ? room.maxUsers : "不限";
    roomInfoSpan.textContent = `房间：${room.roomId} | 群主：${room.ownerId} | 密码：${hasPwd} | 人数上限：${limit}`;
  } catch (e) {
    console.error("获取房间信息失败：", e);
  }
}

// ================== 渲染：系统消息 ==================
function renderSystemMessage(msg, prepend = false) {
  const div = document.createElement("div");
  div.className = "system-line";

  const contentSpan = document.createElement("span");
  contentSpan.textContent = msg.content || "";
  div.appendChild(contentSpan);

  if (msg.createdAt) {
    const timeEl = document.createElement("time");
    timeEl.textContent = formatTime(msg.createdAt);
    div.appendChild(timeEl);
  }

  if (prepend) {
    messagesDiv.prepend(div);
  } else {
    messagesDiv.appendChild(div);
  }
  return div;
}

// ================== 渲染：普通消息（QQ 气泡） ==================
function renderChatMessage(msg, isSelf, prepend = false, pending = false) {
  const line = document.createElement("div");
  line.className = "msg-line " + (isSelf ? "me" : "other");

  const bubble = document.createElement("div");
  bubble.className = "msg " + (isSelf ? "me" : "other");

  if (msg.clientMsgId) {
    bubble.dataset.clientMsgId = msg.clientMsgId;
  }
  if (msg.id) {
    bubble.dataset.messageId = msg.id;
  }

  const senderSpan = document.createElement("span");
  senderSpan.className = "sender";
  senderSpan.textContent = msg.from || "";
  bubble.appendChild(senderSpan);

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "content";

  if (!msg.type || msg.type === "text") {
    contentWrapper.textContent = msg.content || "";
  } else if (msg.type === "image") {
    const img = document.createElement("img");
    img.src = msg.url;
    img.alt = msg.fileName || "";
    contentWrapper.appendChild(img);
  } else if (msg.type === "audio") {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = msg.url;
    contentWrapper.appendChild(audio);
  } else if (msg.type === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.src = msg.url;
    video.style.maxHeight = "220px";
    contentWrapper.appendChild(video);
  } else if (msg.type === "file") {
    const a = document.createElement("a");
    a.href = msg.url;
    a.target = "_blank";
    a.textContent = msg.fileName || "下载文件";
    contentWrapper.appendChild(a);
  } else {
    contentWrapper.textContent = msg.content || "[未知类型消息]";
  }

  bubble.appendChild(contentWrapper);

  const metaRow = document.createElement("div");
  metaRow.className = "meta-row";

  const timeEl = document.createElement("time");
  timeEl.textContent = msg.createdAt ? formatTime(msg.createdAt) : "";
  metaRow.appendChild(timeEl);

  const statusSpan = document.createElement("span");
  statusSpan.className = "status";
  if (isSelf) statusSpan.textContent = pending ? "发送中..." : "已送达";
  metaRow.appendChild(statusSpan);

  bubble.appendChild(metaRow);
  line.appendChild(bubble);

  if (prepend) {
    messagesDiv.prepend(line);
  } else {
    messagesDiv.appendChild(line);
  }

  return bubble;
}

// ================== 收到 WebSocket 消息 ==================
function handleIncomingMessage(msg) {
  if (msg.type === "system") {
    if (msg.systemType === "onlineCount") {
      setOnlineCount(msg.onlineCount || 0);
      return;
    }

    renderSystemMessage(msg);
    if (
      msg.systemType === "info" &&
      msg.content &&
      msg.content.indexOf("你已加入房间") === 0 &&
      msg.roomId
    ) {
      fetchRoomInfo(msg.roomId);
    }
    scrollToBottom();
    return;
  }

  const myId = userIdInput.value.trim();
  const isSelf = msg.from === myId;

  if (msg.clientMsgId && pendingMessages.has(msg.clientMsgId)) {
    const bubble = pendingMessages.get(msg.clientMsgId);
    pendingMessages.delete(msg.clientMsgId);

    bubble.dataset.messageId = msg.id || "";

    const timeEl = bubble.querySelector(".meta-row time");
    if (timeEl && msg.createdAt) {
      timeEl.textContent = formatTime(msg.createdAt);
    }

    const statusSpan = bubble.querySelector(".meta-row .status");
    if (statusSpan && isSelf) {
      statusSpan.textContent = "已送达";
    }
  } else {
    renderChatMessage(msg, isSelf, false, false);
  }

  scrollToBottom();
}

// ================== WebSocket 连接 + 加入房间 ==================
function connectWS() {
  const userId = userIdInput.value.trim();
  const roomId = roomIdInput.value.trim();
  const password = roomPasswordInput.value.trim();

  if (!userId || !roomId) {
    alert("请先填写 用户ID 和 房间ID");
    return;
  }

  const doJoin = () => {
    earliestTimestamp = Date.now() + 1;
    hasMoreHistory = true;
    inSearchMode = false;
    messagesDiv.innerHTML = "";
    roomInfoSpan.textContent = "";
    pendingMessages.clear();

    ws.send(
      JSON.stringify({
        action: "join",
        userId,
        roomId,
        password
      })
    );
    // 不会自动加载历史，需要手动点“加载历史”
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    doJoin();
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("✅ WebSocket 已连接");
    doJoin();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleIncomingMessage(msg);
    } catch (e) {
      console.error("解析服务端消息失败：", e);
    }
  };

  ws.onclose = () => {
    console.log("❌ WebSocket 已断开");
    setOnlineCount(0);
  };

  ws.onerror = (err) => {
    console.error("WebSocket 出错：", err);
  };
}

// ================== 历史记录：点击按钮加载（带密码） ==================
async function loadMoreHistory() {
  if (isLoadingHistory || !hasMoreHistory || inSearchMode) return;

  const roomId = roomIdInput.value.trim();
  const password = roomPasswordInput.value.trim();

  if (!roomId) {
    alert("请先填写房间ID并加入房间");
    return;
  }

  isLoadingHistory = true;
  const before = earliestTimestamp || Date.now();
  const oldScrollHeight = messagesDiv.scrollHeight;

  try {
    const url =
      `${HTTP_BASE}/messages?roomId=${encodeURIComponent(roomId)}` +
      `&before=${before}&limit=20&password=${encodeURIComponent(password)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      alert("加载历史失败：" + (data.message || ""));
      return;
    }

    const list = data.data || [];
    if (list.length === 0) {
      hasMoreHistory = false;
      renderSystemMessage({
        content: "没有更多历史记录了",
        createdAt: Date.now()
      }, true);
      return;
    }

    list.forEach((m) => {
      const isSelf = m.from === userIdInput.value.trim();
      if (m.type === "system") {
        renderSystemMessage(m, true);
      } else {
        renderChatMessage(m, isSelf, true, false);
      }
      if (m.createdAt && m.createdAt < earliestTimestamp) {
        earliestTimestamp = m.createdAt;
      }
    });

    const newScrollHeight = messagesDiv.scrollHeight;
    messagesDiv.scrollTop = newScrollHeight - oldScrollHeight;
  } catch (e) {
    console.error("加载历史异常：", e);
  } finally {
    isLoadingHistory = false;
  }
}

// ================== 发送文本消息 ==================
function sendText() {
  const rawText = msgInput.value.trim();
  if (!rawText) return;

  const userId = userIdInput.value.trim();
  const roomId = roomIdInput.value.trim();

  if (!userId || !roomId) {
    alert("请先填写 用户ID 和 房间ID");
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("请先加入房间（建立 WebSocket 连接）");
    return;
  }

  const content = applyEmojiShortcodes(rawText);
  const clientMsgId = generateClientMsgId();

  const localMsg = {
    roomId,
    from: userId,
    type: "text",
    content,
    url: "",
    fileName: "",
    fileType: "",
    clientMsgId,
    createdAt: Date.now()
  };

  const bubble = renderChatMessage(localMsg, true, false, true);
  pendingMessages.set(clientMsgId, bubble);
  scrollToBottom();

  const payload = {
    action: "chat",
    // roomId 不再用于权限判断，后端只信 ws.roomId，这里发不发无所谓
    roomId,
    from: userId,
    type: "text",
    content,
    url: "",
    fileName: "",
    fileType: "",
    clientMsgId
  };

  ws.send(JSON.stringify(payload));
  msgInput.value = "";
}

// ================== 发送文件 ==================
async function sendFile() {
  const file = fileInput.files[0];
  if (!file) {
    alert("请先选择一个文件");
    return;
  }

  const userId = userIdInput.value.trim();
  const roomId = roomIdInput.value.trim();

  if (!userId || !roomId) {
    alert("请先填写 用户ID 和 房间ID");
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("请先加入房间（建立 WebSocket 连接）");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${HTTP_BASE}/upload`, {
      method: "POST",
      body: formData
    });
    const data = await res.json();

    if (!data.ok) {
      alert("上传失败：" + (data.message || ""));
      return;
    }

    const relativeUrl = data.url;
    const fullUrl = `${HTTP_BASE}${relativeUrl}`;
    const fileType = data.fileType || file.type || "";
    let msgType = "file";

    if (fileType.startsWith("image/")) {
      msgType = "image";
    } else if (fileType.startsWith("audio/")) {
      msgType = "audio";
    } else if (fileType.startsWith("video/")) {
      msgType = "video";
    }

    const clientMsgId = generateClientMsgId();
    const localMsg = {
      roomId,
      from: userId,
      type: msgType,
      content: "",
      url: fullUrl,
      fileName: data.fileName || file.name,
      fileType,
      clientMsgId,
      createdAt: Date.now()
    };

    const bubble = renderChatMessage(localMsg, true, false, true);
    pendingMessages.set(clientMsgId, bubble);
    scrollToBottom();

    const payload = {
      action: "chat",
      roomId,
      from: userId,
      type: msgType,
      content: "",
      url: fullUrl,
      fileName: data.fileName || file.name,
      fileType,
      clientMsgId
    };

    ws.send(JSON.stringify(payload));
    fileInput.value = "";
  } catch (e) {
    console.error("上传异常：", e);
    alert("上传失败，请检查控制台日志");
  }
}

// ================== 搜索 / 清除搜索（带密码） ==================
async function searchMessages() {
  const roomId = roomIdInput.value.trim();
  const keyword = searchInput.value.trim();
  const password = roomPasswordInput.value.trim();

  if (!roomId) {
    alert("请先填写房间ID");
    return;
  }
  if (!keyword) {
    alert("请输入关键字");
    return;
  }

  try {
    const url =
      `${HTTP_BASE}/messages/search?roomId=${encodeURIComponent(roomId)}` +
      `&keyword=${encodeURIComponent(keyword)}` +
      `&password=${encodeURIComponent(password)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      alert("搜索失败：" + (data.message || ""));
      return;
    }

    inSearchMode = true;
    messagesDiv.innerHTML = "";

    const list = data.data || [];
    list.forEach((m) => {
      if (m.type === "system") {
        renderSystemMessage(m);
      } else {
        const isSelf = m.from === userIdInput.value.trim();
        renderChatMessage(m, isSelf, false, false);
      }
    });

    renderSystemMessage({
      content: `🔍 搜索结果（关键字：${keyword}，共 ${list.length} 条）`,
      createdAt: Date.now()
    });

    scrollToBottom();
  } catch (e) {
    console.error("搜索异常：", e);
    alert("搜索异常，请检查控制台日志");
  }
}

function clearSearch() {
  inSearchMode = false;
  searchInput.value = "";
  messagesDiv.innerHTML = "";
  earliestTimestamp = Date.now() + 1;
  hasMoreHistory = true;
}

// ================== 创建房间 ==================
async function createRoom() {
  const userId = userIdInput.value.trim();
  const roomId = roomIdInput.value.trim();
  const password = roomPasswordInput.value;
  const maxUsers = maxUsersInput.value;

  if (!userId) {
    alert("请先填写 用户ID（你就是群主）");
    return;
  }
  if (!roomId) {
    alert("请先填写 房间ID");
    return;
  }

  try {
    const res = await fetch(`${HTTP_BASE}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        ownerId: userId,
        password,
        maxUsers
      })
    });
    const data = await res.json();
    if (!data.ok) {
      alert("创建失败：" + (data.message || ""));
      return;
    }

    alert("房间创建成功！");
    fetchRoomInfo(roomId);
  } catch (e) {
    console.error("创建房间异常：", e);
    alert("创建房间异常，请检查控制台日志");
  }
}

// ================== 事件绑定 ==================
joinBtn.onclick        = connectWS;
sendBtn.onclick        = sendText;
sendFileBtn.onclick    = sendFile;
loadMoreBtn.onclick    = loadMoreHistory;
searchBtn.onclick      = searchMessages;
clearSearchBtn.onclick = clearSearch;
createRoomBtn.onclick  = createRoom;

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
});

// Emoji 按钮
document.querySelectorAll(".emoji-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const emoji = btn.dataset.emoji || btn.textContent;
    msgInput.value += emoji;
    msgInput.focus();
  });
});
