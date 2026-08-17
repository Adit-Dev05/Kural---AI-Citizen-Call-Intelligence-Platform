import React, { useMemo } from 'react';

export default function SLAAnalytics({ tickets, fixedDepartment }) {
  const { avgResTime, breaches, activeWithinSla } = useMemo(() => {
    const relevantTickets = fixedDepartment ? tickets.filter(t => t.department === fixedDepartment && !t.duplicate_of) : tickets.filter(t => !t.duplicate_of);
    const resolved = relevantTickets.filter(t => t.status === 'resolved');
    
    let avgResTime = 'N/A';
    if (resolved.length > 0) {
      const totalTime = resolved.reduce((acc, t) => acc + (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()), 0);
      const avg = totalTime / resolved.length;
      const hours = Math.floor(avg / (1000 * 60 * 60));
      const mins = Math.floor((avg / (1000 * 60)) % 60);
      avgResTime = `${hours}h ${mins}m`;
    }

    const SLA_LIMIT = 24 * 60 * 60 * 1000; // 24 hours
    let breaches = 0;
    let activeWithinSla = 0;

    relevantTickets.forEach(t => {
      if (t.status !== 'resolved' && t.status !== 'incomplete') {
        if (Date.now() - new Date(t.created_at).getTime() > SLA_LIMIT) {
          breaches++;
        } else {
          activeWithinSla++;
        }
      }
    });

    return { avgResTime, breaches, activeWithinSla };
  }, [tickets, fixedDepartment]);

  return (
    <div className="sla-card" style={{ padding: '24px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }}>
      <div className="sla-card-header" style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⏱️</span> SLA Monitoring
        </h3>
        <span style={{ fontSize: '13px', color: '#64748b' }}>{fixedDepartment || 'Overall'} Performance</span>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Resolution Time</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginTop: '8px' }}>{avgResTime}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Target: &lt; 24h</span>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: breaches > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', border: `1px solid ${breaches > 0 ? '#fecaca' : '#bbf7d0'}`, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '12px', color: breaches > 0 ? '#991b1b' : '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SLA Breaches</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: breaches > 0 ? '#ef4444' : '#22c55e', marginTop: '8px' }}>{breaches}</span>
          <span style={{ fontSize: '12px', color: breaches > 0 ? '#b91c1c' : '#15803d', marginTop: '4px' }}>
            {activeWithinSla} tickets within SLA
          </span>
        </div>
      </div>
    </div>
  );
}
