require('dotenv').config();
const app = require('./app');
const { initWhatsAppClient } = require('./services/whatsappClient');

const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
  initWhatsAppClient();
});
