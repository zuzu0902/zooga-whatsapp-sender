const express = require('express');
const router = express.Router();

const { getWhatsAppGroups } = require('../services/whatsappClient');

router.get('/', async (req, res) => {
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

module.exports = router;
