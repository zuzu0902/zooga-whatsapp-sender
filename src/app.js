const express = require('express');
const cors = require('cors');

const {
  getQrDataUrl,
  getSenderStatus,
  getWhatsAppGroups,
  sendMessageToGroup,
  restartClient,
  resetSession
} = require('./services/whatsappClient');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'zooga-whatsapp-sender' });
});

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    service: 'zooga-whatsapp-sender',
    ...getSenderStatus()
  });
});

app.get('/qr', (req, res) => {
  const qr = getQrDataUrl();

  if (!qr) {
    return res.status(404).send('No QR available');
  }

  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h2>Scan QR</h2>
        <img src="${qr}" style="width:300px;" />
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

    const result = await sendMessageToGroup(
      whatsapp_chat_id,
      message_text
    );

    res.json({ ok: true, result });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post('/restart', async (req, res) => {
  await restartClient();
  res.json({ ok: true });
});

app.post('/reset-session', async (req, res) => {
  await resetSession();
  res.json({ ok: true });
});

module.exports = app;
