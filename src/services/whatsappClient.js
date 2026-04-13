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
  lastQrDataUrl = await qrcode.toDataURL(qrText);
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
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });
}

function bindEvents(c) {
  c.on('qr', async (qr) => {
    console.log('QR received');
    isReady = false;
    lastEventAt = nowIso();
    await buildQrDataUrl(qr);
  });

  c.on('ready', () => {
    console.log('READY');
    isReady = true;
    lastQrDataUrl = null;
    lastEventAt = nowIso();
  });

  c.on('authenticated', () => {
    console.log('AUTH OK');
    lastEventAt = nowIso();
  });

  c.on('auth_failure', (msg) => {
    console.error('AUTH FAIL', msg);
    lastError = msg;
    isReady = false;
  });

  c.on('disconnected', (reason) => {
    console.log('DISCONNECTED', reason);
    isReady = false;
  });
}

async function initWhatsAppClient() {
  if (client) return client;

  client = createClient();
  bindEvents(client);

  try {
    await client.initialize();
  } catch (err) {
    console.error('INIT ERROR', err.message);
    client = null;
    throw err;
  }

  return client;
}

function getSenderStatus() {
  return {
    ok: true,
    state: isReady ? 'ready' : lastQrDataUrl ? 'qr_required' : 'initializing',
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

async function ensureClient() {
  if (!client) await initWhatsAppClient();

  if (!client) {
    throw new Error('Client not initialized');
  }

  return client;
}

async function waitUntilReady(timeoutMs = 15000) {
  const start = Date.now();

  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('WhatsApp not ready after timeout');
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

async function getWhatsAppGroups() {
  const c = await ensureClient();
  await waitUntilReady();

  const chats = await c.getChats();

  return chats
    .filter(c => c.isGroup)
    .map(c => ({
      whatsapp_chat_id: c.id._serialized,
      name: c.name || ''
    }));
}

async function sendTextToGroupById(chatId, text) {
  const c = await ensureClient();
  await waitUntilReady();

  console.log('SENDING TO:', chatId);

  const chat = await c.getChatById(chatId);

  const result = await chat.sendMessage(text);

  console.log('SENT OK');

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
