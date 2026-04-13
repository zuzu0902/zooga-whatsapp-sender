const express = require('express');
const router = express.Router();

const { sendTextToGroupById } = require('../services/whatsappClient');

let queue = [];
let isRunning = false;
let isPaused = false;
let currentJob = null;
let lastSummary = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    let lastError = null;

    console.log('Processing queue job:', {
      chatId: job.chatId,
      messageLength: job.message.length
    });

    for (let attempt = 0; attempt <= job.retries; attempt++) {
      try {
        await sendTextToGroupById(job.chatId, job.message);
        success = true;
        break;
      } catch (err) {
        lastError = err.message;
        console.log(`Retry ${attempt + 1} failed for ${job.chatId}: ${err.message}`);
        await sleep(1500);
      }
    }

    if (!lastSummary) {
      lastSummary = {
        total: 0,
        sent: 0,
        failed: 0,
        started_at: new Date().toISOString(),
        finished_at: null
      };
    }

    if (success) {
      lastSummary.sent += 1;
    } else {
      lastSummary.failed += 1;
      console.log(`Failed permanently for ${job.chatId}: ${lastError}`);
    }

    await sleep(job.delay);
  }

  isRunning = false;
  currentJob = null;

  if (lastSummary) {
    lastSummary.finished_at = new Date().toISOString();
  }
}

router.post('/', (req, res) => {
  try {
    const targets = normalizeTargets(req.body.targets);
    const messageText = normalizeMessage(req.body);
    const delayMs = Number(req.body.delay_ms || 3000);
    const retries = Number(req.body.retries || 2);

    if (!messageText || targets.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'message_text and targets are required'
      });
    }

    const uniqueTargets = [...new Set(targets)];

    lastSummary = {
      total: uniqueTargets.length,
      sent: 0,
      failed: 0,
      started_at: new Date().toISOString(),
      finished_at: null
    };

    uniqueTargets.forEach(target => {
      queue.push({
        chatId: target,
        message: messageText,
        delay: delayMs,
        retries
      });
    });

    processQueue();

    return res.json({
      ok: true,
      queued: uniqueTargets.length
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/clusters', (req, res) => {
  try {
    const { clusters, delay_ms = 3000, retries = 2 } = req.body;

    if (!Array.isArray(clusters) || clusters.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'clusters are required'
      });
    }

    let queued = 0;
    let totalTargets = 0;

    clusters.forEach(cluster => {
      const targets = normalizeTargets(cluster.targets || []);
      totalTargets += targets.length;
    });

    lastSummary = {
      total: totalTargets,
      sent: 0,
      failed: 0,
      started_at: new Date().toISOString(),
      finished_at: null
    };

    clusters.forEach(cluster => {
      const targets = normalizeTargets(cluster.targets || []);
      const message = normalizeMessage(cluster);

      if (!message) return;

      targets.forEach(target => {
        queue.push({
          chatId: target,
          message,
          delay: Number(delay_ms),
          retries: Number(retries)
        });
        queued += 1;
      });
    });

    processQueue();

    return res.json({
      ok: true,
      queued
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/status', (req, res) => {
  res.json({
    ok: true,
    running: isRunning,
    paused: isPaused,
    queue_length: queue.length,
    current: currentJob,
    summary: lastSummary
  });
});

router.post('/pause', (req, res) => {
  isPaused = true;
  res.json({ ok: true });
});

router.post('/resume', (req, res) => {
  isPaused = false;
  processQueue();
  res.json({ ok: true });
});

router.post('/stop', (req, res) => {
  queue = [];
  isRunning = false;
  isPaused = false;
  currentJob = null;

  if (lastSummary && !lastSummary.finished_at) {
    lastSummary.finished_at = new Date().toISOString();
  }

  res.json({ ok: true });
});

module.exports = router;
