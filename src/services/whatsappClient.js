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

const READY_TIMEOUT_MS = 45000;
const SEND_TIMEOUT_MS = 90000;

function nowIso() {
  return new Date().toISOString();
}

function setError(err) {
  lastError = err ? String(err.message || err) : null;
  lastEventAt = nowIso();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

async function buildQrDataUrl(qrText) {
  try {
    lastQrDataUrl = await qrcode.toDataURL(qrText, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8
    });
  } catch (err) {
    console.error('QR build failed:', err.message);
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
    msg.includes('protocol error')
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
        '--disable-gpu',
        '--no-zygote',
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
    console.log('Authenticated');
    lastEventAt = nowIso();
  });

  instance.on('auth_failure', (msg) => {
    console.log('Auth failure:', msg);
    isReady = false;
    setError(msg);
  });

  instance.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    isReady = false;
    setError(reason);
  });
}

async function initWhatsAppClient() {
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const c = createClient();
    bindClientEvents(c);

    try {
      await c.initialize();
      client = c;
      return client;
    } catch (err) {
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

async function ensureClient() {
  if (!client) {
    await initWhatsAppClient();
  }
  return client;
}

async function waitUntilReady(timeoutMs = READY_TIMEOUT_MS) {
  const start = Date.now();

  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('WhatsApp not ready');
    }
    await sleep(500);
  }
}

async function hardRestartClient() {
  if (restartPromise) return restartPromise;

  restartPromise = (async () => {
    isRestarting = true;

    try {
      if (client) {
        await client.destroy().catch(() => {});
      }

      client = null;
      isReady = false;
      lastQrDataUrl = null;

      await initWhatsAppClient();
    } finally {
      isRestarting = false;
      restartPromise = null;
    }
  })();

  return restartPromise;
}

async function withRecovery(workFn) {
  try {
    return await workFn();
  } catch (err) {
    setError(err);

    if (!isRecoverableBrowserError(err)) {
      throw err;
    }

    console.log('Recoverable error → restarting WhatsApp');

    await hardRestartClient();
    await waitUntilReady();

    return await workFn();
  }
}

/* ===================== */
/* ====== SEND ========= */
/* ===================== */

async function sendTextToGroupById(chatId, messageText) {
  return withRecovery(async () => {
    const c = await ensureClient();
    await waitUntilReady();

    if (!chatId.includes('@g.us')) {
      throw new Error('Invalid group id');
    }

    const text = String(messageText).trim();

    console.log('--- SEND START ---', chatId);

    // 🔥 קריטי — warmup
    try {
      await withTimeout(c.getState(), 15000, 'warmup');
    } catch (e) {
      console.log('Warmup failed:', e.message);
    }

    let result;

    // ניסיון ראשון — ישיר
    try {
      result = await withTimeout(
        c.sendMessage(chatId, text),
        SEND_TIMEOUT_MS,
        'sendMessage direct'
      );

      console.log('Direct send success');
    } catch (err) {
      console.log('Direct failed → fallback:', err.message);

      const chat = await withTimeout(
        c.getChatById(chatId),
        SEND_TIMEOUT_MS,
        'getChatById'
      );

      result = await withTimeout(
        chat.sendMessage(text),
        SEND_TIMEOUT_MS,
        'sendMessage fallback'
      );
    }

    console.log('--- SEND SUCCESS ---');

    return {
      whatsapp_chat_id: chatId,
      message_id: result?.id?._serialized || null,
      status: 'sent'
    };
  });
}

/* ===================== */
/* ===== GROUPS ======== */
/* ===================== */

async function getWhatsAppGroups() {
  return withRecovery(async () => {
    const c = await ensureClient();
    await waitUntilReady();

    const chats = await withTimeout(
      c.getChats(),
      60000,
      'getChats'
    );

    return chats
      .filter(c => c.isGroup)
      .map(c => ({
        whatsapp_chat_id: c.id._serialized,
        name: c.name || ''
      }));
  });
}

/* ===================== */

async function restartClient() {
  await hardRestartClient();
}

async function resetSession() {
  isRestarting = true;

  try {
    if (client) {
      await client.destroy().catch(() => {});
    }

    client = null;

    fs.rmSync(path.resolve(SESSION_PATH), {
      recursive: true,
      force: true
    });

    isReady = false;
    lastQrDataUrl = null;
    lastError = null;

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
