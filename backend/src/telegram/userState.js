/**
 * In-memory user state tracking for multi-step Telegram flows.
 *
 * Tracks which citizens are in the middle of a "Register via Text" flow
 * so we know to treat their next free-text message as a complaint, not a command.
 *
 * This is intentionally in-memory (not persisted) — if the server restarts,
 * the citizen simply taps the menu button again. No data is lost since tickets
 * are only created after the full flow completes.
 */

// Map<chatId (string), state object>
// State shape: { mode: 'awaiting_text' | 'awaiting_status' }
const userStates = new Map();

function setState(chatId, state) {
  userStates.set(String(chatId), state);
}

function getState(chatId) {
  return userStates.get(String(chatId)) || null;
}

function clearState(chatId) {
  userStates.delete(String(chatId));
}

module.exports = { setState, getState, clearState };
