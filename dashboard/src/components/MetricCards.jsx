import React from 'react';

export default function MetricCards({ tickets, fixedDepartment }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const scopedTickets = fixedDepartment
    ? tickets.filter(t => t.department === fixedDepartment)
    : tickets;

  const openCount = scopedTickets.filter(
    t => t.status !== 'resolved' && !t.duplicate_of
  ).length;

  const urgentCount = scopedTickets.filter(
    t => t.urgency === 'urgent' && t.status !== 'resolved' && !t.duplicate_of
  ).length;

  const resolvedTickets = scopedTickets.filter(t => t.status === 'resolved');
  let avgResolutionTime = '—';
  if (resolvedTickets.length > 0) {
    const totalMs = resolvedTickets.reduce((sum, t) => {
      return sum + (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime());
    }, 0);
    const avgHours = totalMs / resolvedTickets.length / (1000 * 60 * 60);
    if (avgHours < 1) avgResolutionTime = `${Math.round(avgHours * 60)}m`;
    else if (avgHours < 24) avgResolutionTime = `${avgHours.toFixed(1)}h`;
    else avgResolutionTime = `${(avgHours / 24).toFixed(1)}d`;
  }

  const todayCount = scopedTickets.filter(
    t => new Date(t.created_at) >= todayStart && !t.duplicate_of
  ).length;

  // SLA breaches
  const slaBreaches = scopedTickets.filter(t => {
    if (t.duplicate_of || t.status === 'resolved' || t.status === 'incomplete') return false;
    const ageHours = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
    return ageHours > 24;
  }).length;

  return (
    <div className="stat-cards-row">
      <div className="stat-card">
        <div className="stat-card-top">
          <span className="stat-label">OPEN TICKETS</span>
          <span className="stat-icon stat-icon-blue">↗</span>
        </div>
        <div className="stat-value">{openCount}</div>
      </div>

      <div className={`stat-card ${urgentCount > 0 ? 'stat-card-urgent' : ''}`}>
        <div className="stat-card-top">
          <span className="stat-label">URGENT</span>
          <span className="stat-icon stat-icon-red">⚠</span>
        </div>
        <div className="stat-value" style={urgentCount > 0 ? { color: '#ef4444' } : {}}>{urgentCount}</div>
      </div>

      <div className="stat-card">
        <div className="stat-card-top">
          <span className="stat-label">AVG RESOLUTION</span>
          <span className="stat-icon stat-icon-default">⏱</span>
        </div>
        <div className="stat-value">{avgResolutionTime}</div>
      </div>

      <div className="stat-card">
        <div className="stat-card-top">
          <span className="stat-label">FILED TODAY</span>
          <span className="stat-icon stat-icon-default">📋</span>
        </div>
        <div className="stat-value">{todayCount}</div>
      </div>
    </div>
  );
}
