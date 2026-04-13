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

function setError(err) {
  lastError = err ? String(err.message || err) : null;
  lastEventAt = nowIso();
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
    setError(err);
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
    setError(msg);
  });

  instance.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    isReady = false;
    setError(reason);
  });

  instance.on('change_state', (state) => {
    console.log('Client state changed:', state);
    lastEventAt = nowIso();
  });
}

async function initWhatsAppClient() {
  if (client) {
    return client;
  }

  client = createClient();
  bindClientEvents(client);

  try {
    await client.initialize();
  } catch (err) {
    console.error('INIT ERROR:', err.message);
    setError(err);
    client = null;
    throw err;
  }

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

async function ensureClient() {
  if (!client) {
    await initWhatsAppClient();
  }

  if (!client) {
    throw new Error('WhatsApp client is not initialized');
  }

  return client;
}

async function waitUntilReady(timeoutMs = 20000) {
  const start = Date.now();

  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('WhatsApp not ready after timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function getWhatsAppGroups() {
  const currentClient = await ensureClient();
  await waitUntilReady();

  try {
    const chats = await Promise.race([
      currentClient.getChats(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getChats timeout')), 15000)
      )
    ]);

    const groups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        whatsapp_chat_id: chat.id._serialized,
        name: chat.name || ''
      }));

    console.log('Groups fetched:', groups.length);
    return groups;
  } catch (err) {
    console.error('getWhatsAppGroups failed:', err.message);
    setError(err);
    throw err;
  }
}

async function sendTextToGroupById(chatId, messageText) {
  const currentClient = await ensureClient();
  await waitUntilReady();

  if (!chatId || !String(chatId).includes('@g.us')) {
    throw new Error(`Invalid group id: ${chatId}`);
  }

  if (!messageText || !String(messageText).trim()) {
    throw new Error('Empty message text');
  }

  const cleanMessage = String(messageText).trim();

  console.log('--- SEND START ---');
  console.log('Target group id:', chatId);
  console.log('Message length:', cleanMessage.length);

  try {
    const chats = await Promise.race([
      currentClient.getChats(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getChats before send timeout')), 15000)
      )
    ]);

    const targetChat = chats.find((chat) => chat.id && chat.id._serialized === chatId);

    if (!targetChat) {
      throw new Error(`Target group not found in current chats: ${chatId}`);
    }

    console.log('Target group found:', targetChat.name || '(no name)');

    let result = null;

    try {
      result = await Promise.race([
        currentClient.sendMessage(chatId, cleanMessage),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('client.sendMessage timeout')), 20000)
        )
      ]);
      console.log('Send method used: client.sendMessage');
    } catch (firstErr) {
      console.log('client.sendMessage failed, trying chat.sendMessage:', firstErr.message);

      result = await Promise.race([
        targetChat.sendMessage(cleanMessage),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('chat.sendMessage timeout')), 20000)
        )
      ]);

      console.log('Send method used: chat.sendMessage');
    }

    console.log('--- SEND SUCCESS ---');

    return {
      whatsapp_chat_id: chatId,
      message_id: result?.id?._serialized || null,
      status: 'sent'
    };
  } catch (err) {
    console.error('--- SEND FAILED ---');
    console.error('Target:', chatId);
    console.error('Reason:', err.message);
    setError(err);
    throw err;
  }
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
    fs.rmSync(path.resolve(SESSION_PATH), {
      recursive: true,
      force: true
    });
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
  sendTextToGroupById,
  restartClient,
  resetSession
};
