require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initWhatsAppClient } = require('./services/whatsappClient');

const groupsRoute = require('./routes/groups');
const broadcastRoute = require('./routes/broadcast');
const statusRoute = require('./routes/status');

const app = express();

app.use(cors());
app.use(express.json());

// routes
app.use('/groups', groupsRoute);
app.use('/broadcast', broadcastRoute);
app.use('/status', statusRoute);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  await initWhatsAppClient();
});
