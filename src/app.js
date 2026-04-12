const express = require('express');
const cors = require('cors');

const {
  getQrDataUrl,
  getSenderStatus,
  getWhatsAppGroups,
  sendMessageToGroup,
  restartClient,
  resetSession
} = require('./services/whatsappClient');

const app = express();

app.use(cors());
app.use(express.json());

/* ---------------- HEALTH ---------------- */

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'zooga-whatsapp-sender' });
});

/* ---------------- STATUS ---------------- */

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender',
    ...getSenderStatus()
  });
});

/* ---------------- QR ---------------- */

app.get('/qr', (req, res) => {
  const qr = getQrDataUrl();

  if (!qr) {
    return res.status(404).send('No QR available');
  }

  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h2>Scan QR</h2>
        <img src="${qr}" style="width:300px;" />
      </body>
    </html>
  `);
});

/* ---------------- GROUPS ---------------- */

app.get('/groups', async (req, res) => {
  try {
    const groups = await getWhatsAppGroups();

    res.json({
      ok: true,
      count: groups.length,
      groups
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- TEST SEND ---------------- */

app.post('/send-test', async (req, res) => {
  try {
    const { whatsapp_chat_id, message_text } = req.body;

    const result = await sendMessageToGroup(
      whatsapp_chat_id,
      message_text
    );

    res.json({ ok: true, result });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- BROADCAST ENGINE ---------------- */

let currentBroadcast = null;

app.post('/broadcast', async (req, res) => {
  try {
    const {
      message_text,
      targets,
      delay_ms = 3000,
      max_retries = 2
    } = req.body;

    if (!message_text || !targets || !targets.length) {
      return res.status(400).json({
        ok: false,
        error: 'message_text and targets required'
      });
    }

    if (currentBroadcast) {
      return res.status(400).json({
        ok: false,
        error: 'Broadcast already running'
      });
    }

    currentBroadcast = {
      total: targets.length,
      sent: 0,
      failed: 0,
      in_progress: true,
      started_at: new Date().toISOString()
    };

    // 🔥 RUN ASYNC (non-blocking)
    runBroadcast(targets, message_text, delay_ms, max_retries);

    res.json({
      ok: true,
      message: 'Broadcast started',
      total: targets.length
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- BROADCAST STATUS ---------------- */

app.get('/broadcast-status', (req, res) => {
  res.json({
    ok: true,
    broadcast: currentBroadcast
  });
});

/* ---------------- BROADCAST LOGIC ---------------- */

async function runBroadcast(targets, message, delayMs, maxRetries) {
  console.log(`🚀 Starting broadcast to ${targets.length} groups`);

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    let success = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await sendMessageToGroup(target, message);
        success = true;
        break;
      } catch (err) {
        console.log(`Retry ${attempt + 1} failed for ${target}`);
        await sleep(1000);
      }
    }

    if (success) {
      currentBroadcast.sent++;
    } else {
      currentBroadcast.failed++;
    }

    await sleep(delayMs);
  }

  currentBroadcast.in_progress = false;
  currentBroadcast.finished_at = new Date().toISOString();

  console.log('✅ Broadcast finished');
}

/* ---------------- HELPERS ---------------- */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------------- CONTROL ---------------- */

app.post('/restart', async (req, res) => {
  await restartClient();
  res.json({ ok: true });
});

app.post('/reset-session', async (req, res) => {
  await resetSession();
  res.json({ ok: true });
});

module.exports = app;
