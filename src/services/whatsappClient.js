const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client = null;
let initPromise = null;
let restartPromise = null;

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

function isRecoverableBrowserError(err) {
  const msg = String(err?.message || err || '').toLowerCase();

  return (
    msg.includes('target closed') ||
    msg.includes('detached frame') ||
    msg.includes('execution context was destroyed') ||
    msg.includes('session closed') ||
    msg.includes('protocol error') ||
    msg.includes('most likely the page has been closed')
  );
}

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=site-per-process,Translate,BackForwardCache',
        '--disable-extensions'
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

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const newClient = createClient();
    bindClientEvents(newClient);

    try {
      await newClient.initialize();
      client = newClient;
      return client;
    } catch (err) {
      console.error('INIT ERROR:', err.message);
      setError(err);
      client = null;
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
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

async function waitUntilReady(timeoutMs = 25000) {
  const start = Date.now();

  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('WhatsApp not ready after timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function hardRestartClient() {
  if (restartPromise) {
    return restartPromise;
  }

  restartPromise = (async () => {
    isRestarting = true;

    try {
      if (client) {
        try {
          await client.destroy();
        } catch (err) {
          console.log('Destroy error ignored:', err.message);
        }
      }

      client = null;
      isReady = false;
      lastQrDataUrl = null;
      lastEventAt = nowIso();

      await initWhatsAppClient();
    } finally {
      isRestarting = false;
      restartPromise = null;
    }
  })();

  return restartPromise;
}

async function withRecovery(workFn, label) {
  try {
    return await workFn();
  } catch (err) {
    console.error(`${label} failed:`, err.message);
    setError(err);

    if (!isRecoverableBrowserError(err)) {
      throw err;
    }

    console.log(`Recoverable browser error detected in ${label}. Restarting client...`);
    await hardRestartClient();
    await waitUntilReady();

    return await workFn();
  }
}

async function getWhatsAppGroups() {
  return withRecovery(async () => {
    const currentClient = await ensureClient();
    await waitUntilReady();

    const chats = await Promise.race([
      currentClient.getChats(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getChats timeout')), 20000)
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
  }, 'getWhatsAppGroups');
}

async function sendTextToGroupById(chatId, messageText) {
  return withRecovery(async () => {
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

    const chat = await Promise.race([
      currentClient.getChatById(chatId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getChatById timeout')), 20000)
      )
    ]);

    if (!chat) {
      throw new Error(`Target group not found: ${chatId}`);
    }

    console.log('Target group found:', chat.name || '(no name)');

    const result = await Promise.race([
      chat.sendMessage(cleanMessage),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('sendMessage timeout')), 25000)
      )
    ]);

    console.log('--- SEND SUCCESS ---');

    return {
      whatsapp_chat_id: chatId,
      message_id: result?.id?._serialized || null,
      status: 'sent'
    };
  }, `sendTextToGroupById(${chatId})`);
}

async function restartClient() {
  await hardRestartClient();
}

async function resetSession() {
  isRestarting = true;

  try {
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        console.log('Destroy error ignored:', err.message);
      }
    }

    client = null;

    try {
      fs.rmSync(path.resolve(SESSION_PATH), {
        recursive: true,
        force: true
      });
    } catch (err) {
      console.log('Session cleanup skipped:', err.message);
    }

    isReady = false;
    lastQrDataUrl = null;
    lastError = null;
    lastEventAt = nowIso();

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
