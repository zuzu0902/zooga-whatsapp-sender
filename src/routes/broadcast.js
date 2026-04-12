const express = require('express');
const router = express.Router();

const { getClient } = require('../services/whatsappClient');

router.post('/broadcast', async (req, res) => {
  try {
    const { chat_ids, message } = req.body;

    if (!chat_ids || !Array.isArray(chat_ids) || chat_ids.length === 0) {
      return res.json({
        ok: false,
        error: 'chat_ids array is required'
      });
    }

    if (!message || message.trim() === '') {
      return res.json({
        ok: false,
        error: 'message is required'
      });
    }

    const client = getClient();

    if (!client) {
      return res.json({
        ok: false,
        error: 'WhatsApp client not ready'
      });
    }

    const results = [];

    for (const chatId of chat_ids) {
      try {
        await client.sendMessage(chatId, message);

        results.push({
          chat_id: chatId,
          success: true
        });

        // delay קטן כדי לא להיחסם
        await new Promise(r => setTimeout(r, 800));

      } catch (err) {
        results.push({
          chat_id: chatId,
          success: false,
          error: err.message
        });
      }
    }

    return res.json({
      ok: true,
      count: results.length,
      results
    });

  } catch (err) {
    return res.json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
