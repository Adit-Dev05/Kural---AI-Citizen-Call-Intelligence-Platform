const express = require('express');
const { updateTicketStatus, lookupTicketById } = require('../services/tickets');
const bot = require('../telegram/bot');
const supabase = require('../supabase');

const router = express.Router();

router.post('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    // 1. Update the ticket status in Supabase
    await updateTicketStatus(id, status);

    // 2. Fetch the updated ticket to get the chat_id and details
    const { data: ticket, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !ticket) {
      console.error('[Tickets API] Failed to fetch ticket after update:', error);
      return res.status(500).json({ error: 'Status updated but failed to fetch ticket' });
    }

    // 3. Send Telegram notification if the ticket has a telegram_chat_id
    if (ticket.telegram_chat_id) {
      if (status === 'in_progress') {
        const message = `🚧 Your ticket no <b>${ticket.ticket_number}</b> regarding "${ticket.summary || 'your complaint'}" at ${ticket.location || 'your location'} is now in progress for resolution.`;
        bot.sendMessage(ticket.telegram_chat_id, message, { parse_mode: 'HTML' }).catch(err => console.error('[Telegram] Failed to send in_progress notification:', err));
      } else if (status === 'resolved') {
        const message = `✅ Your ticket no <b>${ticket.ticket_number}</b> for "${ticket.summary || 'your complaint'}" has been resolved.\n\nPlease rate our service:`;
        
        // Inline keyboard for 1-5 star rating
        const keyboard = {
          inline_keyboard: [
            [
              { text: '⭐ 1', callback_data: `rate_1_${ticket.ticket_number}` },
              { text: '⭐⭐ 2', callback_data: `rate_2_${ticket.ticket_number}` },
              { text: '⭐⭐⭐ 3', callback_data: `rate_3_${ticket.ticket_number}` }
            ],
            [
              { text: '⭐⭐⭐⭐ 4', callback_data: `rate_4_${ticket.ticket_number}` },
              { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rate_5_${ticket.ticket_number}` }
            ]
          ]
        };
        
        bot.sendMessage(ticket.telegram_chat_id, message, { 
          parse_mode: 'HTML',
          reply_markup: keyboard
        }).catch(err => console.error('[Telegram] Failed to send resolved notification:', err));
      }
    }

    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ticket status', details: err.message, stack: err.stack });
  }
});

module.exports = router;
