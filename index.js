// index.js
const express = require("express");
const path = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ====== CONFIG ======
const COMMAND_KEY     = process.env.COMMAND_KEY || "change-this-key";
const COMMAND_TTL_MS  = 60 * 1000; // 1 minute

app.use(express.json());

// In-memory command store: { [userLower]: { cmd, ts } }
const commandStore = Object.create(null);

function setCommand(user, cmd) {
  if (!user || !cmd) return;
  const key = user.toLowerCase();
  commandStore[key] = {
    cmd: String(cmd),
    ts: Date.now(),
  };
}

function popCommand(user) {
  if (!user) return null;
  const key = user.toLowerCase();
  const entry = commandStore[key];
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.ts > COMMAND_TTL_MS) {
    // expired -> delete & ignore
    delete commandStore[key];
    return null;
  }

  // one-time command: delete after first read
  delete commandStore[key];
  return entry.cmd;
}

function checkKey(key) {
  // simple shared secret check
  return key === COMMAND_KEY;
}

// ============ API ============

// External clients can POST a command (optional, bạn có thể không dùng route này)
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

// Roblox script polls this endpoint every 2s
app.get("/api/get-command", (req, res) => {
  const user = (req.query.user || "").trim();
  const key  = req.query.key;

  if (!user) {
    return res.status(400).json({ ok: false, error: "missing_user" });
  }
  if (!checkKey(key)) {
    return res.status(403).json({ ok: false, error: "bad_key" });
  }

  const cmd = popCommand(user); // returns null if expired or none
  return res.json({ ok: true, cmd: cmd || null });
});

// ============ Web panel ============
// Called from Discord embed: /panel?user=Iris_11109&cmd=sellall
//  -> ghi lệnh vào RAM, rồi show UI đẹp cho user.
app.get("/panel", (req, res) => {
  const userRaw = (req.query.user || "").trim();
  const cmdRaw  = (req.query.cmd  || "").trim().toLowerCase();

  if (!userRaw || !cmdRaw) {
    return res.status(400).send("Missing 'user' or 'cmd' query parameter.");
  }

  // Trust this route (coming from your own embed), so no key check here.
  setCommand(userRaw, cmdRaw);

  // Simple modern UI (English only)
  const safeUser = userRaw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeCmd  = cmdRaw.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!doctype html>
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
      background: linear-gradient(135deg, #22c55e, #16a34a);
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
      background: #bbf7d0;
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
    .close-btn {
      margin-top: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 14px;
      border-radius: 999px;
      border: none;
      background: rgba(37, 99, 235, 0.95);
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .close-btn:hover {
      background: rgb(59, 130, 246);
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
      Command sent
    </div>

    <div class="status-text">
      Your command has been queued for this player.
    </div>
    <div class="hint">
      If the player is in-game and the script is running, it should execute within a few seconds.
      Commands automatically expire after <strong>1 minute</strong>.
    </div>

    <button class="close-btn" onclick="window.close();">
      Close this tab
    </button>

    <div class="footer">
      <span class="brand">Mozil · Roblox Scripts</span>
      <span>Safe one-time commands via web panel.</span>
    </div>
  </div>
</body>
</html>`;

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
