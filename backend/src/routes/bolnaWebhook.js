/**
 * Bolna post-call webhook: POST /webhook/bolna/call-ended
 *
 * Receives the call outcome from Bolna after an outbound call completes.
 * Payload field names are confirmed from a real test call — do not rename them.
 *
 * Flow:
 * 1. Match the webhook's "id" to call_requests.bolna_call_id
 * 2. If call wasn't completed → mark failed, notify citizen on Telegram
 * 3. If completed → classify transcript via Gemini → check duplicates → create ticket → notify citizen
 */

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { classifyComplaint } = require('../services/gemini');
const { checkDuplicate, createTicket } = require('../services/tickets');

// Lazy-loaded bot reference — set by index.js after bot is initialized
let bot = null;
function setBot(botInstance) {
  bot = botInstance;
}

/**
 * Send a Telegram message, swallowing errors so ticket creation isn't blocked
 * if the citizen has blocked the bot or the chat_id is invalid.
 */
async function safeSendMessage(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
  } catch (err) {
    console.error(`[Telegram] Failed to send message to chat ${chatId}:`, err.message);
  }
}

router.post('/call-ended', async (req, res) => {
  // Always return 200 to Bolna immediately to acknowledge receipt
  res.status(200).json({ received: true });

  const payload = req.body;
  console.log('[BolnaWebhook] Received post-call webhook:', JSON.stringify(payload, null, 2));

  try {
    // Extract fields using the confirmed payload field names
    const bolnaCallId = payload.id;
    const callStatus = payload.status;
    const transcript = payload.transcript || '';
    const userNumber = payload.user_number || '';
    const recordingUrl = payload.telephony_data?.recording_url || null;

    if (!bolnaCallId) {
      console.error('[BolnaWebhook] Missing "id" in payload, cannot match to call_requests');
      return;
    }

    // Look up the call_requests row by bolna_call_id
    const { data: callRequest, error: lookupError } = await supabase
      .from('call_requests')
      .select('*')
      .eq('bolna_call_id', bolnaCallId)
      .single();

    if (lookupError || !callRequest) {
      // Fallback: try matching by phone number (most recent in_progress request)
      console.warn('[BolnaWebhook] No match by bolna_call_id, trying phone number fallback');
      const { data: fallbackRequest, error: fallbackError } = await supabase
        .from('call_requests')
        .select('*')
        .eq('phone_number', userNumber)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fallbackError || !fallbackRequest) {
        console.error('[BolnaWebhook] Could not match webhook to any call_requests row');
        return;
      }

      // Use the fallback match
      await processCallResult(fallbackRequest, callStatus, transcript, recordingUrl);
      return;
    }

    await processCallResult(callRequest, callStatus, transcript, recordingUrl);
  } catch (err) {
    console.error('[BolnaWebhook] Unhandled error processing webhook:', err);
  }
});

/**
 * Process the result of a completed (or failed) call.
 */
