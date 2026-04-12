const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client;
let isReady = false;
let lastQr = null;
let lastQrDataUrl = null;
let lastEventAt = null;
let lastError = null;

const SESSION_PATH = '.wwebjs_auth';

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
    console.error('Failed to build QR:', err.message);
    lastQrDataUrl = null;
  }
}

function initWhatsAppClient() {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', async (qr) => {
    console.log('📱 QR received');
    lastQr = qr;
    isReady = false;
    lastEventAt = nowIso();
    lastError = null;

    await buildQrDataUrl(qr);
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp ready');
    isReady = true;
    lastQr = null;
    lastQrDataUrl = null;
    lastEventAt = nowIso();
    lastError = null;
  });

  client.on('authenticated', () => {
    console.log('🔐 Authenticated');
    lastEventAt = nowIso();
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Auth failure:', msg);
    isReady = false;
    lastError = msg;
    lastEventAt = nowIso();
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️ Disconnected:', reason);
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

  const chats = await Promise.race([
    client.getChats(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 10000)
    )
  ]);

  return chats
    .filter(chat => chat.isGroup)
    .map(chat => ({
      whatsapp_chat_id: chat.id._serialized,
      name: chat.name
    }));
}

async function sendMessageToGroup(chatId, message) {
  if (!client || !isReady) {
    throw new Error('WhatsApp client is not ready');
  }

  return client.sendMessage(chatId, message);
}

async function restartClient() {
  console.log('🔄 Restarting client...');

  try {
    if (client) {
      await client.destroy();
    }
  } catch (e) {}

  isReady = false;
  lastQr = null;
  lastQrDataUrl = null;
  lastError = null;
  lastEventAt = nowIso();

  initWhatsAppClient();
}

async function resetSession() {
  console.log('🧹 Resetting session...');

  try {
    if (client) {
      await client.destroy();
    }
  } catch (e) {}

  try {
    fs.rmSync(path.resolve(SESSION_PATH), { recursive: true, force: true });
  } catch (e) {
    console.log('Session cleanup skipped');
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
  restartClient,
  resetSession
};
