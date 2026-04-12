const express = require('express');
const router = express.Router();

const { sendMessageToGroup } = require('../services/whatsappClient');

let queue = [];
let isRunning = false;
let isPaused = false;
let currentJob = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    for (let attempt = 0; attempt <= job.retries; attempt++) {
      try {
        await sendMessageToGroup(job.chatId, job.message);
        success = true;
        break;
      } catch (err) {
        console.log(`Retry ${attempt + 1} failed for ${job.chatId}: ${err.message}`);
        await sleep(1000);
      }
    }

    if (!success) {
      console.log(`Failed permanently for ${job.chatId}`);
    }

    await sleep(job.delay);
  }

  isRunning = false;
  currentJob = null;
}

router.post('/', (req, res) => {
  try {
    const { message_text, targets, delay_ms = 3000, retries = 2 } = req.body;

    if (!message_text || !Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'message_text and targets are required'
      });
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

    return res.json({
      ok: true,
      queued: targets.length
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

    clusters.forEach(cluster => {
      const targets = Array.isArray(cluster.targets) ? cluster.targets : [];
      const message = cluster.message_text || '';

      targets.forEach(target => {
        queue.push({
          chatId: target,
          message,
          delay: delay_ms,
          retries
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
    current: currentJob
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
  res.json({ ok: true });
});

module.exports = router;
