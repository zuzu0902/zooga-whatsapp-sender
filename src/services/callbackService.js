const axios = require('axios');
const env = require('../config/env');
const { sleep } = require('../utils/helpers');

async function sendCallback(payload, logger) {
  if (!env.adminCallbackUrl) {
    logger.warn('ADMIN_CALLBACK_URL not set; skipping callback');
    return { ok: false, skipped: true };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await axios.post(env.adminCallbackUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': env.adminSharedSecret
        },
        timeout: 30000
      });
      logger.info({ attempt }, 'Callback sent successfully');
      return { ok: true };
    } catch (err) {
      lastError = err.message;
      logger.error({ attempt, err: err.message }, 'Callback failed');
      if (attempt < 3) {
        await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }
  return { ok: false, error: lastError };
}

module.exports = { sendCallback };
