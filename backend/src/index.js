/**
 * Express server entry point — Kural Backend
 *
 * Single service that handles:
 * 1. Telegram webhook (POST /webhook/telegram)
 * 2. Bolna post-call webhook (POST /webhook/bolna/call-ended)
 * 3. Internal trigger-call endpoint (POST /api/trigger-call)
 *
 * The Telegram bot runs in webhook mode (not polling) — Express receives
 * updates at /webhook/telegram and forwards them to the bot via processUpdate().
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');

const bot = require('./telegram/bot');
const triggerCallRouter = require('./routes/triggerCall');
const bolnaWebhookRouter = require('./routes/bolnaWebhook');

// Pass the bot instance to the Bolna webhook so it can send Telegram messages
bolnaWebhookRouter.setBot(bot);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'Kural — AI Citizen Call Intelligence Platform',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// ─── Telegram webhook ──────────────────────────────────────────────────────
// Express receives the raw update from Telegram and forwards it to the bot
app.post('/webhook/telegram', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ─── Bolna post-call webhook ────────────────────────────────────────────────
app.use('/webhook/bolna', bolnaWebhookRouter);

// ─── Internal API ───────────────────────────────────────────────────────────
app.use('/api', triggerCallRouter);

// ─── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Kural backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/`);
  console.log(`   Telegram webhook: POST /webhook/telegram`);
  console.log(`   Bolna webhook: POST /webhook/bolna/call-ended`);
  console.log(`   Trigger call: POST /api/trigger-call\n`);

  // If a public URL is configured, register the Telegram webhook automatically
  const publicUrl = process.env.PUBLIC_BACKEND_URL;
  if (publicUrl && publicUrl !== 'http://localhost:3000') {
    try {
      const webhookUrl = `${publicUrl}/webhook/telegram`;
      await bot.setWebHook(webhookUrl);
      console.log(`✅ Telegram webhook registered: ${webhookUrl}`);
    } catch (err) {
      console.error('❌ Failed to register Telegram webhook:', err.message);
      console.log('   Register manually: GET https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PUBLIC_URL>/webhook/telegram');
    }
  } else {
    console.log('ℹ️  PUBLIC_BACKEND_URL is localhost — Telegram webhook not registered.');
    console.log('   For local testing, use ngrok or similar to expose this server, then set PUBLIC_BACKEND_URL and restart.');
  }
});
