/**
 * MetricCards — summary statistics at the top of the dashboard.
 *
 * Displays: open tickets, urgent count, avg resolution time, tickets today.
 * All values computed from the tickets array passed as props.
 */

import React from 'react';

export default function MetricCards({ tickets, fixedDepartment }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Filter by department if fixed
  const scopedTickets = fixedDepartment
    ? tickets.filter(t => t.department === fixedDepartment)
    : tickets;

  // Open tickets (not resolved)
  const openCount = scopedTickets.filter(
    (t) => t.status !== 'resolved' && !t.duplicate_of
  ).length;

  // Urgent tickets that are still open
  const urgentCount = scopedTickets.filter(
    (t) => t.urgency === 'urgent' && t.status !== 'resolved' && !t.duplicate_of
  ).length;

  // Average resolution time (for resolved tickets, in hours)
  const resolvedTickets = scopedTickets.filter((t) => t.status === 'resolved');
  let avgResolutionTime = '—';
  if (resolvedTickets.length > 0) {
    const totalMs = resolvedTickets.reduce((sum, t) => {
      const created = new Date(t.created_at).getTime();
      const updated = new Date(t.updated_at).getTime();
      return sum + (updated - created);
    }, 0);
    const avgHours = totalMs / resolvedTickets.length / (1000 * 60 * 60);
    if (avgHours < 1) {
      avgResolutionTime = `${Math.round(avgHours * 60)}m`;
    } else if (avgHours < 24) {
      avgResolutionTime = `${avgHours.toFixed(1)}h`;
    } else {
      avgResolutionTime = `${(avgHours / 24).toFixed(1)}d`;
    }
  }

  // Tickets filed today
  const todayCount = scopedTickets.filter(
    (t) => new Date(t.created_at) >= todayStart && !t.duplicate_of
  ).length;

  return (
    <div className="metric-cards">
      <div className="metric-card">
        <div className="label">Open Tickets</div>
        <div className="value">{openCount}</div>
      </div>

      <div className={`metric-card ${urgentCount > 0 ? 'urgent' : ''}`}>
        <div className="label">Urgent</div>
        <div className="value">{urgentCount}</div>
      </div>

      <div className="metric-card">
        <div className="label">Avg Resolution</div>
        <div className="value">{avgResolutionTime}</div>
      </div>

      <div className="metric-card">
        <div className="label">Filed Today</div>
        <div className="value">{todayCount}</div>
      </div>
    </div>
  );
}
