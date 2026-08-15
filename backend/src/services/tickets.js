/**
 * Ticket service — handles ticket creation, numbering, and duplicate detection.
 *
 * Ticket numbers are human-readable (GC-1001, GC-1002, ...) and auto-increment
 * by querying the highest existing number. Duplicate detection uses a conservative
 * two-condition rule: same department AND matching location within 48 hours.
 */

const supabase = require('../supabase');

/**
 * Generate the next ticket number by finding the current max.
 * Format: GC-NNNN (e.g. GC-1001, GC-1002, ...)
 * Starts at GC-1001 if no tickets exist.
 */
async function generateTicketNumber() {
  const { data, error } = await supabase
    .from('tickets')
    .select('ticket_number')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[Tickets] Error fetching latest ticket number:', error);
    // Fallback: use timestamp-based number to avoid collisions
    return `GC-${Date.now().toString().slice(-6)}`;
  }

  if (!data || data.length === 0) {
    return 'GC-1001';
  }

  // Extract numeric part from "GC-NNNN" and increment
  const lastNumber = parseInt(data[0].ticket_number.replace('GC-', ''), 10);
  return `GC-${lastNumber + 1}`;
}

/**
 * Check for a duplicate ticket: same department + matching location, still open,
 * created within the last 48 hours.
 *
 * This is intentionally conservative — a false negative (two tickets for the same
 * issue) is less harmful than a false positive (merging genuinely distinct complaints).
 *
 * @param {string} department
 * @param {string} location
 * @returns {Promise<Object|null>} The existing ticket if a duplicate is found, null otherwise
 */
async function checkDuplicate(department, location) {
  // Don't match on "Not specified" locations — too generic
  if (!location || location === 'Not specified') {
    return null;
  }

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('department', department)
    .ilike('location', location) // case-insensitive match
    .in('status', ['open', 'in_progress'])
    .gte('created_at', fortyEightHoursAgo)
    .is('duplicate_of', null) // don't chain duplicates off other duplicates
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[Tickets] Error checking duplicates:', error);
    return null; // fail open — create a new ticket rather than crashing
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Create a new ticket in Supabase.
 * @param {Object} ticketData - All ticket fields except id and ticket_number
 * @returns {Promise<Object>} The created ticket row
 */
async function createTicket(ticketData) {
  const ticketNumber = await generateTicketNumber();

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      ticket_number: ticketNumber,
      ...ticketData,
    })
    .select()
    .single();

  if (error) {
    console.error('[Tickets] Error creating ticket:', error);
    throw error;
  }

  console.log('[Tickets] Created ticket:', data.ticket_number);
  return data;
}

/**
 * Look up a ticket by its human-readable ticket number.
 * @param {string} ticketNumber - e.g. "GC-1001"
 * @returns {Promise<Object|null>}
 */
async function lookupTicket(ticketNumber) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .ilike('ticket_number', ticketNumber.trim())
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Update a ticket's status.
 * @param {string} ticketId - UUID
 * @param {string} status - New status value
 */
async function updateTicketStatus(ticketId, status) {
  const { error } = await supabase
    .from('tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId);

  if (error) {
    console.error('[Tickets] Error updating ticket status:', error);
    throw error;
  }
}

module.exports = {
  generateTicketNumber,
  checkDuplicate,
  createTicket,
  lookupTicket,
  updateTicketStatus,
};
