require('dotenv').config();
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'server is alive' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
