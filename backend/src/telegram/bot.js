/**
 * Telegram Bot — the single citizen entry point.
 *
 * Runs inside the Express service using webhook mode (not polling).
 * Handles all citizen interactions: /start menu, Register via Call,
 * Register via Text, Check Status.
 *
 * Uses node-telegram-bot-api with webHook option disabled at init
 * (Express handles the webhook route directly to avoid port conflicts).
 */

const TelegramBot = require('node-telegram-bot-api');
const supabase = require('../supabase');
const { setState, getState, clearState } = require('./userState');
const { classifyComplaint } = require('../services/gemini');
const { checkDuplicate, createTicket, lookupTicket, reverseGeocode } = require('../services/tickets');

// Initialize bot — webhook mode, no polling
// We don't let the library open its own web server; Express will
// forward /webhook/telegram to bot.processUpdate() instead
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  webHook: false,
});

// ─── Inline Keyboard: Main Menu ─────────────────────────────────────────────
const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🚨 Emergency', callback_data: 'emergency' }],
    [{ text: '📞 Register via Call', callback_data: 'register_call' }],
    [{ text: '📝 Register via Text', callback_data: 'register_text' }],
    [{ text: '🔍 Check Status', callback_data: 'check_status' }],
  ],
};

// ─── /start command ─────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  clearState(chatId); // Reset any in-progress flow

  await safeSendMessage(chatId,
    `👋 Welcome to <b>Kural</b> — AI Citizen Grievance System\n\n` +
    `How would you like to register your complaint?`,
    { reply_markup: MAIN_MENU_KEYBOARD }
  );
});

// ─── /status command (direct shortcut) ──────────────────────────────────────
bot.onText(/\/status\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const ticketNumber = match[1].trim().toUpperCase();
  clearState(chatId);

  await handleStatusLookup(chatId, ticketNumber);
});

// ─── /feedback command ──────────────────────────────────────────────────────
bot.onText(/\/feedback\s+([a-zA-Z]+-\d+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const ticketNumber = match[1].toUpperCase();
  const feedback = match[2].trim();
  
  await saveCitizenFeedback(chatId, ticketNumber, feedback);
});

// ─── Callback query handler (button taps) ───────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  // Acknowledge the button tap to remove the loading spinner
  await bot.answerCallbackQuery(query.id);

  if (action.startsWith('rate_')) {
    await handleCitizenRating(chatId, action);
    return;
  }

  switch (action) {
    case 'emergency':
      await handleEmergencyMenu(chatId);
      break;

    case 'emergency_ambulance':
    case 'emergency_fire':
    case 'emergency_gas_leak':
      await handleEmergencyDispatch(chatId, action);
      break;
    case 'register_call':
      await handleRegisterCall(chatId);
      break;

    case 'register_text':
      await handleRegisterText(chatId);
      break;

    case 'check_status':
      await handleCheckStatus(chatId);
      break;

    default:
      console.warn(`[Telegram] Unknown callback_data: ${action}`);
  }
});

