# Zooga WhatsApp Sender

External sender service for Zooga Broadcast Hub. It uses `whatsapp-web.js` to connect to WhatsApp Web, sync groups, send broadcasts gradually, and report results back to your admin app.

## Endpoints

- `GET /health`
- `GET /status`
- `GET /groups` (requires `x-admin-secret`)
- `POST /broadcast/send-test` (requires `x-admin-secret`)
- `POST /broadcast` (requires `x-admin-secret`)
- `GET /jobs` (requires `x-admin-secret`)
- `GET /jobs/:broadcastId` (requires `x-admin-secret`)
- `POST /jobs/:broadcastId/cancel` (requires `x-admin-secret`)

## Local run

1. Copy `.env.example` to `.env`
2. Run `npm install`
3. Run `npm start`
4. Scan the QR from logs

## Railway notes

Railway can run this service, but persistent WhatsApp session storage matters. If Railway redeploys without persistent storage, you may need to scan QR again.

## Base44 / Lovable settings

- `sender_sync_groups_url` -> `https://YOUR-RAILWAY-URL/groups`
- `sender_webhook_url` -> `https://YOUR-RAILWAY-URL/broadcast`
- Header on requests: `x-admin-secret: YOUR_SECRET`
