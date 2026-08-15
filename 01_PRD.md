# Product Requirements Document
## AI-Powered Citizen Call Intelligence Platform

**Hackathon:** Hexaware Mavericks
**Document version:** 2.0 — updated for outbound-call architecture

---

## 1. Background

Government organizations receive thousands of citizen calls daily across helplines, grievance cells, municipal offices, electricity boards, water departments, transport authorities, healthcare services, police control rooms, and disaster management centers. Most calls are still manually recorded and forwarded, which causes delays, duplicate complaints, poor tracking, and limited visibility into recurring public issues.

## 2. Problem Statement

Design and develop an AI-powered Citizen Call Intelligence Platform that captures and analyzes incoming calls in real time, automatically identifies citizen issues, classifies complaints, generates summaries, recommends the appropriate department, tracks resolution progress, and provides actionable insights to government officials. The platform should reduce manual intervention, improve response times, enhance citizen satisfaction, and support data-driven governance.

## 3. Architecture Decision — Outbound Call, Not Inbound

**This version supersedes the earlier inbound-call design.** The platform now initiates the voice call rather than receiving one:

- The citizen starts on Telegram, selects "Register via Call" from a menu
- The backend triggers an **outbound call** from Bolna to the citizen's phone number
- The citizen's phone rings, they answer, and the same AI conversation, classification, and ticketing pipeline runs exactly as originally designed

**Why this change:** an inbound number on Bolna requires a paid monthly number ($5/month) and, for Indian numbers, a compliance document approval process that isn't guaranteed to complete inside a hackathon timeline. Outbound calling from a verified number was already tested and works reliably. This preserves the most important judging moment — a real, live AI phone conversation — while removing a timeline risk and a recurring cost. Telegram becomes the single citizen entry point for every channel (call request, text complaint, status check), which also simplifies the product story: one door in, multiple ways to be heard.

## 4. Goals & Objectives

| Objective | Description |
|---|---|
| Automated capture | Transcribe and understand citizen complaints with no manual data entry, whether spoken or typed |
| Automated classification | Identify issue type and route to the correct department without a human dispatcher |
| Urgency handling | Detect and prioritize emergency-grade complaints |
| Duplicate control | Prevent the same real-world issue from generating multiple untracked tickets |
| Lifecycle visibility | Let both citizens and officials track a complaint from filing to resolution |
| Data-driven governance | Surface trends and hotspots officials can act on, not just individual tickets |

## 5. Target Users

- **Citizens** — open the Telegram bot, choose to be called or to type their complaint, and check status later, all in one place
- **Department officers** — see a live, filtered queue of complaints relevant to their department and update status
- **Administrators** — see cross-department trends, SLA compliance, and volume patterns

## 6. Scope

### In scope (this build)
- Telegram bot as the single citizen entry point, with a menu (inline buttons): **Register via Call**, **Register via Text**, **Check Status**
- Phone number capture via Telegram's native contact-share button when a citizen requests a call
- Outbound voice call triggered from the backend via Bolna's API, with multilingual speech understanding during the call
- AI-driven complaint classification (issue type, department, location, urgency, sentiment) after the call or text message
- Ticket creation, storage, and status tracking
- Duplicate complaint detection
- Officer dashboard with live queue and status updates
- Automatic linking of phone number to Telegram chat, since both are captured at the moment the citizen requests a call — no separate linking step needed

### Out of scope (roadmap, not built for this submission)
- Inbound calling (citizen dialing a helpline number directly)
- WhatsApp Business API integration
- Full administrator analytics suite (heatmaps, predictive hotspot modeling)
- Native mobile citizen app
- Human agent handoff / live transfer during a call
- Multi-tenant support for multiple government bodies in one deployment

## 7. Feature Set (Tiered)

**Tier 1 — Core, demo-critical**
1. Telegram menu: citizen taps "Register via Call," shares phone number via Telegram's contact button
2. Backend triggers a real outbound call via Bolna; citizen's phone rings and the AI conversation happens live
3. Call ends → transcript classified → department assigned → ticket created → confirmation sent back to the same Telegram chat
4. Telegram "Register via Text" — file a complaint by typing, same classification pipeline, no call involved
5. "Check Status" menu option / `/status <ticket_number>` command
6. Officer dashboard: live queue, filter by department and status, mark resolved

**Tier 2 — Differentiators**
7. Duplicate complaint detection (same department + location within a rolling time window merges into an existing ticket)
8. Urgency flagging for emergency-pattern complaints, surfaced distinctly on the dashboard
9. Sentiment tagging (neutral / frustrated / angry) surfaced to officers

**Tier 3 — Roadmap, mentioned but not built**
10. Inbound calling with a dedicated public helpline number
11. Predictive analytics / recurring-issue hotspot detection
12. Full administrator cross-department analytics suite
13. WhatsApp as an additional channel

## 8. User Stories

- *As a citizen*, I want to choose whether to speak or type my complaint, from the same place, so I'm not forced into a channel I'm not comfortable with.
- *As a citizen*, I want to just tap a button and get called, instead of remembering or dialing a number.
- *As a citizen*, I want a ticket number I can use later to check what's happening with my complaint, checked from the same Telegram chat I started in.
- *As an officer*, I want a live queue filtered to my department so I'm not sorting through irrelevant tickets.
- *As an officer*, I want urgent complaints visually distinct so they don't sit in a queue unnoticed.
- *As an administrator*, I want to see complaint volume and resolution time trends to identify systemic issues.

## 9. Success Metrics (for this prototype)

- A citizen taps "Register via Call" on Telegram, receives a real call within seconds, has a full AI conversation, and a correctly classified ticket appears on the dashboard
- A duplicate complaint correctly detected and merged rather than double-counted
- A Telegram-typed complaint and a call-filed complaint both visible in the same dashboard queue in real time
- At least one edge case (unclear speech, invalid ticket lookup, citizen declines the call) handled gracefully and demonstrably, not silently

## 10. Assumptions & Constraints

- Built and demoed within a hackathon timeframe — architecture favors managed platforms (Bolna, Supabase) over self-hosted infrastructure to prioritize a working end-to-end product over infrastructure completeness
- Outbound calling requires the citizen's number to already be verified/allowed on the Bolna account during the trial tier — for the live demo this is not a blocker since the demo caller's own number is verified, but note this constraint if judges test with an arbitrary number
- Department taxonomy is fixed and small for reliability of classification; not intended to be exhaustive of every real government department
- A recorded backup demo is maintained as a contingency for network/telephony issues at judging time