// ─── Contact shared (phone number for call registration) ────────────────────
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;

  // Only process if the citizen shared their own number (not someone else's)
  const phoneNumber = contact.phone_number.startsWith('+')
    ? contact.phone_number
    : `+${contact.phone_number}`;
  const callerName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Citizen';

  console.log(`[Telegram] Contact shared by chat ${chatId}: ${phoneNumber} (${callerName})`);

  // Remove the contact-share keyboard
  await safeSendMessage(chatId, '📱 Phone number received!', {
    reply_markup: { remove_keyboard: true },
  });

  // Check for an existing pending or in-progress call in the last 5 minutes to prevent double-dialing
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: existingCalls } = await supabase
    .from('call_requests')
    .select('*')
    .eq('telegram_chat_id', String(chatId))
    .in('status', ['requested', 'in_progress'])
    .gt('created_at', fiveMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingCalls && existingCalls.length > 0) {
    await safeSendMessage(chatId,
      '⏳ You already have a call in progress. Please wait for it to complete, or try "📝 Register via Text" instead.',
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
    return;
  }

  // Insert a new call_requests row
  const { data: callRequest, error: insertError } = await supabase
    .from('call_requests')
    .insert({
      telegram_chat_id: String(chatId),
      phone_number: phoneNumber,
      caller_name: callerName,
      status: 'requested',
    })
    .select()
    .single();

  if (insertError) {
    console.error('[Telegram] Error inserting call_requests:', insertError);
    await safeSendMessage(chatId,
      '❌ Something went wrong while setting up your call. Please try again.',
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
    return;
  }

  // Trigger the outbound call via the internal endpoint
  try {
    const triggerResponse = await fetch(`${process.env.PUBLIC_BACKEND_URL}/api/trigger-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber,
        callerName,
        callRequestId: callRequest.id,
      }),
    });

    if (!triggerResponse.ok) {
      throw new Error(`Trigger call failed: ${triggerResponse.status}`);
    }

    await safeSendMessage(chatId,
      `📞 <b>Calling you now</b> — please answer your phone.\n\n` +
      `This may take a few seconds. You'll receive a call from our AI grievance assistant.`
    );
  } catch (err) {
    console.error('[Telegram] Error triggering call:', err);

    // Mark the call request as failed
    await supabase
      .from('call_requests')
      .update({ status: 'failed' })
      .eq('id', callRequest.id);

    await safeSendMessage(chatId,
      '❌ We couldn\'t place the call right now. Please try again, or use "📝 Register via Text" to type your complaint.',
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
  }
});

// ─── Free-text message handler ──────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Handle location messages
  if (msg.location) {
    const state = getState(chatId);
    if (!state) return;

    if (state.mode === 'awaiting_emergency_location') {
      await handleEmergencyLocation(chatId, msg.location, state.emergency_type);
      clearState(chatId);
      return;
    }

    if (state.mode === 'awaiting_location_gps') {
      // Citizen shared GPS location for a text complaint
      const issueText = state.issueText;
      clearState(chatId);
      await handleTextComplaintWithLocation(chatId, issueText, msg.location.latitude, msg.location.longitude);
      return;
    }

    if (state.mode === 'awaiting_ticket_location') {
      // Citizen shared GPS location for an existing ticket (e.g., after a call)
      const ticketId = state.ticketId;
      clearState(chatId);
      await handleTicketLocationUpdate(chatId, ticketId, msg.location.latitude, msg.location.longitude);
      return;
    }

    return;
  }

  // Skip commands, contacts, and non-text messages
  if (!msg.text || msg.text.startsWith('/') || msg.contact) return;

  const state = getState(chatId);

  if (!state) {
    // No active flow — show the menu
    await safeSendMessage(chatId,
      `I didn't understand that. Use the menu below to get started:`,
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
    return;
  }

  if (state.mode === 'awaiting_issue_text') {
    // Citizen described the issue, now ask for GPS location
    setState(chatId, { mode: 'awaiting_location_gps', issueText: msg.text });
    await safeSendMessage(chatId, 
      '📍 Please tap the button below to share your exact location for this issue:', 
      {
        reply_markup: {
          keyboard: [[{ text: '📍 Share Location', request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      }
    );
    return;
  }

  if (state.mode === 'awaiting_location_gps') {
    // Citizen typed a text location instead of sharing GPS
    const combinedText = `Issue: ${state.issueText}\nLocation: ${msg.text}`;
    clearState(chatId);
    await handleTextComplaint(chatId, combinedText, null, null);
    return;
  }

  if (state.mode === 'awaiting_status') {
    // Citizen is providing a ticket number
    clearState(chatId);
    await handleStatusLookup(chatId, msg.text.trim().toUpperCase());
    return;
  }

  if (state.mode === 'awaiting_feedback') {
    clearState(chatId);
    await saveCitizenFeedback(chatId, state.ticketNumber, msg.text);
    return;
  }
});

// ─── Flow handlers ──────────────────────────────────────────────────────────

async function handleEmergencyMenu(chatId) {
  clearState(chatId);
  await safeSendMessage(chatId, '🚨 What type of emergency is this?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚑 Ambulance', callback_data: 'emergency_ambulance' }],
        [{ text: '🔥 Fire', callback_data: 'emergency_fire' }],
        [{ text: '⛽ Gas Leak', callback_data: 'emergency_gas_leak' }],
      ]
    }
  });
}

