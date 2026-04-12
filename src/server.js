require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initWhatsAppClient } = require('./services/whatsappClient');

const statusRoute = require('./routes/status');
const groupsRoute = require('./routes/groups');
const broadcastRoute = require('./routes/broadcast');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/status', statusRoute);
app.use('/groups', groupsRoute);
app.use('/broadcast', broadcastRoute);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender'
  });
});

app.get('/qr', async (req, res) => {
  try {
    const { getQrDataUrl } = require('./services/whatsappClient');
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
            <p>אם לא, בצע רענון או אתחול חיבור.</p>
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
          <p>וואטסאפ > מכשירים מקושרים > קישור מכשיר</p>
          <div style="background: white; display: inline-block; padding: 20px; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.12);">
            <img src="${qrDataUrl}" alt="WhatsApp QR" style="max-width: 360px; width: 100%; height: auto;" />
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`
      <html dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>WhatsApp QR Error</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2>שגיאה בטעינת קוד QR</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
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

    const { sendMessageToGroup } = require('./services/whatsappClient');
    const result = await sendMessageToGroup(whatsapp_chat_id, message_text);

    return res.json({
      ok: true,
      result
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post('/restart', async (req, res) => {
  try {
    const { restartClient } = require('./services/whatsappClient');
    await restartClient();

    return res.json({
      ok: true,
      message: 'WhatsApp client restarting'
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post('/reset-session', async (req, res) => {
  try {
    const { resetSession } = require('./services/whatsappClient');
    await resetSession();

    return res.json({
      ok: true,
      message: 'WhatsApp session reset'
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server listening on port ${PORT}`);
  await initWhatsAppClient();
});
