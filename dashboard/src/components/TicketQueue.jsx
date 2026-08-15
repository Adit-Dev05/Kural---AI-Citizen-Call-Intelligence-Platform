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

import React, { useState } from 'react';
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
  let filtered = tickets.filter((t) => !t.duplicate_of); // Don't show duplicates as separate rows

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

  // Resolve a ticket
  async function handleResolve(ticketId) {
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    if (error) {
      console.error('Error resolving ticket:', error);
      alert('Failed to update ticket status. Please try again.');
    }
    // No local state update needed — realtime subscription will handle it
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
          filtered.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              isNew={newTicketIds.has(ticket.id)}
              onResolve={handleResolve}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TicketRow({ ticket, isNew, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const isSlaBreached = 
    (ticket.status === 'open' || ticket.status === 'in_progress') && 
    (Date.now() - new Date(ticket.created_at).getTime()) > (24 * 60 * 60 * 1000);

  async function handleResolveClick(e) {
    e.stopPropagation(); // Prevent row expansion when clicking resolve
    setResolving(true);
    await onResolve(ticket.id);
    // State will be updated via realtime, but keep the button disabled briefly
    setTimeout(() => setResolving(false), 2000);
  }

  function toggleExpand() {
    setIsExpanded(!isExpanded);
  }

  return (
    <>
      <div className={`ticket-row ${isNew ? 'is-new' : ''} ${ticket.source === 'emergency' ? 'is-emergency' : ''}`} onClick={toggleExpand} style={{ cursor: 'pointer' }}>
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

      <span className={`badge ${urgencyBadgeClass}`}>{urgencyLabel}</span>

      {isSlaBreached ? (
        <span className="badge badge-sla">⚠️ SLA Breached</span>
      ) : (
        <span></span>
      )}

      <span className={`badge badge-status-${ticket.status}`}>{statusLabel}</span>

      <span className="source-icon" title={
        ticket.source === 'emergency' ? 'Emergency Dispatch' :
        ticket.source === 'call' ? 'Filed via call' : 'Filed via text'
      }>
        {ticket.source === 'emergency' ? '🚨' : ticket.source === 'call' ? '📞' : '📝'}
      </span>

      <span
        className={`badge ${ticket.classified_by === 'rules' ? 'badge-rules' : 'badge-ai'}`}
        title={ticket.classified_by === 'rules' ? 'Classified by keyword rules (Gemini was unavailable)' : 'Classified by AI (Gemini)'}
      >
        {ticket.classified_by === 'rules' ? '⚙ Rules' : '✦ AI'}
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

        {ticket.status !== 'resolved' ? (
          <button
            className="btn btn-resolve"
            onClick={handleResolveClick}
            disabled={resolving}
            id={`resolve-${ticket.ticket_number}`}
          >
            {resolving ? 'Updating...' : '✓ Resolve'}
          </button>
        ) : (
          <span className="badge badge-status-resolved">Done</span>
        )}
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
            <strong>Citizen Transcript / Complaint:</strong>
            <p className="transcript-text">{ticket.raw_transcript || 'No transcript available.'}</p>
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
