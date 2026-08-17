import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">KURAL</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} end title="Dashboard">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/grievances" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} title="Grievances">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>Grievances</span>
        </NavLink>

        <NavLink to="/departments" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} title="Departments">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>Departments</span>
        </NavLink>
      </nav>

      <div className="sidebar-bottom">
        {/* Removed settings and avatar as per request */}
      </div>
    </aside>
  );
}
