const express = require('express');
const { getSenderState } = require('../services/whatsappClient');

const router = express.Router();
const startTime = Date.now();

router.get('/', (_req, res) => {
  const sender = getSenderState();
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender',
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    state: sender.state
  });
});

module.exports = router;
