const express = require('express');
const env = require('../config/env');
const { getRunningJobs, getJobSummary, requestCancel } = require('../services/broadcastProcessor');

const router = express.Router();

function ensureSecret(req, res, next) {
  if (req.headers['x-admin-secret'] !== env.adminSharedSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

router.get('/', ensureSecret, (_req, res) => {
  res.json({ ok: true, running_jobs: getRunningJobs() });
});

router.get('/:broadcastId', ensureSecret, (req, res) => {
  const job = getJobSummary(req.params.broadcastId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  res.json({ ok: true, job });
});

router.post('/:broadcastId/cancel', ensureSecret, (req, res) => {
  const cancelled = requestCancel(req.params.broadcastId);
  if (!cancelled) return res.status(404).json({ ok: false, error: 'Running job not found' });
  res.json({ ok: true, accepted: true, broadcast_id: req.params.broadcastId });
});

module.exports = router;
