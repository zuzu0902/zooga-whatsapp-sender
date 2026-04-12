const express = require('express');
const cors = require('cors');
const pino = require('pino');
require('dotenv').config();
const app = require('./app');
const { initWhatsAppClient } = require('./services/whatsappClient');

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  initWhatsAppClient();
});
const healthRoute = require('./routes/health');
const statusRoute = require('./routes/status');
const groupsRoute = require('./routes/groups');
const broadcastRoute = require('./routes/broadcast');
const jobsRoute = require('./routes/jobs');

const logger = pino({ level: 'info' });
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use((req, _res, next) => {
  req.log = logger;
  next();
});

app.use('/health', healthRoute);
app.use('/status', statusRoute);
app.use('/groups', groupsRoute);
app.use('/broadcast', broadcastRoute);
app.use('/jobs', jobsRoute);

app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
});

module.exports = { app, logger };
