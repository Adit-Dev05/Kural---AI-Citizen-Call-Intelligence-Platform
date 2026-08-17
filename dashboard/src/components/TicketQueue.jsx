import React, { useState, useEffect } from 'react';

export default function TicketQueue({ tickets, newTicketIds, fixedDepartment }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const primaryTickets = tickets.filter(t => !t.duplicate_of);
  let filtered = fixedDepartment
    ? primaryTickets.filter(t => t.department === fixedDepartment)
    : primaryTickets;

  if (statusFilter === 'open') filtered = filtered.filter(t => t.status === 'open' || t.status === 'in_progress');
  else if (statusFilter === 'resolved') filtered = filtered.filter(t => t.status === 'resolved');

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      t.ticket_number?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q) ||
      t.location?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  async function handleStatusChange(ticketId, newStatus) {
    try {
      const response = await fetch(`http://localhost:3000/api/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) console.error('Failed to update status');
    } catch (err) {
      console.error('Error calling backend:', err);
    }
  }

  return (
    <div className="queue-card">
      <div className="queue-toolbar">
        <div className="queue-tabs">
          <button className={`queue-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
          <button className={`queue-tab ${statusFilter === 'open' ? 'active' : ''}`} onClick={() => setStatusFilter('open')}>Open</button>
          <button className={`queue-tab ${statusFilter === 'resolved' ? 'active' : ''}`} onClick={() => setStatusFilter('resolved')}>Resolved</button>
        </div>
        <div className="queue-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="queue-table-wrap">
        <table className="queue-table">
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Summary</th>
              <th>Priority</th>
              <th>SLA Time</th>
              <th>Department</th>
              <th>Status</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="7" className="table-empty">No tickets match the current filters.</td></tr>
            ) : (
              filtered.map(ticket => (
                <TicketTableRow
                  key={ticket.id}
                  ticket={ticket}
                  isNew={newTicketIds.has(ticket.id)}
                  onStatusChange={handleStatusChange}
                  allTickets={tickets}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketTableRow({ ticket, isNew, onStatusChange, allTickets }) {
  const [expanded, setExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const priorityClass = {
    urgent: 'priority-urgent',
    medium: 'priority-medium',
    low: 'priority-low',
  }[ticket.urgency] || 'priority-low';

  const priorityLabel = {
    urgent: 'Urgent',
    medium: 'Medium',
    low: 'Low',
  }[ticket.urgency] || ticket.urgency;

  const statusClass = {
    open: 'status-open',
    in_progress: 'status-progress',
    resolved: 'status-resolved',
    incomplete: 'status-incomplete',
  }[ticket.status] || '';

  const statusLabel = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    incomplete: 'Incomplete',
  }[ticket.status] || ticket.status;

  const duplicates = allTickets.filter(t => t.duplicate_of === ticket.id);

  return (
    <>
      <tr className={`${isNew ? 'row-new' : ''} ${ticket.source === 'emergency' ? 'row-emergency' : ''}`} onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <td className="col-id">{ticket.ticket_number}</td>
        <td className="col-summary">
          <div className="summary-text">{ticket.summary || '(no summary)'}</div>
          <div className="summary-location">📍 {ticket.location || 'Not specified'}</div>
        </td>
        <td>
          <span className={`priority-badge ${priorityClass}`}>
            <span className="priority-dot"></span>
            {priorityLabel}
          </span>
        </td>
        <td>
          <SLATimer createdAt={ticket.created_at} status={ticket.status} />
        </td>
        <td className="col-dept">{ticket.department}</td>
        <td>
          <select
            className={`status-select ${statusClass}`}
            value={ticket.status}
            onChange={e => { e.stopPropagation(); onStatusChange(ticket.id, e.target.value); }}
            onClick={e => e.stopPropagation()}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </td>
        <td className="col-source">
          <span className="source-chip">{ticket.source === 'emergency' ? '🚨' : ticket.source === 'call' ? '📞' : '📝'}</span>
        </td>
        <td className="col-actions">
          {ticket.recording_url && (
            <a href={ticket.recording_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="action-link" title="Listen">🎧</a>
          )}
          {duplicates.length > 0 && <span className="dup-badge">+{duplicates.length}</span>}
        </td>
      </tr>

      {expanded && (
        <tr className="detail-row">
          <td colSpan="7">
            <div className="detail-panel">
              {ticket.source === 'emergency' ? (
                <div className="detail-section">
                  <strong>Emergency Live Location</strong>
                  <p>Lat: <code>{ticket.latitude}</code>, Lng: <code>{ticket.longitude}</code></p>
                  {ticket.latitude && ticket.longitude && (
                    <a href={`https://www.google.com/maps?q=${ticket.latitude},${ticket.longitude}`} target="_blank" rel="noopener noreferrer" className="map-link">🗺️ Open in Google Maps</a>
                  )}
                </div>
              ) : (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <strong>{ticket.source === 'call' ? 'Call Transcript' : 'Complaint Text'}</strong>
                    {ticket.source === 'call' && (
                      <button className="btn-sm" onClick={() => setShowTranscript(!showTranscript)}>
                        {showTranscript ? 'Hide' : 'View Transcript'}
                      </button>
                    )}
                  </div>
                  {(ticket.source !== 'call' || showTranscript) && (
                    <p className="transcript-block">{ticket.raw_transcript || 'No transcript available.'}</p>
                  )}
                </div>
              )}
              <div className="detail-section">
                <strong>Issue Type:</strong> {ticket.issue_type || 'General'}
                {ticket.sentiment && ticket.sentiment !== 'neutral' && (
                  <span className="sentiment-tag">{ticket.sentiment === 'angry' ? '💢 Angry' : '😡 Frustrated'}</span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SLATimer({ createdAt, status }) {
  const [elapsed, setElapsed] = useState('');
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    const update = () => {
      if (status === 'resolved' || status === 'incomplete') {
        setElapsed('-');
        setIsBreached(false);
        return;
      }
      
      const SLA_LIMIT = 24 * 60 * 60 * 1000; // 24 hours
      let remaining = SLA_LIMIT - (Date.now() - new Date(createdAt).getTime());
      
      const breached = remaining < 0;
      setIsBreached(breached);
      
      if (breached) remaining = Math.abs(remaining);
      
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const mins = Math.floor((remaining / (1000 * 60)) % 60);
      setElapsed(`${breached ? '-' : ''}${hours}h ${mins}m`);
    };
    
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [createdAt, status]);

  return (
    <span 
      className="sla-timer" 
      style={{ 
        fontWeight: 600, 
        color: isBreached ? '#ef4444' : (elapsed === '-' ? '#94a3b8' : '#22c55e'), 
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      {elapsed !== '-' && (isBreached ? '⚠️' : '⏱')} {elapsed}
    </span>
  );
}
