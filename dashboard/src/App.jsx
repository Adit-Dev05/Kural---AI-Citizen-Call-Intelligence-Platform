/**
 * App — main dashboard component.
 *
 * Fetches all tickets from Supabase on mount, then subscribes to realtime
 * changes (INSERT and UPDATE on the tickets table) so the dashboard is
 * always live without manual refreshing.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { supabase } from './supabaseClient';
import MetricCards from './components/MetricCards';
import TicketQueue from './components/TicketQueue';
import SLAAnalytics from './components/SLAAnalytics';
import ExecutiveSummary from './components/ExecutiveSummary';
import MapView from './components/MapView';
import TrustScoreWidget from './components/TrustScoreWidget';

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
        <div className="header-top">
          <div>
            <h1>Kural</h1>
            <span className="subtitle">AI Citizen Call Intelligence Platform — Officer Dashboard</span>
          </div>
          <div className="live-indicator">
            <span className="live-dot"></span>
            Live
          </div>
        </div>
        <nav className="nav-bar">
          <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} end>Central</NavLink>
          <NavLink to="/dashboard/sanitation" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Sanitation</NavLink>
          <NavLink to="/dashboard/water-supply" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Water Supply</NavLink>
          <NavLink to="/dashboard/electricity" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Electricity</NavLink>
          <NavLink to="/dashboard/roads-infrastructure" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Roads & Infra</NavLink>
          <NavLink to="/dashboard/health-services" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Health Services</NavLink>
          <NavLink to="/dashboard/police" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Police</NavLink>
          <NavLink to="/dashboard/fire-department" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Fire Dept</NavLink>
          <NavLink to="/dashboard/general" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>General</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment={null} />} />
        <Route path="/dashboard/sanitation" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Sanitation" />} />
        <Route path="/dashboard/water-supply" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Water Supply" />} />
        <Route path="/dashboard/electricity" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Electricity" />} />
        <Route path="/dashboard/roads-infrastructure" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Roads & Infrastructure" />} />
        <Route path="/dashboard/health-services" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Health Services" />} />
        <Route path="/dashboard/police" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Police" />} />
        <Route path="/dashboard/fire-department" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="Fire Department" />} />
        <Route path="/dashboard/general" element={<DashboardView tickets={tickets} newTicketIds={newTicketIds} fixedDepartment="General Grievance" />} />
      </Routes>
    </div>
  );
}

function DashboardView({ tickets, newTicketIds, fixedDepartment }) {
  const displayTickets = fixedDepartment
    ? tickets.filter(t => t.department === fixedDepartment)
    : tickets;

  return (
    <>
      <ExecutiveSummary tickets={tickets} fixedDepartment={fixedDepartment} />
      
      <div className="dashboard-row-flex">
        <TrustScoreWidget tickets={tickets} fixedDepartment={fixedDepartment} />
        <MetricCards tickets={tickets} fixedDepartment={fixedDepartment} />
      </div>

      <MapView tickets={displayTickets} />
      {!fixedDepartment && <SLAAnalytics tickets={tickets} />}
      <TicketQueue tickets={tickets} newTicketIds={newTicketIds} fixedDepartment={fixedDepartment} />
    </>
  );
}
