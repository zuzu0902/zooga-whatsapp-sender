require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initWhatsAppClient } = require('./services/whatsappClient');

const groupsRoute = require('./routes/groups');
const broadcastRoute = require('./routes/broadcast');
const sendTestRoute = require('./routes/sendTest');
const statusRoute = require('./routes/status');
const qrRoute = require('./routes/qr');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/groups', groupsRoute);
app.use('/broadcast', broadcastRoute);
app.use('/send-test', sendTestRoute);
app.use('/status', statusRoute);
app.use('/qr', qrRoute);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  await initWhatsAppClient();
});
