import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SLA_THRESHOLD_HOURS = 24;

export default function SLAAnalytics({ tickets }) {
  const { departmentData, avgResolutionTime, slaBreachesCount } = useMemo(() => {
    // 1. Group by department for Bar Chart
    const deptCounts = {};
    tickets.forEach((t) => {
      if (t.duplicate_of) return; // exclude duplicates
      deptCounts[t.department] = (deptCounts[t.department] || 0) + 1;
    });

    const departmentData = Object.keys(deptCounts)
      .map(dept => ({
        name: dept,
        count: deptCounts[dept]
      }))
      .sort((a, b) => b.count - a.count);

    // 2. Compute Average Resolution Time (Resolved tickets only)
    const resolvedTickets = tickets.filter((t) => t.status === 'resolved' && !t.duplicate_of);
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

    // 3. Compute SLA Breaches (Open/In Progress > 24 hours old)
    const nowMs = Date.now();
    const slaBreachesCount = tickets.filter((t) => {
      if (t.duplicate_of) return false;
      if (t.status === 'resolved' || t.status === 'incomplete') return false; // Only open/in_progress
      const createdMs = new Date(t.created_at).getTime();
      const ageHours = (nowMs - createdMs) / (1000 * 60 * 60);
      return ageHours > SLA_THRESHOLD_HOURS;
    }).length;

    return { departmentData, avgResolutionTime, slaBreachesCount };
  }, [tickets]);

  return (
    <div className="sla-analytics-container">
      <h2 className="section-title">SLA Monitoring & Analytics</h2>
      
      <div className="metric-cards sla-overview-cards">
        <div className="metric-card">
          <div className="label">Avg Resolution Time</div>
          <div className="value">{avgResolutionTime}</div>
        </div>

        <div className={`metric-card ${slaBreachesCount > 0 ? 'urgent' : ''}`}>
          <div className="label">SLA Breaches (&gt; 24h)</div>
          <div className="value">{slaBreachesCount}</div>
        </div>
      </div>

      <div className="chart-container">
        <h3 className="chart-title">Tickets by Department</h3>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={departmentData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} interval={0} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }} 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {departmentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="var(--color-primary)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
