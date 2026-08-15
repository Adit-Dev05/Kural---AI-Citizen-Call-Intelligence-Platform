import React, { useState, useEffect } from 'react';

export default function ExecutiveSummary({ tickets, fixedDepartment }) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch for central dashboard to avoid irrelevant summaries per-department
    if (fixedDepartment) {
      setLoading(false);
      return;
    }

    async function fetchSummary() {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:3000/api/summary');
        const data = await response.json();
        if (!response.ok || data.error) {
          setSummary('AI Summary is currently unavailable (API Error).');
        } else {
          setSummary(data.summary || 'No summary generated.');
        }
      } catch (err) {
        console.error('Failed to fetch AI summary:', err);
        setSummary('AI Summary is currently unavailable (Network Error).');
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, [tickets, fixedDepartment]); // re-fetch when tickets change

  if (fixedDepartment) return null;

  return (
    <div className="executive-summary-card">
      <div className="summary-header">
        <span className="ai-icon">✨</span>
        <h3>AI Executive Summary</h3>
      </div>
      <div className="summary-content">
        {loading ? (
          <p className="loading-text">Generating situational awareness...</p>
        ) : (
          <p>{summary}</p>
        )}
      </div>
    </div>
  );
}
