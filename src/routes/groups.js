const express = require('express');
const { getClient, getSenderState } = require('../services/whatsappClient');
const env = require('../config/env');

const router = express.Router();

router.get('/', async (req, res) => {
  if (req.headers['x-admin-secret'] !== env.adminSharedSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const sender = getSenderState();
  if (!sender.is_ready) {
    return res.status(409).json({ ok: false, error: 'Sender not ready', state: sender.state });
  }

  try {
    const chats = await getClient().getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({ whatsapp_chat_id: chat.id._serialized, name: chat.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));

    return res.json({ ok: true, count: groups.length, groups });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
