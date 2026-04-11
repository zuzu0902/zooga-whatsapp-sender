const express = require('express');
const env = require('../config/env');
const { getSenderState } = require('../services/whatsappClient');

const router = express.Router();

router.get('/', (_req, res) => {
  const sender = getSenderState();
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender',
    ...sender,
    settings: {
      default_delay_seconds: env.defaultDelaySeconds,
      min_delay_seconds: env.minDelaySeconds,
      max_delay_seconds: env.maxDelaySeconds,
      batch_size: env.batchSize,
      pause_between_batches_seconds: env.pauseBetweenBatchesSeconds,
      max_groups_per_broadcast: env.maxGroupsPerBroadcast,
      enable_sending: env.enableSending
    }
  });
});

module.exports = router;
