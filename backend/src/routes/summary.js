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

    // 2. Compute structured stats for the prompt
    const totalOpen = tickets.length;
    const urgentTickets = tickets.filter(t => t.urgency === 'urgent');
    
    // Department-wise counts
    const deptCounts = {};
    tickets.forEach(t => {
      deptCounts[t.department] = (deptCounts[t.department] || 0) + 1;
    });
    const deptBreakdown = Object.entries(deptCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([dept, count]) => `${dept}: ${count}`)
      .join(', ');

    // Location clusters for urgent tickets
    const locationClusters = {};
    urgentTickets.forEach(t => {
      const loc = t.location || 'Unknown';
      locationClusters[loc] = (locationClusters[loc] || 0) + 1;
    });
    const hotspotData = Object.entries(locationClusters)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([loc, count]) => `${loc} (${count} urgent)`)
      .join(', ');

    const prompt = `You are a Chief Operations AI for a city municipal corporation.
Generate a crisp, actionable executive briefing for city officers based on these EXACT numbers. Do NOT invent any numbers — use only what is given below.

DATA:
- Total open/unresolved tickets right now: ${totalOpen}
- Urgent tickets: ${urgentTickets.length}
- Department-wise breakdown: ${deptBreakdown}
- Top urgent hotspots: ${hotspotData || 'None'}

RULES:
1. Start with the total open/unresolved ticket count in the first sentence.
2. Then mention the department-wise ticket counts in one sentence.
3. End with one sentence about the most critical hotspot or urgent situation requiring immediate attention.
4. Use ONLY the exact numbers provided above. Do NOT hallucinate or estimate.
5. Do NOT include any title, header, or prefix. Do NOT use markdown formatting. Plain text only.
6. Keep it to exactly 3 sentences. Be deliberate and professional.`;

    // 3. Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    
    const result = await model.generateContent(prompt);
    const summaryText = result.response.text();

    res.json({ summary: summaryText });
  } catch (err) {
    console.error('[Summary API] Error generating summary:', err);
    res.status(500).json({ error: 'Failed to generate AI summary' });
  }
});

module.exports = router;