async function handleEmergencyDispatch(chatId, action) {
  const type = action.replace('emergency_', '');
  setState(chatId, { mode: 'awaiting_emergency_location', emergency_type: type });

  const textMap = {
    ambulance: '🚑 Ambulance',
    fire: '🔥 Fire',
    gas_leak: '⛽ Gas Leak'
  };

  await safeSendMessage(chatId, 
    `You selected ${textMap[type]}.\n\n` + 
    `📍 Please share your exact location immediately so we can dispatch units.`, 
    {
      reply_markup: {
        keyboard: [[{ text: '📍 Share Location', request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      }
    }
  );
}

async function handleEmergencyLocation(chatId, location, emergencyType) {
  const departmentMap = {
    ambulance: 'Health Services',
    fire: 'Fire Department',
    gas_leak: 'Fire Department'
  };

  const summaryMap = {
    ambulance: 'Emergency: Ambulance requested',
    fire: 'Emergency: Fire reported',
    gas_leak: 'Emergency: Gas leak reported'
  };

  const address = await reverseGeocode(location.latitude, location.longitude);

  const ticketData = {
    source: 'emergency',
    telegram_chat_id: String(chatId),
    raw_transcript: null,
    issue_type: emergencyType,
    department: departmentMap[emergencyType],
    location: address, // use reverse geocoded address
    latitude: location.latitude,
    longitude: location.longitude,
    emergency_type: emergencyType,
    urgency: 'urgent',
    sentiment: 'frustrated', // high stress
    summary: summaryMap[emergencyType],
    classified_by: 'rules', // bypassed AI
    status: 'open',
  };

  try {
    const ticket = await createTicket(ticketData);

    await safeSendMessage(chatId,
      `🚨 <b>${summaryMap[emergencyType]}</b>\n\n` +
      `Ticket <b>${ticket.ticket_number}</b> dispatched immediately to ${ticketData.department}.\n` +
      `Units are being routed to your coordinates.`,
      { reply_markup: { remove_keyboard: true } }
    );
  } catch (err) {
    console.error('[Telegram] Failed to create emergency ticket:', err);
    await safeSendMessage(chatId,
      `❌ We were unable to register your emergency ticket right now due to a database issue. Please try again or dial local emergency numbers.`,
      { reply_markup: { remove_keyboard: true } }
    );
  }
}

async function handleRegisterCall(chatId) {
  clearState(chatId);

  await safeSendMessage(chatId,
    '📱 Please share your phone number so we can call you.\n\nTap the button below to share:',
    {
      reply_markup: {
        keyboard: [[{ text: '📱 Share Phone Number', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function handleRegisterText(chatId) {
  setState(chatId, { mode: 'awaiting_issue_text' });

  await safeSendMessage(chatId,
    '📝 Please describe the issue you are facing.\n\n' +
    'You can write in any language.'
  );
}

async function handleCheckStatus(chatId) {
  setState(chatId, { mode: 'awaiting_status' });

  await safeSendMessage(chatId,
    '🔍 Please enter your ticket number (e.g. <b>GC-1001</b>):'
  );
}

/**
 * Process a text-based complaint when user typed a location instead of sharing GPS
 */
async function handleTextComplaint(chatId, text) {
  await safeSendMessage(chatId, '⏳ Analyzing your complaint...', { reply_markup: { remove_keyboard: true } });

  const classification = await classifyComplaint(text);
  const existingTicket = await checkDuplicate(classification.department, classification.location);

  const ticketData = {
    source: 'text',
    telegram_chat_id: String(chatId),
    raw_transcript: text,
    issue_type: classification.issue_type,
    department: classification.department,
    location: classification.location,
    urgency: classification.urgency,
    sentiment: classification.sentiment,
    summary: classification.summary,
    classified_by: classification.classified_by,
    status: 'open',
  };

  await finalizeTextComplaint(chatId, ticketData, existingTicket);
}

/**
 * Process a text-based complaint with exact GPS coordinates
 */
async function handleTextComplaintWithLocation(chatId, issueText, lat, lon) {
  await safeSendMessage(chatId, '⏳ Analyzing your complaint...', { reply_markup: { remove_keyboard: true } });

  // Classify just the issue text
  const classification = await classifyComplaint(issueText);
  
  // Reverse geocode the location
  const address = await reverseGeocode(lat, lon);

  // Check for duplicates
  const existingTicket = await checkDuplicate(classification.department, address, lat, lon);

  const ticketData = {
    source: 'text',
    telegram_chat_id: String(chatId),
    raw_transcript: issueText,
    issue_type: classification.issue_type,
    department: classification.department,
    location: address,
    latitude: lat,
    longitude: lon,
    urgency: classification.urgency,
    sentiment: classification.sentiment,
    summary: classification.summary,
    classified_by: classification.classified_by,
    status: 'open',
  };

  await finalizeTextComplaint(chatId, ticketData, existingTicket);
}

async function finalizeTextComplaint(chatId, ticketData, existingTicket) {
  if (existingTicket) {
    ticketData.duplicate_of = existingTicket.id;
  }

  try {
    const ticket = await createTicket(ticketData);
    const urgencyEmoji = { urgent: '🔴', medium: '🟡', low: '🟢' }[ticketData.urgency] || '🟢';

    let response =
      `✅ Your complaint has been registered.\n\n` +
      `${urgencyEmoji} Ticket: <b>${ticket.ticket_number}</b>\n` +
      `Department: ${ticketData.department}\n` +
      `Summary: ${ticketData.summary}\n`;

    if (existingTicket) {
      response += `\nℹ️ A similar complaint (${existingTicket.ticket_number}) is already being tracked — your report has been linked to it.\n`;
    }

    response += `\nUse /status ${ticket.ticket_number} to check updates.`;

    await safeSendMessage(chatId, response);
  } catch (err) {
    console.error('[Telegram] Failed to create text complaint ticket:', err);
    await safeSendMessage(chatId,
      `❌ We were unable to register your complaint right now due to a database issue. Please try again later.`,
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
  }
}

async function handleTicketLocationUpdate(chatId, ticketId, lat, lon) {
  await safeSendMessage(chatId, '⏳ Saving location...', { reply_markup: { remove_keyboard: true } });
  
  const address = await reverseGeocode(lat, lon);
  
  // Get ticket's department to search for duplicates in that area
  const { data: ticket, error: fetchError } = await supabase
    .from('tickets')
    .select('department')
    .eq('id', ticketId)
    .single();
    
  if (fetchError || !ticket) {
    console.error('[Telegram] Failed to fetch ticket for duplicate checking:', fetchError);
    return;
  }

  // Check if there is an existing ticket in that department close by (within 350m)
  const existingTicket = await checkDuplicate(ticket.department, address, lat, lon);

  const updateData = { latitude: lat, longitude: lon, location: address };
  if (existingTicket && existingTicket.id !== ticketId) {
    updateData.duplicate_of = existingTicket.id;
  }

  const { error } = await supabase
    .from('tickets')
    .update(updateData)
    .eq('id', ticketId);
    
  if (error) {
    console.error('[Telegram] Failed to update ticket location:', error);
    await safeSendMessage(chatId, '❌ Failed to save your location. You can track your ticket using the menu.');
  } else {
    let msg = '✅ Location saved successfully! We will dispatch the team to this exact spot.';
    if (existingTicket && existingTicket.id !== ticketId) {
      msg += `\n\nℹ️ A similar complaint (${existingTicket.ticket_number}) is already being tracked in this area — your report has been linked to it.`;
    }
    await safeSendMessage(chatId, msg, { reply_markup: MAIN_MENU_KEYBOARD });
  }
}

/**
 * Look up a ticket and send the status to the citizen.
 */
async function handleStatusLookup(chatId, ticketNumber) {
  // Normalize: accept with or without "GC-" prefix
  if (!ticketNumber.startsWith('GC-')) {
    ticketNumber = `GC-${ticketNumber}`;
  }

  const ticket = await lookupTicket(ticketNumber);

  if (!ticket) {
    await safeSendMessage(chatId,
      `❌ No ticket found with number <b>${ticketNumber}</b>.\n\n` +
      `Please check the number and try again, or tap the menu below:`,
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
    return;
  }

  const statusEmoji = {
    open: '🟡',
    in_progress: '🟡',
    resolved: '🟢',
    incomplete: '⚪',
  }[ticket.status] || '⚪';

  const urgencyEmoji = { urgent: '🔴', medium: '🟡', low: '🟢' }[ticket.urgency] || '🟢';

  const timeSince = getTimeSince(ticket.created_at);

  await safeSendMessage(chatId,
    `${statusEmoji} <b>Ticket ${ticket.ticket_number}</b>\n\n` +
    `Status: ${ticket.status.replace('_', ' ').toUpperCase()}\n` +
    `${urgencyEmoji} Urgency: ${ticket.urgency}\n` +
    `Department: ${ticket.department}\n` +
    `Summary: ${ticket.summary}\n` +
    `Filed: ${timeSince} ago` +
    (ticket.duplicate_of ? `\n\nℹ️ Linked to an earlier ticket in this area` : '')
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Human-readable time-since string (e.g. "12 minutes", "2 hours", "1 day")
 */
function getTimeSince(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Send a Telegram message, swallowing errors so the flow continues
 * even if the citizen has blocked the bot or the chat_id is invalid.
 */
async function safeSendMessage(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
  } catch (err) {
    console.error(`[Telegram] Failed to send message to chat ${chatId}:`, err.message);
  }
}

// ─── Rating and Feedback Handlers ───────────────────────────────────────────

async function handleCitizenRating(chatId, action) {
  // Expected action format: rate_5_GC-1001
  const parts = action.split('_');
  const rating = parseInt(parts[1], 10);
  const ticketNumber = parts[2];

  const { error } = await supabase
    .from('tickets')
    .update({ citizen_rating: rating, updated_at: new Date().toISOString() })
    .ilike('ticket_number', ticketNumber.trim());

  if (error) {
    console.error('[Telegram] Failed to save rating:', error);
    await safeSendMessage(chatId, '❌ Failed to save your rating. Please try again later.');
    return;
  }

  // Await detailed feedback
  setState(chatId, { mode: 'awaiting_feedback', ticketNumber });

  await safeSendMessage(chatId, 
    `Thank you for your ${rating}-star rating! ⭐\n\nIf you have any detailed feedback about the resolution, please type it below:`
  );
}

async function saveCitizenFeedback(chatId, ticketNumber, feedback) {
  const { error } = await supabase
    .from('tickets')
    .update({ citizen_feedback: feedback, updated_at: new Date().toISOString() })
    .ilike('ticket_number', ticketNumber.trim());

  if (error) {
    console.error('[Telegram] Failed to save feedback:', error);
    await safeSendMessage(chatId, '❌ Failed to save your feedback. Please try again later.');
    return;
  }

  await safeSendMessage(chatId, '✅ Your feedback has been recorded. Thank you for helping us improve!');
}

module.exports = bot;
