require('dotenv').config();

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

module.exports = {
  port: toInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'production',
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`,
  adminCallbackUrl: process.env.ADMIN_CALLBACK_URL || '',
  adminSharedSecret: process.env.ADMIN_SHARED_SECRET || 'change_me',
  defaultDelaySeconds: toInt(process.env.DEFAULT_DELAY_SECONDS, 4),
  minDelaySeconds: toInt(process.env.MIN_DELAY_SECONDS, 3),
  maxDelaySeconds: toInt(process.env.MAX_DELAY_SECONDS, 7),
  batchSize: toInt(process.env.BATCH_SIZE, 20),
  pauseBetweenBatchesSeconds: toInt(process.env.PAUSE_BETWEEN_BATCHES_SECONDS, 30),
  maxGroupsPerBroadcast: toInt(process.env.MAX_GROUPS_PER_BROADCAST, 200),
  enableSending: toBool(process.env.ENABLE_SENDING, true),
  enableHeadless: toBool(process.env.ENABLE_HEADLESS, true),
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  clientId: process.env.CLIENT_ID || 'zooga-broadcaster',
  sessionPath: process.env.SESSION_PATH || '.wwebjs_auth'
};
