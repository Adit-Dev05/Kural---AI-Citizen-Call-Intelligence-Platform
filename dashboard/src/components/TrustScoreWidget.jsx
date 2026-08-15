import React from 'react';

const DEPARTMENTS = [
  'Sanitation', 'Water Supply', 'Electricity', 'Roads & Infrastructure',
  'Health Services', 'Police', 'Fire Department', 'General Grievance'
];

function calculateMetrics(deptTickets) {
  const resolved = deptTickets.filter(t => t.status === 'resolved');
  
  let slaCompliant = 0;
  resolved.forEach(t => {
    const created = new Date(t.created_at);
    const updated = new Date(t.updated_at);
    const hours = (updated - created) / (1000 * 60 * 60);
    if (hours <= 24) slaCompliant++;
  });
  
  const slaPct = resolved.length > 0 ? (slaCompliant / resolved.length) * 100 : null;
  
  const rated = resolved.filter(t => t.citizen_rating > 0);
  const avgRating = rated.length > 0
    ? rated.reduce((sum, t) => sum + t.citizen_rating, 0) / rated.length
    : null;
    
  let trustScore = null;
  if (slaPct !== null && avgRating !== null) {
    trustScore = Math.round(((avgRating / 5) * 100 * 0.5) + (slaPct * 0.5));
  } else if (slaPct !== null) {
    trustScore = Math.round(slaPct);
  }

  let color = 'var(--color-text-primary)';
  if (trustScore !== null) {
    if (trustScore >= 90) color = '#22c55e';
    else if (trustScore >= 75) color = '#ff9900';
    else color = '#ef4444';
  }

  return { slaPct, avgRating, trustScore, color, rated };
}

export default function TrustScoreWidget({ tickets, fixedDepartment }) {
  if (fixedDepartment) {
    // Single department view
    const deptTickets = tickets.filter(t => t.department === fixedDepartment);
    const metrics = calculateMetrics(deptTickets);
    const recentFeedback = metrics.rated
      .filter(t => t.citizen_feedback)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 3);

    return (
      <div className="trust-score-card">
        <div className="trust-header">
          <h3>🛡️ Resolution Trust Score</h3>
          <span className="subtitle">Department Accountability & Satisfaction</span>
        </div>
        <div className="trust-content">
          <div className="score-circle" style={{ borderColor: metrics.color }}>
            <span className="score-value" style={{ color: metrics.color }}>
              {metrics.trustScore !== null ? `${metrics.trustScore}%` : 'N/A'}
            </span>
            <span className="score-label">Trust Index</span>
          </div>
          <div className="trust-metrics">
            <div className="trust-metric">
              <span className="metric-label">Average Rating</span>
              <span className="metric-value">
                {metrics.avgRating !== null ? `⭐ ${metrics.avgRating.toFixed(1)} / 5` : 'No ratings yet'}
              </span>
            </div>
            <div className="trust-metric">
              <span className="metric-label">SLA Compliance</span>
              <span className="metric-value">
                {metrics.slaPct !== null ? `${Math.round(metrics.slaPct)}%` : 'No resolved tickets'}
              </span>
            </div>
          </div>
        </div>
        {recentFeedback.length > 0 && (
          <div className="recent-feedback-section">
            <h4>Recent Citizen Feedback</h4>
            <div className="feedback-list">
              {recentFeedback.map(ticket => (
                <div key={ticket.id} className="feedback-item">
                  <div className="feedback-meta">
                    <span className="feedback-rating">{'⭐'.repeat(ticket.citizen_rating)}</span>
                    <span className="feedback-ticket">{ticket.ticket_number}</span>
                  </div>
                  <p>"{ticket.citizen_feedback}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Central dashboard view - All departments
  return (
    <div className="trust-score-card" style={{ flex: 2 }}>
      <div className="trust-header">
        <h3>🛡️ Department Trust Scores</h3>
        <span className="subtitle">Accountability & Satisfaction by Department</span>
      </div>
      <div className="trust-departments-grid">
        {DEPARTMENTS.map(dept => {
          const deptTickets = tickets.filter(t => t.department === dept);
          const metrics = calculateMetrics(deptTickets);
          
          return (
            <div key={dept} className="trust-dept-item">
              <div className="dept-name">{dept}</div>
              <div className="dept-score-bar-container">
                <div 
                  className="dept-score-bar" 
                  style={{ 
                    width: `${metrics.trustScore !== null ? metrics.trustScore : 0}%`, 
                    backgroundColor: metrics.color 
                  }}
                ></div>
              </div>
              <div className="dept-score-text" style={{ color: metrics.color }}>
                {metrics.trustScore !== null ? `${metrics.trustScore}%` : 'N/A'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
