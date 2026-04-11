const env = require('../config/env');
const { normalizeSettings, randomInt, sleep, nowIso } = require('../utils/helpers');
const { getClient, getSenderState } = require('./whatsappClient');
const { sendCallback } = require('./callbackService');

const runningJobs = new Map();
const jobSummaries = new Map();

function getRunningJobs() {
  return Array.from(runningJobs.values()).map(job => ({
    broadcast_id: job.broadcastId,
    started_at: job.startedAt,
    processed: job.processed,
    total: job.total,
    cancellation_requested: job.cancellationRequested
  }));
}

function getJobSummary(broadcastId) {
  return runningJobs.get(broadcastId) || jobSummaries.get(broadcastId) || null;
}

async function processBroadcast(payload, logger) {
  const state = getSenderState();
  if (!state.is_ready) throw new Error('Sender not ready');
  if (!env.enableSending) throw new Error('Sending is disabled');
  if (runningJobs.has(payload.broadcast_id)) throw new Error('Broadcast already running');

  const settings = normalizeSettings(payload.settings, env);
  const job = {
    broadcastId: payload.broadcast_id,
    startedAt: nowIso(),
    processed: 0,
    total: payload.targets.length,
    cancellationRequested: false,
    results: []
  };
  runningJobs.set(payload.broadcast_id, job);

  const client = getClient();
  try {
    for (let i = 0; i < payload.targets.length; i += 1) {
      if (job.cancellationRequested) break;

      const target = payload.targets[i];
      try {
        const chat = await client.getChatById(target.whatsapp_chat_id);
        const message = await chat.sendMessage(payload.message_text);
        job.results.push({
          broadcast_target_id: target.broadcast_target_id,
          status: 'sent',
          sent_at: nowIso(),
          error_text: null,
          external_response: { message_id: message?.id?._serialized || null }
        });
        logger.info({ broadcast_id: payload.broadcast_id, target: target.whatsapp_chat_id }, 'Message sent');
      } catch (err) {
        job.results.push({
          broadcast_target_id: target.broadcast_target_id,
          status: 'failed',
          sent_at: null,
          error_text: err.message,
          external_response: {}
        });
        logger.error({ err: err.message, target: target.whatsapp_chat_id }, 'Message failed');
      }

      job.processed += 1;

      const isLast = i === payload.targets.length - 1;
      if (!isLast && !job.cancellationRequested) {
        const batchBoundary = (i + 1) % settings.batch_size === 0;
        if (batchBoundary) {
          await sleep(settings.pause_between_batches_seconds * 1000);
        } else {
          await sleep(randomInt(settings.min_delay_seconds, settings.max_delay_seconds) * 1000);
        }
      }
    }

    if (job.cancellationRequested) {
      for (let i = job.processed; i < payload.targets.length; i += 1) {
        job.results.push({
          broadcast_target_id: payload.targets[i].broadcast_target_id,
          status: 'failed',
          sent_at: null,
          error_text: 'Cancelled before send',
          external_response: {}
        });
      }
    }

    await sendCallback({ broadcast_id: payload.broadcast_id, results: job.results }, logger);
  } finally {
    job.finishedAt = nowIso();
    jobSummaries.set(payload.broadcast_id, { ...job });
    runningJobs.delete(payload.broadcast_id);
  }
}

function requestCancel(broadcastId) {
  const job = runningJobs.get(broadcastId);
  if (!job) return false;
  job.cancellationRequested = true;
  return true;
}

module.exports = { processBroadcast, getRunningJobs, getJobSummary, requestCancel };
