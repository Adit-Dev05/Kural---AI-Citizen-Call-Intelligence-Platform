/**
 * TicketQueue — the main filterable list of tickets.
 *
 * Features:
 * - Filter by department, status, and source (call/text)
 * - Each row shows: ticket number, summary, department, location,
 *   urgency badge, source icon, recording link, resolve button
 * - Sorted newest-first
 * - New tickets get a brief highlight animation
 * - "Mark Resolved" updates Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const DEPARTMENTS = [
  'All Departments',
  'Sanitation',
  'Water Supply',
  'Electricity',
  'Roads & Infrastructure',
  'Health Services',
  'Police',
  'General Grievance',
];

const STATUSES = ['All Statuses', 'open', 'in_progress', 'resolved', 'incomplete'];
const SOURCES = ['All Sources', 'call', 'text'];

export default function TicketQueue({ tickets, newTicketIds, fixedDepartment }) {
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [sourceFilter, setSourceFilter] = useState('All Sources');

  // Apply filters
  const primaryTickets = tickets.filter((t) => !t.duplicate_of);
  let filtered = primaryTickets;

  if (fixedDepartment) {
    filtered = filtered.filter((t) => t.department === fixedDepartment);
  } else if (departmentFilter !== 'All Departments') {
    filtered = filtered.filter((t) => t.department === departmentFilter);
  }
  if (statusFilter !== 'All Statuses') {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }
  if (sourceFilter !== 'All Sources') {
    filtered = filtered.filter((t) => t.source === sourceFilter);
  }

  // Sort newest-first
  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Change ticket status via backend to trigger Telegram notifications
  async function handleStatusChange(ticketId, newStatus) {
    try {
      const response = await fetch(`http://localhost:3000/api/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) {
        console.error('Failed to update status');
      }
    } catch (err) {
      console.error('Error calling backend for status update:', err);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="filters">
        {!fixedDepartment && (
          <select
            className="filter-select"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            id="filter-department"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          id="filter-status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'All Statuses' ? s : s.replace('_', ' ').toUpperCase()}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          id="filter-source"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === 'All Sources' ? s : s === 'call' ? '📞 Call' : '📝 Text'}
            </option>
          ))}
        </select>
      </div>

      {/* Queue */}
      <div className="ticket-queue">
        <div className="queue-header">
          <h2>Ticket Queue</h2>
          <span className="queue-count">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            No tickets match the current filters.
          </div>
        ) : (
          filtered.map((ticket) => {
            const duplicates = tickets.filter(t => t.duplicate_of === ticket.id);
            return (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                isNew={newTicketIds.has(ticket.id)}
                duplicates={duplicates}
                onStatusChange={handleStatusChange}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function TicketRow({ ticket, isNew, duplicates, onStatusChange }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (ticket.status === 'resolved') {
      setTimeLeft('');
      return;
    }
    const updateTime = () => {
      const elapsed = Date.now() - new Date(ticket.created_at).getTime();
      const slaLimit = 24 * 60 * 60 * 1000;
      const remaining = slaLimit - elapsed;
      
      if (remaining <= 0) {
        setTimeLeft('SLA Breached');
      } else {
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        setTimeLeft(`${h}h ${m}m left`);
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [ticket.created_at, ticket.status]);

  const urgencyBadgeClass = {
    urgent: 'badge-urgent',
    medium: 'badge-medium',
    low: 'badge-low',
  }[ticket.urgency] || 'badge-low';

  const urgencyLabel = {
    urgent: '🔴 Urgent',
    medium: '🟡 Medium',
    low: '🟢 Low',
  }[ticket.urgency] || ticket.urgency;

  const statusLabel = ticket.status.replace('_', ' ').toUpperCase();

  const timeSince = getTimeSince(ticket.created_at);

  const isSlaBreached = timeLeft === 'SLA Breached';

  function handleStatusSelect(e) {
    e.stopPropagation();
    onStatusChange(ticket.id, e.target.value);
  }

  function toggleExpand() {
    setIsExpanded(!isExpanded);
  }

  return (
    <>
      <div className={`ticket-row ${isNew ? 'is-new' : ''} ${ticket.source === 'emergency' ? 'is-emergency' : ''} ${isExpanded ? 'is-expanded' : ''}`} onClick={toggleExpand} style={{ cursor: 'pointer' }}>
        <span className="ticket-number">{ticket.ticket_number}</span>

      <div>
        <div className="ticket-summary" title={ticket.summary}>
          {ticket.summary || '(no summary)'}
        </div>
        <div className="ticket-location" title={ticket.location}>
          📍 {ticket.location || 'Not specified'} · {timeSince}
        </div>
      </div>

      <span className="ticket-department">{ticket.department}</span>

      <div className="ticket-meta-badges">
        <span className={`badge ${urgencyBadgeClass}`}>{urgencyLabel}</span>

        {ticket.sentiment === 'angry' || ticket.sentiment === 'frustrated' ? (
          <span className="badge badge-sentiment" title="Angry/Frustrated Caller">
            {ticket.sentiment === 'angry' ? '💢 Angry' : '😡 Frustrated'}
          </span>
        ) : null}

        {duplicates && duplicates.length > 0 && (
          <span className="badge badge-duplicates" title="Similar complaints linked">
            +{duplicates.length} Similar
          </span>
        )}

        {ticket.status !== 'resolved' && (
          isSlaBreached ? (
            <span className="badge badge-sla flash-red">⚠️ SLA Breached</span>
          ) : (
            <span className={`badge ${timeLeft.includes('h ') && parseInt(timeLeft) < 4 ? 'badge-sla-warning' : 'badge-sla-safe'}`}>
              ⏳ {timeLeft}
            </span>
          )
        )}
      </div>

      <div className="ticket-actions">
        <select
          className={`status-dropdown status-${ticket.status}`}
          value={ticket.status}
          onChange={handleStatusSelect}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="incomplete">Incomplete</option>
        </select>

        <span className="source-icon" title={
          ticket.source === 'emergency' ? 'Emergency Dispatch' :
          ticket.source === 'call' ? 'Filed via call' : 'Filed via text'
        }>
          {ticket.source === 'emergency' ? '🚨' : ticket.source === 'call' ? '📞' : '📝'}
        </span>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {ticket.recording_url && (
          <a
            className="recording-link"
            href={ticket.recording_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Listen to call recording"
            onClick={(e) => e.stopPropagation()}
          >
            🎧
          </a>
        )}

      </div>
    </div>
    </div>
      
    {isExpanded && (
      <div className={`ticket-details-panel ${ticket.source === 'emergency' ? 'is-emergency-panel' : ''}`}>
        {ticket.source === 'emergency' ? (
          <div className="details-group">
            <strong>Emergency Live Location:</strong>
            <div className="location-info">
              Latitude: <code>{ticket.latitude}</code><br/>
              Longitude: <code>{ticket.longitude}</code>
            </div>
            {ticket.latitude && ticket.longitude && (
              <a 
                href={`https://www.google.com/maps?q=${ticket.latitude},${ticket.longitude}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-map"
              >
                🗺️ Open in Google Maps
              </a>
            )}
          </div>
        ) : (
          <div className="details-group">
            <div className="transcript-header">
              <strong>{ticket.source === 'call' ? 'Citizen Call Transcript:' : 'Citizen Complaint Text:'}</strong>
              {ticket.source === 'call' && (
                <button 
                  className="btn-toggle-transcript" 
                  onClick={() => setShowTranscript(!showTranscript)}
                >
                  {showTranscript ? 'Hide Transcript' : 'View Full Transcript'}
                </button>
              )}
            </div>
            
            {(ticket.source !== 'call' || showTranscript) && (
              <p className="transcript-text">{ticket.raw_transcript || 'No transcript available.'}</p>
            )}
          </div>
        )}

        <div className="details-group">
          <strong>Classified Issue Type:</strong>
          <p>{ticket.issue_type || 'General'}</p>
        </div>
      </div>
    )}
    </>
  );
}

/**
 * Human-readable time-since string.
 */
function getTimeSince(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
