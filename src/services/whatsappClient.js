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
    lastQrDataUrl = await qrcode.toDataURL(qrText);
  } catch (err) {
    lastQrDataUrl = null;
  }
}

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });
}

function bindClientEvents(instance) {
  instance.on('qr', async (qr) => {
    console.log('QR received');
    isReady = false;
    lastEventAt = nowIso();
    await buildQrDataUrl(qr);
  });

  instance.on('ready', () => {
    console.log('WhatsApp ready');
    isReady = true;
    lastQrDataUrl = null;
    lastEventAt = nowIso();
  });

  instance.on('authenticated', () => {
    console.log('Authenticated');
    lastEventAt = nowIso();
  });

  instance.on('auth_failure', (msg) => {
    console.error('Auth failure:', msg);
    lastError = msg;
    isReady = false;
  });

  instance.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    isReady = false;
  });
}

async function initWhatsAppClient() {
  if (client) return client;

  client = createClient();
  bindClientEvents(client);

  try {
    await client.initialize();
  } catch (err) {
    console.error('INIT FAILED:', err.message);
    lastError = err.message;
    client = null;
    throw err;
  }

  return client;
}

function getSenderStatus() {
  let state = 'disconnected';

  if (isReady) state = 'ready';
  else if (lastQrDataUrl) state = 'qr_required';
  else if (isRestarting) state = 'initializing';

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
  if (!client) await initWhatsAppClient();

  if (!client || !isReady) {
    throw new Error('WhatsApp not ready');
  }

  return client;
}

async function getWhatsAppGroups() {
  const c = await ensureReadyClient();
  const chats = await c.getChats();

  return chats
    .filter(c => c.isGroup)
    .map(c => ({
      whatsapp_chat_id: c.id._serialized,
      name: c.name || ''
    }));
}

async function sendTextToGroupById(chatId, text) {
  const c = await ensureReadyClient();

  const chat = await c.getChatById(chatId);
  const result = await chat.sendMessage(text);

  return {
    whatsapp_chat_id: chatId,
    message_id: result?.id?._serialized || null
  };
}

async function restartClient() {
  isRestarting = true;

  try {
    if (client) await client.destroy();
  } catch {}

  client = null;
  isReady = false;
  lastQrDataUrl = null;

  await initWhatsAppClient();

  isRestarting = false;
}

async function resetSession() {
  try {
    if (client) await client.destroy();
  } catch {}

  client = null;

  try {
    fs.rmSync(path.resolve(SESSION_PATH), {
      recursive: true,
      force: true
    });
  } catch {}

  isReady = false;
  lastQrDataUrl = null;

  await initWhatsAppClient();
}

module.exports = {
  initWhatsAppClient,
  getSenderStatus,
  getQrDataUrl,
  getWhatsAppGroups,
  sendTextToGroupById,
  restartClient,
  resetSession
};
