// index.js
const express = require("express");

const app  = express();
const PORT = process.env.PORT || 3000;

// ====== CONFIG ======
const COMMAND_KEY = process.env.COMMAND_KEY || "change-this-key";
// TTL mặc định: 60s, có thể override bằng env COMMAND_TTL_MS (tính bằng ms)
let COMMAND_TTL_MS = Number(process.env.COMMAND_TTL_MS || 60 * 1000);

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // để đọc body form POST

// In-memory command store: { [userLower]: { cmd, ts } }
const commandStore = Object.create(null);

function setCommand(user, cmd) {
  if (!user || !cmd) return;
  const key = String(user).toLowerCase();
  commandStore[key] = {
    cmd: String(cmd),
    ts: Date.now(),
  };
}

function popCommand(user) {
  if (!user) return null;
  const key = String(user).toLowerCase();
  const entry = commandStore[key];
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.ts > COMMAND_TTL_MS) {
    // hết hạn -> xoá
    delete commandStore[key];
    return null;
  }

  // one-time command -> đọc xong xoá
  delete commandStore[key];
  return entry.cmd;
}

function checkKey(key) {
  return key === COMMAND_KEY;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===================== API (Roblox / Bot) =====================

// Bot / service khác gửi lệnh (có bảo vệ KEY)
app.post("/api/set-command", (req, res) => {
  const body = req.body || {};
  const user = (body.user || "").trim();
  const cmd  = (body.cmd  || "").trim().toLowerCase();
  const key  = body.key;

  if (!user || !cmd) {
    return res.status(400).json({ ok: false, error: "missing_user_or_cmd" });
  }
  if (!checkKey(key)) {
    return res.status(403).json({ ok: false, error: "bad_key" });
  }

  setCommand(user, cmd);
  return res.json({ ok: true });
});

// Script Roblox poll lệnh
app.get("/api/get-command", (req, res) => {
  const user = (req.query.user || "").trim();
  const key  = req.query.key;

  if (!user) {
    return res.status(400).json({ ok: false, error: "missing_user" });
  }
  if (!checkKey(key)) {
    return res.status(403).json({ ok: false, error: "bad_key" });
  }

  const cmd = popCommand(user); // null nếu hết hạn / không có
  return res.json({ ok: true, cmd: cmd || null });
});
// Simple endpoint cho SAB: chỉ trả về { sellall: true/false }
app.get("/api/sellall", (req, res) => {
  const username = (req.query.username || req.query.user || "").trim();

  if (!username) {
    return res.status(400).json({ sellall: false, error: "missing_username" });
  }

  // Lấy lệnh theo username, giống get-command nhưng không cần key
  const cmd = popCommand(username);  // dùng lại function đã có
  const isSell = cmd && cmd.toLowerCase() === "sellall";

  return res.json({ sellall: !!isSell });
});

// Đổi TTL (giây) qua API – dùng cho lệnh admin từ bot
app.post("/api/set-ttl", (req, res) => {
  const body = req.body || {};
  const key  = body.key;
  const ttlSeconds = body.ttlSeconds;

  if (!checkKey(key)) {
    return res.status(403).json({ ok: false, error: "bad_key" });
  }

  const n = parseInt(ttlSeconds, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 3600) {
    return res.status(400).json({ ok: false, error: "invalid_ttl" });
  }

  COMMAND_TTL_MS = n * 1000;
  return res.json({ ok: true, ttlMs: COMMAND_TTL_MS });
});

// ===================== HTML panel =====================

function renderPanelPage(userRaw, cmdRaw, state /* "preview" | "sent" */) {
  const safeUser = escapeHtml(userRaw);
  const safeCmd  = escapeHtml(cmdRaw);

  const isPreview = state === "preview";

  const badgeText  = isPreview ? "Confirmation required" : "Command sent";
  const badgeGrad  = isPreview
    ? "linear-gradient(135deg, #f59e0b, #f97316)"
    : "linear-gradient(135deg, #22c55e, #16a34a)";

  const statusText = isPreview
    ? "Please confirm this action before it is sent to the player."
    : "Your command has been queued for this player.";

  const hintText = isPreview
    ? "After you confirm, the command will be queued for the player. Commands automatically expire after 1 minute."
    : "If the player is in-game and the script is running, it should execute within a few seconds. Commands automatically expire after 1 minute.";

  const actionButton = isPreview
    ? `<form method="POST" action="/panel/confirm" style="margin-top:14px;">
         <input type="hidden" name="user" value="${safeUser}">
         <input type="hidden" name="cmd"  value="${safeCmd}">
         <button class="primary-btn" type="submit">
           Confirm Sellall
         </button>
       </form>`
    : `<button class="secondary-btn" onclick="window.close();">
         Close this tab
       </button>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Roblox Command Panel</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top, #4f46e5 0, #111827 55%);
      color: #e5e7eb;
    }
    .card {
      background: rgba(17, 24, 39, 0.92);
      border-radius: 20px;
      padding: 24px 28px 22px;
      max-width: 420px;
      width: calc(100% - 32px);
      box-shadow: 0 18px 45px rgba(0,0,0,0.45);
      border: 1px solid rgba(129, 140, 248, 0.45);
      backdrop-filter: blur(14px);
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #9ca3af;
      margin-bottom: 14px;
    }
    .info {
      font-size: 14px;
      line-height: 1.6;
      background: rgba(31, 41, 55, 0.9);
      border-radius: 14px;
      padding: 10px 12px;
      margin-bottom: 14px;
      border: 1px solid rgba(55, 65, 81, 0.9);
    }
    .info span.label {
      color: #9ca3af;
      display: inline-block;
      width: 80px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: ${badgeGrad};
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: white;
      margin-bottom: 10px;
    }
    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #fef3c7;
      margin-right: 6px;
    }
    .status-text {
      font-size: 14px;
      margin-bottom: 6px;
    }
    .hint {
      font-size: 12px;
      color: #9ca3af;
    }
    .footer {
      margin-top: 16px;
      font-size: 11px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .brand {
      font-weight: 500;
      color: #a5b4fc;
    }
    .primary-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border-radius: 999px;
      border: none;
      background: rgba(37, 99, 235, 0.95);
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .primary-btn:hover {
      background: rgb(59, 130, 246);
    }
    .secondary-btn {
      margin-top: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(75, 85, 99, 0.9);
      background: transparent;
      color: #e5e7eb;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .secondary-btn:hover {
      background: rgba(31, 41, 55, 0.9);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Roblox Command Panel</div>
    <div class="subtitle">Control panel for your in-game executor.</div>

    <div class="info">
      <div><span class="label">User:</span> <strong>${safeUser}</strong></div>
      <div><span class="label">Command:</span> <strong>${safeCmd}</strong></div>
    </div>

    <div class="badge">
      <span class="badge-dot"></span>
      ${badgeText}
    </div>

    <div class="status-text">
      ${statusText}
    </div>
    <div class="hint">
      ${hintText}
    </div>

    ${actionButton}

    <div class="footer">
      <span class="brand">Mozil · Roblox Scripts</span>
      <span>Safe one-time commands via web panel.</span>
    </div>
  </div>
</body>
</html>`;
}

// ===================== Web panel routes =====================

// Step 1: mở preview (chưa gửi lệnh)
app.get("/panel", (req, res) => {
  const userRaw = (req.query.user || "").trim();
  const cmdRaw  = (req.query.cmd  || "").trim().toLowerCase();

  if (!userRaw || !cmdRaw) {
    return res.status(400).send("Missing 'user' or 'cmd' query parameter.");
  }

  const html = renderPanelPage(userRaw, cmdRaw, "preview");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Step 2: user bấm Confirm -> gửi lệnh + show trang success
app.post("/panel/confirm", (req, res) => {
  const userRaw = (req.body.user || "").trim();
  const cmdRaw  = (req.body.cmd  || "").trim().toLowerCase();

  if (!userRaw || !cmdRaw) {
    return res.status(400).send("Missing 'user' or 'cmd' in form body.");
  }

  setCommand(userRaw, cmdRaw); // lưu lệnh với TTL

  const html = renderPanelPage(userRaw, cmdRaw, "sent");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Root route (optional)
app.get("/", (req, res) => {
  res.redirect("/panel-info");
});

app.get("/panel-info", (req, res) => {
  res.send("Roblox Command Panel is running.");
});

app.listen(PORT, () => {
  console.log(`Roblox Command Panel listening on port ${PORT}`);
});
