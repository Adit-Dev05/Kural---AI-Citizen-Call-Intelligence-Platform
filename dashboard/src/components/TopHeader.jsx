import React from 'react';

export default function TopHeader({ title }) {
  return (
    <header className="top-header">
      <h1 className="page-title">{title}</h1>

      <div className="header-center">
        {/* Search bar removed as per request */}
      </div>

      <div className="header-right">
        <div className="live-badge">
          <span className="live-dot-green"></span>
          LIVE
        </div>
      </div>
    </header>
  );
}
