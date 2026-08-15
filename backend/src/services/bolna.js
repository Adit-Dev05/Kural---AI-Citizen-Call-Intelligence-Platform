/**
 * Bolna outbound call service.
 *
 * Triggers an outbound call via Bolna's API. The call goes from our verified
 * Bolna number to the citizen's phone number. user_data passes the citizen's
 * name and phone so the AI agent's prompt can reference them without asking again.
 *
 * API shape confirmed from a real test call — do not change field names.
 */

/**
 * Trigger an outbound call to a citizen.
 * @param {string} phoneNumber - Citizen's phone in E.164 format (e.g. +917200909287)
 * @param {string} callerName - Citizen's name from Telegram contact share
 * @returns {Promise<{executionId: string}>} The execution_id to store in call_requests
 */
async function triggerCall(phoneNumber, callerName) {
  const response = await fetch('https://api.bolna.ai/call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BOLNA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: process.env.BOLNA_AGENT_ID,
      recipient_phone_number: phoneNumber,
      user_data: {
        caller_name: callerName || 'Citizen',
        caller_phone: phoneNumber,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bolna API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Response shape: { status: "queued", message: "done", execution_id: "...", run_id: "..." }
  console.log('[Bolna] Call queued:', data);

  return { executionId: data.execution_id };
}

module.exports = { triggerCall };
