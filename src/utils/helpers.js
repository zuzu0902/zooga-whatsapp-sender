function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeSettings(input = {}, env) {
  const min = Number(input.min_delay_seconds ?? env.minDelaySeconds);
  const max = Number(input.max_delay_seconds ?? env.maxDelaySeconds);
  const batch = Number(input.batch_size ?? env.batchSize);
  const pause = Number(input.pause_between_batches_seconds ?? env.pauseBetweenBatchesSeconds);
  const def = Number(input.default_delay_seconds ?? env.defaultDelaySeconds);
  return {
    default_delay_seconds: Number.isFinite(def) ? def : env.defaultDelaySeconds,
    min_delay_seconds: Number.isFinite(min) ? min : env.minDelaySeconds,
    max_delay_seconds: Number.isFinite(max) ? max : env.maxDelaySeconds,
    batch_size: Number.isFinite(batch) ? batch : env.batchSize,
    pause_between_batches_seconds: Number.isFinite(pause) ? pause : env.pauseBetweenBatchesSeconds
  };
}

function validateBroadcastPayload(body, env) {
  if (!body || typeof body !== 'object') return 'Missing request body';
  if (!body.broadcast_id) return 'broadcast_id is required';
  if (!body.message_text || !String(body.message_text).trim()) return 'message_text is required';
  if (!Array.isArray(body.targets) || body.targets.length === 0) return 'targets are required';
  if (body.targets.length > env.maxGroupsPerBroadcast) return `targets exceed limit of ${env.maxGroupsPerBroadcast}`;
  return null;
}

module.exports = { sleep, randomInt, nowIso, normalizeSettings, validateBroadcastPayload };
