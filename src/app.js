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

/* ---------------- STATE ---------------- */

let queue = [];
let isRunning = false;
let isPaused = false;
let currentJob = null;

/* ---------------- HEALTH ---------------- */

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

/* ---------------- STATUS ---------------- */

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    ...getSenderStatus(),
    queue_length: queue.length,
    running: isRunning,
    paused: isPaused
  });
});

/* ---------------- QR ---------------- */

app.get('/qr', (req, res) => {
  const qr = getQrDataUrl();

  if (!qr) return res.status(404).send('No QR');

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
      groups
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- ADD BROADCAST ---------------- */

app.post('/broadcast', (req, res) => {
  const { message_text, targets, delay_ms = 3000, retries = 2 } = req.body;

  if (!targets || !targets.length) {
    return res.status(400).json({ ok: false });
  }

  targets.forEach(target => {
    queue.push({
      chatId: target,
      message: message_text,
      delay: delay_ms,
      retries
    });
  });

  processQueue();

  res.json({
    ok: true,
    queued: targets.length
  });
});

/* ---------------- CLUSTER BROADCAST ---------------- */

app.post('/broadcast-clusters', (req, res) => {
  const { clusters, delay_ms = 3000, retries = 2 } = req.body;

  clusters.forEach(cluster => {
    cluster.targets.forEach(target => {
      queue.push({
        chatId: target,
        message: cluster.message_text,
        delay: delay_ms,
        retries
      });
    });
  });

  processQueue();

  res.json({ ok: true });
});

/* ---------------- QUEUE ENGINE ---------------- */

async function processQueue() {
  if (isRunning) return;

  isRunning = true;

  while (queue.length > 0) {

    if (isPaused) {
      await sleep(1000);
      continue;
    }

    const job = queue.shift();
    currentJob = job;

    let success = false;

    for (let i = 0; i <= job.retries; i++) {
      try {
        await sendMessageToGroup(job.chatId, job.message);
        success = true;
        break;
      } catch (err) {
        await sleep(1000);
      }
    }

    await sleep(job.delay);
  }

  isRunning = false;
  currentJob = null;
}

/* ---------------- CONTROL ---------------- */

app.post('/pause', (req, res) => {
  isPaused = true;
  res.json({ ok: true });
});

app.post('/resume', (req, res) => {
  isPaused = false;
  processQueue();
  res.json({ ok: true });
});

app.post('/stop', (req, res) => {
  queue = [];
  isRunning = false;
  isPaused = false;
  currentJob = null;
  res.json({ ok: true });
});

/* ---------------- STATUS ---------------- */

app.get('/queue-status', (req, res) => {
  res.json({
    ok: true,
    running: isRunning,
    paused: isPaused,
    queue_length: queue.length,
    current: currentJob
  });
});

/* ---------------- CONTROL ---------------- */

app.post('/restart', async (req, res) => {
  await restartClient();
  res.json({ ok: true });
});

app.post('/reset-session', async (req, res) => {
  await resetSession();
  res.json({ ok: true });
});

/* ---------------- HELPERS ---------------- */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = app;
