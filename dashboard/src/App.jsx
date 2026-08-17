import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
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
    async function fetchTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) console.error('Error fetching tickets:', error);
      else setTickets(data || []);
      setLoading(false);
    }

    fetchTickets();

    const channel = supabase
      .channel('tickets-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (payload) => {
        setTickets(prev => {
          if (prev.some(t => t.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
        setNewTicketIds(prev => { const u = new Set(prev); u.add(payload.new.id); return u; });
        setTimeout(() => { setNewTicketIds(prev => { const u = new Set(prev); u.delete(payload.new.id); return u; }); }, 3000);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, (payload) => {
        setTickets(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
      })
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">
          <div className="loading-screen">Loading dashboard...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage tickets={tickets} />} />
          <Route path="/grievances" element={<GrievancesPage tickets={tickets} newTicketIds={newTicketIds} />} />
          <Route path="/departments" element={<DepartmentsPage tickets={tickets} newTicketIds={newTicketIds} />} />
        </Routes>
      </main>
    </div>
  );
}

/* ─── Dashboard Page ─────────────────────────────────────────────────────── */
function DashboardPage({ tickets }) {
  return (
    <>
      <TopHeader title="Dashboard" />
      <div className="page-content">
        <div className="dashboard-top-row">
          <div className="dashboard-top-left">
            <ExecutiveSummary tickets={tickets} fixedDepartment={null} />
            <MetricCards tickets={tickets} fixedDepartment={null} />
          </div>
          <div className="dashboard-top-right">
            <TrustScoreWidget tickets={tickets} fixedDepartment={null} />
          </div>
        </div>
        <div className="dashboard-bottom-row">
          <MapView tickets={tickets} mode="heatmap" />
        </div>
      </div>
    </>
  );
}

/* ─── Grievances Page ────────────────────────────────────────────────────── */
function GrievancesPage({ tickets, newTicketIds }) {
  const activeCount = tickets.filter(t => t.status !== 'resolved' && !t.duplicate_of).length;
  const slaBreaches = tickets.filter(t => {
    if (t.duplicate_of || t.status === 'resolved' || t.status === 'incomplete') return false;
    return (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60) > 24;
  }).length;

  return (
    <>
      <TopHeader title="Grievances Ticket Queue" />
      <div className="page-content">
        <div className="grievance-top-row">
          <ExecutiveSummary tickets={tickets} fixedDepartment={null} />
          <div className="mini-stat-card">
            <span className="mini-stat-label">Active Tickets</span>
            <span className="mini-stat-icon">↗</span>
            <span className="mini-stat-value">{activeCount}</span>
          </div>
          <div className={`mini-stat-card ${slaBreaches > 0 ? 'mini-stat-warn' : ''}`}>
            <span className="mini-stat-label">Pending SLAs</span>
            <span className="mini-stat-icon">⚠</span>
            <span className="mini-stat-value">{slaBreaches}</span>
          </div>
        </div>
        <TicketQueue tickets={tickets} newTicketIds={newTicketIds} fixedDepartment={null} />
        <div style={{ marginTop: '24px' }}>
          <MapView tickets={tickets} mode="pins" />
        </div>
      </div>
    </>
  );
}

/* ─── Departments Page ───────────────────────────────────────────────────── */
const DEPT_TABS = [
  { key: 'Sanitation / Solid Waste Management', label: 'Sanitation' },
  { key: 'Roads & Infrastructure', label: 'Roads' },
  { key: 'Water Supply', label: 'Water' },
  { key: 'Storm Water Drainage / Sewerage', label: 'Drainage' },
  { key: 'Street Lighting / Electricity', label: 'Lighting' },
  { key: 'Public Health', label: 'Health' },
];

function DepartmentsPage({ tickets, newTicketIds }) {
  const [activeDept, setActiveDept] = useState('Sanitation / Solid Waste Management');
  const [showInsights, setShowInsights] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsData, setInsightsData] = useState(null);
  const deptTickets = tickets.filter(t => t.department === activeDept);

  const fetchInsights = async () => {
    setShowInsights(true);
    setInsightsLoading(true);
    setInsightsData(null);
    try {
      const response = await fetch('http://localhost:3000/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: activeDept })
      });
      const data = await response.json();
      setInsightsData(data.insights);
    } catch (err) {
      console.error('Failed to fetch AI insights:', err);
      setInsightsData('Failed to generate insights. Please try again.');
    } finally {
      setInsightsLoading(false);
    }
  };

  return (
    <>
      <TopHeader title="Kural Department Specific Intelligence" />
      <div className="page-content">
        <div className="dept-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div className="dept-tabs" style={{ marginBottom: 0 }}>
            {DEPT_TABS.map(d => (
              <button
                key={d.key}
                className={`dept-tab ${activeDept === d.key ? 'active' : ''}`}
                onClick={() => { setActiveDept(d.key); setShowInsights(false); }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button className="btn-ai-insights" onClick={fetchInsights}>
            <span className="ai-icon">✨</span> AI Actionable Insights
          </button>
        </div>

        <div className="dept-grid">
          <div className="dept-grid-left">
            <TicketQueue tickets={tickets} newTicketIds={newTicketIds} fixedDepartment={activeDept} />
          </div>
          <div className="dept-grid-right">
            <TrustScoreWidget tickets={tickets} fixedDepartment={activeDept} />
            <div style={{ marginTop: '24px' }}>
              <SLAAnalytics tickets={tickets} fixedDepartment={activeDept} />
            </div>
          </div>
        </div>

        <MapView tickets={deptTickets} mode="pins" />
      </div>

      {showInsights && (
        <div className="modal-overlay" onClick={() => setShowInsights(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="ai-icon-large">✨</span>
                <h2>AI Insights: {activeDept}</h2>
              </div>
              <button className="modal-close" onClick={() => setShowInsights(false)}>×</button>
            </div>
            <div className="modal-body">
              {insightsLoading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Analyzing ticket queues and SLA metrics...</p>
                </div>
              ) : (
                <div className="markdown-content" dangerouslySetInnerHTML={{ 
                  // Quick and dirty markdown rendering for the 3 sections + bullet points
                  __html: insightsData ? insightsData
                    .replace(/\*\*(.*?)\*\*/g, '<h3>$1</h3>')
                    .replace(/\* (.*?)(?=\n|$)/g, '<li>$1</li>')
                    .replace(/<\/li>\n<li>/g, '</li><li>')
                    .replace(/<li>(.*?)<\/li>/g, '<ul><li>$1</li></ul>')
                    .replace(/<\/ul>\n<ul>/g, '')
                    .replace(/\n\n/g, '<br/>') : ''
                }} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
