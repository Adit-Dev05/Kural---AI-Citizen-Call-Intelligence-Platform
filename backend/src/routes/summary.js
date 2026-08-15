const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.get('/', async (req, res) => {
  try {
    // 1. Fetch active tickets from Supabase
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('*')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Summary API] Supabase error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!tickets || tickets.length === 0) {
      return res.json({ summary: 'There are currently no open or active complaints in the system. The city is running smoothly.' });
    }

    // 2. Prepare data for Gemini
    const ticketData = tickets.map(t => 
      `- [${t.department}] ${t.issue_type} at ${t.location} (Urgency: ${t.urgency}, Sentiment: ${t.sentiment}, Source: ${t.source})`
    ).join('\n');

    const prompt = `You are a Chief Operations AI for a city.
Review the following list of active citizen complaints and provide a highly professional, 2-to-3 sentence executive situational summary for the city officers.
Focus on clusters of issues, high-urgency emergencies, and overarching themes. Do not list every single ticket. Keep it extremely concise and actionable.

Active Tickets:
${ticketData}`;

    // 3. Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent(prompt);
    const summaryText = result.response.text();

    res.json({ summary: summaryText });
  } catch (err) {
    console.error('[Summary API] Error generating summary:', err);
    res.status(500).json({ error: 'Failed to generate AI summary' });
  }
});

module.exports = router;
