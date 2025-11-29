// server/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ================= 目录配置 =================

// 静态网页目录：../web （注意这里用了 ..）
const WEB_DIR = path.join(__dirname, '..', 'web');
// 上传目录：./uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads');
// 消息存储文件：./messages.json
const DB_FILE = path.join(__dirname, 'messages.json');

// 确保 uploads 目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 把 web 目录暴露成静态目录，这样 /index.html 就能访问到 ../web/index.html
app.use(express.static(WEB_DIR));
// 上传文件静态访问
app.use('/uploads', express.static(UPLOAD_DIR));

// 根路径直接返回 index.html（可选，方便直接打开 http://localhost:3000/）
app.get('/', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// ================= 消息持久化 =================

let messages = [];
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      messages = parsed;
    }
  } catch (e) {
    console.error('读取 messages.json 失败，使用空数组：', e);
    messages = [];
  }
}

function saveMessages() {
  fs.writeFile(DB_FILE, JSON.stringify(messages, null, 2), (err) => {
    if (err) {
      console.error('保存 messages.json 失败：', err);
    }
  });
}

// ================= 文件上传（音频/视频/图片/其他） =================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const safeBase = base.replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});

const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: '未收到文件' });
  }
  const file = req.file;
  const url = `/uploads/${file.filename}`;
  res.json({
    ok: true,
    url,
    fileType: file.mimetype,
    fileName: file.originalname
  });
});

// ================= 房间管理（开房 / 群主 / 密码 / 人数上限） =================

// roomId -> { roomId, ownerId, password, maxUsers }
const rooms = new Map();

// WebSocket 连接表：roomId -> Set<ws>
const roomClients = new Map();

function getRoomClientSet(roomId) {
  let set = roomClients.get(roomId);
  if (!set) {
    set = new Set();
    roomClients.set(roomId, set);
  }
  return set;
}

// 创建房间
app.post('/rooms', (req, res) => {
  const { roomId, ownerId, password, maxUsers } = req.body || {};
  if (!roomId || !ownerId) {
    return res
      .status(400)
      .json({ ok: false, message: 'roomId 和 ownerId 必填' });
  }
  if (rooms.has(roomId)) {
    return res.status(400).json({ ok: false, message: '房间已存在' });
  }

  const n = parseInt(maxUsers, 10);
  const safeMax = Number.isFinite(n) && n > 0 ? n : 0; // 0 表示不限制

  rooms.set(roomId, {
    roomId,
    ownerId,
    password: password || '',
    maxUsers: safeMax
  });

  return res.json({
    ok: true,
    data: {
      roomId,
      ownerId,
      hasPassword: !!(password && password.length > 0),
      maxUsers: safeMax
    }
  });
});

// 获取房间信息
app.get('/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ ok: false, message: '房间不存在' });
  }
  const set = roomClients.get(roomId);
  const onlineCount = set ? set.size : 0;
  res.json({
    ok: true,
    data: {
      roomId,
      ownerId: room.ownerId,
      hasPassword: !!room.password,
      maxUsers: room.maxUsers,
      onlineCount
    }
  });
});

// ================= 历史消息 / 搜索（带密码校验） =================

// 懒加载历史消息
app.get('/messages', (req, res) => {
  const { roomId, before, limit, password } = req.query;
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'roomId 必填' });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ ok: false, message: '房间不存在' });
  }
  if (room.password && room.password !== (password || '')) {
    return res.status(403).json({ ok: false, message: '房间密码错误' });
  }

  const beforeTs = before ? Number(before) : Date.now() + 1;
  const lim = limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20;

  const filtered = messages.filter(
    (m) => m.roomId === roomId && m.createdAt < beforeTs
  );

  filtered.sort((a, b) => b.createdAt - a.createdAt);
  const sliced = filtered.slice(0, lim);
  sliced.sort((a, b) => a.createdAt - b.createdAt);

  res.json({ ok: true, data: sliced });
});

// 搜索消息
app.get('/messages/search', (req, res) => {
  const { roomId, keyword, password } = req.query;
  if (!roomId || !keyword) {
    return res
      .status(400)
      .json({ ok: false, message: 'roomId 和 keyword 必填' });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ ok: false, message: '房间不存在' });
  }
  if (room.password && room.password !== (password || '')) {
    return res.status(403).json({ ok: false, message: '房间密码错误' });
  }

  const lower = String(keyword).toLowerCase();
  const result = messages.filter((m) => {
    if (m.roomId !== roomId) return false;
    const content = (m.content || '').toLowerCase();
    const fileName = (m.fileName || '').toLowerCase();
    const from = (m.from || '').toLowerCase();
    return (
      content.includes(lower) ||
      fileName.includes(lower) ||
      from.includes(lower)
    );
  });

  result.sort((a, b) => a.createdAt - b.createdAt);
  res.json({ ok: true, data: result });
});

