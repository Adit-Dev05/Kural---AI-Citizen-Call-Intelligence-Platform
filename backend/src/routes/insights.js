const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.post('/', async (req, res) => {
  try {
    const { department } = req.body;
    
    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    // 1. Fetch active tickets for this department from Supabase
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('department', department)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Insights API] Supabase error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!tickets || tickets.length === 0) {
      return res.json({ 
        insights: 'No open or active complaints found for this department. All SLAs are met and operations are running smoothly.' 
      });
    }

    // 2. Prepare data for the prompt
    const totalActive = tickets.length;
    const urgentCount = tickets.filter(t => t.urgency === 'urgent').length;
    const now = Date.now();
    
    let slaBreaches = 0;
    const ticketDetails = tickets.map(t => {
      const ageHours = (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) slaBreaches++;
      
      return `Ticket ${t.ticket_number}: ${t.summary} (Loc: ${t.location}, Urgency: ${t.urgency}, Sentiment: ${t.sentiment}, Age: ${ageHours.toFixed(1)} hrs)`;
    });

    const prompt = `You are a Chief AI Operations Analyst for the municipal corporation, advising the Head of the "${department}" department.
Analyze the following active tickets and provide highly actionable, strategic insights.

DATA:
- Total Active Tickets: ${totalActive}
- Urgent Tickets: ${urgentCount}
- SLA Breaches (>24 hrs): ${slaBreaches}
- Ticket Details:
${ticketDetails.join('\n')}

INSTRUCTIONS:
Provide a structured response with exactly these 3 sections (use these exact headers):

**1. Immediate Actions Required**
Identify the 1 or 2 most critical tickets that need immediate attention (e.g., due to SLA breach, urgent sentiment, or critical location) and state exactly WHY.

**2. Resource Allocation Strategy**
Suggest where the department should focus its personnel/resources right now based on ticket locations or issue types (e.g., "Deploy a team to T Nagar as there are 3 related drainage complaints").

**3. Potential Risks**
Identify any emerging risks from the data (e.g., "High number of angry citizens", "Multiple tickets nearing the 24-hour SLA mark").

Keep the tone professional, urgent, and concise. Do not invent data. Base all advice strictly on the provided tickets. Formatting: Use bullet points under each header.`;

    // 3. Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    
    const result = await model.generateContent(prompt);
    const insightsText = result.response.text();

    res.json({ insights: insightsText });
  } catch (err) {
    console.error('[Insights API] Error generating insights:', err);
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
});

module.exports = router;
