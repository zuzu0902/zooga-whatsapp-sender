require('dotenv').config();

const express = require('express');
const cors = require('cors');

const {
  initWhatsAppClient,
  getSenderStatus,
  getQrDataUrl,
  getWhatsAppGroups,
  sendTextToGroupById,
  restartClient,
  resetSession
} = require('./services/whatsappClient');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function normalizeTargets(rawTargets) {
  if (!Array.isArray(rawTargets)) return [];

  return rawTargets
    .map((item) => {
      if (!item) return null;

      if (typeof item === 'string') return item.trim();

      if (typeof item === 'object') {
        return (
          item.whatsapp_chat_id ||
          item.chat_id ||
          item.target ||
          item.id ||
          null
        );
      }

      return null;
    })
    .filter(Boolean);
}

function normalizeMessage(body) {
  return (
    body.message_text ||
    body.message ||
    body.text ||
    body.caption_text ||
    ''
  ).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------------- HEALTH ---------------- */

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender'
  });
});

/* ---------------- STATUS ---------------- */

app.get('/status', (req, res) => {
  try {
    res.json(getSenderStatus());
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- QR ---------------- */

app.get('/qr', (req, res) => {
  try {
    const qrDataUrl = getQrDataUrl();

    if (!qrDataUrl) {
      return res.status(404).send(`
        <html dir="rtl">
          <head>
            <meta charset="utf-8" />
            <title>WhatsApp QR</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f7f7f7;">
            <h2>כרגע אין QR זמין</h2>
            <p>אם הוואטסאפ כבר מחובר, זה תקין.</p>
            <p>אם לא, בצע איפוס חיבור או רענון.</p>
          </body>
        </html>
      `);
    }

    return res.send(`
      <html dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>WhatsApp QR</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f7f7f7;">
          <h2>סרוק את הקוד עם וואטסאפ</h2>
          <p>וואטסאפ &gt; מכשירים מקושרים &gt; קישור מכשיר</p>
          <div style="background: white; display: inline-block; padding: 20px; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.12);">
            <img src="${qrDataUrl}" alt="WhatsApp QR" style="max-width: 360px; width: 100%; height: auto;" />
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`
      <html dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>WhatsApp QR Error</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2>שגיאה בטעינת קוד QR</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
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
    console.error('GET /groups failed:', err.message);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- SEND TEST ---------------- */

app.post('/send-test', async (req, res) => {
  try {
    const whatsappChatId =
      req.body.whatsapp_chat_id ||
      req.body.chat_id ||
      req.body.target ||
      null;

    const messageText = normalizeMessage(req.body);

    console.log('SEND-TEST payload:', {
      whatsappChatId,
      messageText
    });

    if (!whatsappChatId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing whatsapp_chat_id'
      });
    }

    if (!messageText) {
      return res.status(400).json({
        ok: false,
        error: 'Missing message_text'
      });
    }

    const result = await sendTextToGroupById(whatsappChatId, messageText);

    return res.json({
      ok: true,
      result
    });
  } catch (err) {
    console.error('POST /send-test failed:', err.message);

    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- BROADCAST ---------------- */

let queue = [];
let isRunning = false;
let isPaused = false;
let currentJob = null;
let lastBroadcastSummary = null;

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

    let sent = false;
    let lastError = null;

    console.log('Processing job:', {
      chatId: job.chatId,
      message: job.message
    });

    for (let attempt = 0; attempt <= job.retries; attempt++) {
      try {
        await sendTextToGroupById(job.chatId, job.message);
        sent = true;
        break;
      } catch (err) {
        lastError = err.message;
        console.error(`Attempt ${attempt + 1} failed for ${job.chatId}:`, err.message);
        await sleep(1200);
      }
    }

    job.status = sent ? 'sent' : 'failed';
    job.error = sent ? null : lastError;
    job.finished_at = new Date().toISOString();

    if (!lastBroadcastSummary) {
      lastBroadcastSummary = {
        total: 0,
        sent: 0,
        failed: 0,
        started_at: new Date().toISOString(),
        finished_at: null
      };
    }

    if (sent) {
      lastBroadcastSummary.sent += 1;
    } else {
      lastBroadcastSummary.failed += 1;
    }

    await sleep(job.delay);
  }

  isRunning = false;
  currentJob = null;

  if (lastBroadcastSummary) {
    lastBroadcastSummary.finished_at = new Date().toISOString();
  }
}

app.post('/broadcast', async (req, res) => {
  try {
    const targets = normalizeTargets(req.body.targets);
    const messageText = normalizeMessage(req.body);
    const delayMs = Number(req.body.delay_ms || 3000);
    const retries = Number(req.body.retries || 2);

    console.log('BROADCAST payload:', {
      targets,
      messageText,
      delayMs,
      retries
    });

    if (!targets.length) {
      return res.status(400).json({
        ok: false,
        error: 'Missing targets'
      });
    }

    if (!messageText) {
      return res.status(400).json({
        ok: false,
        error: 'Missing message_text'
      });
    }

    const uniqueTargets = [...new Set(targets)];

    lastBroadcastSummary = {
      total: uniqueTargets.length,
      sent: 0,
      failed: 0,
      started_at: new Date().toISOString(),
      finished_at: null
    };

    uniqueTargets.forEach((chatId) => {
      queue.push({
        chatId,
        message: messageText,
        delay: delayMs,
        retries,
        status: 'queued',
        error: null,
        created_at: new Date().toISOString(),
        finished_at: null
      });
    });

    processQueue();

    return res.json({
      ok: true,
      queued: uniqueTargets.length
    });
  } catch (err) {
    console.error('POST /broadcast failed:', err.message);

    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- QUEUE STATUS ---------------- */

app.get('/queue-status', (req, res) => {
  res.json({
    ok: true,
    running: isRunning,
    paused: isPaused,
    queue_length: queue.length,
    current: currentJob,
    summary: lastBroadcastSummary
  });
});

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

  if (lastBroadcastSummary && !lastBroadcastSummary.finished_at) {
    lastBroadcastSummary.finished_at = new Date().toISOString();
  }

  res.json({ ok: true });
});

/* ---------------- CONNECTION CONTROL ---------------- */

app.post('/restart', async (req, res) => {
  try {
    await restartClient();

    res.json({
      ok: true,
      message: 'WhatsApp client restarting'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post('/reset-session', async (req, res) => {
  try {
    await resetSession();

    res.json({
      ok: true,
      message: 'WhatsApp session reset'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server listening on port ${PORT}`);
  await initWhatsAppClient();
});
