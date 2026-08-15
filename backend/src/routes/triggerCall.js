/**
 * Internal endpoint: POST /api/trigger-call
 *
 * Called by the Telegram handler when a citizen shares their phone number.
 * Triggers an outbound call via Bolna and updates the call_requests row
 * with the execution_id returned by Bolna.
 */

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { triggerCall } = require('../services/bolna');

router.post('/trigger-call', async (req, res) => {
  const { phoneNumber, callerName, callRequestId } = req.body;

  try {
    // Trigger the outbound call via Bolna
    const { executionId } = await triggerCall(phoneNumber, callerName);

    // Update the call_requests row with the Bolna execution ID and mark as in_progress
    const { error } = await supabase
      .from('call_requests')
      .update({
        bolna_call_id: executionId,
        status: 'in_progress',
      })
      .eq('id', callRequestId);

    if (error) {
      console.error('[TriggerCall] Error updating call_requests:', error);
      return res.status(500).json({ error: 'Failed to update call request' });
    }

    console.log(`[TriggerCall] Call triggered for ${phoneNumber}, execution_id: ${executionId}`);
    return res.json({ success: true, executionId });
  } catch (err) {
    console.error('[TriggerCall] Error triggering call:', err);

    // Mark the call request as failed so the citizen isn't left hanging
    await supabase
      .from('call_requests')
      .update({ status: 'failed' })
      .eq('id', callRequestId);

    return res.status(500).json({ error: 'Failed to trigger call' });
  }
});

module.exports = router;
