const express = require('express');
const env = require('../config/env');
const { validateBroadcastPayload } = require('../utils/helpers');
const { getSenderState, getClient } = require('../services/whatsappClient');
const { processBroadcast } = require('../services/broadcastProcessor');

const router = express.Router();

function ensureSecret(req, res, next) {
  if (req.headers['x-admin-secret'] !== env.adminSharedSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

router.post('/send-test', ensureSecret, async (req, res) => {
  const sender = getSenderState();
  if (!sender.is_ready) return res.status(409).json({ ok: false, error: 'Sender not ready' });
  if (!env.enableSending) return res.status(403).json({ ok: false, error: 'Sending is disabled' });

  const { whatsapp_chat_id, message_text } = req.body || {};
  if (!whatsapp_chat_id || !message_text) {
    return res.status(400).json({ ok: false, error: 'whatsapp_chat_id and message_text are required' });
  }

  try {
    const chat = await getClient().getChatById(whatsapp_chat_id);
    const message = await chat.sendMessage(message_text);
    return res.json({ ok: true, status: 'sent', message_id: message?.id?._serialized || null });
  } catch (err) {
    return res.status(500).json({ ok: false, status: 'failed', error: err.message });
  }
});

router.post('/', ensureSecret, async (req, res) => {
  const error = validateBroadcastPayload(req.body, env);
  if (error) return res.status(400).json({ ok: false, error });

  const sender = getSenderState();
  if (!sender.is_ready) return res.status(409).json({ ok: false, error: 'Sender not ready', state: sender.state });
  if (!env.enableSending) return res.status(403).json({ ok: false, error: 'Sending is disabled' });

  const payload = req.body;
  setImmediate(() => {
    processBroadcast(payload, req.log || console).catch(err => {
      (req.log || console).error({ err: err.message, broadcast_id: payload.broadcast_id }, 'Broadcast processor crashed');
    });
  });

  return res.json({
    ok: true,
    accepted: true,
    broadcast_id: payload.broadcast_id,
    target_count: payload.targets.length
  });
});

module.exports = router;
