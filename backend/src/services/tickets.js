/**
 * Ticket service — handles ticket creation, numbering, and duplicate detection.
 *
 * Ticket numbers are human-readable (GC-1001, GC-1002, ...) and auto-increment
 * by querying the highest existing number. Duplicate detection uses a conservative
 * two-condition rule: same department AND matching location within 48 hours.
 */

const supabase = require('../supabase');

/**
 * Reverse geocode latitude and longitude to a human-readable address.
 * Uses Nominatim (OpenStreetMap).
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string>} Human-readable address or "Location Provided" if failed
 */
async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: { 'User-Agent': 'Kural-Hackathon-App/1.0' }
    });
    const data = await response.json();
    
    if (data && data.display_name) {
      // Simplify the display name by removing the country and postcode if present
      let address = data.display_name;
      address = address.split(',').slice(0, 4).join(',').trim();
      return address;
    }
    return "Location Provided";
  } catch (err) {
    console.error('[Geocoding] Reverse geocode failed:', err.message);
    return "Location Provided";
  }
}

/**
 * Generate the next ticket number by finding the current max.
 * Format: GC-NNNN (e.g. GC-1001, GC-1002, ...)
 * Starts at GC-1001 if no tickets exist.
 */
async function generateTicketNumber() {
  const { data, error } = await supabase
    .from('tickets')
    .select('ticket_number')
    .order('ticket_number', { ascending: false })
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

  let latitude = ticketData.latitude || null;
  let longitude = ticketData.longitude || null;

  // Capture the location string for background geocoding before we delete it (if applicable)
  const locationToGeocode = ticketData.broad_location || ticketData.location;

  // Remove broad_location before inserting into DB so we don't violate schema (if it's strictly defined)
  delete ticketData.broad_location;

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      ticket_number: ticketNumber,
      source: ticketData.source,
      caller_phone: ticketData.caller_phone || null,
      caller_name: ticketData.caller_name || null,
      telegram_chat_id: ticketData.telegram_chat_id || null,
      raw_transcript: ticketData.raw_transcript || null,
      issue_type: ticketData.issue_type,
      department: ticketData.department,
      location: ticketData.location,
      latitude,
      longitude,
      urgency: ticketData.urgency || 'low',
      sentiment: ticketData.sentiment || 'neutral',
      summary: ticketData.summary,
      classified_by: ticketData.classified_by || 'rules',
      status: ticketData.status || 'open',
      duplicate_of: ticketData.duplicate_of || null,
      recording_url: ticketData.recording_url || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Background Geocoding: Do not await this, let it run in the background to keep response times fast
  if (!latitude && !longitude && locationToGeocode && locationToGeocode !== 'Not specified') {
    (async () => {
      try {
        let cleanLoc = locationToGeocode
          .replace(/no\.?\s*\d+/gi, '')
          .replace(/\d+(st|nd|rd|th)\s+(cross|street|main road|avenue|lane)/gi, '')
          .replace(/chennai\s*:?\s*\d{6}/gi, '')
          .replace(/[:,]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
          
        if (!cleanLoc || cleanLoc.length < 3) cleanLoc = locationToGeocode;

        const query = encodeURIComponent(`${cleanLoc}, Chennai, Tamil Nadu, India`);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
          headers: { 'User-Agent': 'Kural-Hackathon-App/1.0' }
        });
        const geoData = await response.json();
        if (geoData && geoData.length > 0) {
          const bgLat = parseFloat(geoData[0].lat);
          const bgLon = parseFloat(geoData[0].lon);
          
          await supabase
            .from('tickets')
            .update({ latitude: bgLat, longitude: bgLon })
            .eq('id', data.id);
            
          console.log(`[Geocoding-BG] Async resolved "${locationToGeocode}" to ${bgLat}, ${bgLon} for ticket ${ticketNumber}`);
        }
      } catch (err) {
        console.error('[Geocoding-BG] Failed to fetch coordinates in background:', err.message);
      }
    })();
  }

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
  reverseGeocode,
};
