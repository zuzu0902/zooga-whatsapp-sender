const { Client, LocalAuth } = require('whatsapp-web.js');

let client;
let isReady = false;
let lastQr = null;
let lastEventAt = null;
let lastError = null;

function initWhatsAppClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('📱 QR received');
    lastQr = qr;
    isReady = false;
    lastEventAt = new Date().toISOString();
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp ready');
    isReady = true;
    lastQr = null;
    lastEventAt = new Date().toISOString();
  });

  client.on('authenticated', () => {
    console.log('🔐 Authenticated');
    lastEventAt = new Date().toISOString();
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Auth failure:', msg);
    isReady = false;
    lastError = msg;
    lastEventAt = new Date().toISOString();
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️ Disconnected:', reason);
    isReady = false;
    lastEventAt = new Date().toISOString();
  });

  client.initialize();
}

function getSenderStatus() {
  let state = 'disconnected';

  if (isReady) {
    state = 'ready';
  } else if (lastQr) {
    state = 'qr_required';
  }

  return {
    state,
    is_ready: isReady,
    last_event_at: lastEventAt,
    last_error: lastError,
    qr_available: !!lastQr,
  };
}

function getQrDataUrl() {
  if (!lastQr) return null;

  const qrcode = require('qrcode');
  return qrcode.toDataURL(lastQr);
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
      ),
    ]);

    const groups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        whatsapp_chat_id: chat.id._serialized,
        name: chat.name,
      }));

    return groups;

  } catch (err) {
    console.error('⚠️ getWhatsAppGroups failed:', err.message);

    isReady = false;
    lastError = err.message;
    lastEventAt = new Date().toISOString();

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
    console.log('🔄 Restarting WhatsApp client...');

    if (client) {
      await client.destroy();
    }

  } catch (e) {
    console.log('Destroy error (ignored)');
  }

  isReady = false;
  lastQr = null;

  initWhatsAppClient();
}

module.exports = {
  initWhatsAppClient,
  getSenderStatus,
  getQrDataUrl,
  getWhatsAppGroups,
  sendMessageToGroup,
  restartClient,
};
