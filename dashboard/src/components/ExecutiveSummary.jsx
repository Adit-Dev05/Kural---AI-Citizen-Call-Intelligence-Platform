import React, { useState, useEffect } from 'react';

export default function ExecutiveSummary({ tickets, fixedDepartment }) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          setSummary('AI Summary is currently unavailable.');
        } else {
          // Clean up the text by removing markdown bolding and prefixes
          let cleanText = data.summary || 'No summary generated.';
          cleanText = cleanText.replace(/^\*\*(.*?)\*\*(?:\s*:\s*|\s*)/i, '').trim();
          setSummary(cleanText);
        }
      } catch (err) {
        console.error('Failed to fetch AI summary:', err);
        setSummary('AI Summary is currently unavailable.');
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, [tickets, fixedDepartment]);

  if (fixedDepartment) return null;

  return (
    <div className="exec-summary">
      <div className="exec-summary-icon">✨</div>
      <div className="exec-summary-body">
        <h3>AI Executive Summary</h3>
        {loading ? (
          <p className="exec-loading">Generating situational awareness...</p>
        ) : (
          <p>{summary}</p>
        )}
      </div>
    </div>
  );
}
