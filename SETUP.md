# Kural Platform - Setup Guide

Welcome to the **Kural — AI Citizen Call Intelligence Platform**. This document provides a comprehensive list of all required libraries, APIs, and instructions to set up the project on a new machine.

## Prerequisites
Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher recommended)
- **Git**
- A **Supabase** account
- A **Google Gemini API** key
- A **Telegram Bot Token** (via BotFather)
- A **Bolna API** key (for AI voice agents)

---

## 1. Environment Setup

### Environment Variables
You need to create a `.env` file in the root directory (where `README.md` is located). You can use `.env.example` as a template.

```env
# Supabase (Database & Real-time)
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Google Gemini (AI Classification & Executive Summary)
GEMINI_API_KEY=your_gemini_api_key

# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Bolna (Voice Agent)
BOLNA_API_KEY=your_bolna_api_key
BOLNA_AGENT_ID=your_bolna_agent_id
BOLNA_CALLER_NUMBER=+91XXXXXXXXXX

# Backend public URL (required for Bolna webhooks, e.g., ngrok URL)
PUBLIC_BACKEND_URL=your_public_backend_url
```

---

## 2. Backend Setup

The backend is built with Express.js and serves as the webhook receiver for Telegram and Bolna, while acting as an API provider for the frontend dashboard.

Navigate to the backend directory and install dependencies:
```bash
cd backend
npm install
```

### Backend Libraries & Dependencies:
- **`express`**: The core web framework serving our APIs and webhook endpoints.
- **`cors`**: Middleware to allow our frontend to securely request data from the backend.
- **`dotenv`**: Loads environment variables from the `.env` file into `process.env`.
- **`@supabase/supabase-js`**: The official Supabase client used for querying and updating our PostgreSQL database.
- **`@google/generative-ai`**: The Google Gemini SDK used for processing AI summaries and rule-based classifications.
- **`node-telegram-bot-api`**: Powers the Kural Telegram Bot (handles menus, inline keyboards, and state management).

### Starting the Backend
```bash
npm run dev
```
*(Runs the backend with auto-reload at `http://localhost:3000`)*

---

## 3. Frontend (Dashboard) Setup

The Officer Dashboard is a modern, responsive React application built with Vite.

Navigate to the dashboard directory and install dependencies:
```bash
cd dashboard
npm install
```

### Frontend Libraries & Dependencies:
- **`react` & `react-dom`**: The core UI framework.
- **`react-router-dom`**: Handles client-side routing (navigating between Central Dashboard and specific Departments).
- **`leaflet`**: An open-source JavaScript library used for mobile-friendly interactive maps.
- **`recharts`**: A composable charting library built on React components (used for analytics/graphs).
- **`@supabase/supabase-js`**: Used to fetch the list of tickets and subscribe to real-time database updates.
- **`vite`**: The incredibly fast frontend build tool and development server.

### Starting the Frontend
```bash
npm run dev
```
*(Runs the dashboard on `http://localhost:5173`)*

---

## 4. Key Architecture Notes

1. **Map Geocoding**: The system uses the free **OpenStreetMap Nominatim API** to geocode addresses automatically during ticket creation. No paid mapping API keys are required.
2. **AI Fallback**: The backend is configured to use `gemini-1.5-flash`. If the Gemini API key fails or the service is overloaded, the system has a built-in **keyword fallback mechanism** to ensure complaints are always routed.
3. **Database Architecture**: Ensure your Supabase instance has a `tickets` table and a `call_requests` table correctly set up according to the project's SQL schema.
