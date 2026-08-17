import React from 'react';



// Trust score mock values (in production this would be calculated from ticket SLAs)
const DEPT_SCORES = {
  'Sanitation / Solid Waste Management': 95,
  'Water Supply': 88,
  'Storm Water Drainage / Sewerage': 82,
  'Roads & Infrastructure': 75,
  'Street Lighting / Electricity': 92,
  'Public Health': 89,
};

function CircularGauge({ score, size = 70, strokeWidth = 5 }) {
  const isNA = score === null || score === undefined;
  const displayScore = isNA ? 0 : score;

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;
  
  // Base circle and progress circle colors
  const trackColor = '#e2e8f0';
  const progressColor = isNA ? '#cbd5e1' : '#1e293b';

  return (
    <div className="modern-gauge-container" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {!isNA && (
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={progressColor} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        )}
      </svg>
      <div className="modern-gauge-inner">
        {isNA ? (
          <span className="modern-gauge-val" style={{ color: '#94a3b8', fontSize: '13px' }}>N/A</span>
        ) : (
          <span className="modern-gauge-val">{score}%</span>
        )}
      </div>
    </div>
  );
}

function CenterGauge({ score, size = 150, strokeWidth = 8 }) {
  const isNA = score === null || score === undefined;
  const displayScore = isNA ? 0 : score;

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;
  
  // Inner ring for decoration
  const innerRadius = radius - 12;

  const progressColor = isNA ? '#cbd5e1' : '#1e293b';

  return (
    <div className="modern-gauge-container center-gauge-container" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        {!isNA && (
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={progressColor} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
          />
        )}
        {/* Inner decorative ring */}
        <circle cx={size / 2} cy={size / 2} r={innerRadius} fill="none" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4" />
      </svg>
      
      <div className="modern-gauge-inner center-inner">
        {isNA ? (
          <>
            <span className="center-val" style={{ color: '#94a3b8' }}>N/A</span>
            <span className="center-label">TRUST INDEX</span>
          </>
        ) : (
          <>
            <span className="center-val">{score}%</span>
            <span className="center-label">TRUST INDEX</span>
            {size >= 140 && (
              <span className="center-sub">4.8 / 5<br/><small>AVERAGE RATING</small></span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TrustScoreWidget({ tickets, fixedDepartment }) {
  // Helper to get score only if tickets exist for dept
  const getScore = (dept) => {
    const hasTickets = tickets.some(t => t.department === dept);
    return hasTickets ? DEPT_SCORES[dept] : null;
  };

  // If we are viewing a single department, show simple view
  if (fixedDepartment) {
    const score = getScore(fixedDepartment);
    return (
      <div className="trust-card">
        <div className="trust-card-header">
          <h3>Resolution Trust Score</h3>
        </div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <CenterGauge score={score} size={120} strokeWidth={6} />
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>{fixedDepartment}</h4>
            <p style={{ margin: 0, color: '#64748b' }}>Accountability & Satisfaction</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate overall center score
  const activeDepts = Object.keys(DEPT_SCORES).filter(dept => tickets.some(t => t.department === dept));
  const centerScore = activeDepts.length > 0 
    ? Math.round(activeDepts.reduce((acc, dept) => acc + DEPT_SCORES[dept], 0) / activeDepts.length)
    : null;

  // Dashboard wide view (Concept matching)
  return (
    <div className="trust-card trust-card-concept">
      <div className="trust-card-header">
        <h3>Department Trust Scores</h3>
        <span className="trust-subtitle">Accountability & Satisfaction</span>
      </div>

      <div className="concept-radial-layout">
        <div className="concept-col concept-col-left">
          <div className="concept-item">
            <span className="concept-label">Sanitation</span>
            <div className="concept-gauge-wrap">
              <CircularGauge score={getScore('Sanitation / Solid Waste Management')} />
              <div className="connector-line line-right" />
            </div>
          </div>
          <div className="concept-item">
            <span className="concept-label">Water Supply</span>
            <div className="concept-gauge-wrap">
              <CircularGauge score={getScore('Water Supply')} />
              <div className="connector-line line-right" />
            </div>
          </div>
          <div className="concept-item">
            <span className="concept-label">Sewerage</span>
            <div className="concept-gauge-wrap">
              <CircularGauge score={getScore('Storm Water Drainage / Sewerage')} />
              <div className="connector-line line-right" />
            </div>
          </div>
        </div>

        <div className="concept-center">
          <CenterGauge score={centerScore} size={140} />
        </div>

        <div className="concept-col concept-col-right">
          <div className="concept-item row-reverse">
            <span className="concept-label text-right">Roads & Infra</span>
            <div className="concept-gauge-wrap">
              <CircularGauge score={getScore('Roads & Infrastructure')} />
              <div className="connector-line line-left" />
            </div>
          </div>
          <div className="concept-item row-reverse">
            <span className="concept-label text-right">Electricity</span>
            <div className="concept-gauge-wrap">
              <CircularGauge score={getScore('Street Lighting / Electricity')} />
              <div className="connector-line line-left" />
            </div>
          </div>
          <div className="concept-item row-reverse">
            <span className="concept-label text-right">Public Health</span>
            <div className="concept-gauge-wrap">
              <CircularGauge score={getScore('Public Health')} />
              <div className="connector-line line-left" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
