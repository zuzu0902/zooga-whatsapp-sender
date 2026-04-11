const { app, logger } = require('./app');
const env = require('./config/env');
const { initialize } = require('./services/whatsappClient');

app.listen(env.port, () => {
  logger.info({ port: env.port }, 'Server listening');
  initialize(logger);
});
