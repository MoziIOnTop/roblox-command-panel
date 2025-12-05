const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// ====== CONFIG ======
const COMMAND_KEY = process.env.COMMAND_KEY || "change-this-key";
// Fixed script key for key system page
const SCRIPT_KEY = "FREE_76002dbd381656d46e167e6334900ece";
// TTL mặc định: 60s, có thể override bằng env COMMAND_TTL_MS (tính bằng ms)
let COMMAND_TTL_MS = Number(process.env.COMMAND_TTL_MS || 60 * 1000);

// Webhook Discord để gửi .sellall <username>
const SELLALL_WEBHOOK_URL = process.env.VERCEL_SELLALL_URL || "";
// hoặc nếu ông muốn giữ tên cũ:
// const SELLALL_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

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
    delete commandStore[key];
    return null;
  }

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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ===================== API (Roblox / Bot) =====================

// Bot / service khác gửi lệnh (có bảo vệ KEY)
app.post("/api/set-command", (req, res) => {
  const body = req.body || {};
  const user = (body.user || "").trim();
  const cmd = (body.cmd || "").trim().toLowerCase();
  const key = body.key;

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
  const key = req.query.key;

  if (!user) {
    return res.status(400).json({ ok: false, error: "missing_user" });
  }
  if (!checkKey(key)) {
    return res.status(403).json({ ok: false, error: "bad_key" });
  }

  const cmd = popCommand(user);
  return res.json({ ok: true, cmd: cmd || null });
});

// Endpoint simple cho SAB: chỉ trả về { sellall: true/false }
app.get("/api/sellall", (req, res) => {
  const username = (req.query.username || req.query.user || "").trim();

  if (!username) {
    return res
      .status(400)
      .json({ sellall: false, error: "missing_username" });
  }

  const cmd = popCommand(username);
  const isSell = cmd && cmd.toLowerCase() === "sellall";

  return res.json({ sellall: !!isSell });
});

