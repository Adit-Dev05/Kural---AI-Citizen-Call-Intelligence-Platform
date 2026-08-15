# Tech Stack & API Documentation
## AI-Powered Citizen Call Intelligence Platform

**Document version:** 2.0 — updated for outbound-call architecture

---

## 1. Tech Stack Overview

| Layer | Choice | Why |
|---|---|---|
| Voice orchestration | Bolna | Managed telephony + multilingual STT/TTS + function calling. Used in **outbound-only** mode — the backend triggers calls via Bolna's API rather than receiving inbound calls, avoiding the need to purchase and compliance-approve a dedicated number |
| Live-turn conversation LLM | Bolna's default fast model | Optimized by the platform for low-latency turn-taking during the call itself |
| Classification LLM | Google Gemini (Flash tier) | Fast, strong multilingual understanding for Indian languages, reliable structured JSON output via `responseSchema`, generous free tier |
| Backend | Node.js + Express | Single lightweight service handling the Telegram bot, the Bolna outbound-call trigger, and the post-call webhook |
| Database | Supabase (managed Postgres) | Zero infrastructure setup, instant REST + realtime API, built-in table viewer usable as a fallback admin view during development |
| Citizen entry point | Telegram Bot API | Single front door for every citizen interaction — call requests, text complaints, and status checks all go through the same bot |
| Officer dashboard | React (Vite) | Reads/writes directly against Supabase using the client library and realtime subscriptions — no separate dashboard API layer needed |
| Hosting — backend | Railway or Render | Free tier, fast deploy, gives Telegram and Bolna's post-call webhook a public URL |
| Hosting — dashboard | Vercel | Free tier, fast static/SPA deploy |

## 2. Why This Stack (Reasoning)

The guiding constraint remains **working product over infrastructure completeness**. The shift to outbound-only calling removes an entire category of risk: no number purchase, no compliance-document wait time, no inbound webhook routing configuration on a telephony provider. The backend becomes the one place that initiates everything — a Telegram button tap is what starts a real phone call — which is a simpler mental model to build, explain to judges, and debug under time pressure.

## 3. Database Schema (Supabase)

### Table: `tickets`

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | `default gen_random_uuid()` |
| ticket_number | text, unique | Human-readable, e.g. `GC-1001` |
| source | text | `'call'` or `'text'` — both originate from Telegram now |
| caller_phone | text, nullable | Captured via Telegram's contact-share, populated for call-sourced tickets |
| telegram_chat_id | text | Always populated — every ticket originates from a Telegram chat |
| raw_transcript | text | Full call transcript or typed message text |
| issue_type | text | Free-text issue category |
| department | text | One of the fixed department taxonomy |
| location | text | Extracted location string |
| urgency | text | `'low'` \| `'medium'` \| `'urgent'` |
| sentiment | text | `'neutral'` \| `'frustrated'` \| `'angry'` |
| summary | text | One-line AI-generated summary |
| status | text | `'open'` \| `'in_progress'` \| `'resolved'` \| `'incomplete'` |
| duplicate_of | uuid, nullable | Self-reference to `tickets.id` when merged |
| created_at | timestamptz | `default now()` |
| updated_at | timestamptz | `default now()` |

### Table: `call_requests`
Tracks the outbound call lifecycle separately from the ticket, since a call can be requested and then fail, decline, or drop before a ticket exists.

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | |
| telegram_chat_id | text | Chat that requested the call |
| phone_number | text | Shared via Telegram contact button |
| bolna_call_id | text, nullable | Returned by Bolna when the call is triggered |
| status | text | `'requested'` \| `'in_progress'` \| `'completed'` \| `'failed'` |
| created_at | timestamptz | |

**Note:** `phone_telegram_links` from the earlier inbound design is no longer needed — phone number and Telegram chat ID are captured together at request time, so linking is automatic rather than a separate matching step.

### Fixed Department Taxonomy
Sanitation, Water Supply, Electricity, Roads & Infrastructure, Health Services, Police, General Grievance (fallback)

## 4. API Endpoints

### `POST /webhook/telegram`
Telegram bot webhook endpoint. Handles all citizen-facing interaction.

**Handles:**
- `/start` → sends the menu (inline keyboard: Register via Call, Register via Text, Check Status)
- Callback from "Register via Call" button → sends the "Share Contact" reply-keyboard prompt
- Incoming contact share (phone number) → inserts a row into `call_requests` with status `'requested'`, calls Bolna's outbound call API, updates `bolna_call_id`, replies confirming the call is being placed
- Callback from "Register via Text" button → prompts for free text
- Free-text message (in text-registration mode) → runs the Gemini classification pipeline, creates a ticket with `source='text'`, replies with confirmation
- `/status <ticket_number>` or "Check Status" flow → looks up the ticket and replies with status

### `POST /api/trigger-call` (internal, called by the Telegram handler above)
Calls Bolna's outbound call API with the agent ID, the verified caller number, and the citizen's shared phone number as the recipient. Stores the returned `bolna_call_id` against the `call_requests` row.

### `POST /webhook/bolna/call-ended`
Triggered by Bolna when the outbound call completes.

