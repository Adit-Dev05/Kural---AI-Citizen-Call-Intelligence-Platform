# UI/UX Design Document
## AI-Powered Citizen Call Intelligence Platform

**Document version:** 2.0 — updated for Telegram-first, outbound-call architecture

---

## 1. Design Philosophy

The product spans three surfaces — a Telegram bot, a voice call, and a web dashboard — but should feel like one coherent system. The direction is **calm, restrained, and trustworthy** rather than flashy: this is government-facing software, and visual noise undermines the sense of reliability the product is trying to build. No gradients, no heavy shadows, no decorative animation. Flat surfaces, clear hierarchy, generous whitespace.

A single status-color convention is used everywhere a ticket appears, regardless of channel:

| State | Color | Meaning |
|---|---|---|
| Urgent | Red / danger | Needs immediate attention |
| In progress / pending | Amber / warning | Acknowledged, not yet resolved |
| Resolved | Green / success | Closed out |
| Incomplete | Grey / neutral | Call declined, dropped, or transcript unusable, needs manual review |

## 2. Surface 1 — Telegram Bot (primary entry point)

Telegram is now the *only* front door — every citizen interaction starts here, so this surface carries more design weight than before.

### 2.1 `/start` — Menu
On `/start`, the bot sends a short welcome line and an inline keyboard with three buttons:
- **📞 Register via Call** — triggers the outbound call flow
- **📝 Register via Text** — citizen types their complaint directly
- **🔍 Check Status** — prompts for a ticket number

Keep the welcome line to one or two sentences. No walls of text, no numbered list requiring the citizen to type a digit — real tappable buttons only.

### 2.2 "Register via Call" flow
1. Citizen taps the button
2. Bot replies asking them to share their phone number, using Telegram's native **"Share Contact"** button (a `request_contact` reply-keyboard button) — never ask the citizen to type their number manually, since Telegram can share it in one tap and this avoids typos entirely
3. Once shared, bot immediately confirms: *"Calling you now — please answer, this may take a few seconds."*
4. Backend triggers the outbound call via Bolna
5. While the call is in progress, the citizen is simply waiting for their phone to ring — no further bot messages needed until the call ends
6. After the call ends and classification completes, the bot sends a confirmation message in the *same chat*: department, one-line summary, ticket number

### 2.3 "Register via Text" flow
1. Citizen taps the button, bot asks them to describe their issue
2. Citizen sends a free-text message
3. Bot replies with a short confirmation, department, and ticket number — same message format as the call flow, so the citizen doesn't perceive the two paths as different products

### 2.4 "Check Status" flow
1. Citizen taps the button, bot asks for a ticket number (or citizen can just send `/status <ticket_number>` directly)
2. Bot replies with current status using the same color-coded language: "🔴 Urgent — assigned to Sanitation, opened 12 minutes ago"
3. Invalid ticket numbers get a clear, short response, never silence or a technical error

### 2.5 Tone
Every bot message is short — one to three lines. Emoji used sparingly and only for status/urgency indicators (🔴🟡🟢), not decoratively.

## 3. Surface 2 — Voice Call (no visual UI, but a designed conversational flow)

Although there's no screen, the call itself is a designed experience and should be treated with the same rigor as a UI:

- **Opening** — the agent identifies itself as the citizen grievance line and asks the caller to describe their issue in their own language. Since the citizen already opted in via Telegram, the agent does not need to re-explain what's happening — it goes straight to listening.
- **Confirmation loop** — before finalizing, the agent reads back a one-line summary ("Registering a sewage overflow complaint on MG Road, routing to Sanitation — is that correct?") so the citizen isn't left uncertain whether they were understood
- **Ticket read-back** — ticket number spoken clearly, slowly, and ideally repeated once — with a note that the same details are being sent to their Telegram chat
- **Clarification handling** — if speech is unclear, the agent asks a specific follow-up rather than guessing silently
- **Tone** — polite, brief, never robotic-scripted-sounding

## 4. Surface 3 — Officer Dashboard (primary visual surface)

### Layout
- **Top row — metric cards**: open tickets, urgent count, average resolution time, tickets filed today. Flat cards, no shadow, subtle border only.
- **Below — live queue**: a filterable list (department, status, and now also **source** — call or text) sorted newest-first. Each row shows: ticket number, one-line issue summary, department tag, location, urgency badge, source icon, time since filed.
- **Realtime behavior**: new tickets appear at the top of the queue without a page refresh, using a brief, subtle highlight to draw attention to what's new.
- **Resolve action**: a single clear button per ticket; status updates immediately and reflects across any other open dashboard session.

### Typography & Spacing
- One typeface family throughout, sans-serif, no more than two weights (regular, medium)
- Consistent 8px-based spacing scale
- Text hierarchy limited to three sizes: page title, section/card label, body text

### Color Usage
- Status colors (table above) are the *only* saturated colors in the interface — everything else is neutral grey/white/near-black text

## 5. Accessibility & Usability Notes

- Status is never conveyed by color alone — each badge also carries a text label
- Dashboard filters are simple dropdowns/toggles, not complex multi-select interfaces
- Telegram responses are kept short deliberately — most citizens will be reading on a small phone screen, often on a slow connection
- The "Share Contact" button removes the need for citizens to type or remember a phone number, which is both faster and more accessible than a text-entry flow

## 6. What "Polished" Means for the Demo

- One consistent product name and wordmark used across the dashboard header, Telegram bot's display name, and any pitch materials
- The Telegram menu-tap-to-call moment should be shown live and unhurried — it's the clearest visual proof that the "citizen portal" and the "voice AI" are the same connected system, not two separate demos stitched together
- The dashboard should be shown live immediately after the call completes, so the visual proof of the pipeline working is as important as the call itself
- No placeholder Lorem Ipsum, no unstyled default browser elements visible anywhere in the demo path