// Đổi TTL (giây) qua API – dùng cho lệnh admin từ bot
app.post("/api/set-ttl", (req, res) => {
  const body = req.body || {};
  const key = body.key;
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
  const safeCmd = escapeHtml(cmdRaw);

  const isPreview = state === "preview";

  const badgeText = isPreview ? "Confirmation required" : "Command sent";
  const badgeGrad = isPreview
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

// ===================== KEY PAGE (Generate Key UI) =====================

function renderKeyPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Key System</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top, #4f46e5 0, #020617 55%);
      color: #e5e7eb;
    }
    .card {
      background: rgba(15, 23, 42, 0.96);
      border-radius: 22px;
      padding: 22px 24px 20px;
      max-width: 420px;
      width: calc(100% - 32px);
      box-shadow: 0 20px 45px rgba(0,0,0,0.55);
      border: 1px solid rgba(96, 165, 250, 0.45);
      backdrop-filter: blur(14px);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .icon-badge {
      width: 32px;
      height: 32px;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 0, #22c55e, #0f172a);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .title {
      font-size: 19px;
      font-weight: 700;
    }
    .subtitle {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 14px;
    }
    .key-box {
      margin-top: 6px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(55, 65, 81, 0.9);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      word-break: break-all;
      min-height: 40px;
      display: flex;
      align-items: center;
      color: #e5e7eb;
    }
    .key-placeholder {
      color: #6b7280;
    }
    .buttons-row {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    button {
      border: none;
      cursor: pointer;
      font-family: inherit;
    }
    .btn-primary {
      flex: 1;
      padding: 9px 0;
      border-radius: 999px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
      box-shadow: 0 10px 25px rgba(79, 70, 229, 0.45);
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 30px rgba(79, 70, 229, 0.6);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      box-shadow: none;
      cursor: default;
      transform: none;
    }
    .btn-secondary {
      width: 110px;
      padding: 9px 0;
      border-radius: 999px;
      border: 1px solid rgba(75, 85, 99, 0.9);
      background: rgba(15, 23, 42, 0.9);
      color: #e5e7eb;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
    }
    .btn-secondary:hover {
      background: rgba(30, 64, 175, 0.2);
      border-color: rgba(129, 140, 248, 0.9);
    }
    .btn-secondary:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .status-text {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 10px;
      min-height: 18px;
    }
    .footer {
      margin-top: 12px;
      font-size: 11px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .brand {
      font-weight: 500;
      color: #a5b4fc;
    }
    .loader {
      position: absolute;
      right: 16px;
      top: 16px;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 2px solid rgba(148, 163, 184, 0.3);
      border-top-color: #60a5fa;
      animation: spin 0.9s linear infinite;
      opacity: 0;
      transform: scale(0.5);
      pointer-events: none;
      transition: opacity 0.12s ease, transform 0.12s ease;
    }
    .card-inner {
      position: relative;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    a.discord-link {
      color: #9ca3af;
      text-decoration: none;
    }
    a.discord-link:hover {
      color: #e5e7eb;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-inner">
      <div class="loader" id="loader"></div>
      <div class="header">
        <div class="icon-badge">🔐</div>
        <div>
          <div class="title">Key System</div>
          <div class="subtitle">Generate your access key for the script.</div>
        </div>
      </div>

      <div style="font-size:12px;color:#9ca3af;margin-bottom:6px;">
        Your key is unique for this script. Keep it private and do not share it with others.
      </div>

      <div class="key-box" id="keyBox">
        <span class="key-placeholder" id="keyPlaceholder">Click "Generate key" to get your key.</span>
      </div>

      <div class="buttons-row">
        <button class="btn-primary" id="generateBtn">
          <span>Generate key</span>
        </button>
        <button class="btn-secondary" id="copyBtn" disabled>
          Copy
        </button>
      </div>

      <div class="status-text" id="statusText">
        Waiting for you to generate a key.
      </div>

      <div class="footer">
        <span class="brand">Mozil · Key System</span>
        <a class="discord-link" href="https://discord.gg/mozil" target="_blank" rel="noreferrer">
          Discord.gg/mozil
        </a>
      </div>
    </div>
  </div>

  <script>
    const FIXED_KEY = '${SCRIPT_KEY}';

    const generateBtn   = document.getElementById('generateBtn');
    const copyBtn       = document.getElementById('copyBtn');
    const keyBox        = document.getElementById('keyBox');
    const keyPlaceholder= document.getElementById('keyPlaceholder');
    const statusText    = document.getElementById('statusText');
    const loader        = document.getElementById('loader');

    function setLoading(isLoading) {
      if (isLoading) {
        loader.style.opacity = '1';
        loader.style.transform = 'scale(1)';
        generateBtn.disabled = true;
        copyBtn.disabled = true;
      } else {
        loader.style.opacity = '0';
        loader.style.transform = 'scale(0.5)';
        generateBtn.disabled = false;
        copyBtn.disabled = false;
      }
    }

    generateBtn.addEventListener('click', () => {
      if (generateBtn.disabled) return;
      keyPlaceholder.textContent = '';
      keyBox.textContent = '';
      statusText.textContent = 'Generating your key...';
      setLoading(true);

      setTimeout(() => {
        keyBox.textContent = FIXED_KEY;
        statusText.textContent = 'Your key is ready. Use this key in the script key system.';
        setLoading(false);
      }, 900);
    });

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        statusText.textContent = 'Key copied to clipboard.';
      } catch (e) {
        statusText.textContent = 'Unable to copy automatically. Please copy the key manually.';
      }
      document.body.removeChild(ta);
    }

    copyBtn.addEventListener('click', () => {
      const key = keyBox.textContent.trim();
      if (!key) {
        statusText.textContent = 'Generate a key first.';
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key)
          .then(() => {
            statusText.textContent = 'Key copied to clipboard.';
          })
          .catch(() => {
            fallbackCopy(key);
          });
      } else {
        fallbackCopy(key);
      }
    });
  </script>
</body>
</html>`;
}

// ===================== Web panel routes =====================

// Step 1: preview
app.get("/panel", (req, res) => {
  const userRaw = (req.query.user || "").trim();
  const cmdRaw = (req.query.cmd || "").trim().toLowerCase();

  if (!userRaw || !cmdRaw) {
    return res.status(400).send("Missing 'user' or 'cmd' query parameter.");
  }

  const html = renderPanelPage(userRaw, cmdRaw, "preview");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Key generator page
app.get("/key", (req, res) => {
  const html = renderKeyPage();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Step 2: Confirm -> set command + gửi webhook Discord
app.post("/panel/confirm", async (req, res) => {
  const userRaw = (req.body.user || "").trim();
  const cmdRaw = (req.body.cmd || "").trim().toLowerCase();

  if (!userRaw || !cmdRaw) {
    return res.status(400).send("Missing 'user' or 'cmd' in form body.");
  }

  // Lưu command vào store (nếu ông còn dùng phần poll)
  setCommand(userRaw, cmdRaw);

  // Gửi tin tới Discord webhook để bot đọc
  if (DISCORD_WEBHOOK_URL) {
    const content = `.sellall ${userRaw}`;
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error("Failed to send webhook:", err);
    }
  }

  const html = renderPanelPage(userRaw, cmdRaw, "sent");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Root
app.get("/", (req, res) => {
  res.redirect("/panel-info");
});

app.get("/panel-info", (req, res) => {
  res.send("Roblox Command Panel is running.");
});

app.listen(PORT, () => {
  console.log(`Roblox Command Panel listening on port ${PORT}`);
});