// ================= WebSocket 聊天服务 =================

function createMessage(payload) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    roomId: payload.roomId,
    from: payload.from,
    type: payload.type,
    content: payload.content || '',
    url: payload.url || '',
    fileName: payload.fileName || '',
    fileType: payload.fileType || '',
    clientMsgId: payload.clientMsgId || null,
    systemType: payload.systemType,
    onlineCount: payload.onlineCount,
    createdAt: Date.now()
  };
}

function createSystemMessage(roomId, content, extra = {}) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    roomId,
    from: '系统',
    type: 'system',
    content,
    url: '',
    fileName: '',
    fileType: '',
    clientMsgId: null,
    systemType: extra.systemType,
    onlineCount: extra.onlineCount,
    createdAt: Date.now()
  };
}

function broadcastToRoom(roomId, data) {
  const set = roomClients.get(roomId);
  if (!set) return;
  const text = JSON.stringify(data);
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

function updateOnlineCount(roomId) {
  const set = roomClients.get(roomId);
  const onlineCount = set ? set.size : 0;
  const msg = createSystemMessage(roomId, '', {
    systemType: 'onlineCount',
    onlineCount
  });
  broadcastToRoom(roomId, msg);
}

// ================= 启动 HTTP + WebSocket =================

const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 HTTP server listening on http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('✅ WebSocket 连接');
  ws.userId = null;
  ws.roomId = null;

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      console.error('WebSocket 消息 JSON 解析失败：', e);
      return;
    }

    // ===== 加入房间 =====
    if (data.action === 'join') {
      const { roomId, userId, password } = data;
      if (!roomId || !userId) return;

      const room = rooms.get(roomId);
      if (!room) {
        ws.send(
          JSON.stringify(
            createSystemMessage(roomId, `房间 ${roomId} 不存在，请先创建房间`, {
              systemType: 'error'
            })
          )
        );
        return;
      }

      if (room.password && room.password !== (password || '')) {
        ws.send(
          JSON.stringify(
            createSystemMessage(roomId, '房间密码错误', {
              systemType: 'error'
            })
          )
        );
        return;
      }

      // 从旧房间移除（只有新房间加入成功才移）
      if (ws.roomId && roomClients.has(ws.roomId)) {
        const oldSet = roomClients.get(ws.roomId);
        oldSet.delete(ws);

        if (rooms.has(ws.roomId)) {
          const leaveMsg = createSystemMessage(
            ws.roomId,
            `${ws.userId || '有人'} 离开了房间`,
            { systemType: 'info' }
          );
          broadcastToRoom(ws.roomId, leaveMsg);
          updateOnlineCount(ws.roomId);
        }
      }

      const set = getRoomClientSet(roomId);
      if (room.maxUsers > 0 && set.size >= room.maxUsers) {
        ws.send(
          JSON.stringify(
            createSystemMessage(roomId, '房间人数已满，无法加入', {
              systemType: 'error'
            })
          )
        );
        return;
      }

      ws.userId = userId;
      ws.roomId = roomId;
      set.add(ws);

      const selfMsg = createSystemMessage(
        roomId,
        `你已加入房间：${roomId}（群主：${room.ownerId}）`,
        { systemType: 'info' }
      );
      ws.send(JSON.stringify(selfMsg));

      const joinMsg = createSystemMessage(roomId, `${userId} 加入了房间`, {
        systemType: 'info'
      });
      broadcastToRoom(roomId, joinMsg);

      updateOnlineCount(roomId);
      return;
    }

    // ===== 聊天消息 =====
    if (data.action === 'chat') {
      // 只允许当前已加入房间的连接发消息
      const roomId = ws.roomId;
      if (!roomId) return;
      const set = roomClients.get(roomId);
      if (!set || !set.has(ws)) return;
      if (!rooms.has(roomId)) return;

      const msg = createMessage({
        roomId,
        from: data.from || ws.userId || '匿名',
        type: data.type || 'text',
        content: data.content || '',
        url: data.url || '',
        fileName: data.fileName || '',
        fileType: data.fileType || '',
        clientMsgId: data.clientMsgId
      });

      messages.push(msg);
      saveMessages();
      broadcastToRoom(roomId, msg);
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket 断开');
    if (ws.roomId && roomClients.has(ws.roomId)) {
      const set = roomClients.get(ws.roomId);
      set.delete(ws);

      if (rooms.has(ws.roomId)) {
        if (ws.userId) {
          const leaveMsg = createSystemMessage(
            ws.roomId,
            `${ws.userId} 离开了房间`,
            { systemType: 'info' }
          );
          broadcastToRoom(ws.roomId, leaveMsg);
        }
        updateOnlineCount(ws.roomId);
      }
    }
  });
});
