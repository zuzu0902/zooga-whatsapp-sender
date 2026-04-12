const express = require('express');
const { getQrDataUrl, getSenderStatus } = require('./services/whatsappClient');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/status', (req, res) => {
  const status = getSenderStatus();
  res.json({ ok: true, ...status });
});

app.get('/qr', (req, res) => {
  const qrDataUrl = getQrDataUrl();

  if (!qrDataUrl) {
    return res.status(404).send(`
      <html dir="rtl">
        <body style="font-family:Arial;padding:40px;text-align:center">
          <h2>כרגע אין QR זמין</h2>
          <p>אם הוואטסאפ כבר מחובר, זה תקין.</p>
          <p>אם לא, בצע restart לשירות וחזור לכאן.</p>
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
      <body style="font-family:Arial;padding:40px;text-align:center;background:#f7f7f7">
        <h2>סרוק את הקוד עם וואטסאפ</h2>
        <p>WhatsApp → מכשירים מקושרים → קישור מכשיר</p>
        <div style="background:white;display:inline-block;padding:20px;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
          <img src="${qrDataUrl}" alt="WhatsApp QR" style="max-width:360px;width:100%;height:auto" />
        </div>
        <p style="margin-top:20px;color:#666">אם הקוד לא עובד, רענן את השירות כדי לקבל QR חדש.</p>
      </body>
    </html>
  `);
});

module.exports = app;