async function processCallResult(callRequest, callStatus, transcript, recordingUrl) {
  const { telegram_chat_id, phone_number, caller_name, id: callRequestId } = callRequest;

  // Ignore intermediate webhook statuses — wait for 'completed' or a clear failure
  const intermediateStatuses = ['initiated', 'ringing', 'in-progress', 'queued', 'answered', 'call-disconnected'];
  if (intermediateStatuses.includes(callStatus)) {
    console.log(`[BolnaWebhook] Ignoring intermediate status: ${callStatus}`);
    return;
  }

  // Handle explicitly failed calls
  if (callStatus !== 'completed') {
    console.log(`[BolnaWebhook] Call not completed (status: ${callStatus}), marking failed`);

    await supabase
      .from('call_requests')
      .update({ status: 'failed' })
      .eq('id', callRequestId);

    await safeSendMessage(
      telegram_chat_id,
      '❌ Unfortunately, the call could not be completed.\n\n' +
      'You can try again by tapping "📞 Register via Call" or use "📝 Register via Text" to type your complaint instead.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📞 Register via Call', callback_data: 'register_call' }],
            [{ text: '📝 Register via Text', callback_data: 'register_text' }],
          ],
        },
      }
    );
    return;
  }

  // Mark call_requests as completed
  await supabase
    .from('call_requests')
    .update({ status: 'completed' })
    .eq('id', callRequestId);

  // Edge case: empty or very short transcript → create an incomplete ticket for manual review
  if (!transcript || transcript.trim().length < 20) {
    console.warn('[BolnaWebhook] Transcript too short or empty, creating incomplete ticket');

    const ticket = await createTicket({
      source: 'call',
      caller_phone: phone_number,
      caller_name: caller_name,
      telegram_chat_id: telegram_chat_id,
      raw_transcript: transcript || '(no transcript)',
      issue_type: 'Unknown',
      department: 'General Grievance',
      location: 'Not specified',
      urgency: 'low',
      sentiment: 'neutral',
      summary: 'Call completed but transcript was empty or too short — requires manual review',
      status: 'incomplete',
      classified_by: 'rules',
      recording_url: recordingUrl,
    });

    await safeSendMessage(
      telegram_chat_id,
      `⚪ Your call was recorded but we couldn't fully understand the issue.\n\n` +
      `Ticket: <b>${ticket.ticket_number}</b>\n` +
      `Status: Incomplete — an officer will review the recording manually.\n\n` +
      `You can also file a clearer complaint by typing it out — tap "📝 Register via Text".`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Register via Text', callback_data: 'register_text' }],
            [{ text: '🔍 Check Status', callback_data: 'check_status' }],
          ],
        },
      }
    );
    return;
  }

  // Classify the transcript using Gemini (with automatic fallback to keyword rules)
  // classifyComplaint never throws — it always returns a result with classified_by: 'ai' | 'rules'
  const classification = await classifyComplaint(transcript);

  // Check for duplicate tickets
  const existingTicket = await checkDuplicate(classification.department, classification.location);

  if (existingTicket) {
    // Link as a duplicate of the existing ticket
    const ticket = await createTicket({
      source: 'call',
      caller_phone: phone_number,
      caller_name: caller_name,
      telegram_chat_id: telegram_chat_id,
      raw_transcript: transcript,
      issue_type: classification.issue_type,
      department: classification.department,
      location: classification.location,
      urgency: classification.urgency,
      sentiment: classification.sentiment,
      summary: classification.summary,
      classified_by: classification.classified_by,
      status: 'open',
      duplicate_of: existingTicket.id,
      recording_url: recordingUrl,
    });

    const urgencyEmoji = { urgent: '🔴', medium: '🟡', low: '🟢' }[classification.urgency] || '🟢';

    await safeSendMessage(
      telegram_chat_id,
      `✅ Your complaint has been registered.\n\n` +
      `${urgencyEmoji} Ticket: <b>${ticket.ticket_number}</b>\n` +
      `Department: ${classification.department}\n` +
      `Summary: ${classification.summary}\n\n` +
      `ℹ️ A similar complaint (${existingTicket.ticket_number}) is already being tracked in this area — your report has been linked to it.\n\n` +
      `Use /status ${ticket.ticket_number} to check updates.`
    );
  } else {
    // Create a fresh ticket
    const ticket = await createTicket({
      source: 'call',
      caller_phone: phone_number,
      caller_name: caller_name,
      telegram_chat_id: telegram_chat_id,
      raw_transcript: transcript,
      issue_type: classification.issue_type,
      department: classification.department,
      location: classification.location,
      urgency: classification.urgency,
      sentiment: classification.sentiment,
      summary: classification.summary,
      classified_by: classification.classified_by,
      status: 'open',
      recording_url: recordingUrl,
    });

    const urgencyEmoji = { urgent: '🔴', medium: '🟡', low: '🟢' }[classification.urgency] || '🟢';

    await safeSendMessage(
      telegram_chat_id,
      `✅ Your complaint has been registered.\n\n` +
      `${urgencyEmoji} Ticket: <b>${ticket.ticket_number}</b>\n` +
      `Department: ${classification.department}\n` +
      `Summary: ${classification.summary}\n\n` +
      `Use /status ${ticket.ticket_number} to check updates.`
    );
  }
}

module.exports = router;
module.exports.setBot = setBot;
