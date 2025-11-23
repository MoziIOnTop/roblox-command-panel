const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// KEY dùng chung giữa server & Roblox
const COMMAND_KEY = process.env.COMMAND_KEY || 'change-this-key';

// Lưu lệnh tạm trong RAM: user -> { cmd, ts }
const commands = new Map();

function checkKey(key) {
  return key === COMMAND_KEY;
}

// --- API: set-command (web/panel gọi vào) ---
app.post('/api/set-command', (req, res) => {
  const { user, cmd, key } = req.body || {};
  if (!checkKey(key)) return res.status(403).json({ ok: false, error: 'bad_key' });
  if (!user || !cmd)  return res.status(400).json({ ok: false, error: 'missing_user_or_cmd' });

  commands.set(user.toLowerCase(), { cmd, ts: Date.now() });
  return res.json({ ok: true });
});

// --- API: get-command (Roblox poll) ---
app.get('/api/get-command', (req, res) => {
  const user = (req.query.user || '').toLowerCase();
  const key  = req.query.key;
  if (!checkKey(key)) return res.status(403).json({ ok: false, error: 'bad_key' });
  if (!user)          return res.status(400).json({ ok: false, error: 'missing_user' });

  const entry = commands.get(user);
  if (!entry) return res.json({ ok: true, cmd: null });

  commands.delete(user); // pop 1 lần
  return res.json({ ok: true, cmd: entry.cmd, ts: entry.ts });
});

// --- Trang panel: click link là gửi lệnh ---
app.get('/panel', (req, res) => {
  const user = req.query.user || '';
  const cmd  = req.query.cmd  || 'sellall';

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Roblox Command Panel</title>
</head>
<body>
  <h2>Roblox Command Panel</h2>
  <p>User: <b>${user || 'unknown'}</b></p>
  <p>Command: <b>${cmd}</b></p>
  <p id="status">Đang gửi lệnh...</p>

  <script>
    const user = ${JSON.stringify(user)};
    const cmd  = ${JSON.stringify(cmd)};
    const key  = ${JSON.stringify(COMMAND_KEY)};

    async function sendCommand() {
      try {
        const res = await fetch('/api/set-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, cmd, key })
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('status').textContent = 'Đã gửi lệnh! Bạn có thể đóng tab.';
        } else {
          document.getElementById('status').textContent = 'Lỗi: ' + (data.error || 'unknown');
        }
      } catch (e) {
        document.getElementById('status').textContent = 'Network error: ' + e;
      }
    }
    sendCommand();
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
