const express = require('express');
const { getQrDataUrl, getSenderStatus } = require('./services/whatsappClient');

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
          <p>אם לא, חכה כמה שניות אחרי העלייה של השרת או בצע redeploy.</p>
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

module.exports = app;
