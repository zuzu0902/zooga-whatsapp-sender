const express = require('express');
const router = express.Router();

const { getSenderStatus } = require('../services/whatsappClient');

router.get('/', (req, res) => {
  try {
    const status = getSenderStatus();

    res.json({
      ok: true,
      ...status
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
