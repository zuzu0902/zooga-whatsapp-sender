const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const env = require('../config/env');

let client;
let state = 'initializing';
let lastEventAt = new Date().toISOString();
let lastError = null;

function setState(nextState, error = null) {
  state = nextState;
  lastEventAt = new Date().toISOString();
  if (error) lastError = error;
}

function initialize(logger) {
  if (client) return client;

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: env.clientId,
      dataPath: env.sessionPath
    }),
    puppeteer: {
      headless: env.enableHeadless,
      executablePath: env.puppeteerExecutablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', qr => {
    setState('qr_required');
    logger.info('QR generated. Scan with your phone.');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    setState('authenticated');
    logger.info('WhatsApp authenticated');
  });

  client.on('ready', () => {
    setState('ready');
    logger.info('WhatsApp client ready');
  });

  client.on('auth_failure', msg => {
    setState('error', msg);
    logger.error({ msg }, 'WhatsApp auth failure');
  });

  client.on('disconnected', reason => {
    setState('disconnected', reason);
    logger.warn({ reason }, 'WhatsApp disconnected');
  });

  client.initialize().catch(err => {
    setState('error', err.message);
    logger.error({ err }, 'Failed to initialize WhatsApp client');
  });

  return client;
}

function getClient() {
  return client;
}

function getSenderState() {
  return {
    state,
    is_ready: state === 'ready',
    last_event_at: lastEventAt,
    last_error: lastError
  };
}

module.exports = { initialize, getClient, getSenderState };