**Receives:** call transcript, the phone number that was called, call outcome (completed, no-answer, declined)

**Does:**
1. Looks up the matching `call_requests` row by phone number (most recent `'in_progress'` request for that number) to recover the `telegram_chat_id`
2. If the call was not answered or declined, updates `call_requests.status = 'failed'` and sends a Telegram message letting the citizen know they can try again or use "Register via Text" instead
3. If completed, sends the transcript to Gemini for structured extraction: issue type, department, location, urgency, sentiment, summary
4. Checks for duplicates — an existing open ticket in the same department with a matching location filed within the last 48 hours
5. Inserts a new ticket (or links as a duplicate), with `telegram_chat_id` and `caller_phone` carried over from the `call_requests` row
6. Sends a confirmation message to the citizen's Telegram chat with department, summary, and ticket number
7. Updates the officer dashboard in real time via Supabase realtime subscription

## 5. Environment Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side inserts/updates (backend only, never exposed to frontend) |
| `SUPABASE_ANON_KEY` | Used by the React dashboard for reads and realtime subscriptions |
| `GEMINI_API_KEY` | Classification LLM calls |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `BOLNA_API_KEY` | Voice platform authentication |
| `BOLNA_AGENT_ID` | The agent created in the Bolna dashboard, used when triggering outbound calls |
| `BOLNA_CALLER_NUMBER` | Your verified Bolna phone number, used as the "from" number for outbound calls |
| `PUBLIC_BACKEND_URL` | The deployed backend URL, used to register the Telegram webhook and Bolna's post-call webhook |

## 6. Third-Party Integration Notes — Confirmed from a Live Test Call

### Outbound call request
```
POST https://api.bolna.ai/call
Authorization: Bearer <BOLNA_API_KEY>
Content-Type: application/json

{
  "agent_id": "afa3e06c-8695-49ab-8db9-8073f6fde22f",
  "recipient_phone_number": "+917200909287",
  "user_data": {
    "caller_name": "Aditya",
    "caller_phone": "+917200909287"
  }
}
```
`user_data` is optional but should be used to pass the citizen's name and phone number captured via Telegram, so the agent's prompt can reference `{{caller_name}}` / `{{caller_phone}}` and skip asking for them again on the call.

### Outbound call response
```json
{
  "status": "queued",
  "message": "done",
  "execution_id": "09409d48-f975-4b13-8bfd-a0b7df9ea321",
  "run_id": "09409d48-f975-4b13-8bfd-a0b7df9ea321"
}
```
Store `execution_id` in `call_requests.bolna_call_id` — it's the join key back to the webhook payload.

### Post-call webhook payload (actual field names, confirmed)
Key fields your backend needs to read:

| Field | Example | Notes |
|---|---|---|
| `id` | `"09409d48-..."` | Same value as `execution_id` from the call request — use this to match back to `call_requests` |
| `agent_id` | `"afa3e06c-..."` | |
| `status` | `"completed"` | Call outcome. Other values (no-answer, failed, busy) haven't been observed yet — handle unknown values defensively rather than assuming only `"completed"` occurs |
| `transcript` | `"assistant: Hello...\nuser: there's a...\n"` | **Flat string**, not an array of turn objects — lines alternate `assistant:` / `user:` separated by `\n`. Pass this whole string directly into the Gemini classification prompt, no need to parse it into structured turns first |
| `user_number` | `"+917200909287"` | The citizen's number — use this (not a field called `recipient_phone_number`) to match back to `call_requests.phone_number` |
| `agent_number` | `"+918035735856"` | Bolna's outbound caller ID, not needed for your logic |
| `conversation_duration` | `113.0` | Seconds |
| `extracted_data.General["Call Summary"].subjective` | auto-generated summary string | Bolna already generates its own summary — you can log this for reference, but still run your own Gemini call for the structured `{issue_type, department, location, urgency, sentiment}` extraction, since this field isn't structured to your schema |
| `telephony_data.call_type` | `"outbound"` | Confirms call direction |
| `recording_url` (`telephony_data.recording_url`) | URL | Useful to store for officer reference/audit, optional field to add to `tickets` |

Update the `tickets` schema (Section 3) to optionally include a `recording_url` column, since Bolna provides it and it's a nice audit trail with no extra work to capture.

### Other integration notes
- **Telegram contact sharing** requires a `reply_markup` with a `request_contact: true` keyboard button — this is the only reliable way to get a citizen's number without them typing it
- **Telegram webhook** should be registered via `setWebhook` pointing at the deployed backend's `/webhook/telegram` route once hosted publicly
- **Gemini structured output** uses `responseSchema` to guarantee the classification response is valid JSON matching the fixed shape, reducing parsing failures
- **Agent prompt update needed**: the SOP-derived prompt currently has the agent ask for the caller's name and phone number verbally (visible in the test transcript, including reading back digits one at a time). Update the agent's conversation prompt in Bolna to use the `user_data` passed at call time instead, and explicitly instruct it not to ask for name/phone again — this shortens the call and removes an awkward, slow exchange
