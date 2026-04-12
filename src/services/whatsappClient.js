const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client;
let isReady = false;
let lastQr = null;
let lastQrDataUrl = null;
let lastEventAt = null;
let lastError = null;

function nowIso() {
  return new Date().toISOString();
}

async function buildQrDataUrl(qrText) {
  try {
    lastQrDataUrl = await qrcode.toDataURL(qrText, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8
    });
  } catch (err) {
    console.error('Failed to build QR image:', err.message);
    lastQrDataUrl = null;
  }
}

function initWhatsAppClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', async (qr) => {
    console.log('QR received');
    lastQr = qr;
    isReady = false;
    lastEventAt = nowIso();
    lastError = null;

    await buildQrDataUrl(qr);
  });

  client.on('ready', () => {
    console.log('WhatsApp ready');
    isReady = true;
    lastQr = null;
    lastQrDataUrl = null;
    lastEventAt = nowIso();
    lastError = null;
  });

  client.on('authenticated', () => {
    console.log('Authenticated');
    lastEventAt = nowIso();
    lastError = null;
  });

  client.on('auth_failure', (msg) => {
    console.error('Auth failure:', msg);
    isReady = false;
    lastError = msg;
    lastEventAt = nowIso();
  });

  client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    isReady = false;
    lastEventAt = nowIso();
  });

  client.initialize();
}

function getSenderStatus() {
  let state = 'disconnected';

  if (isReady) {
    state = 'ready';
  } else if (lastQrDataUrl) {
    state = 'qr_required';
  }

  return {
    state,
    is_ready: isReady,
    last_event_at: lastEventAt,
    last_error: lastError,
    qr_available: !!lastQrDataUrl
  };
}

function getQrDataUrl() {
  return lastQrDataUrl;
}

async function getWhatsAppGroups() {
  if (!client || !isReady) {
    throw new Error('WhatsApp client is not ready');
  }

  try {
    const chats = await Promise.race([
      client.getChats(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      )
    ]);

    return chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        whatsapp_chat_id: chat.id._serialized,
        name: chat.name
      }));
  } catch (err) {
    console.error('getWhatsAppGroups failed:', err.message);
    isReady = false;
    lastError = err.message;
    lastEventAt = nowIso();
    throw new Error('WhatsApp client is stuck. Requires reinitialization.');
  }
}

async function sendMessageToGroup(chatId, message) {
  if (!client || !isReady) {
    throw new Error('WhatsApp client is not ready');
  }

  return client.sendMessage(chatId, message);
}

async function restartClient() {
  try {
    console.log('Restarting WhatsApp client...');
    if (client) {
      await client.destroy();
    }
  } catch (err) {
    console.log('Destroy error ignored');
  }

  isReady = false;
  lastQr = null;
  lastQrDataUrl = null;
  lastError = null;
  lastEventAt = nowIso();

  initWhatsAppClient();
}

module.exports = {
  initWhatsAppClient,
  getSenderStatus,
  getQrDataUrl,
  getWhatsAppGroups,
  sendMessageToGroup,
  restartClient
};
