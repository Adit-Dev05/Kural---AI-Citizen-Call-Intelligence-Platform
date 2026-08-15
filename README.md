# Kural — AI Citizen Call Intelligence Platform

An AI-powered citizen grievance system for government organizations. Citizens file complaints via Telegram (voice call or text), complaints are automatically classified by AI, and officers manage them through a live dashboard.

## Architecture

```
Citizen (Telegram) → Express Backend → Bolna (outbound AI call)
                                     → Gemini (classification)
                                     → Supabase (storage + realtime)
                                     → Officer Dashboard (React)
```

**Single entry point:** Telegram bot — citizens can choose to speak (AI call) or type their complaint.

**Three surfaces:** Telegram bot, AI voice call, officer web dashboard — all connected through Supabase.

---

## Quick Start

### 1. Database Setup (Supabase)

Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor** → paste and run:

```sql
-- Tickets table: stores all citizen complaints
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('call', 'text', 'emergency')),
  caller_phone TEXT,
  caller_name TEXT,
  telegram_chat_id TEXT NOT NULL,
  raw_transcript TEXT,
  issue_type TEXT,
  department TEXT,
  location TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  emergency_type TEXT,
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'urgent')),
  sentiment TEXT CHECK (sentiment IN ('neutral', 'frustrated', 'angry')),
  summary TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'incomplete')),
  duplicate_of UUID REFERENCES tickets(id),
  recording_url TEXT,
  classified_by TEXT DEFAULT 'ai' CHECK (classified_by IN ('ai', 'rules')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Call requests table: tracks outbound call lifecycle
CREATE TABLE IF NOT EXISTS call_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  caller_name TEXT,
  bolna_call_id TEXT,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable realtime for the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;

-- Index for duplicate detection queries
CREATE INDEX IF NOT EXISTS idx_tickets_department_location
  ON tickets (department, location)
  WHERE status IN ('open', 'in_progress') AND duplicate_of IS NULL;

-- Index for call request matching
CREATE INDEX IF NOT EXISTS idx_call_requests_bolna_id
  ON call_requests (bolna_call_id);

CREATE INDEX IF NOT EXISTS idx_call_requests_phone_status
  ON call_requests (phone_number, status);
```

### 2. Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend starts on `http://localhost:3000`.

### 3. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

The dashboard starts on `http://localhost:5173`.

---

## Deployment

### Backend → Railway or Render

1. Push to GitHub
2. Connect the `backend/` directory to Railway or Render
3. Set all environment variables from `.env` (copy from `.env.example` for the list)
4. Set `PUBLIC_BACKEND_URL` to the deployed URL (e.g. `https://kural-backend.up.railway.app`)
5. The server auto-registers the Telegram webhook on startup when `PUBLIC_BACKEND_URL` is not localhost

**Manual Telegram webhook registration (if auto-registration fails):**
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<PUBLIC_BACKEND_URL>/webhook/telegram
```

### Dashboard → Vercel

1. Connect the `dashboard/` directory to Vercel
2. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy

### Bolna Post-Call Webhook

In the [Bolna Dashboard](https://app.bolna.ai):
1. Go to your agent → Settings/Analytics
2. Set the post-call webhook URL to: `<PUBLIC_BACKEND_URL>/webhook/bolna/call-ended`

---

## Project Structure

```
├── .env                          # Real environment variables (gitignored)
├── .env.example                  # Placeholder reference for env vars
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js              # Express entry point
│       ├── supabase.js           # Supabase client (service role)
│       ├── telegram/
│       │   ├── bot.js            # Telegram bot — all citizen interaction
│       │   └── userState.js      # In-memory state for multi-step flows
│       ├── services/
│       │   ├── bolna.js          # Outbound call trigger
│       │   ├── gemini.js         # AI complaint classification
│       │   └── tickets.js        # Ticket CRUD + duplicate detection
│       └── routes/
│           ├── triggerCall.js     # POST /api/trigger-call
│           └── bolnaWebhook.js   # POST /webhook/bolna/call-ended
└── dashboard/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── .env                      # Dashboard-specific env vars (VITE_ prefixed)
    └── src/
        ├── main.jsx
        ├── App.jsx               # Main app + realtime subscriptions
        ├── supabaseClient.js     # Supabase client (anon key)
        ├── index.css             # Design system
        └── components/
            ├── MetricCards.jsx    # Summary statistics
            └── TicketQueue.jsx   # Filterable live ticket list
```

## Department Taxonomy

| Department | Examples |
|---|---|
| Sanitation | Garbage, sewage, waste management |
| Water Supply | Water shortage, pipe leak, contamination |
| Electricity | Power outage, broken streetlight, voltage issues |
| Roads & Infrastructure | Potholes, broken bridges, construction issues |
| Health Services | Hospital complaints, disease outbreaks, ambulance |
| Police | Crime reports, noise complaints, safety concerns |
| Fire Department | Fire, gas leak, explosions, rescue |
| General Grievance | Anything that doesn't fit the above categories |

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health check |
| POST | `/webhook/telegram` | Telegram bot webhook |
| POST | `/webhook/bolna/call-ended` | Bolna post-call webhook |
| POST | `/api/trigger-call` | Internal — triggers outbound call |

## Local Development with Telegram

For local development, you need a public URL for Telegram webhooks. Options:
1. **ngrok**: `ngrok http 3000` → copy the https URL → set as `PUBLIC_BACKEND_URL` → restart backend
2. **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:3000`

---

Built for **Hexaware Mavericks Hackathon**.
