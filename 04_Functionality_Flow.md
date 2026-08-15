# Functionality & Flow Document
## AI-Powered Citizen Call Intelligence Platform

**Document version:** 2.0 — updated for outbound-call architecture

---

## 1. Primary Flow — Register via Call (Telegram-triggered outbound call)

1. Citizen opens the Telegram bot, sends `/start`, sees a menu with three buttons
2. Citizen taps **"Register via Call"**
3. Bot prompts them to share their phone number using Telegram's native "Share Contact" button
4. Citizen taps to share — number arrives at the backend along with their `telegram_chat_id`
5. Backend creates a `call_requests` row (`status = 'requested'`) and calls Bolna's outbound call API with the agent ID, the verified caller number, and the citizen's number as recipient
6. Bot immediately confirms: *"Calling you now — please answer."*
7. Bolna places the call; citizen's phone rings and they have a live AI conversation, describing their issue in their own language
8. Bolna's live-turn model handles the conversational back-and-forth in real time, including any clarifying follow-up if speech is unclear
9. Call ends → full transcript and outcome sent to the backend via `POST /webhook/bolna/call-ended`
10. Backend matches the call back to its `call_requests` row (by phone number) to recover the `telegram_chat_id`
11. If the call wasn't answered or was declined, `call_requests.status` is set to `'failed'` and the citizen is notified on Telegram with the option to retry or use "Register via Text" instead
12. If completed, the transcript is sent to Gemini for structured extraction: issue type, department, location, urgency, sentiment, one-line summary
13. Backend checks for duplicates — an existing open ticket in the same department with a matching location filed within the last 48 hours
    - If found → new call is linked via `duplicate_of`, no new primary ticket created
    - If not → a new ticket is created with an auto-generated ticket number
14. A confirmation message is sent to the *same* Telegram chat that requested the call: department, summary, ticket number
15. Ticket appears in the officer dashboard queue in real time via Supabase realtime subscription

## 2. Primary Flow — Register via Text

1. Citizen taps **"Register via Text"** from the Telegram menu
2. Bot asks them to describe their issue
3. Citizen sends a free-text message
4. Backend runs the same Gemini classification pipeline used for calls
5. Duplicate check runs identically to the call flow
6. Bot replies with department, one-line summary, and ticket number
7. Ticket appears in the officer dashboard queue in real time, same as a call-sourced ticket

## 3. Status Check Flow

1. Citizen taps **"Check Status"** or sends `/status <ticket_number>` directly
2. Backend looks up the ticket in Supabase
3. Bot replies with current status, department, and time since filed, using the same color-coded status language used on the dashboard
4. Invalid ticket numbers return a clear "no ticket found" response, never a guess

## 4. Officer Resolution Flow

1. Officer opens the dashboard, filters to their department
2. New tickets appear at the top of the queue automatically as they're filed (no manual refresh)
3. Officer reviews the summary, location, source (call or text), and urgency badge
4. Officer marks a ticket resolved — status updates in Supabase and reflects instantly across any other open dashboard session

## 5. Duplicate Detection Logic

A ticket is treated as a duplicate of an existing one only when **both** conditions hold:
- Same department
- Matching location text, and the existing ticket is still open and was created within the last 48 hours

This conservative two-condition rule is intentional — a looser rule risks silently merging genuinely distinct complaints, which would be worse than occasionally creating two tickets for the same real-world issue.

## 6. Urgency & Sentiment Handling

- Urgency is derived by Gemini from the transcript or message content (e.g. flooding, electrocution risk, fire, gas leak language) rather than a fixed keyword list, so it generalizes beyond a hardcoded phrase set
- Urgent tickets are visually distinct on the dashboard (red badge) and sorted to be immediately visible
- Sentiment (neutral / frustrated / angry) is surfaced to officers as context, not used to alter routing

## 7. Edge Case Handling

| Scenario | Handling |
|---|---|
| Citizen declines to share their phone number | Bot explains the number is needed to place the call, offers "Register via Text" as an alternative |
| Call not answered | `call_requests` marked `'failed'`, citizen notified on Telegram with a retry option |
| Call answered but immediately hung up / no usable speech | Ticket created with status `'incomplete'` for manual review rather than discarded |
| Unclear or mumbled speech during the call | Agent asks a specific clarifying follow-up rather than guessing or creating a garbage ticket |
| Multiple distinct issues in one call or message | Split into separate tickets, both ticket numbers communicated |
| Unsupported or poorly recognized language | Graceful fallback response rather than silent failure |
| Citizen taps "Register via Call" twice in a row | Backend checks for an existing `'requested'` or `'in_progress'` call for that chat before triggering a second call, to avoid double-dialing |
| Ticket number doesn't exist on status lookup | Clear "not found" response — never a guessed or hallucinated status |
| Gemini returns a department outside the fixed taxonomy | Falls back to "General Grievance" rather than failing the whole pipeline |
| Telegram message delivery fails (bot blocked, bad chat ID) | Logged and skipped — does not block ticket creation |

## 8. Why This Is Still "One System, Two Ways to Be Heard"

Even though calling is now outbound-triggered rather than inbound, the product story is unchanged: a citizen has one entry point (Telegram), can choose to speak or type, and can check on their complaint from the same place regardless of how they filed it. The phone-to-Telegram link that previously required a separate matching step is now automatic, since both are captured together the moment a call is requested — which is simpler to build and arguably a better experience, since the citizen never has to manually connect the two channels themselves.
