const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');

let client = null;
let senderState = 'initializing';
let lastEventAt = new Date().toISOString();
let lastError = null;
let lastQrDataUrl = null;

function nowIso() {
  return new Date().toISOString();
}

async function buildQrImage(qrString) {
  try {
    lastQrDataUrl = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8
    });
  } catch (err) {
    console.error('Failed to generate QR image:', err.message);
    lastQrDataUrl = null;
  }
}

function initWhatsAppClient() {
  if (client) {
    return client;
  }

  senderState = 'initializing';
  lastEventAt = nowIso();
  lastError = null;

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: process.env.CLIENT_ID || 'zooga-broadcaster',
      dataPath: process.env.SESSION_PATH || '.wwebjs_auth'
    }),
    puppeteer: {
      headless: process.env.ENABLE_HEADLESS !== 'false',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', async (qr) => {
    senderState = 'qr_required';
    lastEventAt = nowIso();
    lastError = null;

    qrcodeTerminal.generate(qr, { small: true });
    await buildQrImage(qr);

    console.log('QR generated. Open /qr in browser to scan.');
  });

  client.on('authenticated', () => {
    senderState = 'authenticated';
    lastEventAt = nowIso();
    lastError = null;
    console.log('WhatsApp authenticated');
  });

  client.on('ready', () => {
    senderState = 'ready';
    lastEventAt = nowIso();
    lastError = null;
    lastQrDataUrl = null;
    console.log('WhatsApp client is ready');
  });

  client.on('auth_failure', (msg) => {
    senderState = 'error';
    lastEventAt = nowIso();
    lastError = `auth_failure: ${msg}`;
    console.error('WhatsApp auth failure:', msg);
  });

  client.on('disconnected', (reason) => {
    senderState = 'disconnected';
    lastEventAt = nowIso();
    lastError = `disconnected: ${reason}`;
    console.error('WhatsApp disconnected:', reason);
  });

  client.initialize().catch((err) => {
    senderState = 'error';
    lastEventAt = nowIso();
    lastError = err.message;
    console.error('Failed to initialize WhatsApp client:', err);
  });

  return client;
}

function getSenderStatus() {
  return {
    state: senderState,
    is_ready: senderState === 'ready',
    last_event_at: lastEventAt,
    last_error: lastError,
    qr_available: !!lastQrDataUrl
  };
}

function getQrDataUrl() {
  return lastQrDataUrl;
}

module.exports = {
  initWhatsAppClient,
  getSenderStatus,
  getQrDataUrl
};
