const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client = null;
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

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
}

function bindClientEvents(instance) {
  instance.on('qr', async (qr) => {
    console.log('QR received');
    isReady = false;
    lastEventAt = nowIso();
    lastError = null;
    await buildQrDataUrl(qr);
  });

  instance.on('ready', () => {
    console.log('WhatsApp ready');
    isReady = true;
    lastQrDataUrl = null;
    lastEventAt = nowIso();
    lastError = null;
  });

  instance.on('authenticated', () => {
    console.log('WhatsApp authenticated');
    lastEventAt = nowIso();
    lastError = null;
  });

  instance.on('auth_failure', (msg) => {
    console.error('Auth failure:', msg);
    isReady = false;
    lastError = msg;
    lastEventAt = nowIso();
  });

  instance.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    isReady = false;
    lastEventAt = nowIso();
  });
}

async function initWhatsAppClient() {
  if (client) {
    return client;
  }

  client = createClient();
  bindClientEvents(client);
  await client.initialize();

  return client;
}

function getSenderStatus() {
  let state = 'disconnected';

  if (isReady) {
    state = 'ready';
  } else if (lastQrDataUrl) {
    state = 'qr_required';
  } else if (isRestarting) {
    state = 'initializing';
  }

  return {
    ok: true,
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

async function ensureReadyClient() {
  if (!client) {
    await initWhatsAppClient();
  }

  if (!client || !isReady) {
    throw new Error('WhatsApp client is not ready');
  }

  return client;
}

async function restartClientInternal() {
  try {
    if (client) {
      await client.destroy();
    }
  } catch (err) {
    console.log('Destroy error ignored');
  }

  client = null;
  isReady = false;
  lastQrDataUrl = null;
  lastError = null;
  lastEventAt = nowIso();

  await initWhatsAppClient();
}

async function getWhatsAppGroups() {
  const currentClient = await ensureReadyClient();

  try {
    const chats = await Promise.race([
      currentClient.getChats(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      )
    ]);

    return chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        whatsapp_chat_id: chat.id._serialized,
        name: chat.name || ''
      }));
  } catch (err) {
    console.error('getWhatsAppGroups failed:', err.message);
    lastError = err.message;
    lastEventAt = nowIso();
    isReady = false;

    if (!isRestarting) {
      isRestarting = true;
      setTimeout(async () => {
        try {
          await restartClientInternal();
        } finally {
          isRestarting = false;
        }
      }, 1000);
    }

    throw new Error('WhatsApp client was stuck — restarting automatically.');
  }
}

async function sendMessageToGroup(chatId, message) {
  const currentClient = await ensureReadyClient();

  try {
    const messageResult = await currentClient.sendMessage(chatId, message);

    return {
      whatsapp_chat_id: chatId,
      message_id: messageResult?.id?._serialized || null,
      status: 'sent'
    };
  } catch (err) {
    lastError = err.message;
    lastEventAt = nowIso();
    throw err;
  }
}

async function restartClient() {
  isRestarting = true;
  try {
    await restartClientInternal();
  } finally {
    isRestarting = false;
  }
}

async function resetSession() {
  isRestarting = true;

  try {
    if (client) {
      await client.destroy();
    }
  } catch (err) {
    console.log('Destroy error ignored');
  }

  client = null;

  try {
    fs.rmSync(path.resolve(SESSION_PATH), { recursive: true, force: true });
  } catch (err) {
    console.log('Session cleanup skipped');
  }

  isReady = false;
  lastQrDataUrl = null;
  lastError = null;
  lastEventAt = nowIso();

  try {
    await initWhatsAppClient();
  } finally {
    isRestarting = false;
  }
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
