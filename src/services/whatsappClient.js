const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client;
let isReady = false;
let lastQrDataUrl = null;
let lastEventAt = null;
let lastError = null;
let isRestarting = false;

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
    isReady = false;
    lastEventAt = nowIso();
    lastError = null;

    await buildQrDataUrl(qr);
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp ready');
    isReady = true;
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
    qr_available: !!lastQrDataUrl,
    restarting: isRestarting
  };
}

function getQrDataUrl() {
  return lastQrDataUrl;
}

async function restartClientInternal() {
  console.log('🔄 AUTO restarting client...');

  try {
    if (client) {
      await client.destroy();
    }
  } catch (e) {}

  isReady = false;
  lastQrDataUrl = null;
  lastError = null;
  lastEventAt = nowIso();

  initWhatsAppClient();
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
      .filter(chat => chat.isGroup)
      .map(chat => ({
        whatsapp_chat_id: chat.id._serialized,
        name: chat.name
      }));

  } catch (err) {
    console.error('⚠️ getWhatsAppGroups failed:', err.message);

    lastError = err.message;
    lastEventAt = nowIso();
    isReady = false;

    // 🔥 SELF HEALING
    if (!isRestarting) {
      isRestarting = true;

      setTimeout(async () => {
        await restartClientInternal();
        isRestarting = false;
      }, 1000);
    }

    throw new Error('WhatsApp client was stuck — restarting automatically.');
  }
}

async function sendMessageToGroup(chatId, message) {
  if (!client || !isReady) {
    throw new Error('WhatsApp client is not ready');
  }

  return client.sendMessage(chatId, message);
}

async function restartClient() {
  console.log('🔄 Manual restart');

  isRestarting = true;
  await restartClientInternal();
  isRestarting = false;
}

async function resetSession() {
  console.log('🧹 Reset session');

  try {
    if (client) {
      await client.destroy();
    }
  } catch (e) {}

  try {
    fs.rmSync(path.resolve(SESSION_PATH), { recursive: true, force: true });
  } catch (e) {}

  isReady = false;
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
