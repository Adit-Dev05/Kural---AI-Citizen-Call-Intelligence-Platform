/**
 * App — main dashboard component.
 *
 * Fetches all tickets from Supabase on mount, then subscribes to realtime
 * changes (INSERT and UPDATE on the tickets table) so the dashboard is
 * always live without manual refreshing.
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import MetricCards from './components/MetricCards';
import TicketQueue from './components/TicketQueue';

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTicketIds, setNewTicketIds] = useState(new Set());
  const channelRef = useRef(null);

  useEffect(() => {
    // Initial fetch of all tickets
    async function fetchTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching tickets:', error);
      } else {
        setTickets(data || []);
      }
      setLoading(false);
    }

    fetchTickets();

    // Subscribe to realtime changes on the tickets table
    const channel = supabase
      .channel('tickets-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          console.log('[Realtime] New ticket:', payload.new.ticket_number);
          setTickets((prev) => [payload.new, ...prev]);

          // Track new ticket for highlight animation
          setNewTicketIds((prev) => {
            const updated = new Set(prev);
            updated.add(payload.new.id);
            return updated;
          });

          // Remove the highlight after the animation completes
          setTimeout(() => {
            setNewTicketIds((prev) => {
              const updated = new Set(prev);
              updated.delete(payload.new.id);
              return updated;
            });
          }, 3000);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        (payload) => {
          console.log('[Realtime] Ticket updated:', payload.new.ticket_number);
          setTickets((prev) =>
            prev.map((t) => (t.id === payload.new.id ? payload.new : t))
          );
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="empty-state">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Kural</h1>
          <span className="subtitle">AI Citizen Call Intelligence Platform — Officer Dashboard</span>
        </div>
        <div className="live-indicator">
          <span className="live-dot"></span>
          Live
        </div>
      </header>

      <MetricCards tickets={tickets} />
      <TicketQueue tickets={tickets} newTicketIds={newTicketIds} />
    </div>
  );
}
