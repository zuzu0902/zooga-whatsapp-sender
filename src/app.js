const express = require('express');
const {
  getQrDataUrl,
  getSenderStatus,
  getWhatsAppGroups,
  sendMessageToGroup
} = require('./services/whatsappClient');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'zooga-whatsapp-sender' });
});

app.get('/status', (req, res) => {
  const status = getSenderStatus();
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender',
    ...status
  });
});

app.get('/qr', (req, res) => {
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
        <p>WhatsApp → מכשירים מקושרים → קישור מכשיר</p>
        <div style="background: white; display: inline-block; padding: 20px; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.12);">
          <img src="${qrDataUrl}" alt="WhatsApp QR" style="max-width: 360px; width: 100%; height: auto;" />
        </div>
      </body>
    </html>
  `);
});

app.get('/groups', async (req, res) => {
  try {
    const groups = await getWhatsAppGroups();
    res.json({
      ok: true,
      count: groups.length,
      groups
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post('/send-test', async (req, res) => {
  try {
    const { whatsapp_chat_id, message_text } = req.body;

    if (!whatsapp_chat_id || !message_text) {
      return res.status(400).json({
        ok: false,
        error: 'whatsapp_chat_id and message_text are required'
      });
    }

    const result = await sendMessageToGroup(whatsapp_chat_id, message_text);

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = app;
